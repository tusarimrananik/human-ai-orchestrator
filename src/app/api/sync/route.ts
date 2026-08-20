import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { TaskStatus, Priority, WorkerType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'user@orchestrator.local',
          name: 'Main User',
        },
      });
    }

    let project = await prisma.project.findFirst({
      where: { userId: user.id },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          userId: user.id,
          name: 'Main Project',
        },
      });
    }

    const dbTasks = await prisma.task.findMany({
      where: { projectId: project.id },
      include: {
        dependencies: {
          select: { dependsOnTaskId: true },
        },
        worker: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const formattedTasks = dbTasks.map((t) => ({
      id: t.id,
      name: t.title,
      owner: (t.worker?.name === 'AI' || t.worker?.type === WorkerType.AI_AGENT
        ? 'AI'
        : t.worker?.type === WorkerType.TEAM_MEMBER
        ? 'Other'
        : 'Me') as 'Me' | 'AI' | 'Other',
      priority: (t.priority === Priority.CRITICAL || t.priority === Priority.HIGH
        ? 'High'
        : t.priority === Priority.LOW
        ? 'Low'
        : 'Medium') as 'High' | 'Medium' | 'Low',
      deadline: t.deadline ? t.deadline.toISOString().split('T')[0] : '',
      estimate: t.estimatedDuration ? `${t.estimatedDuration}m` : '',
      doneRule: t.completionCriteria || '',
      notes: t.notes || '',
      dependencies: t.dependencies.map((d) => d.dependsOnTaskId),
      manualStatus: (t.status === TaskStatus.DONE
        ? 'done'
        : t.status === TaskStatus.IN_PROGRESS
        ? 'progress'
        : 'todo') as 'todo' | 'progress' | 'done',
      createdAt: t.createdAt.getTime(),
    }));

    return NextResponse.json({ tasks: formattedTasks });
  } catch (error: any) {
    console.error('Background sync GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tasks } = body;

    if (!Array.isArray(tasks)) {
      return NextResponse.json({ error: 'Tasks array required' }, { status: 400 });
    }

    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'user@orchestrator.local',
          name: 'Main User',
        },
      });
    }

    let project = await prisma.project.findFirst({
      where: { userId: user.id },
    });
    if (!project) {
      project = await prisma.project.create({
        data: {
          userId: user.id,
          name: 'Main Project',
        },
      });
    }

    // Workers mapping
    const workerMe = await prisma.worker.upsert({
      where: { id: `worker_me_${user.id}` },
      update: {},
      create: { id: `worker_me_${user.id}`, userId: user.id, name: 'Me', type: WorkerType.ME },
    });
    const workerAI = await prisma.worker.upsert({
      where: { id: `worker_ai_${user.id}` },
      update: {},
      create: { id: `worker_ai_${user.id}`, userId: user.id, name: 'AI', type: WorkerType.AI_AGENT },
    });
    const workerOther = await prisma.worker.upsert({
      where: { id: `worker_other_${user.id}` },
      update: {},
      create: { id: `worker_other_${user.id}`, userId: user.id, name: 'Other', type: WorkerType.TEAM_MEMBER },
    });

    const workerMap = {
      Me: workerMe.id,
      AI: workerAI.id,
      Other: workerOther.id,
    };

    // Upsert tasks in database
    for (const t of tasks) {
      const priorityEnum =
        t.priority === 'High' ? Priority.HIGH : t.priority === 'Low' ? Priority.LOW : Priority.MEDIUM;
      const statusEnum =
        t.manualStatus === 'done'
          ? TaskStatus.DONE
          : t.manualStatus === 'progress'
          ? TaskStatus.IN_PROGRESS
          : TaskStatus.READY;

      const durMatch = (t.estimate || '').match(/\d+/);
      const estMinutes = durMatch ? parseInt(durMatch[0], 10) : null;

      await prisma.task.upsert({
        where: { id: t.id },
        update: {
          title: t.name,
          workerId: workerMap[t.owner as keyof typeof workerMap] || workerMe.id,
          priority: priorityEnum,
          status: statusEnum,
          deadline: t.deadline ? new Date(t.deadline) : null,
          estimatedDuration: estMinutes,
          completionCriteria: t.doneRule || null,
          notes: t.notes || null,
        },
        create: {
          id: t.id,
          userId: user.id,
          projectId: project.id,
          title: t.name,
          workerId: workerMap[t.owner as keyof typeof workerMap] || workerMe.id,
          priority: priorityEnum,
          status: statusEnum,
          deadline: t.deadline ? new Date(t.deadline) : null,
          estimatedDuration: estMinutes,
          completionCriteria: t.doneRule || null,
          notes: t.notes || null,
        },
      });

      // Update dependencies
      await prisma.taskDependency.deleteMany({
        where: { taskId: t.id },
      });

      if (Array.isArray(t.dependencies) && t.dependencies.length > 0) {
        for (const depId of t.dependencies) {
          if (depId && depId !== t.id) {
            try {
              await prisma.taskDependency.create({
                data: {
                  taskId: t.id,
                  dependsOnTaskId: depId,
                },
              });
            } catch {
              // Ignore duplicate or missing prerequisite errors safely
            }
          }
        }
      }
    }

    // Delete tasks that are no longer in the array
    const currentTaskIds = tasks.map((t) => t.id);
    await prisma.task.deleteMany({
      where: {
        projectId: project.id,
        id: { notIn: currentTaskIds },
      },
    });

    return NextResponse.json({ success: true, count: tasks.length });
  } catch (error: any) {
    console.error('Background sync POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

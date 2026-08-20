import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { TaskStatus, Priority, WorkerType, WaitingType } from '@prisma/client';
import { recalculateTaskStatus, wouldCreateCycle } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const workerId = searchParams.get('workerId');
    const status = searchParams.get('status') as TaskStatus | null;
    const priority = searchParams.get('priority') as Priority | null;
    const search = searchParams.get('search');

    const where: any = {};
    if (projectId && projectId !== 'all') where.projectId = projectId;
    if (workerId && workerId !== 'all') where.workerId = workerId;
    if (status && status !== 'all' as any) where.status = status;
    if (priority && priority !== 'all' as any) where.priority = priority;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        milestone: { select: { id: true, name: true } },
        worker: true,
        dependencies: {
          include: {
            dependsOnTask: {
              select: { id: true, title: true, status: true, priority: true, worker: { select: { name: true, type: true } } },
            },
          },
        },
        dependents: {
          include: {
            task: {
              select: { id: true, title: true, status: true, priority: true, worker: { select: { name: true, type: true } } },
            },
          },
        },
        subtasks: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ tasks });
  } catch (error: any) {
    console.error('Error fetching tasks:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      projectId,
      title,
      description,
      completionCriteria,
      priority = Priority.MEDIUM,
      workerId,
      milestoneId,
      estimatedDuration,
      deadline,
      dependencies = [], // array of task IDs this task depends on
      waitingReason,
      waitingType,
      aiInstructions,
      aiExpectedOutput,
      parentId,
    } = body;

    if (!projectId || !title) {
      return NextResponse.json({ error: 'Project and Title are required' }, { status: 400 });
    }

    // Default user (single-tenant personal app)
    const user = await prisma.user.findFirst();
    if (!user) {
      return NextResponse.json({ error: 'No user found' }, { status: 500 });
    }

    // Initial status: if dependencies provided, check them; otherwise READY (or BACKLOG if explicitly asked)
    let initialStatus = body.status || TaskStatus.READY;

    const task = await prisma.task.create({
      data: {
        userId: user.id,
        projectId,
        title,
        description,
        completionCriteria,
        priority: priority as Priority,
        status: initialStatus,
        workerId: workerId || null,
        milestoneId: milestoneId || null,
        estimatedDuration: estimatedDuration ? parseInt(estimatedDuration, 10) : null,
        deadline: deadline ? new Date(deadline) : null,
        waitingReason,
        waitingType: waitingType as WaitingType || null,
        waitingSince: initialStatus === TaskStatus.WAITING ? new Date() : null,
        aiInstructions,
        aiExpectedOutput,
        parentId: parentId || null,
      },
    });

    // Create dependencies
    if (Array.isArray(dependencies) && dependencies.length > 0) {
      for (const prereqId of dependencies) {
        if (prereqId && prereqId !== task.id) {
          const isCycle = await wouldCreateCycle(prisma, task.id, prereqId);
          if (!isCycle) {
            await prisma.taskDependency.create({
              data: {
                taskId: task.id,
                dependsOnTaskId: prereqId,
              },
            });
          }
        }
      }
    }

    // Auto-recalculate status based on attached dependencies
    const calculatedStatus = await recalculateTaskStatus(prisma, task.id);

    // Record activity
    await prisma.activity.create({
      data: {
        userId: user.id,
        taskId: task.id,
        type: 'TASK_CREATED',
        message: `Task "${title}" created (Status: ${calculatedStatus})`,
      },
    });

    const enriched = await prisma.task.findUnique({
      where: { id: task.id },
      include: {
        project: true,
        worker: true,
        dependencies: {
          include: {
            dependsOnTask: { select: { id: true, title: true, status: true } },
          },
        },
        dependents: {
          include: {
            task: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });

    return NextResponse.json({ task: enriched }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating task:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

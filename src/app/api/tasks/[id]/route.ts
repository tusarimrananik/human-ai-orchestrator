import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { TaskStatus, Priority, WorkerType, WaitingType } from '@prisma/client';
import { recalculateTaskStatus } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        project: true,
        milestone: true,
        worker: true,
        dependencies: {
          include: {
            dependsOnTask: {
              include: { worker: true },
            },
          },
        },
        dependents: {
          include: {
            task: {
              include: { worker: true },
            },
          },
        },
        subtasks: {
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch (error: any) {
    console.error('Error getting task:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const existingTask = await prisma.task.findUnique({
      where: { id },
      include: {
        dependencies: {
          include: { dependsOnTask: true },
        },
      },
    });

    if (!existingTask) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const updateData: any = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.completionCriteria !== undefined) updateData.completionCriteria = body.completionCriteria;
    if (body.priority !== undefined) updateData.priority = body.priority as Priority;
    if (body.workerId !== undefined) updateData.workerId = body.workerId || null;
    if (body.milestoneId !== undefined) updateData.milestoneId = body.milestoneId || null;
    if (body.estimatedDuration !== undefined)
      updateData.estimatedDuration = body.estimatedDuration ? parseInt(body.estimatedDuration, 10) : null;
    if (body.deadline !== undefined)
      updateData.deadline = body.deadline ? new Date(body.deadline) : null;
    if (body.aiInstructions !== undefined) updateData.aiInstructions = body.aiInstructions;
    if (body.aiExpectedOutput !== undefined) updateData.aiExpectedOutput = body.aiExpectedOutput;
    if (body.notes !== undefined) updateData.notes = body.notes;

    // Waiting reason / type
    if (body.waitingReason !== undefined) updateData.waitingReason = body.waitingReason;
    if (body.waitingType !== undefined) updateData.waitingType = (body.waitingType as WaitingType) || null;

    // Status transition handling
    if (body.status !== undefined && body.status !== existingTask.status) {
      const requestedStatus = body.status as TaskStatus;

      // RULE: Do not allow user to manually set READY if prerequisites are unfinished!
      if (requestedStatus === TaskStatus.READY) {
        const unfinished = existingTask.dependencies.filter(
          (d) => d.dependsOnTask.status !== TaskStatus.DONE
        );
        if (unfinished.length > 0) {
          return NextResponse.json(
            {
              error: `Cannot mark task as READY: ${unfinished.length} required prerequisite task(s) are not finished (${unfinished.map((u) => u.dependsOnTask.title).join(', ')}).`,
            },
            { status: 400 }
          );
        }
      }

      updateData.status = requestedStatus;

      // Track timestamps
      if (requestedStatus === TaskStatus.IN_PROGRESS && !existingTask.actualStartedAt) {
        updateData.actualStartedAt = new Date();
      }
      if (requestedStatus === TaskStatus.DONE) {
        updateData.completedAt = new Date();
      } else if (existingTask.status === TaskStatus.DONE) {
        updateData.completedAt = null; // Reopened
      }

      if (requestedStatus === TaskStatus.WAITING) {
        updateData.waitingSince = new Date();
      } else {
        updateData.waitingSince = null;
      }

      // Record activity
      await prisma.activity.create({
        data: {
          userId: existingTask.userId,
          taskId: existingTask.id,
          type: 'STATUS_CHANGED',
          message: `Task status changed from ${existingTask.status} to ${requestedStatus}`,
        },
      });
    }

    const updatedTask = await prisma.task.update({
      where: { id },
      data: updateData,
    });

    // Cascade recalculation if status changed or dependencies might be affected
    await recalculateTaskStatus(prisma, id);

    return NextResponse.json({ task: updatedTask });
  } catch (error: any) {
    console.error('Error updating task:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Find all dependent tasks that depend on this task before deleting
    const dependents = await prisma.taskDependency.findMany({
      where: { dependsOnTaskId: id },
      select: { taskId: true },
    });

    const task = await prisma.task.findUnique({
      where: { id },
      select: { title: true, userId: true },
    });

    // Delete task (cascade will remove taskDependency rows)
    await prisma.task.delete({
      where: { id },
    });

    if (task) {
      await prisma.activity.create({
        data: {
          userId: task.userId,
          type: 'TASK_DELETED',
          message: `Deleted task "${task.title}". Dependencies were updated.`,
        },
      });
    }

    // Recalculate all tasks that used to depend on this task
    for (const dep of dependents) {
      await recalculateTaskStatus(prisma, dep.taskId);
    }

    return NextResponse.json({ success: true, recalculatedCount: dependents.length });
  } catch (error: any) {
    console.error('Error deleting task:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

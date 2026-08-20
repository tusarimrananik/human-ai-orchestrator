import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { wouldCreateCycle, recalculateTaskStatus } from '@/lib/engine';
import { DependencyType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const { dependsOnTaskId, type = DependencyType.FINISH_TO_START } = await req.json();

    if (!dependsOnTaskId) {
      return NextResponse.json({ error: 'dependsOnTaskId is required' }, { status: 400 });
    }

    if (taskId === dependsOnTaskId) {
      return NextResponse.json({ error: 'A task cannot depend on itself.' }, { status: 400 });
    }

    // Verify both tasks exist
    const [targetTask, sourceTask] = await Promise.all([
      prisma.task.findUnique({ where: { id: taskId } }),
      prisma.task.findUnique({ where: { id: dependsOnTaskId } }),
    ]);

    if (!targetTask || !sourceTask) {
      return NextResponse.json({ error: 'One or both tasks do not exist.' }, { status: 404 });
    }

    // Check project boundary (Restricted to same project for consistency)
    if (targetTask.projectId !== sourceTask.projectId) {
      return NextResponse.json(
        { error: 'Cross-project dependencies are not allowed in this version.' },
        { status: 400 }
      );
    }

    // Circular Dependency Validation
    const isCycle = await wouldCreateCycle(prisma, taskId, dependsOnTaskId);
    if (isCycle) {
      return NextResponse.json(
        {
          error: `Circular dependency detected: Task "${sourceTask.title}" already directly or indirectly depends on Task "${targetTask.title}". Creating this link would cause a circular loop.`,
        },
        { status: 400 }
      );
    }

    // Check if link already exists
    const existing = await prisma.taskDependency.findUnique({
      where: {
        taskId_dependsOnTaskId: {
          taskId,
          dependsOnTaskId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ message: 'Dependency already exists.', dependency: existing });
    }

    const dependency = await prisma.taskDependency.create({
      data: {
        taskId,
        dependsOnTaskId,
        type: type as DependencyType,
      },
    });

    // Recalculate status for the dependent task
    await recalculateTaskStatus(prisma, taskId);

    // Record activity
    await prisma.activity.create({
      data: {
        userId: targetTask.userId,
        taskId,
        type: 'DEPENDENCY_ADDED',
        message: `Task "${targetTask.title}" now depends on "${sourceTask.title}".`,
      },
    });

    return NextResponse.json({ dependency }, { status: 201 });
  } catch (error: any) {
    console.error('Error adding dependency:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const { searchParams } = new URL(req.url);
    const dependsOnTaskId = searchParams.get('dependsOnTaskId');

    if (!dependsOnTaskId) {
      return NextResponse.json({ error: 'dependsOnTaskId query param is required' }, { status: 400 });
    }

    await prisma.taskDependency.deleteMany({
      where: {
        taskId,
        dependsOnTaskId,
      },
    });

    // Recalculate status after removing dependency
    await recalculateTaskStatus(prisma, taskId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error removing dependency:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

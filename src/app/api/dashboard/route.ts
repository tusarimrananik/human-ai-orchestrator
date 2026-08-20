import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { recommendNextTask, calculateProjectCriticalPath } from '@/lib/engine';
import { TaskStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || undefined;

    const user = await prisma.user.findFirst();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Run recommendation engine
    const dashboardData = await recommendNextTask(prisma, user.id, projectId === 'all' ? undefined : projectId);

    // Calculate critical path for current project if selected
    let criticalPath: { criticalTaskIds: string[]; totalDurationMinutes: number } | null = null;
    if (projectId && projectId !== 'all') {
      criticalPath = await calculateProjectCriticalPath(prisma, projectId);
    }

    // Projects summary
    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      include: {
        _count: {
          select: { tasks: true },
        },
        tasks: {
          select: { status: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const projectStats = projects.map((p) => {
      const total = p.tasks.length;
      const done = p.tasks.filter((t) => t.status === TaskStatus.DONE).length;
      const inProgress = p.tasks.filter((t) => t.status === TaskStatus.IN_PROGRESS).length;
      const ready = p.tasks.filter((t) => t.status === TaskStatus.READY).length;
      const blocked = p.tasks.filter((t) => t.status === TaskStatus.BLOCKED).length;
      const progress = total > 0 ? Math.round((done / total) * 100) : 0;
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        deadline: p.deadline,
        total,
        done,
        inProgress,
        ready,
        blocked,
        progress,
      };
    });

    // Workers summary
    const workers = await prisma.worker.findMany({
      where: { userId: user.id },
      include: {
        tasks: {
          where: { status: TaskStatus.IN_PROGRESS },
          select: { id: true, title: true, actualStartedAt: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Recent activity
    const activities = await prisma.activity.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });

    return NextResponse.json({
      ...dashboardData,
      criticalPath,
      projectStats,
      workers,
      activities,
    });
  } catch (error: any) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

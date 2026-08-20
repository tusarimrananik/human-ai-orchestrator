import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { TaskStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await prisma.user.findFirst();
    if (!user) return NextResponse.json({ projects: [] });

    const projects = await prisma.project.findMany({
      where: { userId: user.id },
      include: {
        milestones: {
          orderBy: { orderIndex: 'asc' },
        },
        tasks: {
          select: {
            id: true,
            status: true,
            priority: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const enriched = projects.map((p) => {
      const total = p.tasks.length;
      const done = p.tasks.filter((t) => t.status === TaskStatus.DONE).length;
      const ready = p.tasks.filter((t) => t.status === TaskStatus.READY).length;
      const blocked = p.tasks.filter((t) => t.status === TaskStatus.BLOCKED).length;
      const inProgress = p.tasks.filter((t) => t.status === TaskStatus.IN_PROGRESS).length;

      return {
        ...p,
        stats: {
          total,
          done,
          ready,
          blocked,
          inProgress,
          progress: total > 0 ? Math.round((done / total) * 100) : 0,
        },
      };
    });

    return NextResponse.json({ projects: enriched });
  } catch (error: any) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await prisma.user.findFirst();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await req.json();
    const { name, description, deadline, milestones = [] } = body;

    if (!name) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        userId: user.id,
        name,
        description,
        deadline: deadline ? new Date(deadline) : null,
      },
    });

    if (Array.isArray(milestones) && milestones.length > 0) {
      for (let i = 0; i < milestones.length; i++) {
        const m = milestones[i];
        if (m.name) {
          await prisma.milestone.create({
            data: {
              projectId: project.id,
              name: m.name,
              description: m.description,
              orderIndex: i + 1,
            },
          });
        }
      }
    }

    const created = await prisma.project.findUnique({
      where: { id: project.id },
      include: { milestones: true },
    });

    return NextResponse.json({ project: created }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating project:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

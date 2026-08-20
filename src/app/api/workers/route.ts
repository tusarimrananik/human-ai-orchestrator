import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { WorkerType, TaskStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await prisma.user.findFirst();
    if (!user) return NextResponse.json({ workers: [] });

    const workers = await prisma.worker.findMany({
      where: { userId: user.id },
      include: {
        tasks: {
          where: { status: TaskStatus.IN_PROGRESS },
          select: { id: true, title: true, actualStartedAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const enriched = workers.map((w) => ({
      ...w,
      activeTasksCount: w.tasks.length,
      isAtCapacity: w.tasks.length >= w.wipLimit,
    }));

    return NextResponse.json({ workers: enriched });
  } catch (error: any) {
    console.error('Error fetching workers:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await prisma.user.findFirst();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await req.json();
    const { name, type = WorkerType.AI_AGENT, wipLimit = 2, description, avatar } = body;

    if (!name) {
      return NextResponse.json({ error: 'Worker name is required' }, { status: 400 });
    }

    const worker = await prisma.worker.create({
      data: {
        userId: user.id,
        name,
        type: type as WorkerType,
        wipLimit: parseInt(wipLimit, 10) || 2,
        description,
        avatar,
      },
    });

    return NextResponse.json({ worker }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating worker:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, wipLimit, isActive, name, description, type } = body;

    if (!id) return NextResponse.json({ error: 'Worker ID is required' }, { status: 400 });

    const updated = await prisma.worker.update({
      where: { id },
      data: {
        ...(wipLimit !== undefined && { wipLimit: parseInt(wipLimit, 10) }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(type && { type: type as WorkerType }),
      },
    });

    return NextResponse.json({ worker: updated });
  } catch (error: any) {
    console.error('Error updating worker:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

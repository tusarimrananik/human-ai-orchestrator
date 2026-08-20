import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calculateProjectCriticalPath } from '@/lib/engine';
import { TaskStatus, Priority, WorkerType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    if (!projectId || projectId === 'all') {
      // Pick first active project if not specified
      const firstProject = await prisma.project.findFirst({
        orderBy: { createdAt: 'asc' },
      });
      if (!firstProject) {
        return NextResponse.json({ nodes: [], edges: [], project: null });
      }
      return fetchProjectGraph(firstProject.id);
    }

    return fetchProjectGraph(projectId);
  } catch (error: any) {
    console.error('Error getting graph data:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

async function fetchProjectGraph(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return NextResponse.json({ nodes: [], edges: [], project: null });
  }

  const tasks = await prisma.task.findMany({
    where: { projectId, status: { not: TaskStatus.CANCELLED } },
    include: {
      worker: true,
      milestone: true,
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
    orderBy: { createdAt: 'asc' },
  });

  const { criticalTaskIds } = await calculateProjectCriticalPath(prisma, projectId);
  const criticalSet = new Set(criticalTaskIds);

  // Topological layer computation for left-to-right visual placement
  // Layer = max(layer of prerequisites) + 1
  const layerMap = new Map<string, number>();
  const inDegree = new Map<string, number>();
  const taskMap = new Map<string, (typeof tasks)[0]>();

  tasks.forEach((t) => {
    taskMap.set(t.id, t);
    inDegree.set(t.id, t.dependencies.length);
  });

  const queue: string[] = [];
  tasks.forEach((t) => {
    if (inDegree.get(t.id) === 0) {
      layerMap.set(t.id, 0);
      queue.push(t.id);
    }
  });

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentLayer = layerMap.get(currentId) || 0;
    const task = taskMap.get(currentId);

    if (task) {
      for (const dep of task.dependents) {
        const childId = dep.task.id;
        const existingChildLayer = layerMap.get(childId) ?? -1;
        const newLayer = Math.max(existingChildLayer, currentLayer + 1);
        layerMap.set(childId, newLayer);

        inDegree.set(childId, (inDegree.get(childId) || 1) - 1);
        if (inDegree.get(childId) === 0) {
          queue.push(childId);
        }
      }
    }
  }

  // Group tasks by layer for vertical spacing
  const layerBuckets: Record<number, string[]> = {};
  tasks.forEach((t) => {
    const layer = layerMap.get(t.id) || 0;
    if (!layerBuckets[layer]) layerBuckets[layer] = [];
    layerBuckets[layer].push(t.id);
  });

  const X_SPACING = 340;
  const Y_SPACING = 160;

  const nodes = tasks.map((t) => {
    const layer = layerMap.get(t.id) || 0;
    const bucket = layerBuckets[layer] || [t.id];
    const indexInLayer = bucket.indexOf(t.id);
    const totalInLayer = bucket.length;

    // Center vertically around 300px
    const yOffset = (indexInLayer - (totalInLayer - 1) / 2) * Y_SPACING + 280;
    const xOffset = layer * X_SPACING + 60;

    const isCritical = criticalSet.has(t.id);

    return {
      id: t.id,
      type: 'customTaskNode',
      position: { x: xOffset, y: yOffset },
      data: {
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        estimatedDuration: t.estimatedDuration,
        deadline: t.deadline,
        worker: t.worker
          ? {
              id: t.worker.id,
              name: t.worker.name,
              type: t.worker.type,
            }
          : null,
        milestone: t.milestone?.name || null,
        isCritical,
        dependenciesCount: t.dependencies.length,
        dependentsCount: t.dependents.length,
        waitingReason: t.waitingReason,
        waitingType: t.waitingType,
      },
    };
  });

  // Edges
  const edges: any[] = [];
  tasks.forEach((t) => {
    t.dependencies.forEach((dep) => {
      const isCriticalEdge = criticalSet.has(t.id) && criticalSet.has(dep.dependsOnTaskId);
      const isPrereqDone = dep.dependsOnTask.status === TaskStatus.DONE;

      edges.push({
        id: `e-${dep.dependsOnTaskId}-${t.id}`,
        source: dep.dependsOnTaskId,
        target: t.id,
        animated: isPrereqDone && t.status === TaskStatus.IN_PROGRESS,
        style: {
          stroke: isCriticalEdge
            ? '#EC4899' // Pink/magenta for critical path
            : isPrereqDone
            ? '#10B981' // Green for satisfied dependency
            : '#6B7280', // Gray for pending dependency
          strokeWidth: isCriticalEdge ? 3 : 2,
          strokeDasharray: isPrereqDone ? undefined : '5 5',
        },
        type: 'smoothstep',
      });
    });
  });

  return NextResponse.json({
    project,
    nodes,
    edges,
    criticalTaskIds: Array.from(criticalSet),
  });
}

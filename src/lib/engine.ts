import { PrismaClient, TaskStatus, Priority, WorkerType } from '@prisma/client';

export interface EnrichedTask {
  id: string;
  projectId: string;
  projectName?: string;
  userId: string;
  milestoneId: string | null;
  milestoneName?: string;
  workerId: string | null;
  worker?: {
    id: string;
    name: string;
    type: WorkerType;
    wipLimit: number;
    activeCount?: number;
    isAtCapacity?: boolean;
  } | null;
  parentId: string | null;
  title: string;
  description: string | null;
  completionCriteria: string | null;
  priority: Priority;
  status: TaskStatus;
  estimatedDuration: number | null;
  deadline: Date | null;
  actualStartedAt: Date | null;
  completedAt: Date | null;
  waitingReason: string | null;
  waitingType: string | null;
  waitingSince: Date | null;
  reviewRequired: boolean;
  aiInstructions: string | null;
  aiExpectedOutput: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  
  // Computed & graph relations
  dependencies?: Array<{
    id: string;
    taskId: string;
    dependsOnTaskId: string;
    dependsOnTask: {
      id: string;
      title: string;
      status: TaskStatus;
      priority: Priority;
      worker?: { name: string; type: WorkerType } | null;
    };
  }>;
  dependents?: Array<{
    id: string;
    taskId: string;
    dependsOnTaskId: string;
    task: {
      id: string;
      title: string;
      status: TaskStatus;
      priority: Priority;
      worker?: { name: string; type: WorkerType } | null;
    };
  }>;
  subtasks?: Array<{
    id: string;
    title: string;
    status: TaskStatus;
  }>;

  // Analysis flags
  unlocksDirectCount?: number;
  unlocksTotalCount?: number;
  isBlockedByUnfinishedPrereq?: boolean;
  blockingReasons?: string[];
  isWorkerAtCapacity?: boolean;
  isCriticalPath?: boolean;
  deadlineRisk?: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'OVERDUE';
}

/**
 * Checks whether adding a dependency where `taskId` depends on `dependsOnTaskId`
 * would create a circular dependency loop (cycle) in the DAG.
 * Returns true if a cycle WOULD be created (i.e. dependsOnTaskId already transitively depends on taskId).
 */
export async function wouldCreateCycle(
  prisma: PrismaClient,
  taskId: string,
  dependsOnTaskId: string
): Promise<boolean> {
  // Direct self-dependency
  if (taskId === dependsOnTaskId) {
    return true;
  }

  // BFS / DFS traversal starting from dependsOnTaskId to see if taskId is reachable
  const visited = new Set<string>();
  const queue: string[] = [dependsOnTaskId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === taskId) {
      return true; // Cycle detected!
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    // Fetch all prerequisites of `current` (tasks that `current` depends on)
    const currentDependencies = await prisma.taskDependency.findMany({
      where: { taskId: current },
      select: { dependsOnTaskId: true },
    });

    for (const dep of currentDependencies) {
      if (!visited.has(dep.dependsOnTaskId)) {
        queue.push(dep.dependsOnTaskId);
      }
    }
  }

  return false;
}

/**
 * Evaluates whether all prerequisites of a task are DONE.
 */
export function areAllPrerequisitesDone(dependencies: Array<{ dependsOnTask: { status: TaskStatus } }>): boolean {
  if (!dependencies || dependencies.length === 0) return true;
  return dependencies.every((dep) => dep.dependsOnTask.status === TaskStatus.DONE);
}

/**
 * Recalculates the status of a specific task based on its dependencies and manual state.
 * If task is BACKLOG, IN_PROGRESS, WAITING, REVIEW, DONE, or CANCELLED,
 * we keep the manual state unless a completed dependency is reopened or dependencies are incomplete.
 * If task is BLOCKED or READY, we automatically evaluate dependencies.
 */
export async function recalculateTaskStatus(
  prisma: PrismaClient,
  taskId: string,
  visited: Set<string> = new Set()
): Promise<TaskStatus> {
  if (visited.has(taskId)) return TaskStatus.BLOCKED;
  visited.add(taskId);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      dependencies: {
        include: {
          dependsOnTask: {
            select: { id: true, status: true, title: true },
          },
        },
      },
    },
  });

  if (!task) return TaskStatus.BACKLOG;

  // Don't auto-modify CANCELLED or BACKLOG tasks unless explicitly transitioned
  if (task.status === TaskStatus.CANCELLED || task.status === TaskStatus.BACKLOG) {
    return task.status;
  }

  const allPrereqsDone = areAllPrerequisitesDone(task.dependencies);

  let newStatus: TaskStatus = task.status;

  if (!allPrereqsDone) {
    // If dependencies are NOT finished:
    // If the task was READY or BLOCKED, it MUST be BLOCKED.
    // If it was IN_PROGRESS, WAITING, or REVIEW and a prerequisite became undone,
    // we should flag it or set it to BLOCKED so user knows it's stalled.
    if (task.status === TaskStatus.READY || task.status === TaskStatus.BLOCKED) {
      newStatus = TaskStatus.BLOCKED;
    }
  } else {
    // All dependencies are finished!
    // If it was BLOCKED, it now automatically becomes READY.
    if (task.status === TaskStatus.BLOCKED) {
      newStatus = TaskStatus.READY;
    }
  }

  if (newStatus !== task.status) {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: newStatus },
    });

    // Record activity for automatic state transition
    await prisma.activity.create({
      data: {
        userId: task.userId,
        taskId: task.id,
        type: newStatus === TaskStatus.READY ? 'TASK_BECAME_READY' : 'TASK_BLOCKED',
        message:
          newStatus === TaskStatus.READY
            ? `Task "${task.title}" automatically became READY (all prerequisites completed).`
            : `Task "${task.title}" is now BLOCKED due to unfinished prerequisites.`,
      },
    });
  }

  // Cascading recalculation for all downstream dependent tasks
  const dependents = await prisma.taskDependency.findMany({
    where: { dependsOnTaskId: taskId },
    select: { taskId: true },
  });

  for (const dep of dependents) {
    await recalculateTaskStatus(prisma, dep.taskId, visited);
  }

  return newStatus;
}

/**
 * Calculates total and direct downstream unlocks for a task.
 */
export async function getDownstreamUnlocks(
  prisma: PrismaClient,
  taskId: string
): Promise<{ direct: number; total: number; dependentTaskIds: string[] }> {
  const directDeps = await prisma.taskDependency.findMany({
    where: { dependsOnTaskId: taskId },
    select: { taskId: true },
  });

  const direct = directDeps.length;
  const visited = new Set<string>();
  const queue = directDeps.map((d) => d.taskId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!visited.has(current)) {
      visited.add(current);
      const nextDeps = await prisma.taskDependency.findMany({
        where: { dependsOnTaskId: current },
        select: { taskId: true },
      });
      for (const nd of nextDeps) {
        if (!visited.has(nd.taskId)) {
          queue.push(nd.taskId);
        }
      }
    }
  }

  return {
    direct,
    total: visited.size,
    dependentTaskIds: Array.from(visited),
  };
}

/**
 * Worker active capacity helper.
 * Calculates active WIP count and whether worker has reached their limit.
 */
export async function getWorkerCapacityMap(prisma: PrismaClient, userId: string) {
  const workers = await prisma.worker.findMany({
    where: { userId, isActive: true },
    include: {
      tasks: {
        where: { status: TaskStatus.IN_PROGRESS },
        select: { id: true },
      },
    },
  });

  const capacityMap = new Map<
    string,
    {
      id: string;
      name: string;
      type: WorkerType;
      wipLimit: number;
      activeCount: number;
      isAtCapacity: boolean;
    }
  >();

  for (const w of workers) {
    const activeCount = w.tasks.length;
    capacityMap.set(w.id, {
      id: w.id,
      name: w.name,
      type: w.type,
      wipLimit: w.wipLimit,
      activeCount,
      isAtCapacity: activeCount >= w.wipLimit,
    });
  }

  return capacityMap;
}

/**
 * Priority numeric scoring for ranking
 */
function getPriorityScore(priority: Priority): number {
  switch (priority) {
    case Priority.CRITICAL:
      return 100;
    case Priority.HIGH:
      return 60;
    case Priority.MEDIUM:
      return 30;
    case Priority.LOW:
      return 10;
    default:
      return 0;
  }
}

/**
 * "What should I do now?" Engine.
 * Recommends the highest-priority, unblocked, actionable task for the user.
 * Evaluates:
 * 1. Tasks assigned to ME (or unassigned human tasks) in READY state
 * 2. Unlocks count (downstream multiplier)
 * 3. Priority weighting (Critical > High > Medium > Low)
 * 4. Deadline urgency / overdue status
 * 5. Duration appropriateness
 * 6. Tiebreaker: oldest ready task
 */
export async function recommendNextTask(
  prisma: PrismaClient,
  userId: string,
  projectId?: string
): Promise<{
  primaryRecommendation: EnrichedTask | null;
  otherReadyTasks: EnrichedTask[];
  aiWorkingTasks: EnrichedTask[];
  waitingTasks: EnrichedTask[];
  blockedTasks: EnrichedTask[];
  isUserGenuinelyBlocked: boolean;
}> {
  // 1. Get worker capacities
  const workerCapacity = await getWorkerCapacityMap(prisma, userId);

  // 2. Fetch all active tasks with dependencies
  const whereClause: any = { userId, status: { not: TaskStatus.CANCELLED } };
  if (projectId) {
    whereClause.projectId = projectId;
  }

  const tasks = await prisma.task.findMany({
    where: whereClause,
    include: {
      project: { select: { id: true, name: true } },
      milestone: { select: { id: true, name: true } },
      worker: true,
      dependencies: {
        include: {
          dependsOnTask: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              worker: { select: { name: true, type: true } },
            },
          },
        },
      },
      dependents: {
        include: {
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              worker: { select: { name: true, type: true } },
            },
          },
        },
      },
      subtasks: {
        select: { id: true, title: true, status: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Calculate downstream unlocks & enrich tasks
  const enrichedTasks: EnrichedTask[] = [];

  for (const t of tasks) {
    const unlocks = await getDownstreamUnlocks(prisma, t.id);
    const workerInfo = t.workerId ? workerCapacity.get(t.workerId) : null;

    // Check unfinished prerequisites
    const unfinishedPrereqs = t.dependencies.filter((d) => d.dependsOnTask.status !== TaskStatus.DONE);
    const isBlocked = unfinishedPrereqs.length > 0;
    const blockingReasons = unfinishedPrereqs.map(
      (d) => `Prerequisite "${d.dependsOnTask.title}" is ${d.dependsOnTask.status.toLowerCase().replace('_', ' ')}`
    );

    // Deadline risk
    let deadlineRisk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'OVERDUE' = 'NONE';
    if (t.deadline) {
      const now = Date.now();
      const deadlineTime = new Date(t.deadline).getTime();
      const timeLeftHours = (deadlineTime - now) / (1000 * 60 * 60);

      if (timeLeftHours < 0 && t.status !== TaskStatus.DONE) {
        deadlineRisk = 'OVERDUE';
      } else if (timeLeftHours < 24 && t.status !== TaskStatus.DONE) {
        deadlineRisk = 'HIGH';
      } else if (timeLeftHours < 72 && t.status !== TaskStatus.DONE) {
        deadlineRisk = 'MEDIUM';
      }
    }

    enrichedTasks.push({
      ...t,
      projectName: t.project.name,
      milestoneName: t.milestone?.name,
      worker: workerInfo
        ? {
            id: workerInfo.id,
            name: workerInfo.name,
            type: workerInfo.type,
            wipLimit: workerInfo.wipLimit,
            activeCount: workerInfo.activeCount,
            isAtCapacity: workerInfo.isAtCapacity,
          }
        : t.worker
        ? {
            id: t.worker.id,
            name: t.worker.name,
            type: t.worker.type,
            wipLimit: t.worker.wipLimit,
          }
        : null,
      unlocksDirectCount: unlocks.direct,
      unlocksTotalCount: unlocks.total,
      isBlockedByUnfinishedPrereq: isBlocked,
      blockingReasons,
      isWorkerAtCapacity: workerInfo?.isAtCapacity ?? false,
      deadlineRisk,
    });
  }

  // Categorize
  const readyTasksForMe: EnrichedTask[] = [];
  const otherReadyTasks: EnrichedTask[] = [];
  const aiWorkingTasks: EnrichedTask[] = [];
  const waitingTasks: EnrichedTask[] = [];
  const blockedTasks: EnrichedTask[] = [];

  for (const t of enrichedTasks) {
    if (t.status === TaskStatus.IN_PROGRESS) {
      if (t.worker?.type === WorkerType.AI_AGENT) {
        aiWorkingTasks.push(t);
      }
    } else if (t.status === TaskStatus.WAITING) {
      waitingTasks.push(t);
    } else if (t.status === TaskStatus.BLOCKED || t.isBlockedByUnfinishedPrereq) {
      blockedTasks.push(t);
    } else if (t.status === TaskStatus.READY) {
      // Is this task for ME or unassigned?
      if (!t.worker || t.worker.type === WorkerType.ME) {
        readyTasksForMe.push(t);
      } else {
        otherReadyTasks.push(t);
      }
    }
  }

  // Scoring function for ranking READY tasks for ME
  const scoreTask = (task: EnrichedTask): number => {
    let score = 0;

    // 1. Priority weight (0 to 100)
    score += getPriorityScore(task.priority);

    // 2. Downstream unlock multiplier (up to 80 pts)
    score += Math.min((task.unlocksTotalCount || 0) * 15, 80);

    // 3. Deadline urgency
    if (task.deadlineRisk === 'OVERDUE') score += 120;
    else if (task.deadlineRisk === 'HIGH') score += 70;
    else if (task.deadlineRisk === 'MEDIUM') score += 35;

    // 4. Prefer manageable estimates over unbounded tasks (up to 20 pts)
    if (task.estimatedDuration && task.estimatedDuration <= 60) {
      score += 15;
    } else if (task.estimatedDuration && task.estimatedDuration <= 120) {
      score += 10;
    }

    // 5. Older tasks get a slight steady boost to avoid starvation
    const ageHours = (Date.now() - new Date(task.createdAt).getTime()) / (1000 * 60 * 60);
    score += Math.min(ageHours * 0.5, 20);

    return score;
  };

  // Sort ready tasks for me
  readyTasksForMe.sort((a, b) => scoreTask(b) - scoreTask(a));

  const primaryRecommendation = readyTasksForMe.length > 0 ? readyTasksForMe[0] : null;
  const remainingReadyForMe = readyTasksForMe.slice(1);
  const combinedOtherReady = [...remainingReadyForMe, ...otherReadyTasks];

  // User is genuinely blocked if they have NO ready tasks for themselves,
  // but there are active tasks (e.g. AI working or waiting) blocking everything.
  const hasNoReadyWork = readyTasksForMe.length === 0;
  const hasPendingUnfinishedWork =
    aiWorkingTasks.length > 0 || waitingTasks.length > 0 || blockedTasks.length > 0;
  const isUserGenuinelyBlocked = hasNoReadyWork && hasPendingUnfinishedWork;

  return {
    primaryRecommendation,
    otherReadyTasks: combinedOtherReady,
    aiWorkingTasks,
    waitingTasks,
    blockedTasks,
    isUserGenuinelyBlocked,
  };
}

/**
 * Calculates Project Critical Path using CPM (Critical Path Method).
 * Tasks with 0 slack (Early Start == Late Start) are on the critical path.
 */
export async function calculateProjectCriticalPath(prisma: PrismaClient, projectId: string) {
  const tasks = await prisma.task.findMany({
    where: { projectId, status: { not: TaskStatus.CANCELLED } },
    include: {
      dependencies: { select: { dependsOnTaskId: true } },
      dependents: { select: { taskId: true } },
    },
  });

  if (tasks.length === 0) return { criticalTaskIds: [], totalDurationMinutes: 0 };

  const taskMap = new Map<string, (typeof tasks)[0]>();
  const durationMap = new Map<string, number>();
  const earlyStart = new Map<string, number>();
  const earlyFinish = new Map<string, number>();
  const lateStart = new Map<string, number>();
  const lateFinish = new Map<string, number>();

  for (const t of tasks) {
    taskMap.set(t.id, t);
    // Default duration is estimatedDuration or 60 min
    durationMap.set(t.id, t.estimatedDuration || 60);
  }

  // Forward Pass: Compute Early Start (ES) and Early Finish (EF)
  const inDegree = new Map<string, number>();
  for (const t of tasks) {
    inDegree.set(t.id, t.dependencies.length);
  }

  const queue: string[] = [];
  for (const t of tasks) {
    if (inDegree.get(t.id) === 0) {
      earlyStart.set(t.id, 0);
      earlyFinish.set(t.id, durationMap.get(t.id)!);
      queue.push(t.id);
    }
  }

  const topologicalOrder: string[] = [];

  while (queue.length > 0) {
    const currId = queue.shift()!;
    topologicalOrder.push(currId);
    const currEF = earlyFinish.get(currId)!;
    const task = taskMap.get(currId)!;

    for (const dep of task.dependents) {
      const childId = dep.taskId;
      const childES = Math.max(earlyStart.get(childId) ?? 0, currEF);
      earlyStart.set(childId, childES);
      earlyFinish.set(childId, childES + durationMap.get(childId)!);

      inDegree.set(childId, inDegree.get(childId)! - 1);
      if (inDegree.get(childId) === 0) {
        queue.push(childId);
      }
    }
  }

  // Max project finish time
  let maxProjectDuration = 0;
  earlyFinish.forEach((ef) => {
    if (ef > maxProjectDuration) maxProjectDuration = ef;
  });

  // Backward Pass: Compute Late Finish (LF) and Late Start (LS)
  for (const t of tasks) {
    lateFinish.set(t.id, maxProjectDuration);
    lateStart.set(t.id, maxProjectDuration - durationMap.get(t.id)!);
  }

  // Traverse in reverse topological order
  for (let i = topologicalOrder.length - 1; i >= 0; i--) {
    const currId = topologicalOrder[i];
    const task = taskMap.get(currId)!;

    if (task.dependents.length > 0) {
      let minChildLS = Infinity;
      for (const dep of task.dependents) {
        const childLS = lateStart.get(dep.taskId) ?? maxProjectDuration;
        if (childLS < minChildLS) {
          minChildLS = childLS;
        }
      }
      lateFinish.set(currId, minChildLS);
      lateStart.set(currId, minChildLS - durationMap.get(currId)!);
    }
  }

  // Critical tasks: Slack (LS - ES) === 0
  const criticalTaskIds: string[] = [];
  for (const t of tasks) {
    const es = earlyStart.get(t.id) ?? 0;
    const ls = lateStart.get(t.id) ?? 0;
    const slack = ls - es;
    if (Math.abs(slack) < 0.001) {
      criticalTaskIds.push(t.id);
    }
  }

  return {
    criticalTaskIds,
    totalDurationMinutes: maxProjectDuration,
  };
}

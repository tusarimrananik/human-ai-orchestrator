export interface RankableTask {
  id: string;
  rank?: number;
  order?: number;
  createdAt?: number;
  dependencies?: string[];
  parallelGroup?: string;
}

function hasRank(task: RankableTask): boolean {
  return Number.isInteger(task.rank) && (task.rank as number) > 0;
}

function fallbackOrder(task: RankableTask, sourceIndex: number): number {
  if (typeof task.order === 'number') return task.order;
  if (typeof task.createdAt === 'number') return task.createdAt;
  return sourceIndex;
}

function compareRankPriority(
  a: { task: RankableTask; sourceIndex: number },
  b: { task: RankableTask; sourceIndex: number }
): number {
  const rankA = hasRank(a.task) ? (a.task.rank as number) : Number.MAX_SAFE_INTEGER;
  const rankB = hasRank(b.task) ? (b.task.rank as number) : Number.MAX_SAFE_INTEGER;

  if (rankA !== rankB) return rankA - rankB;
  const ordA = fallbackOrder(a.task, a.sourceIndex);
  const ordB = fallbackOrder(b.task, b.sourceIndex);
  if (ordA !== ordB) return ordA - ordB;
  return a.sourceIndex - b.sourceIndex;
}

function getActiveAncestors<T extends RankableTask>(
  taskId: string,
  byId: Map<string, T>,
  isDone: (task: T) => boolean,
  visited = new Set<string>()
): Set<string> {
  const ancestors = new Set<string>();
  const task = byId.get(taskId);
  if (!task || visited.has(taskId)) return ancestors;
  visited.add(taskId);

  for (const depId of task.dependencies || []) {
    const parent = byId.get(depId);
    if (parent && !isDone(parent)) {
      ancestors.add(depId);
      for (const ancId of getActiveAncestors(depId, byId, isDone, visited)) {
        ancestors.add(ancId);
      }
    }
  }
  return ancestors;
}

function getActiveDescendants<T extends RankableTask>(
  taskId: string,
  activeTasks: readonly T[],
  visited = new Set<string>()
): Set<string> {
  const descendants = new Set<string>();
  if (visited.has(taskId)) return descendants;
  visited.add(taskId);

  for (const t of activeTasks) {
    if ((t.dependencies || []).includes(taskId)) {
      descendants.add(t.id);
      for (const descId of getActiveDescendants(t.id, activeTasks, visited)) {
        descendants.add(descId);
      }
    }
  }
  return descendants;
}

export function rankActiveTasks<T extends RankableTask>(
  tasks: readonly T[],
  isDone: (task: T) => boolean
): T[] {
  const activeTasksWithIndex = tasks
    .map((task, sourceIndex) => ({ task, sourceIndex }))
    .filter(({ task }) => !isDone(task));

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const activeMap = new Map(activeTasksWithIndex.map((item) => [item.task.id, item]));

  // Find all explicitly ranked tasks and their required uncompleted ancestors
  const rankedTaskIds = new Set<string>();
  for (const { task } of activeTasksWithIndex) {
    if (hasRank(task)) {
      rankedTaskIds.add(task.id);
      const ancestors = getActiveAncestors(task.id, byId, isDone);
      for (const ancId of ancestors) {
        if (activeMap.has(ancId)) {
          rankedTaskIds.add(ancId);
        }
      }
    }
  }

  if (rankedTaskIds.size === 0) return [];

  // Filter items in ranked set
  const rankedItems = activeTasksWithIndex.filter(({ task }) => rankedTaskIds.has(task.id));

  // Build dependency graph strictly within the ranked set
  const inDegree = new Map<string, number>();
  const childrenMap = new Map<string, string[]>();

  for (const { task } of rankedItems) {
    inDegree.set(task.id, 0);
    childrenMap.set(task.id, []);
  }

  for (const { task } of rankedItems) {
    for (const depId of task.dependencies || []) {
      if (rankedTaskIds.has(depId)) {
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
        childrenMap.get(depId)?.push(task.id);
      }
    }
  }

  // Priority-queue topological sort
  const available: Array<{ task: T; sourceIndex: number }> = [];
  for (const item of rankedItems) {
    if ((inDegree.get(item.task.id) || 0) === 0) {
      available.push(item);
    }
  }

  const result: T[] = [];

  while (available.length > 0) {
    // Pick the item with the highest priority (smallest rank / fallback order)
    available.sort(compareRankPriority);
    const current = available.shift()!;
    result.push(current.task);

    for (const childId of childrenMap.get(current.task.id) || []) {
      const remaining = (inDegree.get(childId) || 1) - 1;
      inDegree.set(childId, remaining);
      if (remaining === 0) {
        const childItem = activeMap.get(childId);
        if (childItem) {
          available.push(childItem);
        }
      }
    }
  }

  return result;
}

export function normalizeTaskRanks<T extends RankableTask>(
  tasks: readonly T[],
  isDone: (task: T) => boolean
): T[] {
  const normalizeGroup = (g?: string) =>
    g === 'Parallel Group 2' || g === 'Study' ? 'Parallel Group 2' : 'Parallel Group 1';

  const distinctGroups = Array.from(
    new Set(tasks.map((t) => normalizeGroup(t.parallelGroup)))
  );

  const rankById = new Map<string, number>();

  for (const grp of distinctGroups) {
    const grpTasks = tasks.filter((t) => normalizeGroup(t.parallelGroup) === grp && !isDone(t));
    const ranked = rankActiveTasks(grpTasks, isDone);
    ranked.forEach((task, index) => {
      rankById.set(task.id, index + 1);
    });
  }

  return tasks.map((task) => {
    if (isDone(task)) {
      const { rank: _rank, ...withoutRank } = task;
      return withoutRank as T;
    }
    const rank = rankById.get(task.id);
    if (rank === undefined) {
      const { rank: _rank, ...withoutRank } = task;
      return withoutRank as T;
    }
    return { ...task, rank };
  });
}

export function setTaskRank<T extends RankableTask>(
  tasks: readonly T[],
  taskId: string,
  requestedRank: number,
  isDone: (task: T) => boolean
): T[] {
  const target = tasks.find((task) => task.id === taskId);
  if (!target || isDone(target)) return normalizeTaskRanks(tasks, isDone);

  const normalizeGroup = (g?: string) =>
    g === 'Parallel Group 2' || g === 'Study' ? 'Parallel Group 2' : 'Parallel Group 1';

  const targetGroup = normalizeGroup(target.parallelGroup);
  const sameGroupTasks = tasks.filter((t) => normalizeGroup(t.parallelGroup) === targetGroup);
  const otherGroupTasks = tasks.filter((t) => normalizeGroup(t.parallelGroup) !== targetGroup);

  const currentRanked = rankActiveTasks(sameGroupTasks, isDone).filter((task) => task.id !== taskId);
  const nextIndex = Math.min(Math.max(Math.trunc(requestedRank) - 1, 0), currentRanked.length);
  currentRanked.splice(nextIndex, 0, target);

  const provisionalRankById = new Map(currentRanked.map((task, index) => [task.id, index + 1]));

  const provisionalSameGroup = sameGroupTasks.map((task) => {
    const provRank = provisionalRankById.get(task.id);
    if (provRank !== undefined) {
      return { ...task, rank: provRank };
    }
    return { ...task };
  });

  return normalizeTaskRanks([...provisionalSameGroup, ...otherGroupTasks], isDone);
}

export function clearTaskRank<T extends RankableTask>(
  tasks: readonly T[],
  taskId: string,
  isDone: (task: T) => boolean
): T[] {
  const activeTasks = tasks.filter((t) => !isDone(t));
  const descendants = getActiveDescendants(taskId, activeTasks);
  const toClear = new Set<string>([taskId, ...descendants]);

  return normalizeTaskRanks(
    tasks.map((task) => {
      if (!toClear.has(task.id)) return { ...task };
      const { rank: _rank, ...withoutRank } = task;
      return withoutRank as T;
    }),
    isDone
  );
}

/**
 * Returns tasks in alternating execution order between parallel groups:
 * First task #1 from the active turn group, then task #1 from the other group,
 * followed by #2 from each group, alternating turn-by-turn.
 */
export function getInterleavedRankedTasks<T extends RankableTask>(
  tasks: readonly T[],
  isDone: (task: T) => boolean,
  groupOrder = ['Parallel Group 1', 'Parallel Group 2']
): T[] {
  const activeTasks = tasks.filter((t) => !isDone(t));

  const normalizeGroup = (g?: string) =>
    g === 'Parallel Group 2' || g === 'Study' ? 'Parallel Group 2' : 'Parallel Group 1';

  const groupsPresent = Array.from(
    new Set(activeTasks.map((t) => normalizeGroup(t.parallelGroup)))
  );

  if (groupsPresent.length <= 1) {
    return rankActiveTasks(activeTasks, isDone);
  }

  // Preserve group order (Group whose turn it is comes first)
  const allGroups = [
    ...groupOrder.map(normalizeGroup).filter((g) => groupsPresent.includes(g)),
    ...groupsPresent.filter((g) => !groupOrder.map(normalizeGroup).includes(g)),
  ];

  const groupRankedMap = new Map<string, T[]>();
  for (const grp of allGroups) {
    const grpTasks = activeTasks.filter((t) => normalizeGroup(t.parallelGroup) === grp);
    groupRankedMap.set(grp, rankActiveTasks(grpTasks, isDone));
  }

  const maxLen = Math.max(0, ...Array.from(groupRankedMap.values()).map((list) => list.length));
  const interleaved: T[] = [];

  for (let i = 0; i < maxLen; i++) {
    for (const grp of allGroups) {
      const list = groupRankedMap.get(grp);
      if (list && i < list.length) {
        interleaved.push(list[i]);
      }
    }
  }

  return interleaved;
}

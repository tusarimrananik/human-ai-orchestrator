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
  // If tasks are scoped across distinct parallel groups, normalize within each group independently
  const distinctGroups = Array.from(
    new Set(tasks.map((t) => t.parallelGroup || 'Parallel Group 1'))
  );

  if (distinctGroups.length <= 1) {
    const ranked = rankActiveTasks(tasks, isDone);
    const rankById = new Map(ranked.map((task, index) => [task.id, index + 1]));

    return tasks.map((task) => {
      const rank = rankById.get(task.id);
      if (rank === undefined) {
        const { rank: _rank, ...withoutRank } = task;
        return withoutRank as T;
      }
      return { ...task, rank };
    });
  }

  // Multi-group: normalize each parallel group independently (no number can be used twice in the same group)
  const rankById = new Map<string, number>();

  for (const grp of distinctGroups) {
    const grpTasks = tasks.filter((t) => (t.parallelGroup || 'Parallel Group 1') === grp);
    const ranked = rankActiveTasks(grpTasks, isDone);
    ranked.forEach((task, index) => {
      rankById.set(task.id, index + 1);
    });
  }

  return tasks.map((task) => {
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

  const targetGroup = target.parallelGroup || 'Parallel Group 1';
  const sameGroupTasks = tasks.filter((t) => (t.parallelGroup || 'Parallel Group 1') === targetGroup);
  const otherGroupTasks = tasks.filter((t) => (t.parallelGroup || 'Parallel Group 1') !== targetGroup);

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
 * First task #1 from Parallel Group 1, then #1 from Parallel Group 2,
 * followed by #2 from Parallel Group 1, then #2 from Parallel Group 2, etc.
 * Each task has its .rank property normalized so no rank number is ever duplicated
 * within the same parallel group.
 */
export function getInterleavedRankedTasks<T extends RankableTask>(
  tasks: readonly T[],
  isDone: (task: T) => boolean,
  groupOrder = ['Parallel Group 1', 'Parallel Group 2']
): T[] {
  // First normalize all ranks across groups so every group's tasks have strictly unique ranks 1, 2, 3...
  const normalizedTasks = normalizeTaskRanks(tasks, isDone);
  const activeTasks = normalizedTasks.filter((t) => !isDone(t));

  const groupsPresent = Array.from(
    new Set(activeTasks.map((t) => t.parallelGroup || 'Parallel Group 1'))
  );

  if (groupsPresent.length <= 1) {
    const raw = rankActiveTasks(activeTasks, isDone);
    return raw.map((task, index) => ({
      ...task,
      rank: index + 1,
    }));
  }

  // Preserve group order (Parallel Group 1 first, Parallel Group 2 second, etc.)
  const allGroups = [
    ...groupOrder.filter((g) => groupsPresent.includes(g)),
    ...groupsPresent.filter((g) => !groupOrder.includes(g)),
  ];

  const groupRankedMap = new Map<string, T[]>();
  for (const grp of allGroups) {
    const grpTasks = activeTasks.filter((t) => (t.parallelGroup || 'Parallel Group 1') === grp);
    const rawRanked = rankActiveTasks(grpTasks, isDone);
    const normalizedGroupRanked = rawRanked.map((task, index) => ({
      ...task,
      rank: index + 1,
    }));
    groupRankedMap.set(grp, normalizedGroupRanked);
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

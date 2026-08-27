export interface DagTask {
  id: string;
  batch?: string;
  order?: number;
  createdAt?: number;
  dependencies?: string[];
}

export interface AlignedDag<T extends DagTask> {
  levels: Record<number, T[]>;
  orderedLevels: number[];
  lanes: Map<string, number>;
  laneCount: number;
}

export function insertDagTaskBefore<T extends DagTask>(tasks: readonly T[], targetId: string, insertedTask: T): T[] {
  const target = tasks.find((task) => task.id === targetId);
  if (!target || tasks.some((task) => task.id === insertedTask.id)) return [...tasks];
  const inserted = { ...insertedTask, dependencies: [...new Set(target.dependencies || [])] };
  return [...tasks.map((task) => task.id === targetId ? { ...task, dependencies: [insertedTask.id] } : task), inserted];
}

export function addDagTaskAfter<T extends DagTask>(tasks: readonly T[], parentId: string, childTask: T): T[] {
  if (!tasks.some((task) => task.id === parentId) || tasks.some((task) => task.id === childTask.id)) return [...tasks];
  return [...tasks, { ...childTask, dependencies: [parentId] }];
}

export function addDagTaskSibling<T extends DagTask>(
  tasks: readonly T[],
  siblingId: string,
  newTask: T,
  position: 'top' | 'bottom'
): T[] {
  const siblingIndex = tasks.findIndex((task) => task.id === siblingId);
  if (siblingIndex === -1 || tasks.some((task) => task.id === newTask.id)) return [...tasks];
  const sibling = tasks[siblingIndex];
  const taskWithDeps = {
    ...newTask,
    dependencies: [...new Set(sibling.dependencies || [])],
  };

  const copy = [...tasks];
  const insertIndex = position === 'top' ? siblingIndex : siblingIndex + 1;
  copy.splice(insertIndex, 0, taskWithDeps);
  return copy;
}

/** Keeps DAG manual order tied to stable source-array position, not Board execution order. */
export function createSourceOrderComparator<T extends DagTask>(tasks: readonly T[]): (a: T, b: T) => number {
  const positions = new Map(tasks.map((task, index) => [task.id, index]));
  return (a, b) => (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER);
}

/**
 * Creates a DAG-only projection with hidden nodes removed. Dependencies pass
 * through hidden nodes to their nearest visible ancestors, so completing a
 * task shifts every later visible stage left without changing stored data.
 */
export function collapseHiddenDagTasks<T extends DagTask>(
  tasks: readonly T[],
  isHidden: (task: T) => boolean
): T[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));

  function visibleAncestors(id: string, visited = new Set<string>()): string[] {
    if (visited.has(id)) return [];
    visited.add(id);
    const task = byId.get(id);
    if (!task) return [];
    if (!isHidden(task)) return [task.id];
    return (task.dependencies || []).flatMap((parentId) => visibleAncestors(parentId, new Set(visited)));
  }

  return tasks
    .filter((task) => !isHidden(task))
    .map((task) => ({
      ...task,
      dependencies: [...new Set((task.dependencies || []).flatMap((id) => visibleAncestors(id)))],
    }));
}

/**
 * Topologically groups tasks into stages. Root tasks use the selected sort,
 * while later stages inherit parent lanes before applying their own tie-break.
 * Lanes are unique within each stage so they can be rendered as shared CSS-grid
 * rows across every stage without cards overlapping.
 */
export function alignDagLevels<T extends DagTask>(
  tasks: readonly T[],
  compareTasks: (a: T, b: T) => number
): AlignedDag<T> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const levelMemo = new Map<string, number>();

  function levelOf(task: T, stack = new Set<string>()): number {
    const memoized = levelMemo.get(task.id);
    if (memoized !== undefined) return memoized;
    if (stack.has(task.id)) return 0;

    stack.add(task.id);
    const parents = (task.dependencies || [])
      .map((id) => byId.get(id))
      .filter((parent): parent is T => Boolean(parent));
    const level = parents.length
      ? 1 + Math.max(...parents.map((parent) => levelOf(parent, new Set(stack))))
      : 0;
    levelMemo.set(task.id, level);
    return level;
  }

  const levels: Record<number, T[]> = {};
  tasks.forEach((task) => {
    const level = levelOf(task);
    (levels[level] ||= []).push(task);
  });

  const orderedLevels = Object.keys(levels).map(Number).sort((a, b) => a - b);
  if (orderedLevels.length === 0) {
    return { levels, orderedLevels: [], lanes: new Map(), laneCount: 0 };
  }

  // Sort roots by comparator
  if (levels[0]) {
    levels[0] = [...levels[0]].sort((a, b) => compareTasks(a, b) || a.id.localeCompare(b.id));
  }

  // Find primary root ancestor for every task
  const primaryRootMemo = new Map<string, string>();
  const rootOrderMap = new Map((levels[0] || []).map((r, i) => [r.id, i]));

  function getPrimaryRoot(taskId: string, stack = new Set<string>()): string | null {
    if (primaryRootMemo.has(taskId)) return primaryRootMemo.get(taskId)!;
    if (stack.has(taskId)) return null;
    stack.add(taskId);

    const task = byId.get(taskId);
    if (!task) return null;
    if (!task.dependencies || task.dependencies.length === 0) {
      primaryRootMemo.set(taskId, taskId);
      return taskId;
    }

    // Pick parent that belongs to earliest root
    const parentRoots = task.dependencies
      .map((pId) => getPrimaryRoot(pId, new Set(stack)))
      .filter((r): r is string => r !== null);

    if (parentRoots.length === 0) return null;

    parentRoots.sort((a, b) => (rootOrderMap.get(a) ?? 9999) - (rootOrderMap.get(b) ?? 9999));
    const chosen = parentRoots[0];
    primaryRootMemo.set(taskId, chosen);
    return chosen;
  }

  // Calculate the vertical span (max nodes in any single stage) for each root tree
  const rootSpanMap = new Map<string, number>();
  (levels[0] || []).forEach((r) => {
    const countsPerLevel: Record<number, number> = {};
    tasks.forEach((t) => {
      if (getPrimaryRoot(t.id) === r.id) {
        const lvl = levelOf(t);
        countsPerLevel[lvl] = (countsPerLevel[lvl] || 0) + 1;
      }
    });
    const maxInLevel = Math.max(1, ...Object.values(countsPerLevel));
    rootSpanMap.set(r.id, maxInLevel);
  });

  // Assign starting base lane for each root
  const rootBaseLane = new Map<string, number>();
  let currentBase = 0;
  (levels[0] || []).forEach((r) => {
    rootBaseLane.set(r.id, currentBase);
    currentBase += rootSpanMap.get(r.id) || 1;
  });

  const lanes = new Map<string, number>();
  let laneCount = currentBase;

  orderedLevels.forEach((level) => {
    levels[level] = [...levels[level]].sort((a, b) => {
      if (level > 0) {
        const laneA = earliestParentLane(a, lanes, rootBaseLane, getPrimaryRoot);
        const laneB = earliestParentLane(b, lanes, rootBaseLane, getPrimaryRoot);
        if (laneA !== laneB) return laneA - laneB;
      }
      return compareTasks(a, b) || a.id.localeCompare(b.id);
    });

    const occupied = new Set<number>();
    levels[level].forEach((task) => {
      const preferredLane = earliestParentLane(task, lanes, rootBaseLane, getPrimaryRoot);
      const rootId = getPrimaryRoot(task.id);
      const baseMin = rootId !== null && rootBaseLane.has(rootId) ? rootBaseLane.get(rootId)! : 0;
      const start = Number.isFinite(preferredLane) ? Math.max(preferredLane, baseMin) : baseMin;
      let lane = firstFreeLane(occupied, start);
      occupied.add(lane);
      lanes.set(task.id, lane);
      laneCount = Math.max(laneCount, lane + 1);
    });
  });

  return { levels, orderedLevels, lanes, laneCount };
}

function earliestParentLane(
  task: DagTask,
  lanes: Map<string, number>,
  rootBaseLane: Map<string, number>,
  getPrimaryRoot: (id: string) => string | null
): number {
  const parentLanes = (task.dependencies || [])
    .map((id) => lanes.get(id))
    .filter((lane): lane is number => lane !== undefined);
  if (parentLanes.length) return Math.min(...parentLanes);

  const rootId = getPrimaryRoot(task.id);
  if (rootId && rootBaseLane.has(rootId)) {
    return rootBaseLane.get(rootId)!;
  }
  return Number.POSITIVE_INFINITY;
}

function firstFreeLane(occupied: Set<number>, start: number): number {
  let lane = start;
  while (occupied.has(lane)) lane += 1;
  return lane;
}

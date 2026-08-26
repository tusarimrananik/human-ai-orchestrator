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
  const lanes = new Map<string, number>();
  let laneCount = 0;

  orderedLevels.forEach((level) => {
    levels[level] = [...levels[level]].sort((a, b) => {
      if (level > 0) {
        const laneA = earliestParentLane(a, lanes);
        const laneB = earliestParentLane(b, lanes);
        if (laneA !== laneB) return laneA - laneB;
      }
      return compareTasks(a, b) || a.id.localeCompare(b.id);
    });

    const occupied = new Set<number>();
    levels[level].forEach((task) => {
      const preferredLane = earliestParentLane(task, lanes);
      let lane = Number.isFinite(preferredLane) ? preferredLane : firstFreeLane(occupied, 0);
      while (occupied.has(lane)) lane += 1;
      occupied.add(lane);
      lanes.set(task.id, lane);
      laneCount = Math.max(laneCount, lane + 1);
    });
  });

  return { levels, orderedLevels, lanes, laneCount };
}

function earliestParentLane(task: DagTask, lanes: Map<string, number>): number {
  const parentLanes = (task.dependencies || [])
    .map((id) => lanes.get(id))
    .filter((lane): lane is number => lane !== undefined);
  return parentLanes.length ? Math.min(...parentLanes) : Number.POSITIVE_INFINITY;
}

function firstFreeLane(occupied: Set<number>, start: number): number {
  let lane = start;
  while (occupied.has(lane)) lane += 1;
  return lane;
}

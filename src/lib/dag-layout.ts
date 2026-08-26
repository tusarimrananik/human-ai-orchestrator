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

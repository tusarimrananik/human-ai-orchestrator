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
}

/**
 * Topologically groups tasks into stages, sorts roots by the selected rule,
 * then makes each later stage inherit its earliest parent's lane. This keeps
 * every downstream chain aligned with the root that determined the sort.
 */
export function alignDagLevels<T extends DagTask>(
  tasks: readonly T[],
  getSortWeight: (batch: T['batch']) => number
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
  let nextLane = 0;

  orderedLevels.forEach((level) => {
    levels[level] = [...levels[level]].sort((a, b) => {
      if (level > 0) {
        const laneA = earliestParentLane(a, lanes);
        const laneB = earliestParentLane(b, lanes);
        if (laneA !== laneB) return laneA - laneB;
      }

      const weightDifference = getSortWeight(a.batch) - getSortWeight(b.batch);
      if (weightDifference !== 0) return weightDifference;

      const orderA = a.order ?? a.createdAt ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? b.createdAt ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });

    levels[level].forEach((task) => {
      const inheritedLane = earliestParentLane(task, lanes);
      if (Number.isFinite(inheritedLane)) {
        lanes.set(task.id, inheritedLane);
      } else {
        lanes.set(task.id, nextLane++);
      }
    });
  });

  return { levels, orderedLevels, lanes };
}

function earliestParentLane(task: DagTask, lanes: Map<string, number>): number {
  const parentLanes = (task.dependencies || [])
    .map((id) => lanes.get(id))
    .filter((lane): lane is number => lane !== undefined);
  return parentLanes.length ? Math.min(...parentLanes) : Number.POSITIVE_INFINITY;
}

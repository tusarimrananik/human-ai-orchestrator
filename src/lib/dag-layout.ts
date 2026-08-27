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

  // Children mapping: For each task, which child tasks directly depend on it?
  const childrenMap = new Map<string, T[]>();
  tasks.forEach((t) => {
    (t.dependencies || []).forEach((pId) => {
      if (byId.has(pId)) {
        const list = childrenMap.get(pId) || [];
        list.push(t);
        childrenMap.set(pId, list);
      }
    });
  });

  // Sort children deterministically by comparator
  childrenMap.forEach((list, pId) => {
    list.sort((a, b) => compareTasks(a, b) || a.id.localeCompare(b.id));
  });

  // Calculate recursive subtree vertical span (number of parallel rows needed)
  const spanMemo = new Map<string, number>();
  function getSubtreeSpan(taskId: string, stack = new Set<string>()): number {
    if (spanMemo.has(taskId)) return spanMemo.get(taskId)!;
    if (stack.has(taskId)) return 1;
    stack.add(taskId);

    const children = childrenMap.get(taskId) || [];
    if (children.length === 0) {
      spanMemo.set(taskId, 1);
      return 1;
    }

    // Sum of child spans (children at the next stage occupy consecutive vertical rows)
    const childrenSpanSum = children
      .map((c) => getSubtreeSpan(c.id, new Set(stack)))
      .reduce((sum, s) => sum + s, 0);

    const span = Math.max(1, childrenSpanSum);
    spanMemo.set(taskId, span);
    return span;
  }

  const lanes = new Map<string, number>();
  let laneCount = 0;

  // Allocate lane offsets recursively starting from Root tasks
  let currentRootLane = 0;
  const assigned = new Set<string>();

  function allocateTreeLanes(taskId: string, startLane: number) {
    if (assigned.has(taskId)) return;
    assigned.add(taskId);
    lanes.set(taskId, startLane);
    laneCount = Math.max(laneCount, startLane + 1);

    let childLane = startLane;
    const children = childrenMap.get(taskId) || [];
    children.forEach((child) => {
      const childSpan = getSubtreeSpan(child.id);
      allocateTreeLanes(child.id, childLane);
      childLane += childSpan;
    });
  }

  (levels[0] || []).forEach((rootTask) => {
    const rootSpan = getSubtreeSpan(rootTask.id);
    allocateTreeLanes(rootTask.id, currentRootLane);
    currentRootLane += rootSpan;
  });

  // Handle any disconnected or cyclic tasks that weren't assigned through roots
  tasks.forEach((t) => {
    if (!lanes.has(t.id)) {
      lanes.set(t.id, currentRootLane);
      currentRootLane += 1;
      laneCount = Math.max(laneCount, currentRootLane);
    }
  });

  // Sort each level's array so CSS grid subgrid renders tasks in lane order
  orderedLevels.forEach((level) => {
    levels[level] = [...levels[level]].sort((a, b) => {
      const laneA = lanes.get(a.id) ?? 0;
      const laneB = lanes.get(b.id) ?? 0;
      if (laneA !== laneB) return laneA - laneB;
      return compareTasks(a, b) || a.id.localeCompare(b.id);
    });
  });

  return { levels, orderedLevels, lanes, laneCount };
}

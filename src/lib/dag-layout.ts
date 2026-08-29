export interface DagTask {
  id: string;
  batch?: string;
  order?: number;
  dependencies?: string[];
  [key: string]: any;
}

export interface AlignedDag<T extends DagTask> {
  levels: Record<number, T[]>;
  orderedLevels: number[];
  lanes: Map<string, number>;
  laneCount: number;
}

/** Swaps two tasks in a list and re-indexes `order` fields. */
export function swapTaskOrder<T extends DagTask>(tasks: readonly T[], idA: string, idB: string): T[] {
  const indexA = tasks.findIndex((task) => task.id === idA);
  const indexB = tasks.findIndex((task) => task.id === idB);
  if (indexA === -1 || indexB === -1 || indexA === indexB) return [...tasks];

  const copy = [...tasks];
  const [removedA] = copy.splice(indexA, 1);
  copy.splice(indexB, 0, removedA);
  return copy.map((task, order) => ({ ...task, order }));
}

/** Replaces a task's dependencies with the new target IDs. */
export function updateTaskDependencies<T extends DagTask>(
  tasks: readonly T[],
  taskId: string,
  dependencies: string[]
): T[] {
  return tasks.map((task) => (task.id === taskId ? { ...task, dependencies } : task));
}

/** Prepends or appends a task relative to its sibling dependencies. */
export function insertTaskAtBoundary<T extends DagTask>(
  tasks: readonly T[],
  taskToInsert: T,
  boundary: 'start' | 'end' = 'end'
): T[] {
  const copy = [...tasks];
  if (boundary === 'start') {
    copy.unshift(taskToInsert);
  } else {
    copy.push(taskToInsert);
  }
  return copy.map((task, order) => ({ ...task, order }));
}

/** Inserts a task before target in the DAG, adopting target's dependencies while making target depend on it. */
export function insertDagTaskBefore<T extends DagTask>(tasks: readonly T[], targetId: string, newTask: T): T[] {
  const target = tasks.find((task) => task.id === targetId);
  if (!target) return [...tasks, newTask];

  const targetParents = [...(target.dependencies || [])];
  const preparedNewTask: T = { ...newTask, dependencies: targetParents };

  const copy = [...tasks];
  const targetIndex = copy.findIndex((task) => task.id === targetId);
  copy.splice(targetIndex, 0, preparedNewTask);

  return copy.map((task) => (task.id === targetId ? { ...task, dependencies: [preparedNewTask.id] } : task));
}

/** Adds a task after target, making it depend on target. */
export function addDagTaskAfter<T extends DagTask>(tasks: readonly T[], targetId: string, newTask: T): T[] {
  const preparedNewTask: T = { ...newTask, dependencies: [targetId] };
  const targetIndex = tasks.findIndex((task) => task.id === targetId);
  if (targetIndex === -1) return [...tasks, preparedNewTask];

  const copy = [...tasks];
  copy.splice(targetIndex + 1, 0, preparedNewTask);
  return copy;
}

/** Adds a sibling task sharing target's exact parents. */
export function addDagTaskSibling<T extends DagTask>(
  tasks: readonly T[],
  targetId: string,
  newTask: T,
  position: 'top' | 'bottom' = 'bottom'
): T[] {
  const target = tasks.find((task) => task.id === targetId);
  if (!target) return [...tasks, newTask];

  const targetParents = [...(target.dependencies || [])];
  const preparedNewTask: T = { ...newTask, dependencies: targetParents };

  const copy = [...tasks];
  const targetIndex = copy.findIndex((task) => task.id === targetId);
  const insertIndex = position === 'top' ? targetIndex : targetIndex + 1;
  copy.splice(insertIndex, 0, preparedNewTask);
  return copy;
}

/** Keeps DAG manual order tied to stable source-array position, not Board execution order. */
export function createSourceOrderComparator<T extends DagTask>(tasks: readonly T[]): (a: T, b: T) => number {
  const positions = new Map(tasks.map((task, index) => [task.id, index]));
  return (a, b) => (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER);
}

/** Swaps the relative order of all tasks in batchA with batchB in the task array. */
export function swapBatchTaskPositions<T extends DagTask>(
  tasks: readonly T[],
  promotedBatch: string,
  demotedBatch: string
): T[] {
  const list = [...tasks];
  const affectedIndices: number[] = [];
  const promotedTasks: T[] = [];
  const demotedTasks: T[] = [];

  list.forEach((t, i) => {
    const b = t.batch || 'Batch 1';
    if (b === promotedBatch) {
      affectedIndices.push(i);
      promotedTasks.push(t);
    } else if (b === demotedBatch) {
      affectedIndices.push(i);
      demotedTasks.push(t);
    }
  });

  if (affectedIndices.length === 0) return list;

  const combined = [...promotedTasks, ...demotedTasks];
  affectedIndices.forEach((targetIndex, k) => {
    list[targetIndex] = combined[k];
  });

  return list.map((t, idx) => ({ ...t, order: idx }));
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
 * Topologically groups tasks into stages.
 * - stageAlignment = 'parent': child stages horizontally align with their parent node rows.
 * - stageAlignment = 'batch': every stage groups strictly by batch priority order.
 */
export function alignDagLevels<T extends DagTask>(
  tasks: readonly T[],
  compareTasks: (a: T, b: T) => number,
  stageAlignment: 'parent' | 'batch' = 'parent'
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

  // If stageAlignment === 'batch': sort every stage strictly by batch and assign compact rows
  if (stageAlignment === 'batch') {
    const lanes = new Map<string, number>();
    let laneCount = 0;

    orderedLevels.forEach((level) => {
      levels[level] = [...levels[level]].sort((a, b) => compareTasks(a, b) || a.id.localeCompare(b.id));
      levels[level].forEach((t, rowIndex) => {
        lanes.set(t.id, rowIndex);
      });
      laneCount = Math.max(laneCount, levels[level].length);
    });

    return { levels, orderedLevels, lanes, laneCount };
  }

  // Default: stageAlignment === 'parent' (tree-lane horizontal alignment)
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

  childrenMap.forEach((list) => {
    list.sort((a, b) => compareTasks(a, b) || a.id.localeCompare(b.id));
  });

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

    const childrenSpanSum = children
      .map((c) => getSubtreeSpan(c.id, new Set(stack)))
      .reduce((sum, s) => sum + s, 0);

    const span = Math.max(1, childrenSpanSum);
    spanMemo.set(taskId, span);
    return span;
  }

  const lanes = new Map<string, number>();
  let laneCount = 0;
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

  tasks.forEach((t) => {
    if (!lanes.has(t.id)) {
      lanes.set(t.id, currentRootLane);
      currentRootLane += 1;
      laneCount = Math.max(laneCount, currentRootLane);
    }
  });

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

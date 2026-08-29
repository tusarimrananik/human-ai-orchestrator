export interface RankableTask {
  id: string;
  rank?: number;
  order?: number;
  createdAt?: number;
}

function fallbackOrder(task: RankableTask, sourceIndex: number): number {
  if (typeof task.order === 'number') return task.order;
  if (typeof task.createdAt === 'number') return task.createdAt;
  return sourceIndex;
}

export function rankActiveTasks<T extends RankableTask>(
  tasks: readonly T[],
  isDone: (task: T) => boolean
): T[] {
  return tasks
    .map((task, sourceIndex) => ({ task, sourceIndex }))
    .filter(({ task }) => !isDone(task))
    .sort((a, b) => {
      const rankA = Number.isInteger(a.task.rank) && (a.task.rank as number) > 0 ? (a.task.rank as number) : Number.MAX_SAFE_INTEGER;
      const rankB = Number.isInteger(b.task.rank) && (b.task.rank as number) > 0 ? (b.task.rank as number) : Number.MAX_SAFE_INTEGER;
      return rankA - rankB || fallbackOrder(a.task, a.sourceIndex) - fallbackOrder(b.task, b.sourceIndex) || a.sourceIndex - b.sourceIndex;
    })
    .map(({ task }) => task);
}

export function normalizeTaskRanks<T extends RankableTask>(
  tasks: readonly T[],
  isDone: (task: T) => boolean
): T[] {
  const active = rankActiveTasks(tasks, isDone);
  const rankById = new Map(active.map((task, index) => [task.id, index + 1]));
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
  const active = rankActiveTasks(tasks, isDone);
  const currentIndex = active.findIndex((task) => task.id === taskId);
  if (currentIndex === -1) return normalizeTaskRanks(tasks, isDone);

  const [moved] = active.splice(currentIndex, 1);
  const nextIndex = Math.min(Math.max(Math.trunc(requestedRank) - 1, 0), active.length);
  active.splice(nextIndex, 0, moved);
  const rankById = new Map(active.map((task, index) => [task.id, index + 1]));

  return tasks.map((task) => {
    const rank = rankById.get(task.id);
    if (rank === undefined) {
      const { rank: _rank, ...withoutRank } = task;
      return withoutRank as T;
    }
    return { ...task, rank };
  });
}

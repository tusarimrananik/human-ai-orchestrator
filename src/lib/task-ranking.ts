export interface RankableTask {
  id: string;
  rank?: number;
  order?: number;
  createdAt?: number;
}

function hasRank(task: RankableTask): boolean {
  return Number.isInteger(task.rank) && (task.rank as number) > 0;
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
    .filter(({ task }) => !isDone(task) && hasRank(task))
    .sort((a, b) =>
      (a.task.rank as number) - (b.task.rank as number)
      || fallbackOrder(a.task, a.sourceIndex) - fallbackOrder(b.task, b.sourceIndex)
      || a.sourceIndex - b.sourceIndex
    )
    .map(({ task }) => task);
}

export function normalizeTaskRanks<T extends RankableTask>(
  tasks: readonly T[],
  isDone: (task: T) => boolean
): T[] {
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

export function setTaskRank<T extends RankableTask>(
  tasks: readonly T[],
  taskId: string,
  requestedRank: number,
  isDone: (task: T) => boolean
): T[] {
  const target = tasks.find((task) => task.id === taskId);
  if (!target || isDone(target)) return normalizeTaskRanks(tasks, isDone);

  const ranked = rankActiveTasks(tasks, isDone).filter((task) => task.id !== taskId);
  const nextIndex = Math.min(Math.max(Math.trunc(requestedRank) - 1, 0), ranked.length);
  ranked.splice(nextIndex, 0, target);
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

export function clearTaskRank<T extends RankableTask>(
  tasks: readonly T[],
  taskId: string,
  isDone: (task: T) => boolean
): T[] {
  return normalizeTaskRanks(
    tasks.map((task) => {
      if (task.id !== taskId) return { ...task };
      const { rank: _rank, ...withoutRank } = task;
      return withoutRank as T;
    }),
    isDone
  );
}

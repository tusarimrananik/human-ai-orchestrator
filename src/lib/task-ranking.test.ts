import { deepEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { clearTaskRank, getInterleavedRankedTasks, normalizeTaskRanks, rankActiveTasks, setTaskRank } from './task-ranking';

type Task = {
  id: string;
  rank?: number;
  order?: number;
  createdAt: number;
  dependencies?: string[];
  parallelGroup?: string;
  manualStatus: 'todo' | 'progress' | 'done';
};

const isDone = (task: Task) => task.manualStatus === 'done';

test('keeps unranked unfinished tasks unranked and removes ranks from completed tasks', () => {
  const tasks: Task[] = [
    { id: 'ranked-second', rank: 2, order: 0, createdAt: 10, manualStatus: 'todo' },
    { id: 'done', rank: 1, order: 1, createdAt: 11, manualStatus: 'done' },
    { id: 'ranked-first', rank: 1, order: 2, createdAt: 12, manualStatus: 'progress' },
    { id: 'unranked', order: 3, createdAt: 13, manualStatus: 'todo' },
  ];
  const result = normalizeTaskRanks(tasks, isDone);
  deepEqual(result.map((task) => [task.id, task.rank]), [
    ['ranked-second', 2],
    ['done', undefined],
    ['ranked-first', 1],
    ['unranked', undefined],
  ]);
});

test('returns only explicitly ranked unfinished tasks in rank order', () => {
  const tasks: Task[] = [
    { id: 'ranked-second', rank: 2, order: 0, createdAt: 10, manualStatus: 'todo' },
    { id: 'done', rank: 1, order: 1, createdAt: 11, manualStatus: 'done' },
    { id: 'ranked-first', rank: 1, order: 2, createdAt: 12, manualStatus: 'progress' },
    { id: 'unranked', order: 3, createdAt: 13, manualStatus: 'todo' },
  ];
  deepEqual(rankActiveTasks(tasks, isDone).map((task) => task.id), ['ranked-first', 'ranked-second']);
});

test('assigns an unranked task the requested rank and shifts only other ranked tasks', () => {
  const tasks: Task[] = [
    { id: 'ranked-second', rank: 2, order: 0, createdAt: 10, manualStatus: 'todo' },
    { id: 'ranked-first', rank: 1, order: 2, createdAt: 12, manualStatus: 'progress' },
    { id: 'unranked', order: 3, createdAt: 13, manualStatus: 'todo' },
  ];
  const result = setTaskRank(tasks, 'unranked', 1, isDone);
  deepEqual(rankActiveTasks(result, isDone).map((task) => [task.id, task.rank]), [
    ['unranked', 1],
    ['ranked-first', 2],
    ['ranked-second', 3],
  ]);
});

test('clears a task rank and closes the remaining ranked sequence', () => {
  const tasks: Task[] = [
    { id: 'ranked-second', rank: 2, order: 0, createdAt: 10, manualStatus: 'todo' },
    { id: 'ranked-first', rank: 1, order: 2, createdAt: 12, manualStatus: 'progress' },
  ];
  const result = clearTaskRank(tasks, 'ranked-first', isDone);
  deepEqual(rankActiveTasks(result, isDone).map((task) => [task.id, task.rank]), [['ranked-second', 1]]);
  deepEqual(result.find((task) => task.id === 'ranked-first')?.rank, undefined);
});

test('child task cannot be ranked before or lower than its parent', () => {
  const tasks: Task[] = [
    { id: 'parent', rank: 2, order: 0, createdAt: 10, manualStatus: 'todo' },
    { id: 'child', rank: 1, order: 1, createdAt: 11, dependencies: ['parent'], manualStatus: 'todo' },
  ];
  const result = normalizeTaskRanks(tasks, isDone);
  const active = rankActiveTasks(result, isDone);
  deepEqual(active.map((t) => [t.id, t.rank]), [
    ['parent', 1],
    ['child', 2],
  ]);
});

test('ranking a child task auto-ranks its uncompleted parent before the child', () => {
  const tasks: Task[] = [
    { id: 'parent', order: 0, createdAt: 10, manualStatus: 'todo' },
    { id: 'child', order: 1, createdAt: 11, dependencies: ['parent'], manualStatus: 'todo' },
  ];
  const result = setTaskRank(tasks, 'child', 1, isDone);
  const active = rankActiveTasks(result, isDone);
  deepEqual(active.map((t) => [t.id, t.rank]), [
    ['parent', 1],
    ['child', 2],
  ]);
});

test('moving parent after child pushes child after parent', () => {
  const tasks: Task[] = [
    { id: 'parent', rank: 1, order: 0, createdAt: 10, manualStatus: 'todo' },
    { id: 'other', rank: 2, order: 1, createdAt: 11, manualStatus: 'todo' },
    { id: 'child', rank: 3, order: 2, createdAt: 12, dependencies: ['parent'], manualStatus: 'todo' },
  ];
  // Move parent to rank 3 (after 'other')
  const result = setTaskRank(tasks, 'parent', 3, isDone);
  const active = rankActiveTasks(result, isDone);
  deepEqual(active.map((t) => [t.id, t.rank]), [
    ['other', 1],
    ['parent', 2],
    ['child', 3],
  ]);
});

test('clearing parent rank also clears dependent child rank', () => {
  const tasks: Task[] = [
    { id: 'parent', rank: 1, order: 0, createdAt: 10, manualStatus: 'todo' },
    { id: 'child', rank: 2, order: 1, createdAt: 11, dependencies: ['parent'], manualStatus: 'todo' },
    { id: 'independent', rank: 3, order: 2, createdAt: 12, manualStatus: 'todo' },
  ];
  const result = clearTaskRank(tasks, 'parent', isDone);
  const active = rankActiveTasks(result, isDone);
  deepEqual(active.map((t) => [t.id, t.rank]), [['independent', 1]]);
  deepEqual(result.find((t) => t.id === 'child')?.rank, undefined);
});

test('sequential execution queue ranks: ranks alternate between groups and are strictly unique 1, 2, 3, 4', () => {
  const tasks: Task[] = [
    { id: 'g1-a', rank: 1, order: 0, createdAt: 10, parallelGroup: 'Parallel Group 1', manualStatus: 'todo' },
    { id: 'g1-b', rank: 2, order: 1, createdAt: 11, parallelGroup: 'Parallel Group 1', manualStatus: 'todo' },
    { id: 'g2-a', rank: 1, order: 2, createdAt: 12, parallelGroup: 'Parallel Group 2', manualStatus: 'todo' },
    { id: 'g2-b', rank: 2, order: 3, createdAt: 13, parallelGroup: 'Parallel Group 2', manualStatus: 'todo' },
  ];

  const result = normalizeTaskRanks(tasks, isDone);

  deepEqual(result.find((t) => t.id === 'g1-a')?.rank, 1);
  deepEqual(result.find((t) => t.id === 'g2-a')?.rank, 2);
  deepEqual(result.find((t) => t.id === 'g1-b')?.rank, 3);
  deepEqual(result.find((t) => t.id === 'g2-b')?.rank, 4);
});

test('setting rank in execution queue updates ranks sequentially without duplicates', () => {
  const tasks: Task[] = [
    { id: 'g1-a', rank: 1, order: 0, createdAt: 10, parallelGroup: 'Parallel Group 1', manualStatus: 'todo' },
    { id: 'g1-b', rank: 2, order: 1, createdAt: 11, parallelGroup: 'Parallel Group 1', manualStatus: 'todo' },
    { id: 'g2-a', rank: 1, order: 2, createdAt: 12, parallelGroup: 'Parallel Group 2', manualStatus: 'todo' },
  ];

  // Set g1-b to rank 1
  const result = setTaskRank(tasks, 'g1-b', 1, isDone);

  deepEqual(result.find((t) => t.id === 'g1-b')?.rank, 1);
  deepEqual(result.find((t) => t.id === 'g2-a')?.rank, 2);
  deepEqual(result.find((t) => t.id === 'g1-a')?.rank, 3);
});

test('interleaved execution alternates by rank and assigns sequential unique ranks 1, 2, 3, 4...', () => {
  const tasks: Task[] = [
    { id: 'g1-task1', rank: 1, order: 0, createdAt: 10, parallelGroup: 'Parallel Group 1', manualStatus: 'todo' },
    { id: 'g1-task2', rank: 2, order: 1, createdAt: 11, parallelGroup: 'Parallel Group 1', manualStatus: 'todo' },
    { id: 'g1-task3', rank: 3, order: 2, createdAt: 12, parallelGroup: 'Parallel Group 1', manualStatus: 'todo' },
    { id: 'g2-task1', rank: 1, order: 3, createdAt: 13, parallelGroup: 'Parallel Group 2', manualStatus: 'todo' },
    { id: 'g2-task2', rank: 2, order: 4, createdAt: 14, parallelGroup: 'Parallel Group 2', manualStatus: 'todo' },
  ];

  const interleaved = getInterleavedRankedTasks(tasks, isDone);

  deepEqual(
    interleaved.map((t) => [t.id, t.parallelGroup, t.rank]),
    [
      ['g1-task1', 'Parallel Group 1', 1],
      ['g2-task1', 'Parallel Group 2', 2],
      ['g1-task2', 'Parallel Group 1', 3],
      ['g2-task2', 'Parallel Group 2', 4],
      ['g1-task3', 'Parallel Group 1', 5],
    ]
  );
});

test('completing the first task promotes Group 2 task to 1st place (#1)', () => {
  const tasks: Task[] = [
    { id: 'g1-task1', rank: 1, order: 0, createdAt: 10, parallelGroup: 'Parallel Group 1', manualStatus: 'done' },
    { id: 'g2-task1', rank: 2, order: 3, createdAt: 13, parallelGroup: 'Parallel Group 2', manualStatus: 'todo' },
    { id: 'g1-task2', rank: 3, order: 1, createdAt: 11, parallelGroup: 'Parallel Group 1', manualStatus: 'todo' },
  ];

  // Group 2 is now active turn
  const interleaved = getInterleavedRankedTasks(tasks, isDone, ['Parallel Group 2', 'Parallel Group 1']);

  deepEqual(
    interleaved.map((t) => [t.id, t.parallelGroup, t.rank]),
    [
      ['g2-task1', 'Parallel Group 2', 1],
      ['g1-task2', 'Parallel Group 1', 2],
    ]
  );
});

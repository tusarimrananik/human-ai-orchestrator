import { deepEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { clearTaskRank, normalizeTaskRanks, rankActiveTasks, setTaskRank } from './task-ranking';

type Task = {
  id: string;
  rank?: number;
  order?: number;
  createdAt: number;
  dependencies?: string[];
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

import { deepEqual } from 'node:assert/strict';
import { test } from 'node:test';
import { clearTaskRank, normalizeTaskRanks, rankActiveTasks, setTaskRank } from './task-ranking';

type Task = {
  id: string;
  rank?: number;
  order?: number;
  createdAt: number;
  manualStatus: 'todo' | 'progress' | 'done';
};

const tasks: Task[] = [
  { id: 'ranked-second', rank: 2, order: 0, createdAt: 10, manualStatus: 'todo' },
  { id: 'done', rank: 1, order: 1, createdAt: 11, manualStatus: 'done' },
  { id: 'ranked-first', rank: 1, order: 2, createdAt: 12, manualStatus: 'progress' },
  { id: 'unranked', order: 3, createdAt: 13, manualStatus: 'todo' },
];

const isDone = (task: Task) => task.manualStatus === 'done';

test('keeps unranked unfinished tasks unranked and removes ranks from completed tasks', () => {
  const result = normalizeTaskRanks(tasks, isDone);
  deepEqual(result.map((task) => [task.id, task.rank]), [
    ['ranked-second', 2],
    ['done', undefined],
    ['ranked-first', 1],
    ['unranked', undefined],
  ]);
});

test('returns only explicitly ranked unfinished tasks in rank order', () => {
  deepEqual(rankActiveTasks(tasks, isDone).map((task) => task.id), ['ranked-first', 'ranked-second']);
});

test('assigns an unranked task the requested rank and shifts only other ranked tasks', () => {
  const result = setTaskRank(tasks, 'unranked', 1, isDone);
  deepEqual(rankActiveTasks(result, isDone).map((task) => [task.id, task.rank]), [
    ['unranked', 1],
    ['ranked-first', 2],
    ['ranked-second', 3],
  ]);
});

test('clears a task rank and closes the remaining ranked sequence', () => {
  const result = clearTaskRank(tasks, 'ranked-first', isDone);
  deepEqual(rankActiveTasks(result, isDone).map((task) => [task.id, task.rank]), [['ranked-second', 1]]);
  deepEqual(result.find((task) => task.id === 'ranked-first')?.rank, undefined);
});

test('does not mutate source tasks', () => {
  const snapshot = structuredClone(tasks);
  setTaskRank(tasks, 'unranked', 1, isDone);
  clearTaskRank(tasks, 'ranked-first', isDone);
  deepEqual(tasks, snapshot);
});

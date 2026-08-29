import { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeTaskRanks, rankActiveTasks, setTaskRank } from './task-ranking';

type Task = {
  id: string;
  rank?: number;
  order?: number;
  createdAt: number;
  manualStatus: 'todo' | 'progress' | 'done';
};

const tasks: Task[] = [
  { id: 'second', rank: 2, order: 0, createdAt: 10, manualStatus: 'todo' },
  { id: 'done', rank: 1, order: 1, createdAt: 11, manualStatus: 'done' },
  { id: 'first', rank: 1, order: 2, createdAt: 12, manualStatus: 'progress' },
  { id: 'unranked', order: 3, createdAt: 13, manualStatus: 'todo' },
];

test('normalizes unfinished tasks into a unique contiguous rank sequence and leaves done tasks unranked', () => {
  const result = normalizeTaskRanks(tasks, (task) => task.manualStatus === 'done');
  deepEqual(rankActiveTasks(result, (task) => task.manualStatus === 'done').map((task) => [task.id, task.rank]), [
    ['first', 1],
    ['second', 2],
    ['unranked', 3],
  ]);
  equal(result.find((task) => task.id === 'done')?.rank, undefined);
});

test('moves a task to the requested rank and shifts the remaining tasks without duplicates', () => {
  const result = setTaskRank(tasks, 'unranked', 1, (task) => task.manualStatus === 'done');
  deepEqual(rankActiveTasks(result, (task) => task.manualStatus === 'done').map((task) => [task.id, task.rank]), [
    ['unranked', 1],
    ['first', 2],
    ['second', 3],
  ]);
});

test('clamps an oversized rank to the end of the active queue', () => {
  const result = setTaskRank(tasks, 'first', 99, (task) => task.manualStatus === 'done');
  deepEqual(rankActiveTasks(result, (task) => task.manualStatus === 'done').map((task) => task.id), [
    'second',
    'unranked',
    'first',
  ]);
});

test('does not mutate the source array or source task objects', () => {
  const snapshot = structuredClone(tasks);
  setTaskRank(tasks, 'unranked', 1, (task) => task.manualStatus === 'done');
  deepEqual(tasks, snapshot);
});

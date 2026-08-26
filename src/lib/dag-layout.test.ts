import { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import { alignDagLevels } from './dag-layout';

type T = { id: string; batch: string; order: number; dependencies: string[] };

const weight = (batch: string) => ({ B1: 0, B2: 1, B3: 2 }[batch] ?? 99);

test('sorts roots by the selected batch order and keeps every later stage grouped with its root parent', () => {
  const tasks: T[] = [
    { id: 'root-b', batch: 'B2', order: 0, dependencies: [] },
    { id: 'root-a', batch: 'B1', order: 1, dependencies: [] },
    { id: 'b-2', batch: 'B1', order: 2, dependencies: ['root-b'] },
    { id: 'a-2', batch: 'B3', order: 3, dependencies: ['root-a'] },
    { id: 'b-3', batch: 'B1', order: 4, dependencies: ['b-2'] },
    { id: 'a-3', batch: 'B3', order: 5, dependencies: ['a-2'] },
  ];

  const result = alignDagLevels(tasks, weight);
  deepEqual(result.levels[0].map((task) => task.id), ['root-a', 'root-b']);
  deepEqual(result.levels[1].map((task) => task.id), ['a-2', 'b-2']);
  deepEqual(result.levels[2].map((task) => task.id), ['a-3', 'b-3']);
});

test('uses the earliest aligned parent for a task with multiple parents', () => {
  const tasks: T[] = [
    { id: 'root-a', batch: 'B1', order: 0, dependencies: [] },
    { id: 'root-b', batch: 'B2', order: 1, dependencies: [] },
    { id: 'a-2', batch: 'B1', order: 2, dependencies: ['root-a'] },
    { id: 'b-2', batch: 'B2', order: 3, dependencies: ['root-b'] },
    { id: 'shared', batch: 'B3', order: 4, dependencies: ['b-2', 'a-2'] },
  ];

  const result = alignDagLevels(tasks, weight);
  equal(result.lanes.get('shared'), result.lanes.get('a-2'));
});

test('does not mutate the task array', () => {
  const tasks: T[] = [
    { id: 'b', batch: 'B2', order: 0, dependencies: [] },
    { id: 'a', batch: 'B1', order: 1, dependencies: [] },
  ];
  const original = tasks.map((task) => task.id);
  alignDagLevels(tasks, weight);
  deepEqual(tasks.map((task) => task.id), original);
});

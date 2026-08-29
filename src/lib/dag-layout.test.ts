import { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDagTaskAfter,
  addDagTaskSibling,
  alignDagLevels,
  collapseHiddenDagTasks,
  createSourceOrderComparator,
  insertDagTaskBefore,
} from './dag-layout';

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

  const result = alignDagLevels(tasks, (a, b) => weight(a.batch) - weight(b.batch));
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

  const result = alignDagLevels(tasks, (a, b) => weight(a.batch) - weight(b.batch));
  equal(result.lanes.get('shared'), result.lanes.get('a-2'));
});

test('does not mutate the task array', () => {
  const tasks: T[] = [
    { id: 'b', batch: 'B2', order: 0, dependencies: [] },
    { id: 'a', batch: 'B1', order: 1, dependencies: [] },
  ];
  const original = tasks.map((task) => task.id);
  alignDagLevels(tasks, (a, b) => weight(a.batch) - weight(b.batch));
  deepEqual(tasks.map((task) => task.id), original);
});

test('accepts a separate root comparator such as task name sorting', () => {
  const tasks: T[] = [
    { id: 'zebra', batch: 'B1', order: 0, dependencies: [] },
    { id: 'alpha', batch: 'B2', order: 1, dependencies: [] },
    { id: 'zebra-child', batch: 'B1', order: 2, dependencies: ['zebra'] },
    { id: 'alpha-child', batch: 'B2', order: 3, dependencies: ['alpha'] },
  ];

  const result = alignDagLevels(tasks, (a, b) => a.id.localeCompare(b.id));
  deepEqual(result.levels[0].map((task) => task.id), ['alpha', 'zebra']);
  deepEqual(result.levels[1].map((task) => task.id), ['alpha-child', 'zebra-child']);
});

test('assigns unique shared rows inside a stage while preserving parent alignment where available', () => {
  const tasks: T[] = [
    { id: 'root-a', batch: 'B1', order: 0, dependencies: [] },
    { id: 'root-b', batch: 'B2', order: 1, dependencies: [] },
    { id: 'a-first', batch: 'B1', order: 2, dependencies: ['root-a'] },
    { id: 'a-second', batch: 'B1', order: 3, dependencies: ['root-a'] },
    { id: 'b-first', batch: 'B2', order: 4, dependencies: ['root-b'] },
  ];

  const result = alignDagLevels(tasks, (a, b) => weight(a.batch) - weight(b.batch));
  equal(result.lanes.get('a-first'), result.lanes.get('root-a'));
  deepEqual(new Set(result.levels[1].map((task) => result.lanes.get(task.id))).size, 3);
});

test('hides completed DAG nodes and shifts each next visible stage left', () => {
  const tasks = [
    { id: 'root', batch: 'B1', order: 0, dependencies: [], done: true },
    { id: 'stage-2', batch: 'B2', order: 1, dependencies: ['root'], done: false },
    { id: 'stage-3', batch: 'B3', order: 2, dependencies: ['stage-2'], done: false },
  ];

  const visible = collapseHiddenDagTasks(tasks, (task) => task.done);
  deepEqual(visible.map((task) => task.id), ['stage-2', 'stage-3']);
  deepEqual(visible.find((task) => task.id === 'stage-2')?.dependencies, []);
  deepEqual(visible.find((task) => task.id === 'stage-3')?.dependencies, ['stage-2']);

  const result = alignDagLevels(visible, (a, b) => a.order - b.order);
  deepEqual(result.levels[0].map((task) => task.id), ['stage-2']);
  deepEqual(result.levels[1].map((task) => task.id), ['stage-3']);
});

test('starting or ranking a task does not change its manual DAG position', () => {
  const tasks = [
    { id: 'first', batch: 'B1', order: 0, dependencies: [], rank: 3 },
    { id: 'started', batch: 'B1', order: 999, dependencies: [], rank: 1 },
    { id: 'third', batch: 'B1', order: 2, dependencies: [] },
  ];

  const result = alignDagLevels(tasks, createSourceOrderComparator(tasks));
  deepEqual(result.levels[0].map((task) => task.id), ['first', 'started', 'third']);
});

test('inserts a task between a target and all existing parents', () => {
  const tasks: T[] = [
    { id: 'a', batch: 'B1', order: 0, dependencies: [] },
    { id: 'c', batch: 'B1', order: 1, dependencies: [] },
    { id: 'b', batch: 'B2', order: 2, dependencies: ['a', 'c'] },
  ];
  const result = insertDagTaskBefore(tasks, 'b', { id: 'x', batch: 'B2', order: 3, dependencies: [] });
  deepEqual(result.find((task) => task.id === 'x')?.dependencies, ['a', 'c']);
  deepEqual(result.find((task) => task.id === 'b')?.dependencies, ['x']);
});

test('adds multiple children as independent parallel branches', () => {
  const root: T = { id: 'a', batch: 'B1', order: 0, dependencies: [] };
  const first = addDagTaskAfter([root], 'a', { id: 'b', batch: 'B2', order: 1, dependencies: [] });
  const result = addDagTaskAfter(first, 'a', { id: 'c', batch: 'B2', order: 2, dependencies: [] });
  deepEqual(result.find((task) => task.id === 'b')?.dependencies, ['a']);
  deepEqual(result.find((task) => task.id === 'c')?.dependencies, ['a']);
});

test('adds a parallel sibling above target with identical parent dependencies', () => {
  const root: T = { id: 'p', batch: 'B1', order: 0, dependencies: [] };
  const b: T = { id: 'b', batch: 'B2', order: 1, dependencies: ['p'] };
  const a: T = { id: 'a', batch: 'B2', order: 2, dependencies: [] };

  const result = addDagTaskSibling([root, b], 'b', a, 'top');
  deepEqual(result.map((t) => t.id), ['p', 'a', 'b']);
  deepEqual(result.find((t) => t.id === 'a')?.dependencies, ['p']);
});

test('pushes subsequent siblings and roots down based on downstream subtree height', () => {
  const tasks: T[] = [
    // Root 1
    { id: 'task-1', batch: 'B1', order: 0, dependencies: [] },
    // Root 2
    { id: 'dfgdfgd', batch: 'B1', order: 1, dependencies: [] },

    // Stage 2 (Children of Root 1)
    { id: 'child-1', batch: 'B2', order: 2, dependencies: ['task-1'] },
    { id: 'another-task', batch: 'B2', order: 3, dependencies: ['task-1'] }, // has 3 children in Stage 3
    { id: 'dfsdfsdfsdfs', batch: 'B2', order: 4, dependencies: ['task-1'] }, // has 1 child in Stage 3

    // Stage 2 (Children of Root 2)
    { id: 'this-should-work', batch: 'B2', order: 5, dependencies: ['dfgdfgd'] },
    { id: 'hi-there', batch: 'B2', order: 6, dependencies: ['dfgdfgd'] },

    // Stage 3 (Children of another-task)
    { id: 'sub-1', batch: 'B3', order: 7, dependencies: ['another-task'] },
    { id: 'sub-2', batch: 'B3', order: 8, dependencies: ['another-task'] },
    { id: 'task-3', batch: 'B3', order: 9, dependencies: ['another-task'] },

    // Stage 3 (Child of dfsdfsdfsdfs)
    { id: 'dfsfsfs', batch: 'B3', order: 10, dependencies: ['dfsdfsdfsdfs'] },

    // Stage 4 (Child of task-3)
    { id: 'stage4-task', batch: 'B4', order: 11, dependencies: ['task-3'] },
  ];

  const result = alignDagLevels(tasks, (a, b) => a.order - b.order);

  // Root 1 starts at 0
  equal(result.lanes.get('task-1'), 0);
  equal(result.lanes.get('child-1'), 0);

  // another-task is at lane 1, its 3 children occupy lanes 1, 2, 3
  equal(result.lanes.get('another-task'), 1);
  equal(result.lanes.get('sub-1'), 1);
  equal(result.lanes.get('sub-2'), 2);
  equal(result.lanes.get('task-3'), 3);
  equal(result.lanes.get('stage4-task'), 3);

  // dfsdfsdfsdfs must be pushed down to lane 4 (after the 3 lanes of another-task)
  equal(result.lanes.get('dfsdfsdfsdfs'), 4);
  equal(result.lanes.get('dfsfsfs'), 4);

  // dfgdfgd (Root 2) and its subtree must start at lane 5 (below Root 1's 5 total lanes: 0, 1, 2, 3, 4)
  equal(result.lanes.get('dfgdfgd'), 5);
  equal(result.lanes.get('this-should-work'), 5);
  equal(result.lanes.get('hi-there'), 6);
});

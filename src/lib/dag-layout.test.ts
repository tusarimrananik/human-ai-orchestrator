import { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import { alignDagLevels, collapseHiddenDagTasks, createSourceOrderComparator } from './dag-layout';

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

test('starting a task does not change its manual DAG position when Board execution order changes', () => {
  const tasks: T[] = [
    { id: 'first', batch: 'B1', order: 0, dependencies: [] },
    { id: 'started', batch: 'B1', order: 999, dependencies: [] },
    { id: 'third', batch: 'B1', order: 2, dependencies: [] },
  ];

  const result = alignDagLevels(tasks, createSourceOrderComparator(tasks));
  deepEqual(result.levels[0].map((task) => task.id), ['first', 'started', 'third']);
});

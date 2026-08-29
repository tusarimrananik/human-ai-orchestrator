import { equal } from 'node:assert/strict';
import { test } from 'node:test';
import { canonicalizeWorkspacePayload, nextSyncStatusAfterSave } from './workspace-sync';

test('a completed save becomes saved when no newer payload is queued', () => {
  equal(nextSyncStatusAfterSave('payload-a', 'payload-a'), 'saved');
});

test('a completed save remains saving when a newer payload is queued', () => {
  equal(nextSyncStatusAfterSave('payload-a', 'payload-b'), 'saving');
});

test('a completed save becomes saved when the queue is empty', () => {
  equal(nextSyncStatusAfterSave('payload-a', null), 'saved');
});

test('normalized cloud payload and equivalent local state have the same canonical hash', () => {
  type FixtureTask = {
    id: string;
    manualStatus: string;
    dependencies: string[];
    order: number;
    rank?: number;
  };
  const remotePayload = {
    schemaVersion: 2 as const,
    tasks: [
      { id: 'parent', manualStatus: 'todo', dependencies: [], order: 0, rank: 9 },
      { id: 'child', manualStatus: 'todo', dependencies: ['parent'], order: 1, rank: 2 },
      { id: 'done', manualStatus: 'done', dependencies: [], order: 2, rank: 3 },
    ] as FixtureTask[],
    batchPriorityOrder: ['Batch 1'],
    parallelGroups: [],
    isParallelModeActive: false,
    activeTurnGroupName: 'Study',
  };

  const canonicalRemote = canonicalizeWorkspacePayload(remotePayload, {
    normalizeTasks: (tasks) => [
      { ...tasks[0], rank: 1 },
      { ...tasks[1], rank: 2 },
      { id: 'done', manualStatus: 'done', dependencies: [], order: 2 },
    ],
    synchronizeBatchOrder: (order) => [...order, 'Custom Batch'],
  });

  const localPayload = {
    ...remotePayload,
    tasks: canonicalRemote.payload.tasks,
    batchPriorityOrder: canonicalRemote.payload.batchPriorityOrder,
  };
  const canonicalLocal = canonicalizeWorkspacePayload(localPayload, {
    normalizeTasks: (tasks) => tasks,
    synchronizeBatchOrder: (order) => order,
  });

  equal(canonicalRemote.hash, canonicalLocal.hash);
});

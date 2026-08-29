import { equal } from 'node:assert/strict';
import { test } from 'node:test';
import { nextSyncStatusAfterSave } from './workspace-sync';

test('a completed save becomes saved when no newer payload is queued', () => {
  equal(nextSyncStatusAfterSave('payload-a', 'payload-a'), 'saved');
});

test('a completed save remains saving when a newer payload is queued', () => {
  equal(nextSyncStatusAfterSave('payload-a', 'payload-b'), 'saving');
});

test('a completed save becomes saved when the queue is empty', () => {
  equal(nextSyncStatusAfterSave('payload-a', null), 'saved');
});

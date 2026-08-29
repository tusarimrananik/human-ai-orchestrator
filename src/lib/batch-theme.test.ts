import { deepEqual, notEqual, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { getBatchHue, getBatchTheme, syncBatchPriorityWithTasks } from './batch-theme';

test('custom named batches in the same workspace have completely unique colors', () => {
  const workspaceBatches = ['Batch 1', 'Batch 2', 'Batch 3', 'Batch 4', 'goog', 'new'];

  const themes = workspaceBatches.map((b) => getBatchTheme(b, workspaceBatches));
  const hues = themes.map((t) => t.hue);

  const uniqueHues = new Set(hues);
  deepEqual(uniqueHues.size, workspaceBatches.length);

  // Assert goog and Batch 2 do NOT collide
  const googHue = getBatchHue('goog', workspaceBatches);
  const b2Hue = getBatchHue('Batch 2', workspaceBatches);
  notEqual(googHue, b2Hue);

  // Assert new and Batch 3 do NOT collide
  const newHue = getBatchHue('new', workspaceBatches);
  const b3Hue = getBatchHue('Batch 3', workspaceBatches);
  notEqual(newHue, b3Hue);
});

test('adjacent batches have maximally distant hues across the color wheel', () => {
  const workspaceBatches = ['Batch 1', 'Batch 2', 'Batch 3', 'Batch 4'];
  const h1 = getBatchHue('Batch 1', workspaceBatches); // 215 (Blue)
  const h2 = getBatchHue('Batch 2', workspaceBatches); // 350 (Red)
  const h3 = getBatchHue('Batch 3', workspaceBatches); // 145 (Green)
  const h4 = getBatchHue('Batch 4', workspaceBatches); // 42 (Gold)

  const diff1_2 = Math.abs(h1 - h2);
  const diff2_3 = Math.abs(h2 - h3);
  const diff3_4 = Math.abs(h3 - h4);

  ok(diff1_2 > 100, 'Batch 1 and 2 are on opposite sides of color wheel');
  ok(diff2_3 > 100, 'Batch 2 and 3 are on opposite sides of color wheel');
  ok(diff3_4 > 90, 'Batch 3 and 4 are on opposite sides of color wheel');
});

test('syncBatchPriorityWithTasks appends any missing task batches into order so DAG and Batch view always match', () => {
  const current = ['Batch 1', 'Batch 2'];
  const tasks = [
    { batch: 'Batch 1' },
    { batch: 'Batch 3' },
    { batch: 'Sprint Alpha' },
  ];

  const synced = syncBatchPriorityWithTasks(current, tasks);
  deepEqual(synced, ['Batch 1', 'Batch 2', 'Batch 3', 'Sprint Alpha']);
});

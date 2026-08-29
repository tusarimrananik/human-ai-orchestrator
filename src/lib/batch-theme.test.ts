import { deepEqual, equal, notEqual, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { getBatchHue, getBatchTheme, syncBatchPriorityWithTasks } from './batch-theme';

test('batch color is completely immutable and NEVER changes when order shifts', () => {
  const b1HueBefore = getBatchHue('Batch 1');
  const b2HueBefore = getBatchHue('Batch 2');

  // Assert hues are distinct
  notEqual(b1HueBefore, b2HueBefore);

  // Moving Batch 2 above Batch 1 in workspace list
  const reorderedWorkspace = ['Batch 2', 'Batch 1'];
  equal(getBatchHue('Batch 1', reorderedWorkspace), b1HueBefore);
  equal(getBatchHue('Batch 2', reorderedWorkspace), b2HueBefore);
});

test('generates unique distinct colors for numbered and custom batches', () => {
  const batchNames = [
    'Batch 1', 'Batch 2', 'Batch 3', 'Batch 4', 'Batch 5',
    'Batch 6', 'Batch 7', 'Batch 8', 'Batch 9', 'Batch 10',
    'Batch 11', 'Batch 12', 'Batch 13', 'Batch 14', 'Batch 15',
  ];

  const themes = batchNames.map((name) => getBatchTheme(name));
  const hues = themes.map((t) => t.hue);

  const uniqueHues = new Set(hues);
  deepEqual(uniqueHues.size, batchNames.length);

  for (const theme of themes) {
    ok(theme.cardStyle.backgroundColor, 'has full-element card background');
    ok(theme.cardStyle.borderColor, 'has full card border');
    ok(theme.cardStyle.color, 'has card text color');
  }
});

test('adjacent batches have maximally distant hues across the color wheel', () => {
  const h1 = getBatchHue('Batch 1'); // 215 (Blue)
  const h2 = getBatchHue('Batch 2'); // 350 (Red)
  const h3 = getBatchHue('Batch 3'); // 145 (Green)
  const h4 = getBatchHue('Batch 4'); // 42 (Gold)

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

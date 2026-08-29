import { deepEqual, equal, notEqual, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { getBatchHue, getBatchTheme, syncBatchPriorityWithTasks } from './batch-theme';

test('batch color is completely stable and does not change when order changes', () => {
  const b1HueBefore = getBatchHue('Batch 1');
  const b2HueBefore = getBatchHue('Batch 2');

  // Assert hues are distinct
  notEqual(b1HueBefore, b2HueBefore);

  // Assert hues remain identical regardless of any external list order
  equal(getBatchHue('Batch 1'), b1HueBefore);
  equal(getBatchHue('Batch 2'), b2HueBefore);
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

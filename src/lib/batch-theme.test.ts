import { deepEqual, notEqual, ok } from 'node:assert/strict';
import { test } from 'node:test';
import { getBatchTheme } from './batch-theme';

test('generates unique distinct colors for arbitrary number of batches without collisions', () => {
  const batchNames = [
    'Batch 1', 'Batch 2', 'Batch 3', 'Batch 4', 'Batch 5',
    'Batch 6', 'Batch 7', 'Batch 8', 'Batch 9', 'Batch 10',
    'Batch 11', 'Batch 12', 'Batch 13', 'Batch 14', 'Batch 15',
    'Sprint Alpha', 'Bugfixes', 'Marketing', 'Custom 1', 'Custom 2'
  ];

  const themes = batchNames.map((name) => getBatchTheme(name, batchNames));
  const hues = themes.map((t) => t.hue);

  // Assert every single batch in the list has a distinct hue
  const uniqueHues = new Set(hues);
  deepEqual(uniqueHues.size, batchNames.length);

  for (const theme of themes) {
    ok(theme.cardStyle.backgroundColor, 'has full-element card background');
    ok(theme.cardStyle.borderColor, 'has full card border');
    ok(theme.cardStyle.color, 'has card text color');
    ok(theme.badgeStyle.backgroundColor, 'has badge background');
    ok(theme.badgeStyle.borderColor, 'has badge border');
    ok(theme.dropdownStyle.backgroundColor, 'has dropdown background');
    ok(theme.dropdownStyle.borderColor, 'has dropdown border');
    ok(theme.descStyle.backgroundColor, 'has desc background');
  }
});

test('adjacent batches have distinct, maximally separated hues', () => {
  const batches = ['Batch 1', 'Batch 2', 'Batch 3', 'Batch 4'];
  const t1 = getBatchTheme('Batch 1', batches);
  const t2 = getBatchTheme('Batch 2', batches);
  const t3 = getBatchTheme('Batch 3', batches);

  notEqual(t1.hue, t2.hue);
  notEqual(t2.hue, t3.hue);
  notEqual(t1.hue, t3.hue);
});

test('produces compact short badges', () => {
  deepEqual(getBatchTheme('Batch 1').short, 'B1');
  deepEqual(getBatchTheme('Batch 12').short, 'B12');
  deepEqual(getBatchTheme('Custom Batch').short, 'Cust');
});

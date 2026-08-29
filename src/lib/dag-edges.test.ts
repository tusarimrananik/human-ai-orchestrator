import { deepEqual, equal } from 'node:assert/strict';
import { test } from 'node:test';
import { getVisibleDagEdges, isDagView } from './dag-edges';

test('renders an edge only when both source and target are visible', () => {
  const tasks = [
    { id: 'visible-parent', dependencies: [] },
    { id: 'visible-child', dependencies: ['visible-parent', 'hidden-parent'] },
  ];

  deepEqual(getVisibleDagEdges(tasks), [
    { sourceId: 'visible-parent', targetId: 'visible-child' },
  ]);
});

test('empty Queue DAG produces zero edges and cannot retain orphan arrows', () => {
  deepEqual(getVisibleDagEdges([]), []);
});

test('removes duplicate and self-referencing edges', () => {
  const tasks = [
    { id: 'a', dependencies: [] },
    { id: 'b', dependencies: ['a', 'a', 'b'] },
  ];

  deepEqual(getVisibleDagEdges(tasks), [{ sourceId: 'a', targetId: 'b' }]);
});

test('all three DAG projections calculate arrows, non-DAG views do not', () => {
  equal(isDagView('queue'), true);
  equal(isDagView('backlog'), true);
  equal(isDagView('dependency'), true);
  equal(isDagView('ranked'), false);
  equal(isDagView('batch'), false);
});

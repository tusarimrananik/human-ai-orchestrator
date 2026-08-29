export interface DagEdgeTask {
  id: string;
  dependencies?: string[];
}

export interface DagEdge {
  sourceId: string;
  targetId: string;
}

/** Returns only edges whose source and target both exist in the current DAG projection. */
export function getVisibleDagEdges<T extends DagEdgeTask>(
  visibleTasks: readonly T[]
): DagEdge[] {
  const visibleIds = new Set(visibleTasks.map((task) => task.id));
  const seen = new Set<string>();
  const edges: DagEdge[] = [];

  for (const target of visibleTasks) {
    for (const sourceId of target.dependencies || []) {
      if (!visibleIds.has(sourceId) || sourceId === target.id) continue;
      const key = `${sourceId}\u0000${target.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ sourceId, targetId: target.id });
    }
  }

  return edges;
}

export function isDagView(
  view: string
): view is 'queue' | 'backlog' | 'dependency' {
  return view === 'queue' || view === 'backlog' || view === 'dependency';
}

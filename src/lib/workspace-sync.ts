export type WorkspaceSyncStatus = 'saved' | 'saving';

export interface CanonicalWorkspacePayload<TTask, TGroup> {
  schemaVersion: 2;
  tasks: TTask[];
  batchPriorityOrder: string[];
  parallelGroups: TGroup[];
  isParallelModeActive: boolean;
  activeTurnGroupName: string;
}

export function canonicalizeWorkspacePayload<TTask, TGroup>(
  payload: CanonicalWorkspacePayload<TTask, TGroup>,
  transforms: {
    normalizeTasks: (tasks: TTask[]) => TTask[];
    synchronizeBatchOrder: (order: string[], tasks: TTask[]) => string[];
  }
): { payload: CanonicalWorkspacePayload<TTask, TGroup>; hash: string } {
  const tasks = transforms.normalizeTasks(payload.tasks);
  const canonicalPayload: CanonicalWorkspacePayload<TTask, TGroup> = {
    ...payload,
    schemaVersion: 2,
    tasks,
    batchPriorityOrder: transforms.synchronizeBatchOrder(
      payload.batchPriorityOrder,
      tasks
    ),
  };
  return { payload: canonicalPayload, hash: JSON.stringify(canonicalPayload) };
}

/**
 * A completed save is final only when no different payload was queued while
 * the request was in flight. A newer queued payload keeps the UI in saving.
 */
export function nextSyncStatusAfterSave(
  sentPayloadHash: string,
  queuedPayloadHash: string | null
): WorkspaceSyncStatus {
  return queuedPayloadHash !== null && queuedPayloadHash !== sentPayloadHash
    ? 'saving'
    : 'saved';
}

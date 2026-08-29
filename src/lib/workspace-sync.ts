export type WorkspaceSyncStatus = 'saved' | 'saving';

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

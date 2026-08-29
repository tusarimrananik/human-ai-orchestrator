export interface BatchTheme {
  hue: number;
  short: string;
  cardStyle: React.CSSProperties;
  dagNodeStyle: React.CSSProperties;
  badgeStyle: React.CSSProperties;
  dropdownStyle: React.CSSProperties;
  descStyle: React.CSSProperties;
}

// Curated maximally separated hues spanning the color wheel
// Consecutive slots jump between opposite/distinct spectrum quadrants:
// Blue (215) -> Red (350) -> Green (145) -> Gold (42) -> Purple (275) -> Cyan (185) -> Magenta (325) -> Orange (22)...
const CURATED_HUES: number[] = [
  215, // Slot 0: Electric Sky Blue
  350, // Slot 1: Crimson Ruby Red
  145, // Slot 2: Emerald Green
  42,  // Slot 3: Bright Amber Gold
  275, // Slot 4: Electric Purple
  185, // Slot 5: Neon Aqua / Cyan
  325, // Slot 6: Hot Magenta Pink
  22,  // Slot 7: Vivid Tangerine Orange
  95,  // Slot 8: Bright Lime Green
  245, // Slot 9: Deep Royal Indigo
  165, // Slot 10: Seafoam Teal
  300, // Slot 11: Bright Violet
];

// Golden angle in degrees (~137.50776405°) for slot 12+
const GOLDEN_ANGLE = 137.508;

function slotToHue(slotIndex: number): number {
  if (slotIndex >= 0 && slotIndex < CURATED_HUES.length) {
    return CURATED_HUES[slotIndex];
  }
  return Math.round((215 + slotIndex * GOLDEN_ANGLE) % 360);
}

export function getBatchHue(rawBatch: string = 'Batch 1', allBatches?: readonly string[]): number {
  const batch = !rawBatch || rawBatch === 'None' ? 'Batch 1' : rawBatch;

  // 1. If workspace batch list is provided and includes this batch, assign its unique slot
  if (allBatches && Array.isArray(allBatches)) {
    const idx = allBatches.indexOf(batch);
    if (idx !== -1) {
      return slotToHue(idx);
    }
  }

  // 2. If numbered batch name (e.g. "Batch 1", "Batch 2")
  const match = batch.match(/^Batch\s+(\d+)$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    return slotToHue(Math.max(0, num - 1));
  }

  // 3. Fallback deterministic slot for standalone custom names
  let hash = 0;
  for (let i = 0; i < batch.length; i++) {
    hash = (hash << 5) - hash + batch.charCodeAt(i);
    hash |= 0;
  }
  const hashSlot = Math.abs(hash) % 24;
  return slotToHue(hashSlot);
}

export function getBatchTheme(rawBatch: string = 'Batch 1', allBatches?: readonly string[]): BatchTheme {
  const batch = !rawBatch || rawBatch === 'None' ? 'Batch 1' : rawBatch;
  const match = batch.match(/^Batch\s+(\d+)$/i);
  const short = match ? `B${match[1]}` : batch.length > 5 ? batch.slice(0, 4) : batch;
  const hue = getBatchHue(batch, allBatches);

  // Vivid, full-element colored boxes with clear contrast
  const cardBg = `hsla(${hue}, 85%, 13%, 0.88)`;
  const cardBorder = `hsla(${hue}, 90%, 55%, 0.95)`;
  const cardText = `hsla(${hue}, 95%, 95%, 1)`;

  const badgeBg = `hsla(${hue}, 90%, 25%, 0.8)`;
  const badgeBorder = `hsla(${hue}, 95%, 65%, 1)`;
  const badgeText = `hsla(${hue}, 95%, 95%, 1)`;

  const dropdownBg = `hsla(${hue}, 90%, 10%, 0.95)`;
  const dropdownBorder = `hsla(${hue}, 90%, 60%, 1)`;
  const dropdownText = `hsla(${hue}, 95%, 95%, 1)`;

  const descBg = `hsla(${hue}, 85%, 8%, 0.9)`;
  const descBorder = `hsla(${hue}, 75%, 35%, 0.8)`;
  const descText = `hsla(${hue}, 90%, 90%, 1)`;

  const cardStyle: React.CSSProperties = {
    backgroundColor: cardBg,
    borderColor: cardBorder,
    color: cardText,
  };

  const dagNodeStyle: React.CSSProperties = {
    backgroundColor: cardBg,
    borderColor: cardBorder,
    color: cardText,
  };

  const badgeStyle: React.CSSProperties = {
    backgroundColor: badgeBg,
    borderColor: badgeBorder,
    color: badgeText,
  };

  const dropdownStyle: React.CSSProperties = {
    backgroundColor: dropdownBg,
    borderColor: dropdownBorder,
    color: dropdownText,
  };

  const descStyle: React.CSSProperties = {
    backgroundColor: descBg,
    borderColor: descBorder,
    color: descText,
  };

  return {
    hue,
    short,
    cardStyle,
    dagNodeStyle,
    badgeStyle,
    dropdownStyle,
    descStyle,
  };
}

/** Ensures all batches present on tasks are included in batch priority list so DAG and Batch views stay 100% in sync. */
export function syncBatchPriorityWithTasks(
  currentOrder: readonly string[],
  tasks: readonly { batch?: string }[]
): string[] {
  const result = [...currentOrder];
  const seen = new Set(result);

  for (const t of tasks) {
    const b = t.batch || 'Batch 1';
    if (b && !seen.has(b)) {
      seen.add(b);
      result.push(b);
    }
  }

  return result;
}

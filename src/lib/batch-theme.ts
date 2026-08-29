export interface BatchTheme {
  hue: number;
  short: string;
  cardStyle: React.CSSProperties;
  dagNodeStyle: React.CSSProperties;
  badgeStyle: React.CSSProperties;
  dropdownStyle: React.CSSProperties;
  descStyle: React.CSSProperties;
}

// Curated maximally separated hues spanning the color wheel:
// 12 distinct anchor colors ensuring adjacent batches never look alike
const CURATED_HUES: number[] = [
  215, // Slot 0 / B1: Electric Sky Blue
  350, // Slot 1 / B2: Crimson Ruby Red
  145, // Slot 2 / B3: Emerald Green
  42,  // Slot 3 / B4: Bright Amber Gold
  275, // Slot 4 / B5: Electric Purple
  185, // Slot 5 / B6: Neon Aqua / Cyan
  325, // Slot 6 / B7: Hot Magenta Pink
  22,  // Slot 7 / B8: Vivid Tangerine Orange
  95,  // Slot 8 / B9: Bright Lime Green
  245, // Slot 9 / B10: Deep Royal Indigo
  165, // Slot 10 / B11: Seafoam Teal
  300, // Slot 11 / B12: Bright Violet
];

// Golden angle in degrees (~137.50776405°) for higher numbers / custom names
const GOLDEN_ANGLE = 137.508;

function slotToHue(slotIndex: number): number {
  if (slotIndex >= 0 && slotIndex < CURATED_HUES.length) {
    return CURATED_HUES[slotIndex];
  }
  return Math.round((215 + slotIndex * GOLDEN_ANGLE) % 360);
}

/**
 * Returns a permanent, immutable hue strictly bound to the batch name itself.
 * It NEVER changes when the batch is moved up or down in batchPriorityOrder.
 */
export function getBatchHue(rawBatch: string = 'Batch 1', _allBatches?: readonly string[]): number {
  const batch = !rawBatch || rawBatch === 'None' ? 'Batch 1' : rawBatch;

  // 1. Numbered batches like "Batch 1", "Batch 2", "B3" get their dedicated permanent hue
  const match = batch.match(/^(?:Batch\s*|B)(\d+)$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    return slotToHue(Math.max(0, num - 1));
  }

  // 2. Custom names get a stable deterministic slot starting after standard numbered batches (slot 12+)
  let hash = 0;
  for (let i = 0; i < batch.length; i++) {
    hash = (hash << 5) - hash + batch.charCodeAt(i);
    hash |= 0;
  }
  const customSlot = 12 + (Math.abs(hash) % 24);
  return slotToHue(customSlot);
}

export function getBatchTheme(rawBatch: string = 'Batch 1', _allBatches?: readonly string[]): BatchTheme {
  const batch = !rawBatch || rawBatch === 'None' ? 'Batch 1' : rawBatch;
  const match = batch.match(/^(?:Batch\s*|B)(\d+)$/i);
  const short = match ? `B${match[1]}` : batch.length > 5 ? batch.slice(0, 4) : batch;
  const hue = getBatchHue(batch);

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

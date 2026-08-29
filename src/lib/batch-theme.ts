export interface BatchTheme {
  hue: number;
  short: string;
  cardBg: string;
  cardTitle: string;
  descBg: string;
  badge: string;
  dropdown: string;
  dagNode: string;
  cardStyle: React.CSSProperties;
  dagNodeStyle: React.CSSProperties;
  badgeStyle: React.CSSProperties;
  dropdownStyle: React.CSSProperties;
  descStyle: React.CSSProperties;
}

// Golden angle in degrees (~137.50776405°), provides optimal dispersion across 360° hue circle
const GOLDEN_ANGLE = 137.508;

export function getBatchHue(rawBatch: string = 'Batch 1', allBatches: string[] = []): number {
  const batch = !rawBatch || rawBatch === 'None' ? 'Batch 1' : rawBatch;

  // If the batch is in the known list, use its index * GOLDEN_ANGLE for zero-collision sequence
  const idx = allBatches.indexOf(batch);
  if (idx !== -1) {
    return Math.round((210 + idx * GOLDEN_ANGLE) % 360);
  }

  const match = batch.match(/^Batch\s+(\d+)$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    return Math.round((210 + (num - 1) * GOLDEN_ANGLE) % 360);
  }

  // Hash-based deterministic hue for arbitrary custom names
  let hash = 0;
  for (let i = 0; i < batch.length; i++) {
    hash = (hash << 5) - hash + batch.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

export function getBatchTheme(rawBatch: string = 'Batch 1', allBatches: string[] = []): BatchTheme {
  const batch = !rawBatch || rawBatch === 'None' ? 'Batch 1' : rawBatch;
  const match = batch.match(/^Batch\s+(\d+)$/i);
  const short = match ? `B${match[1]}` : batch.length > 5 ? batch.slice(0, 4) : batch;
  const hue = getBatchHue(batch, allBatches);

  // Calculate rich, high-contrast, beautiful dark-mode colors
  const cardBgColor = `hsla(${hue}, 70%, 10%, 0.6)`;
  const cardBorderColor = `hsla(${hue}, 80%, 55%, 0.8)`;
  const cardTextColor = `hsla(${hue}, 95%, 90%, 1)`;

  const badgeBgColor = `hsla(${hue}, 75%, 20%, 0.5)`;
  const badgeBorderColor = `hsla(${hue}, 85%, 60%, 0.8)`;
  const badgeTextColor = `hsla(${hue}, 95%, 85%, 1)`;

  const dropdownBgColor = `hsla(${hue}, 70%, 8%, 0.95)`;
  const dropdownBorderColor = `hsla(${hue}, 80%, 55%, 0.85)`;
  const dropdownTextColor = `hsla(${hue}, 95%, 85%, 1)`;

  const descBgColor = `hsla(${hue}, 60%, 8%, 0.7)`;
  const descBorderColor = `hsla(${hue}, 70%, 35%, 0.6)`;
  const descTextColor = `hsla(${hue}, 90%, 85%, 0.95)`;

  const cardStyle: React.CSSProperties = {
    backgroundColor: cardBgColor,
    borderColor: cardBorderColor,
    color: cardTextColor,
  };

  const dagNodeStyle: React.CSSProperties = {
    backgroundColor: cardBgColor,
    borderColor: cardBorderColor,
    color: cardTextColor,
  };

  const badgeStyle: React.CSSProperties = {
    backgroundColor: badgeBgColor,
    borderColor: badgeBorderColor,
    color: badgeTextColor,
  };

  const dropdownStyle: React.CSSProperties = {
    backgroundColor: dropdownBgColor,
    borderColor: dropdownBorderColor,
    color: dropdownTextColor,
  };

  const descStyle: React.CSSProperties = {
    backgroundColor: descBgColor,
    borderColor: descBorderColor,
    color: descTextColor,
  };

  return {
    hue,
    short,
    cardBg: 'border shadow-sm space-y-1',
    cardTitle: 'font-bold',
    descBg: 'p-1 rounded border',
    badge: 'border font-bold',
    dropdown: 'border font-bold rounded',
    dagNode: 'border-2 shadow select-none',
    cardStyle,
    dagNodeStyle,
    badgeStyle,
    dropdownStyle,
    descStyle,
  };
}

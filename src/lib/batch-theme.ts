export interface BatchTheme {
  hue: number;
  short: string;
  badgeStyle: React.CSSProperties;
  dropdownStyle: React.CSSProperties;
  borderAccentStyle: React.CSSProperties;
}

// Golden angle in degrees (~137.50776405°), provides optimal dispersion across 360° hue circle
const GOLDEN_ANGLE = 137.508;

export function getBatchHue(rawBatch: string = 'Batch 1', allBatches: string[] = []): number {
  const batch = !rawBatch || rawBatch === 'None' ? 'Batch 1' : rawBatch;

  const idx = allBatches.indexOf(batch);
  if (idx !== -1) {
    return Math.round((210 + idx * GOLDEN_ANGLE) % 360);
  }

  const match = batch.match(/^Batch\s+(\d+)$/i);
  if (match) {
    const num = parseInt(match[1], 10);
    return Math.round((210 + (num - 1) * GOLDEN_ANGLE) % 360);
  }

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

  // Vibrant, high-contrast accent colors on dark backgrounds
  const badgeBg = `hsla(${hue}, 80%, 18%, 0.55)`;
  const badgeBorder = `hsla(${hue}, 85%, 55%, 0.85)`;
  const badgeText = `hsla(${hue}, 95%, 85%, 1)`;

  const dropdownBg = `hsla(${hue}, 70%, 10%, 0.95)`;
  const dropdownBorder = `hsla(${hue}, 80%, 50%, 0.8)`;
  const dropdownText = `hsla(${hue}, 95%, 88%, 1)`;

  return {
    hue,
    short,
    badgeStyle: {
      backgroundColor: badgeBg,
      borderColor: badgeBorder,
      color: badgeText,
    },
    dropdownStyle: {
      backgroundColor: dropdownBg,
      borderColor: dropdownBorder,
      color: dropdownText,
    },
    borderAccentStyle: {
      borderLeftColor: badgeBorder,
      borderLeftWidth: '3px',
    },
  };
}

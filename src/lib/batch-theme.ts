export interface BatchTheme {
  hue: number;
  short: string;
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

  // Full-element rich colored boxes with high contrast
  const cardBg = `hsla(${hue}, 85%, 8%, 0.75)`;
  const cardBorder = `hsla(${hue}, 85%, 55%, 0.85)`;
  const cardText = `hsla(${hue}, 95%, 92%, 1)`;

  const badgeBg = `hsla(${hue}, 85%, 20%, 0.6)`;
  const badgeBorder = `hsla(${hue}, 90%, 60%, 0.9)`;
  const badgeText = `hsla(${hue}, 95%, 90%, 1)`;

  const dropdownBg = `hsla(${hue}, 85%, 8%, 0.95)`;
  const dropdownBorder = `hsla(${hue}, 85%, 55%, 0.85)`;
  const dropdownText = `hsla(${hue}, 95%, 90%, 1)`;

  const descBg = `hsla(${hue}, 80%, 5%, 0.85)`;
  const descBorder = `hsla(${hue}, 70%, 30%, 0.7)`;
  const descText = `hsla(${hue}, 90%, 88%, 0.95)`;

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

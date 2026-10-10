export interface MeasuredSettledWindowGap {
  maxSettledWindowInternalGapMs: number | null;
  unavailableReason: string | null;
}

/**
 * Observed max inter-sample gap inside the settled window — distinct from scanner policy limits.
 */
export function measureMaxSettledWindowInternalGapMs(
  samples: Array<{ timestamp: Date }>,
  settledWindowStart: Date | null,
  settledWindowEnd: Date | null,
): MeasuredSettledWindowGap {
  if (!settledWindowStart || !settledWindowEnd) {
    return {
      maxSettledWindowInternalGapMs: null,
      unavailableReason: 'SETTLED_WINDOW_NOT_IDENTIFIED',
    };
  }
  if (settledWindowEnd.getTime() < settledWindowStart.getTime()) {
    return {
      maxSettledWindowInternalGapMs: null,
      unavailableReason: 'SETTLED_WINDOW_INVERTED',
    };
  }

  const inWindow = samples
    .filter(
      (s) =>
        s.timestamp.getTime() >= settledWindowStart.getTime() &&
        s.timestamp.getTime() <= settledWindowEnd.getTime(),
    )
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (inWindow.length < 2) {
    return {
      maxSettledWindowInternalGapMs: null,
      unavailableReason: 'INSUFFICIENT_SETTLED_WINDOW_SAMPLES',
    };
  }

  let maxGapMs = 0;
  for (let i = 1; i < inWindow.length; i++) {
    const gapMs = inWindow[i].timestamp.getTime() - inWindow[i - 1].timestamp.getTime();
    if (gapMs > maxGapMs) maxGapMs = gapMs;
  }

  return { maxSettledWindowInternalGapMs: maxGapMs, unavailableReason: null };
}

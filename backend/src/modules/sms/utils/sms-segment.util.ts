/** Estimate GSM/UCS-2 SMS segment count (indicative — not a billing guarantee). */
export function estimateSmsSegmentCount(body: string): number {
  if (!body) return 0;
  const isUnicode = [...body].some((c) => c.charCodeAt(0) > 127);
  const single = isUnicode ? 70 : 160;
  const concat = isUnicode ? 67 : 153;
  if (body.length <= single) return 1;
  return Math.ceil(body.length / concat);
}

/** Rough USD estimate per segment — metadata only, not guaranteed billing. */
export function estimateSmsCostUsd(segmentCount: number, region = 'EU'): number | null {
  if (segmentCount <= 0) return null;
  const perSegment = region === 'EU' ? 0.08 : 0.0075;
  return Math.round(segmentCount * perSegment * 1_000_000) / 1_000_000;
}

export function assertSmsBodyLength(body: string, maxSegments = 3): void {
  const segments = estimateSmsSegmentCount(body);
  if (segments > maxSegments) {
    throw new Error(`SMS body exceeds ${maxSegments} segment limit (estimated ${segments} segments)`);
  }
  if (body.length > 1600) {
    throw new Error('SMS body exceeds maximum character length');
  }
}

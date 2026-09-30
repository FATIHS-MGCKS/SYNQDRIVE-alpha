const HV_SEGMENT_ID = /^HV_SEGMENT_(\d+)$/;

export function parseM3_3HvH2LifecycleSegmentIndex(lifecycleSegmentId: string): number {
  const match = HV_SEGMENT_ID.exec(lifecycleSegmentId);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Number.parseInt(match[1]!, 10);
}

export function compareM3_3HvH2LifecycleSegmentIds(a: string, b: string): number {
  const ai = parseM3_3HvH2LifecycleSegmentIndex(a);
  const bi = parseM3_3HvH2LifecycleSegmentIndex(b);
  if (ai !== bi) return ai - bi;
  return a.localeCompare(b);
}

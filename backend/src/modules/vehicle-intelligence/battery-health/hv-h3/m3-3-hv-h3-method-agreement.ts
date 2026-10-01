import { M3_3_HV_H3_RELATIVE_DIFFERENCE_REFERENCE } from './m3-3-hv-h3.constants';
import type {
  M3_3HvH3LifecycleSegmentTrendsV1,
  M3_3HvH3MethodAgreementDiagnosticsV1,
  M3_3HvH3MethodAgreementSessionV1,
} from './m3-3-hv-h3.types';

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function buildM3_3HvH3MethodAgreementDiagnosticsV1(
  lifecycleSegments: M3_3HvH3LifecycleSegmentTrendsV1[],
): M3_3HvH3MethodAgreementDiagnosticsV1 {
  const sessions: M3_3HvH3MethodAgreementSessionV1[] = [];

  for (const seg of lifecycleSegments) {
    const m2Series = seg.methodSeries.find((s) => s.method === 'M2_CURRENT_ENERGY_SOC');
    const m3Series = seg.methodSeries.find((s) => s.method === 'M3_ADDED_ENERGY_DELTA_SOC');
    if (!m2Series || !m3Series) continue;

    const m2BySession = new Map(
      m2Series.trendPoints
        .filter((p) => p.sessionId)
        .map((p) => [p.sessionId!, p.numericValue]),
    );
    for (const m3Point of m3Series.trendPoints) {
      if (!m3Point.sessionId) continue;
      const m2Val = m2BySession.get(m3Point.sessionId);
      if (m2Val == null) continue;
      const m3Val = m3Point.numericValue;
      const absDiff = Math.abs(m3Val - m2Val);
      const rel =
        m2Val > 0 ? absDiff / Math.abs(m2Val) : null;
      sessions.push({
        sessionId: m3Point.sessionId,
        lifecycleSegmentId: seg.lifecycleSegmentId,
        m2SessionMedianKwh: m2Val,
        m3PointKwh: m3Val,
        absoluteDifferenceKwh: absDiff,
        relativeDifferenceRatio: rel,
      });
    }
  }

  const absDiffs = sessions
    .map((s) => s.absoluteDifferenceKwh)
    .filter((v): v is number => v != null && Number.isFinite(v));
  const rels = sessions
    .map((s) => s.relativeDifferenceRatio)
    .filter((v): v is number => v != null && Number.isFinite(v));

  return {
    relativeDifferenceReference: M3_3_HV_H3_RELATIVE_DIFFERENCE_REFERENCE,
    pairedSessionCount: sessions.length,
    sessions,
    medianAbsoluteDifferenceKwh: median(absDiffs),
    medianRelativeDifferenceRatio: median(rels),
  };
}

import type { TireHealthSummaryResponse } from '../../lib/api';
import type { SupportedLocale } from '../../i18n/locales';
import { tireWearV3Copy } from './tire-wear-v3-i18n';

/** Customer APIs set this when V3 authoritative cutover flags are both ON. */
export function isTireWearV3Authoritative(
  summary: TireHealthSummaryResponse | null | undefined,
): boolean {
  return summary?.wearReadModel === 'v3' && summary.wearV3 != null;
}

/**
 * V2 tread-life % must not be shown as the current wear result under V3 authority.
 * Returns null when the UI should hide legacy percent bars/scores.
 */
export function resolveLegacyTreadLifePercent(
  summary: TireHealthSummaryResponse | null | undefined,
  wearAnalysisPercent?: number | null,
): number | null {
  if (isTireWearV3Authoritative(summary)) return null;
  return summary?.overallPercent ?? wearAnalysisPercent ?? null;
}

/** Bar width for health box row — mm-based under V3, legacy % otherwise. */
export function resolveTireHealthBoxBarPercent(
  summary: TireHealthSummaryResponse | null | undefined,
): number {
  if (isTireWearV3Authoritative(summary)) {
    const mm = summary?.displayTreadMm;
    if (mm == null || summary?.wearV3?.insufficientEvidence) return 0;
    const refNew = 8;
    return Math.max(0, Math.min(100, Math.round((mm / refNew) * 100)));
  }
  return summary?.overallPercent ?? 0;
}

export function formatV3AuthoritativeHeadline(
  summary: TireHealthSummaryResponse,
  locale: SupportedLocale = 'de',
): string {
  const v3 = summary.wearV3!;
  if (v3.insufficientEvidence || v3.verificationStatus === 'INSUFFICIENT_EVIDENCE') {
    return tireWearV3Copy(locale, 'tire.wearV3.insufficientEvidenceHeadline');
  }
  if (v3.lowestTreadMm) {
    const pos = v3.lowestTreadPosition ?? 'lowest';
    return tireWearV3Copy(locale, 'tire.wearV3.lowestTreadIntervalHeadline', {
      position: pos,
      lo: v3.lowestTreadMm.lo.toFixed(1),
      hi: v3.lowestTreadMm.hi.toFixed(1),
    });
  }
  return tireWearV3Copy(locale, 'tire.wearV3.authoritativeWearFallback');
}

/** Wheel tread mm for grid when V3 authoritative (overrides V2 wear-analysis fallback). */
export function resolveV3WheelTreadFallback(
  summary: TireHealthSummaryResponse | null | undefined,
): Partial<Record<'FL' | 'FR' | 'RL' | 'RR', number>> | undefined {
  if (!isTireWearV3Authoritative(summary) || !summary?.wearV3) return undefined;
  const out: Partial<Record<'FL' | 'FR' | 'RL' | 'RR', number>> = {};
  for (const w of summary.wearV3.wheels) {
    const pos = w.position as 'FL' | 'FR' | 'RL' | 'RR';
    const mm = w.treadDepthMm?.lo ?? w.pointEstimateTreadMm;
    if (mm != null && mm > 0) out[pos] = mm;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

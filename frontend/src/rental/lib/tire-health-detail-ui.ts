import type {
  TireDisplayMode,
  TireEvidencePresentation,
  TireHealthSummaryResponse,
  TireStructuredAction,
  TireUiStatus,
  TireWheelEstimate,
} from '../../lib/api';
import {
  segmentFromHealthState,
  type SegmentLevel,
  type SegmentTone,
} from './health-segment-display';

export type TireUiLocale = 'de' | 'en';

export const TIRE_FORECAST_QUALITY_SUBTEXT =
  'Forecast based on tread baseline, mileage, usage profile and driving behavior.';

export const TIRE_MANUAL_MEASUREMENT_HINT =
  'Manual measurements improve the remaining-life forecast and keep tire values up to date.';

export const TIRE_TREAD_LIFE_SCORE_HINT =
  'Tread life score — reflects remaining tread life, not a direct mm percentage.';

export function tireEvidencePresentation(
  summary: TireHealthSummaryResponse | null | undefined,
): TireEvidencePresentation | null {
  return summary?.evidencePresentation ?? null;
}

export function tireUiStatus(
  summary: TireHealthSummaryResponse | null | undefined,
): TireUiStatus {
  return summary?.evidencePresentation?.uiStatus ?? summary?.overallStatus ?? 'UNKNOWN';
}

export function tireUiStatusLabel(
  summary: TireHealthSummaryResponse | null | undefined,
  locale: TireUiLocale = 'de',
): string {
  const ep = tireEvidencePresentation(summary);
  if (ep) return locale === 'de' ? ep.uiStatusLabelDe : ep.uiStatusLabelEn;
  return summary?.overallStatus ?? '—';
}

export function tireHasTrackableData(
  summary: TireHealthSummaryResponse | null | undefined,
): boolean {
  if (!summary) return false;
  return summary.hasActiveSet === true || summary.displayTreadMm != null;
}

export function tireRemainingKmLabel(
  summary: TireHealthSummaryResponse | null | undefined,
  locale: TireUiLocale = 'de',
): string {
  const ep = tireEvidencePresentation(summary);
  if (ep?.remainingKm) {
    return locale === 'de' ? ep.remainingKm.displayDe : ep.remainingKm.displayEn;
  }
  return '—';
}

export function tireLowestTreadLabel(
  summary: TireHealthSummaryResponse | null | undefined,
  locale: TireUiLocale = 'de',
): string {
  const ep = tireEvidencePresentation(summary);
  if (ep?.lowestTread) {
    return locale === 'de' ? ep.lowestTread.displayLabelDe : ep.lowestTread.displayLabelEn;
  }
  if (summary?.displayTreadMm == null) return '—';
  return formatLowestTreadLine(
    summary.displayTreadMm,
    summary.lowestTreadPosition,
    summary.displayMode,
    locale,
  ).full;
}

export function tireDefaultAssumptionWarning(
  summary: TireHealthSummaryResponse | null | undefined,
  locale: TireUiLocale = 'de',
): string | null {
  const ep = tireEvidencePresentation(summary);
  if (!ep) return summary?.isDefaultAssumption ? tireDefaultAssumptionFallback(summary, locale) : null;
  return locale === 'de' ? ep.defaultAssumptionWarningDe : ep.defaultAssumptionWarningEn;
}

function tireDefaultAssumptionFallback(
  summary: TireHealthSummaryResponse,
  locale: TireUiLocale,
): string {
  const mm = (summary.displayTreadMm ?? 8).toFixed(1);
  return locale === 'de'
    ? `Ausgangsprofil geschätzt – Standardannahme ${mm} mm. Bitte messen.`
    : `Estimated starting profile – standard assumption ${mm} mm. Please measure.`;
}

export function tireStructuredActions(
  summary: TireHealthSummaryResponse | null | undefined,
  locale: TireUiLocale = 'de',
): Array<Pick<TireStructuredAction, 'code'> & { label: string }> {
  const ep = tireEvidencePresentation(summary);
  if (!ep?.structuredActions?.length) return [];
  return ep.structuredActions.map((action) => ({
    code: action.code,
    label: locale === 'de' ? action.labelDe : action.labelEn,
  }));
}

export function tireForecastBadgeLabel(
  summary: TireHealthSummaryResponse | null | undefined,
  locale: TireUiLocale = 'de',
): string {
  const ep = tireEvidencePresentation(summary);
  if (ep?.lowestTread?.isDefaultAssumption) {
    return locale === 'de' ? 'Standardannahme' : 'Default assumption';
  }
  const mode = summary?.displayMode;
  if (mode === 'MEASURED') return locale === 'de' ? 'Gemessen · Prognose' : 'Measured · Forecast';
  if (mode === 'ESTIMATED') return locale === 'de' ? 'Modellprognose' : 'Model forecast';
  return locale === 'de' ? 'Unbekannt' : 'Unknown';
}

export function formatLowestTreadLine(
  mm: number,
  position: string | null | undefined,
  displayMode?: TireDisplayMode | string | null,
  locale: TireUiLocale = 'de',
): { prefix: string; value: string; suffix: string; full: string } {
  const posSuffix = position ? ` · ${position}` : '';
  if (displayMode === 'MEASURED') {
    const prefix = locale === 'de' ? 'Niedrigste gemessene Profiltiefe:' : 'Lowest measured tread:';
    const value = `${mm.toFixed(1)} mm`;
    return { prefix, value, suffix: posSuffix, full: `${prefix} ${value}${posSuffix}` };
  }
  const prefix = locale === 'de' ? 'Niedrigste geschätzte Profiltiefe:' : 'Lowest estimated tread:';
  const value = locale === 'de' ? `ca. ${mm.toFixed(1)} mm` : `about ${mm.toFixed(1)} mm`;
  return { prefix, value, suffix: posSuffix, full: `${prefix} ${value}${posSuffix}` };
}

export function wheelIsMeasured(wheel: TireWheelEstimate): boolean {
  return wheel.lastMeasuredMm != null && Number.isFinite(wheel.lastMeasuredMm);
}

export function wheelMeasurementBadge(
  wheel: TireWheelEstimate,
  locale: TireUiLocale = 'de',
): string | null {
  if (wheel.treadMm <= 0 && wheel.lastMeasuredMm == null) return null;
  if (wheelIsMeasured(wheel)) return locale === 'de' ? 'Gemessen' : 'Measured';
  return locale === 'de' ? 'Geschätzt' : 'Estimated';
}

export function formatWheelLastMeasured(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export const WHEEL_POSITIONS = ['FL', 'FR', 'RL', 'RR'] as const;

export type WheelPosition = (typeof WHEEL_POSITIONS)[number];

export function resolveWheelByPosition(
  wheels: TireWheelEstimate[] | undefined,
  position: WheelPosition,
  wearFallbackMm?: Partial<Record<WheelPosition, number | null | undefined>>,
): TireWheelEstimate | null {
  const found = wheels?.find((w) => w.position === position) ?? null;
  if (found) return found;
  const fallbackMm = wearFallbackMm?.[position];
  if (fallbackMm == null || !Number.isFinite(fallbackMm)) return null;
  return {
    position,
    treadMm: fallbackMm,
    wearPercent: 0,
    remainingKm: 0,
    healthStatus: 'UNKNOWN',
    initialTreadMm: 0,
    lastMeasuredMm: null,
    lastMeasuredAt: null,
    confidenceScore: 0,
    confidenceLabel: 'Low',
    brand: null,
    tireModel: null,
    size: null,
    totalKm: 0,
    cityKm: 0,
    highwayKm: 0,
    ruralKm: 0,
  };
}

export function formatTireQuickNextMeasurementLabel(
  summary: Pick<TireHealthSummaryResponse, 'actionState' | 'recommendations' | 'evidencePresentation'> | null | undefined,
  locale: TireUiLocale = 'de',
): string {
  if (!summary) return '—';
  const ui = summary.evidencePresentation?.uiStatus;
  if (ui === 'MEASUREMENT_REQUIRED') return locale === 'de' ? 'erforderlich' : 'required';
  if (summary.actionState === 'CHECK_SOON') return locale === 'de' ? 'empfohlen' : 'recommended';
  const rec = summary.recommendations?.find((r) => /re-measure|measurement|messung/i.test(r));
  if (!rec) return '—';
  if (/overdue/i.test(rec)) return locale === 'de' ? 'überfällig' : 'overdue';
  return locale === 'de' ? 'empfohlen' : 'recommended';
}

export function tirePressureEvidenceLine(
  summary: TireHealthSummaryResponse | null | undefined,
  locale: TireUiLocale = 'de',
): string | null {
  const ep = tireEvidencePresentation(summary);
  if (!ep) return null;
  if (ep.lastPressureValueBar == null) {
    return locale === 'de' ? 'Kein Drucksignal' : 'No pressure signal';
  }
  const value = `${ep.lastPressureValueBar.toFixed(2)} bar`;
  const source = ep.lastPressureSource ?? (locale === 'de' ? 'unbekannt' : 'unknown');
  const fresh =
    ep.pressureFreshness === 'fresh'
      ? locale === 'de'
        ? 'frisch'
        : 'fresh'
      : ep.pressureFreshness === 'stale'
        ? locale === 'de'
          ? 'veraltet'
          : 'stale'
        : ep.pressureFreshness;
  return locale === 'de'
    ? `Druck: ${value} (${source}, ${fresh})`
    : `Pressure: ${value} (${source}, ${fresh})`;
}

export function tireModelEvidenceLine(
  summary: TireHealthSummaryResponse | null | undefined,
  locale: TireUiLocale = 'de',
): string | null {
  const ep = tireEvidencePresentation(summary);
  if (!ep) return null;
  const when = ep.modelCalculatedAt
    ? new Date(ep.modelCalculatedAt).toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB')
    : null;
  return locale === 'de'
    ? `Modell ${ep.modelVersion}${when ? ` · ${when}` : ''}`
    : `Model ${ep.modelVersion}${when ? ` · ${when}` : ''}`;
}

export function tireSpecEvidenceLine(
  summary: TireHealthSummaryResponse | null | undefined,
  locale: TireUiLocale = 'de',
): string | null {
  const ep = tireEvidencePresentation(summary);
  if (!ep) return null;
  return locale === 'de' ? ep.tireSpecSourceLabelDe : ep.tireSpecSourceLabelEn;
}

export function uiStatusAccentClass(status: TireUiStatus): string {
  switch (status) {
    case 'CRITICAL':
      return 'sq-chip-critical';
    case 'WARNING':
    case 'REVIEW_REQUIRED':
      return 'sq-chip-watch';
    case 'MEASUREMENT_REQUIRED':
    case 'LIMITED_DATA':
      return 'sq-tone-ai';
    case 'GOOD':
      return 'sq-chip-success';
    default:
      return 'sq-chip-neutral';
  }
}

export function treadMmColorClass(mm: number): string {
  if (mm <= 0) return 'text-muted-foreground';
  if (mm >= 4) return 'text-[color:var(--status-positive)]';
  if (mm >= 2.5) return 'text-[color:var(--status-watch)]';
  return 'text-[color:var(--status-critical)]';
}

export function tireStatusToSegment(status: TireUiStatus): {
  level: SegmentLevel;
  tone: SegmentTone;
  label: string;
} {
  const segment = segmentFromHealthState(status);
  return {
    level: segment.level,
    tone: segment.tone,
    label: segment.label,
  };
}

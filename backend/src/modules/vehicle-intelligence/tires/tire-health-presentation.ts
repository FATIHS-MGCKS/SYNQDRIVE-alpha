import { TireEvidenceSource } from '@prisma/client';
import type { TirePressureContext } from './tire-pressure-context.types';
import type { TireActionState, TireHealthSummary } from './tire-health.service';
import type { TireConfidenceLevel, TireDisplayMode, TireStatus } from './tire-status';
import { TIRE_WEAR_MODEL_VERSION } from './tire-wear-model-version';
import { isMeasuredEvidence } from './tire-evidence-provenance';

export type TireUiStatus =
  | 'GOOD'
  | 'WARNING'
  | 'CRITICAL'
  | 'UNKNOWN'
  | 'MEASUREMENT_REQUIRED'
  | 'REVIEW_REQUIRED'
  | 'LIMITED_DATA';

export type TireTreadProvenance =
  | 'MEASURED'
  | 'ESTIMATED'
  | 'DEFAULT_ASSUMPTION'
  | 'MODEL'
  | 'DOCUMENTED'
  | 'UNKNOWN';

export type TireStructuredActionCode =
  | 'MEASURE_TREAD'
  | 'CAPTURE_ODOMETER_ANCHOR'
  | 'CONFIRM_TIRE_SPEC'
  | 'SET_RECOMMENDED_PRESSURE'
  | 'CHECK_PRESSURE'
  | 'REPLACE_TIRES'
  | 'REVIEW_ROTATION';

export interface TireTreadEvidenceLine {
  position: string;
  axle: 'front' | 'rear';
  valueMm: number | null;
  provenance: TireTreadProvenance;
  sourceCode: string | null;
  sourceLabelDe: string;
  sourceLabelEn: string;
  measuredAt: string | null;
  confidence: TireConfidenceLevel;
  isDefaultAssumption: boolean;
  displayLabelDe: string;
  displayLabelEn: string;
}

export interface TireRemainingKmPresentation {
  reliable: boolean;
  displayDe: string;
  displayEn: string;
  exactKm: number | null;
  bandMinKm: number | null;
  bandMaxKm: number | null;
  reasonDe: string | null;
  reasonEn: string | null;
}

export interface TireStructuredAction {
  code: TireStructuredActionCode;
  labelDe: string;
  labelEn: string;
  priority: number;
}

export type TireHealthSummaryForPresentation = Omit<TireHealthSummary, 'evidencePresentation'>;

interface WheelEstimateForPresentation {
  position: string;
  treadMm: number;
  lastMeasuredMm: number | null;
  lastMeasuredAt: string | null;
}

export interface TireEvidencePresentation {
  uiStatus: TireUiStatus;
  uiStatusLabelDe: string;
  uiStatusLabelEn: string;
  treadLines: TireTreadEvidenceLine[];
  lowestTread: TireTreadEvidenceLine | null;
  remainingKm: TireRemainingKmPresentation;
  lastTreadMeasurementAt: string | null;
  lastPressureValueBar: number | null;
  lastPressureSource: string | null;
  pressureFreshness: string;
  modelVersion: string;
  modelCalculatedAt: string | null;
  tireSpecSource: string | null;
  tireSpecSourceLabelDe: string;
  tireSpecSourceLabelEn: string;
  structuredActions: TireStructuredAction[];
  defaultAssumptionWarningDe: string | null;
  defaultAssumptionWarningEn: string | null;
}

const UI_STATUS_LABELS: Record<TireUiStatus, { de: string; en: string }> = {
  GOOD: { de: 'Gut', en: 'Good' },
  WARNING: { de: 'Beobachten', en: 'Warning' },
  CRITICAL: { de: 'Kritisch', en: 'Critical' },
  UNKNOWN: { de: 'Unbekannt', en: 'Unknown' },
  MEASUREMENT_REQUIRED: { de: 'Messung erforderlich', en: 'Measurement required' },
  REVIEW_REQUIRED: { de: 'Prüfung erforderlich', en: 'Review required' },
  LIMITED_DATA: { de: 'Eingeschränkte Daten', en: 'Limited data' },
};

const EVIDENCE_SOURCE_LABELS: Record<string, { de: string; en: string }> = {
  [TireEvidenceSource.MANUAL_MEASUREMENT]: {
    de: 'Manuelle Messung',
    en: 'Manual measurement',
  },
  [TireEvidenceSource.WORKSHOP_MEASUREMENT]: {
    de: 'Werkstattmessung',
    en: 'Workshop measurement',
  },
  [TireEvidenceSource.DOCUMENT_MEASUREMENT]: {
    de: 'Dokumentierte Messung',
    en: 'Documented measurement',
  },
  [TireEvidenceSource.MANUFACTURER_CONFIRMED]: {
    de: 'Hersteller bestätigt',
    en: 'Manufacturer confirmed',
  },
  [TireEvidenceSource.USER_CONFIRMED]: {
    de: 'Nutzer bestätigt',
    en: 'User confirmed',
  },
  [TireEvidenceSource.AI_ESTIMATED]: {
    de: 'KI-Schätzung',
    en: 'AI estimate',
  },
  [TireEvidenceSource.MODEL_ESTIMATED]: {
    de: 'Modellberechnung',
    en: 'Model calculation',
  },
  [TireEvidenceSource.DEFAULT_ASSUMPTION]: {
    de: 'Standardannahme',
    en: 'Default assumption',
  },
  [TireEvidenceSource.PROVIDER_SIGNAL]: {
    de: 'Fahrzeugsignal',
    en: 'Vehicle signal',
  },
  [TireEvidenceSource.UNKNOWN]: {
    de: 'Unbekannt',
    en: 'Unknown',
  },
};

const TREAD_SOURCE_LABELS: Record<string, { de: string; en: string }> = {
  manual_measurement: { de: 'Manuelle Messung', en: 'Manual measurement' },
  calibration_projection: { de: 'Kalibrierte Projektion', en: 'Calibrated projection' },
  fallback_estimate: { de: 'Modellberechnung', en: 'Model calculation' },
  default_assumption: { de: 'Standardannahme', en: 'Default assumption' },
};

const REF_NEW_TREAD_LABELS: Record<string, { de: string; en: string }> = {
  manual_confirmed: { de: 'Manuell bestätigt', en: 'Manually confirmed' },
  ai_confirmed: { de: 'KI bestätigt', en: 'AI confirmed' },
  season_fallback: { de: 'Saison-Fallback', en: 'Season fallback' },
  archetype_fallback: { de: 'Archetyp-Fallback', en: 'Archetype fallback' },
};

function fmtKm(km: number): string {
  return Math.round(km).toLocaleString('de-DE');
}

function evidenceLabels(
  source: string | null | undefined,
): { de: string; en: string } {
  if (!source) return EVIDENCE_SOURCE_LABELS[TireEvidenceSource.UNKNOWN];
  return (
    EVIDENCE_SOURCE_LABELS[source] ??
    TREAD_SOURCE_LABELS[source] ?? {
      de: source,
      en: source,
    }
  );
}

function resolveTreadProvenance(args: {
  isDefaultAssumption: boolean;
  isMeasured: boolean;
  displayMode: TireDisplayMode;
  evidenceSource: string | null;
}): TireTreadProvenance {
  if (args.isDefaultAssumption) return 'DEFAULT_ASSUMPTION';
  if (args.isMeasured || args.displayMode === 'MEASURED') return 'MEASURED';
  if (
    args.evidenceSource === TireEvidenceSource.DOCUMENT_MEASUREMENT ||
    args.evidenceSource === TireEvidenceSource.WORKSHOP_MEASUREMENT
  ) {
    return 'DOCUMENTED';
  }
  if (
    args.evidenceSource === TireEvidenceSource.MODEL_ESTIMATED ||
    args.evidenceSource === TireEvidenceSource.AI_ESTIMATED
  ) {
    return 'MODEL';
  }
  if (args.displayMode === 'ESTIMATED') return 'ESTIMATED';
  return 'UNKNOWN';
}

export function formatTreadValueLabel(
  valueMm: number | null,
  provenance: TireTreadProvenance,
  position?: string | null,
): { de: string; en: string } {
  if (valueMm == null || !Number.isFinite(valueMm)) {
    return { de: '—', en: '—' };
  }
  const pos = position ? ` (${position})` : '';
  const v = valueMm.toFixed(1);
  switch (provenance) {
    case 'MEASURED':
      return {
        de: `Gemessen: ${v} mm${pos}`,
        en: `Measured: ${v} mm${pos}`,
      };
    case 'DEFAULT_ASSUMPTION':
      return {
        de: `Ausgangsprofil geschätzt – Standardannahme ${v} mm${pos}`,
        en: `Estimated starting profile – standard assumption ${v} mm${pos}`,
      };
    case 'DOCUMENTED':
      return {
        de: `Dokumentiert: ca. ${v} mm${pos}`,
        en: `Documented: about ${v} mm${pos}`,
      };
    case 'MODEL':
      return {
        de: `Modell: ca. ${v} mm${pos}`,
        en: `Model: about ${v} mm${pos}`,
      };
    case 'ESTIMATED':
      return {
        de: `Geschätzt: ca. ${v} mm${pos}`,
        en: `Estimated: about ${v} mm${pos}`,
      };
    default:
      return {
        de: `Unbekannt: ${v} mm${pos}`,
        en: `Unknown: ${v} mm${pos}`,
      };
  }
}

export function buildRemainingKmPresentation(args: {
  km: number | null;
  confidence: TireConfidenceLevel;
  predictionCapable: boolean;
  displayMode: TireDisplayMode;
  isDefaultAssumption: boolean;
}): TireRemainingKmPresentation {
  const { km, confidence, predictionCapable, displayMode, isDefaultAssumption } = args;

  if (!predictionCapable) {
    return {
      reliable: false,
      displayDe: 'noch nicht belastbar',
      displayEn: 'not yet reliable',
      exactKm: null,
      bandMinKm: null,
      bandMaxKm: null,
      reasonDe: 'Kilometeranker oder belastbare Datenbasis fehlt.',
      reasonEn: 'Odometer anchor or reliable data basis missing.',
    };
  }

  if (km == null || !Number.isFinite(km)) {
    return {
      reliable: false,
      displayDe: '—',
      displayEn: '—',
      exactKm: null,
      bandMinKm: null,
      bandMaxKm: null,
      reasonDe: 'Restlaufzeit nicht berechenbar.',
      reasonEn: 'Remaining life not calculable.',
    };
  }

  if (isDefaultAssumption || confidence === 'LOW' || confidence === 'UNKNOWN') {
    const band = Math.max(500, Math.round((km * 0.25) / 500) * 500);
    const min = Math.max(0, km - band);
    const max = km + band;
    return {
      reliable: false,
      displayDe: `ca. ${fmtKm(min)}–${fmtKm(max)} km`,
      displayEn: `about ${fmtKm(min)}–${fmtKm(max)} km`,
      exactKm: null,
      bandMinKm: min,
      bandMaxKm: max,
      reasonDe: 'Niedrige Datenqualität – Bandbreite statt exakter Kilometer.',
      reasonEn: 'Low data quality — range instead of exact kilometres.',
    };
  }

  if (confidence === 'MEDIUM' || displayMode === 'ESTIMATED') {
    return {
      reliable: false,
      displayDe: `ca. ${fmtKm(km)} km`,
      displayEn: `about ${fmtKm(km)} km`,
      exactKm: null,
      bandMinKm: null,
      bandMaxKm: null,
      reasonDe: 'Geschätzte Restlaufzeit – Messung verbessert die Genauigkeit.',
      reasonEn: 'Estimated remaining life — measurement improves accuracy.',
    };
  }

  return {
    reliable: true,
    displayDe: `${fmtKm(km)} km`,
    displayEn: `${fmtKm(km)} km`,
    exactKm: Math.round(km),
    bandMinKm: null,
    bandMaxKm: null,
    reasonDe: null,
    reasonEn: null,
  };
}

export function resolveTireUiStatus(args: {
  overallStatus: TireStatus;
  hasActiveSet: boolean;
  hasMeasurements: boolean;
  isDefaultAssumption: boolean;
  confidence: TireConfidenceLevel;
  actionState: TireActionState;
  measurementOverdue: boolean;
  reviewRequirement?: 'MEASUREMENT_REQUIRED' | 'REVIEW_REQUIRED' | null;
}): TireUiStatus {
  if (args.reviewRequirement === 'MEASUREMENT_REQUIRED') {
    return 'MEASUREMENT_REQUIRED';
  }
  if (args.reviewRequirement === 'REVIEW_REQUIRED') {
    return 'REVIEW_REQUIRED';
  }
  if (!args.hasActiveSet) return 'UNKNOWN';
  if (
    !args.hasMeasurements &&
    (args.actionState === 'CHECK_SOON' || args.measurementOverdue)
  ) {
    return 'MEASUREMENT_REQUIRED';
  }
  if (
    args.isDefaultAssumption ||
    args.confidence === 'LOW' ||
    args.confidence === 'UNKNOWN'
  ) {
    if (args.overallStatus === 'CRITICAL' || args.overallStatus === 'WARNING') {
      return 'REVIEW_REQUIRED';
    }
    return 'LIMITED_DATA';
  }
  switch (args.overallStatus) {
    case 'CRITICAL':
      return 'CRITICAL';
    case 'WARNING':
    case 'WATCH':
      return 'WARNING';
    case 'GOOD':
      return 'GOOD';
    default:
      return 'UNKNOWN';
  }
}

function resolvePressureSnapshot(ctx: TirePressureContext): {
  valueBar: number | null;
  source: string | null;
  freshness: string;
} {
  const wheels = [
    ctx.wheels.frontLeft,
    ctx.wheels.frontRight,
    ctx.wheels.rearLeft,
    ctx.wheels.rearRight,
  ].filter((w) => w.value != null);
  const latest = wheels
    .filter((w) => w.sourceTimestamp)
    .sort((a, b) =>
      String(b.sourceTimestamp).localeCompare(String(a.sourceTimestamp)),
    )[0];
  return {
    valueBar: latest?.value ?? wheels[0]?.value ?? null,
    source: latest?.sourceProvider ?? ctx.sourceType ?? null,
    freshness: ctx.overallFreshness,
  };
}

function buildStructuredActions(
  summary: Pick<
    TireHealthSummary,
    | 'hasMeasurements'
    | 'predictionCapable'
    | 'tireSpecMatched'
    | 'tireSpecConfidence'
    | 'pressureSpecMissingLabel'
    | 'pressureStatus'
    | 'actionState'
    | 'overallStatus'
    | 'alerts'
    | 'measurementAgeDays'
  >,
): TireStructuredAction[] {
  const actions: TireStructuredAction[] = [];
  const push = (code: TireStructuredActionCode, labelDe: string, labelEn: string, priority: number) => {
    actions.push({ code, labelDe, labelEn, priority });
  };

  if (!summary.hasMeasurements) {
    push('MEASURE_TREAD', 'Profiltiefe messen', 'Measure tread depth', 10);
  } else if (summary.measurementAgeDays != null && summary.measurementAgeDays > 120) {
    push('MEASURE_TREAD', 'Profiltiefe erneut messen', 'Re-measure tread depth', 12);
  }
  if (!summary.predictionCapable) {
    push('CAPTURE_ODOMETER_ANCHOR', 'Kilometeranker erfassen', 'Capture odometer anchor', 15);
  }
  if (!summary.tireSpecMatched || (summary.tireSpecConfidence ?? 0) < 50) {
    push('CONFIRM_TIRE_SPEC', 'Reifenspezifikation bestätigen', 'Confirm tire specification', 20);
  }
  if (summary.pressureSpecMissingLabel) {
    push(
      'SET_RECOMMENDED_PRESSURE',
      'Solldruck hinterlegen',
      'Set recommended pressure',
      25,
    );
  }
  if (summary.pressureStatus === 'WARNING' || summary.pressureStatus === 'CRITICAL') {
    push('CHECK_PRESSURE', 'Reifendruck prüfen', 'Check tire pressure', 30);
  }
  if (summary.actionState === 'REPLACE' || summary.overallStatus === 'CRITICAL') {
    push('REPLACE_TIRES', 'Reifenwechsel planen', 'Plan tire replacement', 5);
  }
  if (summary.alerts.some((a) => a.type === 'ROTATION_OVERDUE')) {
    push('REVIEW_ROTATION', 'Rotation prüfen', 'Review tire rotation', 35);
  }

  return actions.sort((a, b) => a.priority - b.priority).slice(0, 8);
}

function buildWheelTreadLine(
  wheel: WheelEstimateForPresentation,
  summary: Pick<
    TireHealthSummaryForPresentation,
    'confidence' | 'isDefaultAssumption' | 'displayMode' | 'currentTreadEvidenceSource'
  >,
): TireTreadEvidenceLine {
  const measured = wheel.lastMeasuredMm != null;
  const provenance = measured
    ? 'MEASURED'
    : summary.isDefaultAssumption
      ? 'DEFAULT_ASSUMPTION'
      : summary.displayMode === 'ESTIMATED'
        ? 'MODEL'
        : 'UNKNOWN';
  const sourceCode = measured
    ? TireEvidenceSource.MANUAL_MEASUREMENT
    : summary.currentTreadEvidenceSource;
  const sourceLabels = evidenceLabels(sourceCode);
  const display = formatTreadValueLabel(
    wheel.treadMm,
    provenance,
    wheel.position,
  );
  return {
    position: wheel.position,
    axle: wheel.position.startsWith('F') ? 'front' : 'rear',
    valueMm: wheel.treadMm,
    provenance,
    sourceCode,
    sourceLabelDe: sourceLabels.de,
    sourceLabelEn: sourceLabels.en,
    measuredAt: wheel.lastMeasuredAt,
    confidence: summary.confidence,
    isDefaultAssumption: provenance === 'DEFAULT_ASSUMPTION',
    displayLabelDe: display.de,
    displayLabelEn: display.en,
  };
}

export function buildTireEvidencePresentation(args: {
  summary: TireHealthSummaryForPresentation;
  wheels?: WheelEstimateForPresentation[];
  modelCalculatedAt?: string | null;
  reviewRequirement?: 'MEASUREMENT_REQUIRED' | 'REVIEW_REQUIRED' | null;
}): TireEvidencePresentation {
  const { summary, wheels, modelCalculatedAt, reviewRequirement } = args;
  const provenance = resolveTreadProvenance({
    isDefaultAssumption: summary.isDefaultAssumption,
    isMeasured: summary.isMeasured,
    displayMode: summary.displayMode,
    evidenceSource: summary.currentTreadEvidenceSource,
  });
  const sourceLabels = evidenceLabels(summary.currentTreadEvidenceSource);
  const treadDisplay = formatTreadValueLabel(
    summary.displayTreadMm,
    provenance,
    summary.lowestTreadPosition,
  );

  const lowestTread: TireTreadEvidenceLine = {
    position: summary.lowestTreadPosition ?? '—',
    axle: summary.lowestTreadPosition?.toLowerCase().includes('front')
      ? 'front'
      : 'rear',
    valueMm: summary.displayTreadMm,
    provenance,
    sourceCode: summary.currentTreadEvidenceSource,
    sourceLabelDe: sourceLabels.de,
    sourceLabelEn: sourceLabels.en,
    measuredAt: summary.lastActualMeasurementAt ?? summary.lastMeasurementAt,
    confidence: summary.confidence,
    isDefaultAssumption: summary.isDefaultAssumption,
    displayLabelDe: treadDisplay.de,
    displayLabelEn: treadDisplay.en,
  };

  const treadLines =
    wheels && wheels.length > 0
      ? wheels.map((w) => buildWheelTreadLine(w, summary))
      : [lowestTread];

  const measurementOverdue =
    summary.measurementAgeDays != null && summary.measurementAgeDays > 90;

  const uiStatus = resolveTireUiStatus({
    overallStatus: summary.overallStatus,
    hasActiveSet: summary.hasActiveSet,
    hasMeasurements: summary.hasMeasurements,
    isDefaultAssumption: summary.isDefaultAssumption,
    confidence: summary.confidence,
    actionState: summary.actionState,
    measurementOverdue,
    reviewRequirement,
  });

  const specLabels =
    REF_NEW_TREAD_LABELS[summary.referenceNewTreadSource ?? ''] ??
  evidenceLabels(summary.baselineSource);

  const pressure = resolvePressureSnapshot(summary.pressureContext);

  return {
    uiStatus,
    uiStatusLabelDe: UI_STATUS_LABELS[uiStatus].de,
    uiStatusLabelEn: UI_STATUS_LABELS[uiStatus].en,
    treadLines,
    lowestTread,
    remainingKm: buildRemainingKmPresentation({
      km: summary.estimatedRemainingKm ?? summary.overallRemainingKm,
      confidence: summary.confidence,
      predictionCapable: summary.predictionCapable,
      displayMode: summary.displayMode,
      isDefaultAssumption: summary.isDefaultAssumption,
    }),
    lastTreadMeasurementAt:
      summary.lastActualMeasurementAt ?? summary.lastMeasurementAt,
    lastPressureValueBar: pressure.valueBar,
    lastPressureSource: pressure.source,
    pressureFreshness: pressure.freshness,
    modelVersion: TIRE_WEAR_MODEL_VERSION,
    modelCalculatedAt: modelCalculatedAt ?? null,
    tireSpecSource: summary.referenceNewTreadSource,
    tireSpecSourceLabelDe: specLabels.de,
    tireSpecSourceLabelEn: specLabels.en,
    structuredActions: buildStructuredActions(summary),
    defaultAssumptionWarningDe: summary.isDefaultAssumption
      ? `Ausgangsprofil geschätzt – Standardannahme ${(summary.displayTreadMm ?? 8).toFixed(1)} mm. Bitte messen.`
      : null,
    defaultAssumptionWarningEn: summary.isDefaultAssumption
      ? `Estimated starting profile – standard assumption ${(summary.displayTreadMm ?? 8).toFixed(1)} mm. Please measure.`
      : null,
  };
}

export function wheelHasMeasuredEvidence(wheel: WheelEstimateForPresentation): boolean {
  return wheel.lastMeasuredMm != null && Number.isFinite(wheel.lastMeasuredMm);
}

export function isDocumentedEvidenceSource(
  source: TireEvidenceSource | string | null | undefined,
): boolean {
  return (
    source === TireEvidenceSource.DOCUMENT_MEASUREMENT ||
    source === TireEvidenceSource.WORKSHOP_MEASUREMENT ||
    isMeasuredEvidence(source as TireEvidenceSource)
  );
}

import type { BrakeReferenceSpecComponent } from './brake-reference-spec.types';
import { BRAKE_WEAR_MODEL_VERSION } from './brake-wear-model-version';
import type { BrakeCondition, BrakeConfidenceLevel, BrakeDataBasis } from './brake-status';
import type { BrakeHealthAlertCategory } from './brake-health-alert.types';
import type { BrakeAlertCode } from './brake-status';

export interface BrakePresentationThreshold {
  component: BrakeReferenceSpecComponent;
  warningThresholdMm: number | null;
  criticalThresholdMm: number | null;
  source: string | null;
  confirmed: boolean;
  thresholdMissing: boolean;
}

export interface BrakePresentationModeledComponents {
  frontPads: boolean;
  rearPads: boolean;
  frontDiscs: boolean;
  rearDiscs: boolean;
  hasAnyPads: boolean;
  hasAnyDiscs: boolean;
  hasAnyModeled: boolean;
}

export interface BrakePresentationModelCoverage {
  hasGap: boolean;
  coverageStatus: string | null;
}

export interface BrakePresentationAlert {
  code: BrakeAlertCode;
  alertType: string;
  category: BrakeHealthAlertCategory;
  reasonCode: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  messageEn: string;
  axle?: 'FRONT' | 'REAR' | 'UNKNOWN';
  displayMode: 'MEASURED' | 'ESTIMATED' | 'SAFETY_EVIDENCE' | 'DATA_GAP';
}

export type BrakeComponentEvidenceClass =
  | 'MEASURED'
  | 'DOCUMENTED_REPLACEMENT'
  | 'SPEC_ESTIMATE'
  | 'MODEL_ESTIMATED'
  | 'UNKNOWN';

export type BrakeComponentKey = BrakeReferenceSpecComponent;

export type BrakeStateClass = 'MEASURED' | 'ESTIMATED' | 'WARNING_ONLY' | 'NO_BASELINE';

export interface BrakeComponentBuildState {
  component: BrakeComponentKey;
  condition: BrakeCondition;
  dataBasis: BrakeDataBasis;
  confidence: BrakeConfidenceLevel;
  measuredMm: number | null;
  estimatedMm: number | null;
  anchorMm: number | null;
  remainingKm: number | null;
  remainingKmMin: number | null;
  remainingKmMax: number | null;
  evidenceClass: BrakeComponentEvidenceClass;
  sourceCode: string | null;
  evidenceAt: string | null;
  odometerKm: number | null;
  lastMeasurementAt: string | null;
  lastMeasurementMm: number | null;
  lastInstallationAt: string | null;
}

export interface BrakeRemainingKmPresentation {
  reliable: boolean;
  displayDe: string;
  displayEn: string;
  exactKm: number | null;
  bandMinKm: number | null;
  bandMaxKm: number | null;
  reasonDe: string | null;
  reasonEn: string | null;
}

export interface BrakeComponentEvidenceLine {
  component: BrakeComponentKey;
  labelDe: string;
  labelEn: string;
  condition: BrakeCondition;
  valueMm: number | null;
  valueLabelDe: string;
  valueLabelEn: string;
  evidenceClass: BrakeComponentEvidenceClass;
  evidenceClassLabelDe: string;
  evidenceClassLabelEn: string;
  sourceCode: string | null;
  sourceLabelDe: string;
  sourceLabelEn: string;
  evidenceAt: string | null;
  odometerKm: number | null;
  confidence: BrakeConfidenceLevel;
  minimumThicknessMm: number | null;
  minimumThicknessSource: string | null;
  minimumThicknessSourceLabelDe: string;
  minimumThicknessSourceLabelEn: string;
  lastMeasurementAt: string | null;
  lastMeasurementMm: number | null;
  lastInstallationAt: string | null;
  modelVersion: string | null;
  isLimiting: boolean;
  isModeled: boolean;
  remainingKm: BrakeRemainingKmPresentation;
}

export type BrakeDataQualityCode =
  | 'MISSING_BASELINE'
  | 'SPEC_UNCONFIRMED'
  | 'COVERAGE_GAP'
  | 'DISTANCE_CONFLICT'
  | 'STALE_EVIDENCE';

export interface BrakeDataQualityItem {
  code: BrakeDataQualityCode;
  labelDe: string;
  labelEn: string;
  detailDe: string | null;
  detailEn: string | null;
  active: boolean;
}

export type BrakeSafetyCode = 'ABS' | 'DTC' | 'WEAR_SENSOR' | 'IMMEDIATE_REPLACEMENT';

export interface BrakeSafetyItem {
  code: BrakeSafetyCode;
  labelDe: string;
  labelEn: string;
  active: boolean;
  detailDe: string | null;
  detailEn: string | null;
  severity: 'info' | 'warning' | 'critical' | null;
}

export type BrakeStructuredActionCode =
  | 'MEASURE_THICKNESS'
  | 'RECORD_SERVICE'
  | 'CONFIRM_REFERENCE_SPEC'
  | 'ADD_ODOMETER'
  | 'REVIEW_SAFETY_EVIDENCE'
  | 'PERFORM_REVIEW';

export interface BrakeStructuredAction {
  code: BrakeStructuredActionCode;
  labelDe: string;
  labelEn: string;
  priority: number;
}

export interface BrakeEvidencePresentation {
  overviewLabelDe: string;
  overviewLabelEn: string;
  uiStatusLabelDe: string;
  uiStatusLabelEn: string;
  components: BrakeComponentEvidenceLine[];
  overallRemainingKm: BrakeRemainingKmPresentation;
  dataQuality: BrakeDataQualityItem[];
  safety: BrakeSafetyItem[];
  structuredActions: BrakeStructuredAction[];
  modelVersion: string;
  modelCalculatedAt: string | null;
}

const COMPONENT_LABELS: Record<
  BrakeComponentKey,
  { de: string; en: string }
> = {
  FRONT_PADS: { de: 'Vordere Beläge', en: 'Front pads' },
  REAR_PADS: { de: 'Hintere Beläge', en: 'Rear pads' },
  FRONT_DISCS: { de: 'Vordere Scheiben', en: 'Front discs' },
  REAR_DISCS: { de: 'Hintere Scheiben', en: 'Rear discs' },
};

const EVIDENCE_CLASS_LABELS: Record<
  BrakeComponentEvidenceClass,
  { de: string; en: string }
> = {
  MEASURED: { de: 'Gemessen', en: 'Measured' },
  DOCUMENTED_REPLACEMENT: { de: 'Dokumentierter Austausch', en: 'Documented replacement' },
  SPEC_ESTIMATE: { de: 'Referenz-Spezifikation', en: 'Reference spec' },
  MODEL_ESTIMATED: { de: 'Modellgeschätzt', en: 'Model estimated' },
  UNKNOWN: { de: 'Unbekannt', en: 'Unknown' },
};

const CONDITION_LABELS: Record<BrakeCondition, { de: string; en: string }> = {
  GOOD: { de: 'Gut', en: 'Good' },
  WATCH: { de: 'Beobachten', en: 'Watch' },
  WARNING: { de: 'Warnung', en: 'Warning' },
  CRITICAL: { de: 'Kritisch', en: 'Critical' },
  UNKNOWN: { de: 'Unbekannt', en: 'Unknown' },
};

const EVIDENCE_SOURCE_LABELS: Record<string, { de: string; en: string }> = {
  MANUAL_MEASUREMENT: { de: 'Manuelle Messung', en: 'Manual measurement' },
  WORKSHOP_MEASUREMENT: { de: 'Werkstattmessung', en: 'Workshop measurement' },
  DOCUMENTED_REPLACEMENT: { de: 'Dokumentierter Austausch', en: 'Documented replacement' },
  INSPECTION_PROTOCOL: { de: 'Prüfprotokoll', en: 'Inspection protocol' },
  AI_UPLOAD_CONFIRMED: { de: 'KI-Upload bestätigt', en: 'AI upload confirmed' },
  TELEMATICS_ESTIMATION: { de: 'Telemetrie-Schätzung', en: 'Telematics estimation' },
  BRAKE_WEAR_SENSOR: { de: 'Verschleißsensor', en: 'Wear sensor' },
  DTC_SIGNAL: { de: 'Fehlercode-Signal', en: 'DTC signal' },
  PROVIDER_WARNING: { de: 'Fahrzeugwarnung', en: 'Vehicle warning' },
  spec_fallback: { de: 'Referenz-Spezifikation', en: 'Reference spec' },
  anchor_service: { de: 'Service-Anker', en: 'Service anchor' },
  UNKNOWN: { de: 'Unbekannt', en: 'Unknown' },
};

const THRESHOLD_SOURCE_LABELS: Record<string, { de: string; en: string }> = {
  manufacturer_confirmed: { de: 'Hersteller bestätigt', en: 'Manufacturer confirmed' },
  user_confirmed: { de: 'Nutzer bestätigt', en: 'User confirmed' },
  ai_confirmed: { de: 'KI bestätigt', en: 'AI confirmed' },
  archetype_fallback: { de: 'Archetyp-Fallback', en: 'Archetype fallback' },
  default: { de: 'Standardwert', en: 'Default value' },
};

function fmtKm(km: number): string {
  return Math.round(km).toLocaleString('de-DE');
}

function sourceLabels(code: string | null | undefined): { de: string; en: string } {
  if (!code) return EVIDENCE_SOURCE_LABELS.UNKNOWN;
  const key = code.toUpperCase();
  return (
    EVIDENCE_SOURCE_LABELS[key] ??
    EVIDENCE_SOURCE_LABELS[code] ?? {
      de: code,
      en: code,
    }
  );
}

function thresholdSourceLabels(source: string | null | undefined): { de: string; en: string } {
  if (!source) return { de: '—', en: '—' };
  return (
    THRESHOLD_SOURCE_LABELS[source] ?? {
      de: source,
      en: source,
    }
  );
}

export function resolveComponentEvidenceClass(args: {
  dataBasis: BrakeDataBasis;
  anchorValidationStatus: string | null | undefined;
  measuredMm: number | null;
  estimatedMm: number | null;
  isModeled: boolean;
}): BrakeComponentEvidenceClass {
  if (args.measuredMm != null && Number.isFinite(args.measuredMm)) return 'MEASURED';
  if (args.dataBasis === 'MEASURED') return 'MEASURED';

  const status = String(args.anchorValidationStatus ?? '').toLowerCase();
  if (status.includes('spec_fallback')) return 'SPEC_ESTIMATE';
  if (args.dataBasis === 'DOCUMENTED') return 'DOCUMENTED_REPLACEMENT';
  if (args.dataBasis === 'ESTIMATED' || args.estimatedMm != null) return 'MODEL_ESTIMATED';
  if (!args.isModeled) return 'UNKNOWN';
  return 'UNKNOWN';
}

export function formatComponentValueLabel(
  valueMm: number | null,
  evidenceClass: BrakeComponentEvidenceClass,
): { de: string; en: string } {
  if (valueMm == null || !Number.isFinite(valueMm)) {
    return { de: '—', en: '—' };
  }
  const v = valueMm.toFixed(1);
  switch (evidenceClass) {
    case 'MEASURED':
      return { de: `${v} mm (gemessen)`, en: `${v} mm (measured)` };
    case 'DOCUMENTED_REPLACEMENT':
      return { de: `${v} mm (dokumentiert)`, en: `${v} mm (documented)` };
    case 'SPEC_ESTIMATE':
      return { de: `${v} mm (Referenz)`, en: `${v} mm (reference)` };
    case 'MODEL_ESTIMATED':
      return { de: `ca. ${v} mm (geschätzt)`, en: `about ${v} mm (estimated)` };
    default:
      return { de: `${v} mm`, en: `${v} mm` };
  }
}

export function buildBrakeRemainingKmPresentation(args: {
  minKm: number | null;
  maxKm: number | null;
  pointKm: number | null;
  confidence: BrakeConfidenceLevel;
  evidenceClass: BrakeComponentEvidenceClass;
  predictionCapable: boolean;
  coverageGap: boolean;
}): BrakeRemainingKmPresentation {
  const { minKm, maxKm, pointKm, confidence, evidenceClass, predictionCapable, coverageGap } = args;

  if (!predictionCapable || coverageGap) {
    return {
      reliable: false,
      displayDe: 'noch nicht belastbar',
      displayEn: 'not yet reliable',
      exactKm: null,
      bandMinKm: null,
      bandMaxKm: null,
      reasonDe: coverageGap
        ? 'Telemetrie-Abdeckung unvollständig — Restkilometer nicht belastbar.'
        : 'Baseline oder Abdeckung unzureichend — Restkilometer nicht belastbar.',
      reasonEn: coverageGap
        ? 'Telemetry coverage incomplete — remaining km not reliable.'
        : 'Baseline or coverage insufficient — remaining km not reliable.',
    };
  }

  if (minKm == null && maxKm == null && pointKm == null) {
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

  const bandMin = minKm ?? pointKm;
  const bandMax = maxKm ?? pointKm;

  const showBand =
    evidenceClass === 'MODEL_ESTIMATED' ||
    evidenceClass === 'SPEC_ESTIMATE' ||
    evidenceClass === 'UNKNOWN' ||
    confidence === 'LOW' ||
    confidence === 'UNKNOWN' ||
    confidence === 'MEDIUM';

  if (showBand && bandMin != null && bandMax != null) {
    const reliable = false;
    if (bandMin === bandMax) {
      return {
        reliable,
        displayDe: `ca. ${fmtKm(bandMin)} km`,
        displayEn: `about ${fmtKm(bandMin)} km`,
        exactKm: null,
        bandMinKm: bandMin,
        bandMaxKm: bandMax,
        reasonDe: 'Bandbreite statt exakter Kilometer — Evidenz nicht ausreichend.',
        reasonEn: 'Range instead of exact km — evidence insufficient.',
      };
    }
    return {
      reliable,
      displayDe: `ca. ${fmtKm(bandMin)}–${fmtKm(bandMax)} km`,
      displayEn: `about ${fmtKm(bandMin)}–${fmtKm(bandMax)} km`,
      exactKm: null,
      bandMinKm: bandMin,
      bandMaxKm: bandMax,
      reasonDe: 'Bandbreite statt exakter Kilometer — Evidenz nicht ausreichend.',
      reasonEn: 'Range instead of exact km — evidence insufficient.',
    };
  }

  if (bandMin != null && bandMax != null && bandMin !== bandMax) {
    return {
      reliable: confidence === 'HIGH' && evidenceClass === 'MEASURED',
      displayDe: `${fmtKm(bandMin)}–${fmtKm(bandMax)} km`,
      displayEn: `${fmtKm(bandMin)}–${fmtKm(bandMax)} km`,
      exactKm: null,
      bandMinKm: bandMin,
      bandMaxKm: bandMax,
      reasonDe: null,
      reasonEn: null,
    };
  }

  const exact = bandMin ?? bandMax;
  if (exact == null) {
    return {
      reliable: false,
      displayDe: '—',
      displayEn: '—',
      exactKm: null,
      bandMinKm: null,
      bandMaxKm: null,
      reasonDe: null,
      reasonEn: null,
    };
  }

  return {
    reliable: confidence === 'HIGH' && evidenceClass === 'MEASURED',
    displayDe: `${fmtKm(exact)} km`,
    displayEn: `${fmtKm(exact)} km`,
    exactKm: Math.round(exact),
    bandMinKm: null,
    bandMaxKm: null,
    reasonDe: null,
    reasonEn: null,
  };
}

export function resolveBrakeOverviewLabel(args: {
  isInitialized: boolean;
  stateClass: BrakeStateClass;
  componentStates: BrakeComponentBuildState[];
}): { de: string; en: string } {
  if (!args.isInitialized || args.stateClass === 'NO_BASELINE') {
    return { de: 'Bremsbaseline erforderlich', en: 'Brake baseline required' };
  }
  if (args.stateClass === 'WARNING_ONLY') {
    return { de: 'Nur Warnsignal — keine belastbare Baseline', en: 'Warning signal only — no reliable baseline' };
  }

  const modeled = args.componentStates.filter((c) => c.anchorMm != null || c.estimatedMm != null || c.measuredMm != null);
  if (modeled.length === 0) {
    return { de: 'Bremsbaseline erforderlich', en: 'Brake baseline required' };
  }

  const classes = modeled.map((c) => c.evidenceClass);
  const hasMeasured = classes.some((c) => c === 'MEASURED');
  const allDocumented = classes.every(
    (c) => c === 'DOCUMENTED_REPLACEMENT' || c === 'SPEC_ESTIMATE' || c === 'MEASURED',
  );

  if (!hasMeasured && classes.some((c) => c === 'DOCUMENTED_REPLACEMENT')) {
    return { de: 'Neue Bremsen dokumentiert', en: 'New brakes documented' };
  }
  if (!hasMeasured && classes.some((c) => c === 'SPEC_ESTIMATE')) {
    return { de: 'Nominaler Ausgangswert aus Referenzdaten', en: 'Nominal starting value from reference data' };
  }
  if (!hasMeasured) {
    return { de: 'Noch keine Dickenmessung vorhanden', en: 'No thickness measurement yet' };
  }
  if (allDocumented || hasMeasured) {
    return { de: 'Bremszustand mit belastbarer Evidenz', en: 'Brake state with reliable evidence' };
  }
  return { de: 'Bremszustand mit gemischter Evidenz', en: 'Brake state with mixed evidence' };
}

function buildDataQualityItems(flags: {
  missingBaseline: boolean;
  specUnconfirmed: boolean;
  coverageGap: boolean;
  distanceConflict: boolean;
  staleEvidence: boolean;
}): BrakeDataQualityItem[] {
  return [
    {
      code: 'MISSING_BASELINE',
      labelDe: 'Fehlende Baseline',
      labelEn: 'Missing baseline',
      detailDe: flags.missingBaseline ? 'Keine belastbare Bremsen-Baseline hinterlegt.' : null,
      detailEn: flags.missingBaseline ? 'No reliable brake baseline on file.' : null,
      active: flags.missingBaseline,
    },
    {
      code: 'SPEC_UNCONFIRMED',
      labelDe: 'Spezifikation unbestätigt',
      labelEn: 'Spec unconfirmed',
      detailDe: flags.specUnconfirmed ? 'Mindestdicken aus Referenzdaten noch nicht bestätigt.' : null,
      detailEn: flags.specUnconfirmed ? 'Minimum thickness from reference data not yet confirmed.' : null,
      active: flags.specUnconfirmed,
    },
    {
      code: 'COVERAGE_GAP',
      labelDe: 'Abdeckungslücke',
      labelEn: 'Coverage gap',
      detailDe: flags.coverageGap ? 'Nicht alle Kilometer seit dem Anker sind modelliert.' : null,
      detailEn: flags.coverageGap ? 'Not all km since anchor are modeled.' : null,
      active: flags.coverageGap,
    },
    {
      code: 'DISTANCE_CONFLICT',
      labelDe: 'Kilometerkonflikt',
      labelEn: 'Distance conflict',
      detailDe: flags.distanceConflict ? 'Modellierte Kilometer überschreiten den Ankerbereich.' : null,
      detailEn: flags.distanceConflict ? 'Modeled km exceeds anchor range.' : null,
      active: flags.distanceConflict,
    },
    {
      code: 'STALE_EVIDENCE',
      labelDe: 'Veraltete Evidenz',
      labelEn: 'Stale evidence',
      detailDe: flags.staleEvidence ? 'Mindestens ein Evidenzdatensatz ist veraltet.' : null,
      detailEn: flags.staleEvidence ? 'At least one evidence record is stale.' : null,
      active: flags.staleEvidence,
    },
  ];
}

function buildSafetyItems(flags: {
  abs: boolean;
  dtc: boolean;
  dtcCode: string | null;
  wearSensor: boolean;
  immediateReplacement: boolean;
}): BrakeSafetyItem[] {
  return [
    {
      code: 'ABS',
      labelDe: 'ABS',
      labelEn: 'ABS',
      active: flags.abs,
      detailDe: flags.abs ? 'ABS-Warnsignal aktiv.' : null,
      detailEn: flags.abs ? 'ABS warning signal active.' : null,
      severity: flags.abs ? 'warning' : null,
    },
    {
      code: 'DTC',
      labelDe: 'Fehlercode (DTC)',
      labelEn: 'Diagnostic trouble code',
      active: flags.dtc,
      detailDe: flags.dtc ? `Aktiver Bremsen-DTC${flags.dtcCode ? `: ${flags.dtcCode}` : ''}.` : null,
      detailEn: flags.dtc ? `Active brake DTC${flags.dtcCode ? `: ${flags.dtcCode}` : ''}.` : null,
      severity: flags.dtc ? 'critical' : null,
    },
    {
      code: 'WEAR_SENSOR',
      labelDe: 'Verschleißsensor',
      labelEn: 'Wear sensor',
      active: flags.wearSensor,
      detailDe: flags.wearSensor ? 'Verschleißsensor meldet Warnung.' : null,
      detailEn: flags.wearSensor ? 'Wear sensor reports warning.' : null,
      severity: flags.wearSensor ? 'warning' : null,
    },
    {
      code: 'IMMEDIATE_REPLACEMENT',
      labelDe: 'Sofortiger Austausch',
      labelEn: 'Immediate replacement',
      active: flags.immediateReplacement,
      detailDe: flags.immediateReplacement ? 'Dokumentierter Sofort-Austausch erforderlich.' : null,
      detailEn: flags.immediateReplacement ? 'Documented immediate replacement required.' : null,
      severity: flags.immediateReplacement ? 'critical' : null,
    },
  ];
}

function buildStructuredActions(args: {
  isInitialized: boolean;
  openAlerts: BrakePresentationAlert[];
  dataQuality: BrakeDataQualityItem[];
  safety: BrakeSafetyItem[];
  componentStates: BrakeComponentBuildState[];
  hasOdometerGap: boolean;
}): BrakeStructuredAction[] {
  const actions: BrakeStructuredAction[] = [];
  const push = (code: BrakeStructuredActionCode, labelDe: string, labelEn: string, priority: number) => {
    if (!actions.some((a) => a.code === code)) {
      actions.push({ code, labelDe, labelEn, priority });
    }
  };

  if (!args.isInitialized || args.dataQuality.some((d) => d.code === 'MISSING_BASELINE' && d.active)) {
    push('RECORD_SERVICE', 'Service erfassen', 'Record service', 1);
  }

  const needsMeasure =
    args.componentStates.some(
      (c) =>
        c.evidenceClass === 'SPEC_ESTIMATE' ||
        c.evidenceClass === 'MODEL_ESTIMATED' ||
        c.evidenceClass === 'UNKNOWN',
    ) ||
    args.openAlerts.some((a) => a.code === 'BRAKE_MEASUREMENT_REQUIRED');
  if (needsMeasure) {
    push('MEASURE_THICKNESS', 'Dicke messen', 'Measure thickness', 2);
  }

  if (args.dataQuality.some((d) => d.code === 'SPEC_UNCONFIRMED' && d.active)) {
    push('CONFIRM_REFERENCE_SPEC', 'Referenz-Spezifikation bestätigen', 'Confirm reference spec', 3);
  }

  if (args.hasOdometerGap) {
    push('ADD_ODOMETER', 'Kilometerstand ergänzen', 'Add odometer', 4);
  }

  if (args.safety.some((s) => s.active)) {
    push('REVIEW_SAFETY_EVIDENCE', 'Sicherheits-Evidenz prüfen', 'Review safety evidence', 5);
  }

  if (
    args.openAlerts.some((a) => a.category === 'DATA_QUALITY') ||
    args.dataQuality.some((d) => d.active)
  ) {
    push('PERFORM_REVIEW', 'Review durchführen', 'Perform review', 6);
  }

  return actions.sort((a, b) => a.priority - b.priority);
}

export interface BuildBrakeEvidencePresentationInput {
  isInitialized: boolean;
  stateClass: BrakeStateClass;
  overallCondition: BrakeCondition;
  modeledComponents: BrakePresentationModeledComponents;
  modelCoverage: BrakePresentationModelCoverage;
  componentThresholds: BrakePresentationThreshold[];
  limitingComponent: BrakeReferenceSpecComponent | 'PADS_SET' | 'DISCS_SET' | null;
  openAlerts: BrakePresentationAlert[];
  componentStates: BrakeComponentBuildState[];
  dataQualityFlags: {
    missingBaseline: boolean;
    specUnconfirmed: boolean;
    coverageGap: boolean;
    distanceConflict: boolean;
    staleEvidence: boolean;
  };
  safetyFlags: {
    abs: boolean;
    dtc: boolean;
    dtcCode: string | null;
    wearSensor: boolean;
    immediateReplacement: boolean;
  };
  predictionCapable: boolean;
  overallRemainingKmMin: number | null;
  overallRemainingKmMax: number | null;
  overallRemainingKmPoint: number | null;
  overallConfidence: BrakeConfidenceLevel;
  modelCalculatedAt: string | null;
  hasOdometerGap: boolean;
}

export function buildBrakeEvidencePresentation(
  input: BuildBrakeEvidencePresentationInput,
): BrakeEvidencePresentation {
  const overview = resolveBrakeOverviewLabel({
    isInitialized: input.isInitialized,
    stateClass: input.stateClass,
    componentStates: input.componentStates,
  });

  const modeledMap: Record<BrakeComponentKey, boolean> = {
    FRONT_PADS: input.modeledComponents.frontPads,
    REAR_PADS: input.modeledComponents.rearPads,
    FRONT_DISCS: input.modeledComponents.frontDiscs,
    REAR_DISCS: input.modeledComponents.rearDiscs,
  };

  const thresholdByComponent = Object.fromEntries(
    input.componentThresholds.map((t) => [t.component, t]),
  ) as Record<BrakeComponentKey, BrakePresentationThreshold | undefined>;

  const components: BrakeComponentEvidenceLine[] = input.componentStates.map((state) => {
    const labels = COMPONENT_LABELS[state.component];
    const classLabels = EVIDENCE_CLASS_LABELS[state.evidenceClass];
    const src = sourceLabels(state.sourceCode);
    const threshold = thresholdByComponent[state.component];
    const minMm = threshold?.criticalThresholdMm ?? threshold?.warningThresholdMm ?? null;
    const thresholdSrc = thresholdSourceLabels(threshold?.source ?? null);
    const valueMm = state.measuredMm ?? state.estimatedMm ?? state.anchorMm;
    const valueLabel = formatComponentValueLabel(valueMm, state.evidenceClass);

    return {
      component: state.component,
      labelDe: labels.de,
      labelEn: labels.en,
      condition: state.condition,
      valueMm,
      valueLabelDe: valueLabel.de,
      valueLabelEn: valueLabel.en,
      evidenceClass: state.evidenceClass,
      evidenceClassLabelDe: classLabels.de,
      evidenceClassLabelEn: classLabels.en,
      sourceCode: state.sourceCode,
      sourceLabelDe: src.de,
      sourceLabelEn: src.en,
      evidenceAt: state.evidenceAt,
      odometerKm: state.odometerKm,
      confidence: state.confidence,
      minimumThicknessMm: minMm,
      minimumThicknessSource: threshold?.source ?? null,
      minimumThicknessSourceLabelDe: thresholdSrc.de,
      minimumThicknessSourceLabelEn: thresholdSrc.en,
      lastMeasurementAt: state.lastMeasurementAt,
      lastMeasurementMm: state.lastMeasurementMm,
      lastInstallationAt: state.lastInstallationAt,
      modelVersion: input.predictionCapable ? BRAKE_WEAR_MODEL_VERSION : null,
      isLimiting: input.limitingComponent === state.component,
      isModeled: modeledMap[state.component] ?? false,
      remainingKm: buildBrakeRemainingKmPresentation({
        minKm: state.remainingKmMin,
        maxKm: state.remainingKmMax,
        pointKm: state.remainingKm,
        confidence: state.confidence,
        evidenceClass: state.evidenceClass,
        predictionCapable: input.predictionCapable,
        coverageGap: input.dataQualityFlags.coverageGap,
      }),
    };
  });

  const limiting = components.find((c) => c.isLimiting) ?? components[0];
  const overallRemainingKm = buildBrakeRemainingKmPresentation({
    minKm: input.overallRemainingKmMin,
    maxKm: input.overallRemainingKmMax,
    pointKm: input.overallRemainingKmPoint,
    confidence: input.overallConfidence,
    evidenceClass: limiting?.evidenceClass ?? 'UNKNOWN',
    predictionCapable: input.predictionCapable,
    coverageGap: input.dataQualityFlags.coverageGap,
  });

  const dataQuality = buildDataQualityItems(input.dataQualityFlags);
  const safety = buildSafetyItems(input.safetyFlags);
  const structuredActions = buildStructuredActions({
    isInitialized: input.isInitialized,
    openAlerts: input.openAlerts,
    dataQuality,
    safety,
    componentStates: input.componentStates,
    hasOdometerGap: input.hasOdometerGap,
  });

  const cond = CONDITION_LABELS[input.overallCondition] ?? CONDITION_LABELS.UNKNOWN;

  return {
    overviewLabelDe: overview.de,
    overviewLabelEn: overview.en,
    uiStatusLabelDe: cond.de,
    uiStatusLabelEn: cond.en,
    components,
    overallRemainingKm,
    dataQuality,
    safety,
    structuredActions,
    modelVersion: BRAKE_WEAR_MODEL_VERSION,
    modelCalculatedAt: input.modelCalculatedAt,
  };
}

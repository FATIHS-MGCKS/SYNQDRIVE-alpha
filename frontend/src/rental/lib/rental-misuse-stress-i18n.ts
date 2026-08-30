/**
 * P2.2.64 — Vehicle rental stress & misuse hints presentation adapter.
 * Presentation-only: machine→label resolution and translation key lookup.
 */
import type {
  MisuseCaseDecisionEligibility,
  MisuseCaseStatus,
  TripEvidenceCaseSource,
  TripEvidenceConfidence,
  TripEvidenceLevel,
} from '../../lib/api';
import type { SupportedLocale } from '../../i18n/locales';
import type { TranslationKey } from '../../i18n/translations/en';
import type { DataConfidence } from './scoreFormat';
import { STRESS_TOOLTIPS, getDataConfidenceLabel } from './scoreFormat';
import {
  CONTEXT_CLASSIFICATION_LABEL,
  confidenceLabel as contextConfidenceLabel,
  evidenceGradeLabel,
} from '../components/trips/event-context-ui';
import {
  EVIDENCE_LEVEL_LABEL,
  EVIDENCE_SOURCE_LABEL,
  evidenceConfidenceLabel,
} from '../components/trips/behavior-ui.utils';

export type MisuseStressTranslate = (
  key: TranslationKey,
  vars?: Record<string, string | number>,
) => string;

const MISUSE_SEVERITY_KEYS = {
  CRITICAL: 'misuseStress.severity.CRITICAL',
  SEVERE: 'misuseStress.severity.SEVERE',
  WARNING: 'misuseStress.severity.WARNING',
  INFO: 'misuseStress.severity.INFO',
} as const satisfies Record<string, TranslationKey>;

const MISUSE_STATUS_KEYS = {
  CANDIDATE: 'misuseStress.status.CANDIDATE',
  ACTIVE: 'misuseStress.status.ACTIVE',
  REVIEW_REQUIRED: 'misuseStress.status.REVIEW_REQUIRED',
  CONFIRMED: 'misuseStress.status.CONFIRMED',
  DISMISSED: 'misuseStress.status.DISMISSED',
  RESOLVED: 'misuseStress.status.RESOLVED',
  SUPERSEDED: 'misuseStress.status.SUPERSEDED',
  NOT_ASSESSABLE: 'misuseStress.status.NOT_ASSESSABLE',
} as const satisfies Record<MisuseCaseStatus, TranslationKey>;

const MISUSE_ELIGIBILITY_KEYS = {
  INFORMATIONAL_ONLY: 'misuseStress.eligibility.INFORMATIONAL_ONLY',
  REVIEW_ONLY: 'misuseStress.eligibility.REVIEW_ONLY',
  MANUAL_CONFIRMATION_ONLY: 'misuseStress.eligibility.MANUAL_CONFIRMATION_ONLY',
  OPERATIONAL_ELIGIBLE: 'misuseStress.eligibility.OPERATIONAL_ELIGIBLE',
  NOT_ELIGIBLE: 'misuseStress.eligibility.NOT_ELIGIBLE',
} as const satisfies Record<MisuseCaseDecisionEligibility, TranslationKey>;

const WEAR_IMPACT_DE: Record<string, string> = {
  low: 'Gering',
  medium: 'Mittel',
  medium_to_high: 'Mittel bis hoch',
  high: 'Hoch',
};

const WEAR_IMPACT_EN: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  medium_to_high: 'Medium to high',
  high: 'High',
};

const DATA_CONFIDENCE_EN: Record<DataConfidence, string> = {
  high: 'High data quality',
  medium: 'Medium data quality',
  low: 'Low data quality',
  none: 'Insufficient data basis',
};

const EVIDENCE_LEVEL_EN: Record<TripEvidenceLevel, string> = {
  NONE: 'None',
  INFO: 'Info',
  CHECK_RECOMMENDED: 'Review recommended',
  MISUSE_SUSPECTED: 'Suspected misuse',
  DAMAGE_RISK: 'Technical risk',
  CRITICAL_DAMAGE_RISK: 'Critical',
};

const EVIDENCE_SOURCE_EN: Record<TripEvidenceCaseSource, string> = {
  NATIVE_EVENT: 'Native event',
  HF_RECONSTRUCTION: 'HF reconstruction',
  CONTEXT_ENRICHMENT: 'Event context',
  MIXED: 'Mixed sources',
};

const EVIDENCE_CONFIDENCE_EN: Record<TripEvidenceConfidence, string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Medium confidence',
  LOW: 'Low confidence',
};

const CONTEXT_CLASSIFICATION_EN: Record<string, string> = {
  AGGRESSIVE_START: 'Aggressive start',
  LAUNCH_LIKE_START: 'Launch-like start',
  KICKDOWN_LIKELY: 'Kickdown likely',
  FULL_THROTTLE_LIKELY: 'Full throttle likely',
  OVERTAKING_LIKELY: 'Overtaking maneuver likely',
  COLD_ENGINE_ACCELERATION: 'Cold-engine acceleration',
  COLD_ENGINE_KICKDOWN: 'Cold-engine kickdown',
  COLD_ENGINE_HIGH_RPM: 'Cold engine: high RPM (signal in context window)',
  EMERGENCY_LIKE_BRAKING: 'Emergency-like braking',
  REV_IN_IDLE_CANDIDATE: 'Revving while stationary (suspected, context)',
  REV_IN_IDLE_CONFIRMED: 'Revving while stationary (inactive/future)',
  HIGH_RPM_CONSTANT: 'Sustained high RPM (context)',
  HIGH_RPM_SPIKE: 'RPM spike (context)',
  OVERHEATING_RISK: 'Overheating risk',
  INSUFFICIENT_CONTEXT: 'Context not sufficiently assessable',
};

const EVIDENCE_GRADE_EN: Record<string, string> = {
  A: 'Evidence grade A — strong',
  B: 'Evidence grade B — reliable',
  C: 'Evidence grade C — weak',
  D: 'Evidence grade D — insufficient',
};

const MISUSE_CONFIDENCE_REUSE_KEYS = {
  HIGH: 'docUpload.entityReview.confidence.HIGH',
  MEDIUM: 'docUpload.entityReview.confidence.MEDIUM',
  LOW: 'docUpload.entityReview.confidence.LOW',
} as const satisfies Record<string, TranslationKey>;

function resolveKeyedOrRaw(
  t: MisuseStressTranslate,
  key: TranslationKey | undefined,
  raw: string,
): string {
  if (!key) return raw;
  const resolved = t(key);
  return resolved === key ? raw : resolved;
}

export function resolveMisuseSeverityLabel(
  t: MisuseStressTranslate,
  severity: string,
): string {
  const key = MISUSE_SEVERITY_KEYS[severity as keyof typeof MISUSE_SEVERITY_KEYS];
  return resolveKeyedOrRaw(t, key, severity);
}

export function resolveMisuseConfidenceLabel(
  t: MisuseStressTranslate,
  confidence: string,
): string {
  const key =
    MISUSE_CONFIDENCE_REUSE_KEYS[confidence as keyof typeof MISUSE_CONFIDENCE_REUSE_KEYS];
  return resolveKeyedOrRaw(t, key, confidence);
}

export function resolveMisuseCaseStatusLabel(
  t: MisuseStressTranslate,
  status: MisuseCaseStatus | string | undefined,
): string | null {
  if (!status) return null;
  const key = MISUSE_STATUS_KEYS[status as MisuseCaseStatus];
  return key ? resolveKeyedOrRaw(t, key, status) : status;
}

export function resolveMisuseCaseDecisionHint(
  t: MisuseStressTranslate,
  eligibility: MisuseCaseDecisionEligibility | string | undefined,
): string | null {
  if (!eligibility) return null;
  const key = MISUSE_ELIGIBILITY_KEYS[eligibility as MisuseCaseDecisionEligibility];
  return key ? resolveKeyedOrRaw(t, key, eligibility) : null;
}

export function resolveWearImpactLabel(
  locale: SupportedLocale,
  impact: string,
): string {
  const map = locale === 'de' ? WEAR_IMPACT_DE : WEAR_IMPACT_EN;
  return map[impact] ?? impact;
}

export function resolveStressDataConfidenceLabel(
  locale: SupportedLocale,
  confidence: DataConfidence | undefined,
): string {
  if (!confidence) {
    return locale === 'de'
      ? getDataConfidenceLabel('none')
      : DATA_CONFIDENCE_EN.none;
  }
  if (locale === 'de') return getDataConfidenceLabel(confidence);
  return DATA_CONFIDENCE_EN[confidence] ?? confidence;
}

export function resolveStressFootnote(locale: SupportedLocale): string {
  return STRESS_TOOLTIPS.vehicleStress[locale === 'de' ? 'de' : 'en'];
}

export function resolveEvidenceLevelLabel(
  locale: SupportedLocale,
  level: TripEvidenceLevel,
): string {
  if (locale === 'de') return EVIDENCE_LEVEL_LABEL[level];
  return EVIDENCE_LEVEL_EN[level] ?? level;
}

export function resolveEvidenceSourceLabel(
  locale: SupportedLocale,
  source: TripEvidenceCaseSource,
): string {
  if (locale === 'de') return EVIDENCE_SOURCE_LABEL[source];
  return EVIDENCE_SOURCE_EN[source] ?? source;
}

export function resolveEvidenceConfidenceLabel(
  locale: SupportedLocale,
  confidence: TripEvidenceConfidence,
): string {
  if (locale === 'de') return evidenceConfidenceLabel(confidence);
  return EVIDENCE_CONFIDENCE_EN[confidence] ?? confidence;
}

export function resolveContextClassificationLabel(
  locale: SupportedLocale,
  code: string,
): string {
  if (locale === 'de') {
    return CONTEXT_CLASSIFICATION_LABEL[code] ?? code.replace(/_/g, ' ').toLowerCase();
  }
  return CONTEXT_CLASSIFICATION_EN[code] ?? code;
}

export function resolveContextConfidenceLabel(
  locale: SupportedLocale,
  code: string | null | undefined,
): string {
  if (!code) return '';
  if (locale === 'de') return contextConfidenceLabel(code);
  const normalized = code.toUpperCase();
  if (normalized === 'HIGH' || normalized === 'MEDIUM' || normalized === 'LOW') {
    return EVIDENCE_CONFIDENCE_EN[normalized as TripEvidenceConfidence];
  }
  return code;
}

export function resolveEvidenceGradeLabel(
  locale: SupportedLocale,
  code: string | null | undefined,
): string {
  if (!code) return '';
  if (locale === 'de') return evidenceGradeLabel(code);
  return EVIDENCE_GRADE_EN[code] ?? code;
}

export function resolveUnknownMachineLabel(machine: string): string {
  return machine;
}

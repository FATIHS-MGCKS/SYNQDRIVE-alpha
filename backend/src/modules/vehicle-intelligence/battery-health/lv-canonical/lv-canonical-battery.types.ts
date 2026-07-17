import type { ResolvedBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.types';
import type { BatteryDataQualityPresentation } from '../battery-data-quality';
import type { BatteryDomainFreshnessBundle } from '../battery-freshness.policy';
import type { LvPublicationMaturity } from '../lv-assessment/lv-publication.policy';

export const LV_CANONICAL_RESOLVER_VERSION = '1.0.0';

export const LV_CANONICAL_TRUTH_SOURCES = [
  'WORKSHOP_MANUAL_EVIDENCE',
  'V2_PUBLICATION_STABLE',
  'V2_PUBLICATION_PROVISIONAL',
  'V2_SHADOW_DIAGNOSTIC',
  'LIVE_TELEMETRY',
  'LEGACY_UNVERIFIED',
  'UNSUPPORTED',
  'UNAVAILABLE',
] as const;

export type LvCanonicalTruthSource = (typeof LV_CANONICAL_TRUTH_SOURCES)[number];

export const LV_CANONICAL_SCORE_SEMANTICS = 'ESTIMATED_HEALTH_NOT_SOH' as const;

export const LV_CANONICAL_SCORE_LABEL_DE = 'Geschätzter 12V-Batteriezustand';

export interface LvCanonicalPrimaryTruth {
  source: LvCanonicalTruthSource;
  estimatedHealthScore: number | null;
  semanticType: typeof LV_CANONICAL_SCORE_SEMANTICS;
  labelDe: typeof LV_CANONICAL_SCORE_LABEL_DE;
  decisionCapable: boolean;
}

export interface LvCanonicalLiveVoltage {
  voltageV: number;
  observedAt: string;
  source: 'live_telemetry' | 'resting_snapshot';
  engineRunning: boolean | null;
  safeForDecision: boolean;
}

export interface LvCanonicalRestMeasurement {
  measurementId: string;
  measurementType: string;
  quality: string;
  voltageV: number | null;
  observedAt: string;
  cycleKey: string | null;
}

export interface LvCanonicalStartProxy {
  sessionId: string | null;
  tripId: string | null;
  observedAt: string | null;
  diagnosticOnly: true;
  measurements: Array<{
    measurementType: string;
    quality: string;
    numericValue: number | null;
    observedAt: string;
  }>;
}

export interface LvCanonicalAssessment {
  assessmentId: string | null;
  assessmentMode: 'CANONICAL' | 'SHADOW';
  assessmentTrack: 'TELEMETRY' | 'WORKSHOP_OVERRIDE';
  estimatedHealthScore: number | null;
  confidence: string | null;
  publicationEligible: boolean;
  computedAt: string | null;
}

export interface LvCanonicalPublication {
  publicationId: string | null;
  maturity: LvPublicationMaturity;
  publishedEstimatedHealth: number | null;
  userFacingPublished: boolean;
  publishedAt: string | null;
  assessmentEvidenceObservedAt: string | null;
}

export interface LvCanonicalProfile {
  profile: ResolvedBatteryPolicy['profile'];
  driveProfile: ResolvedBatteryPolicy['driveProfile'];
  lvAssessmentAllowed: boolean;
  supported: boolean;
}

export interface LvCanonicalChemistry {
  chemistry: ResolvedBatteryPolicy['chemistry'];
  chemicalSocEstimationAllowed: boolean;
}

export interface LvCanonicalQuality {
  aggregate: BatteryDataQualityPresentation;
  primaryTruth: BatteryDataQualityPresentation;
}

export interface LvCanonicalLegacyDiagnostic {
  displayMode: 'LEGACY_UNVERIFIED';
  decisionCapable: false;
  publishedSohPct: number | null;
  stabilizedSohPct: number | null;
  rawSohPct: number | null;
  publicationState: string | null;
  scoredAt: string | null;
  supersededByPrimary: boolean;
}

export interface LvCanonicalWorkshopEvidenceInput {
  sourceType: 'WORKSHOP_MEASUREMENT' | 'DOCUMENT_CONFIRMED' | 'MANUAL_REPORT';
  estimatedHealthScore: number | null;
  observedAt: string;
  evidenceId?: string | null;
  measurementId?: string | null;
}

export interface LvCanonicalLegacyInput {
  publishedSohPct: number | null;
  stabilizedSohPct: number | null;
  rawSohPct: number | null;
  publicationState: string | null;
  scoredAt: string | null;
}

export interface ResolveCanonicalLvBatteryInput {
  vehicleId: string;
  policy: ResolvedBatteryPolicy;
  workshopEvidence: LvCanonicalWorkshopEvidenceInput | null;
  publication: LvCanonicalPublication | null;
  assessment: LvCanonicalAssessment | null;
  liveVoltage: LvCanonicalLiveVoltage | null;
  latestQualifiedRestMeasurement: LvCanonicalRestMeasurement | null;
  latestStartProxy: LvCanonicalStartProxy | null;
  legacy: LvCanonicalLegacyInput | null;
  freshness: BatteryDomainFreshnessBundle;
  now?: Date;
}

export interface CanonicalLvBatteryResponse {
  resolverVersion: string;
  vehicleId: string;
  resolvedAt: string;
  profile: LvCanonicalProfile;
  chemistry: LvCanonicalChemistry;
  primaryTruth: LvCanonicalPrimaryTruth;
  liveVoltage: LvCanonicalLiveVoltage | null;
  latestQualifiedRestMeasurement: LvCanonicalRestMeasurement | null;
  latestStartProxy: LvCanonicalStartProxy | null;
  assessment: LvCanonicalAssessment | null;
  publication: LvCanonicalPublication | null;
  freshness: BatteryDomainFreshnessBundle;
  quality: LvCanonicalQuality;
  legacyDiagnostic: LvCanonicalLegacyDiagnostic | null;
  unsupported: boolean;
  unavailable: boolean;
}

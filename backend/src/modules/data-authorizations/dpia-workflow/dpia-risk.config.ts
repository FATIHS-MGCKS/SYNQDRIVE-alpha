import type { DataAuthorizationRiskLevel } from '@prisma/client';
import {
  PrivacyRiskDataVolume,
  PrivacyRiskDuration,
  PrivacyRiskFrequency,
  PrivacyRiskLikelihood,
  PrivacyRiskSubjectScale,
} from '@prisma/client';

export const DPIA_RISK_CONFIG = {
  /** Risk score threshold (0–100) above which DPIA is recommended. */
  dpiaScoreThreshold: Number(process.env.DPIA_RISK_SCORE_THRESHOLD ?? 55),
  /** HIGH/CRITICAL org risk level always triggers DPIA gate. */
  highRiskLevelsTriggerDpia: true,
  /** Days before reviewDate to mark DPIA_REVIEW_DUE. */
  reviewDueLeadDays: Number(process.env.DPIA_REVIEW_DUE_LEAD_DAYS ?? 30),
  /** When true, REVIEW_DUE may suspend ACTIVE processing activities. */
  reviewDueSuspendEnabled: process.env.DPIA_REVIEW_DUE_SUSPEND === 'true',
  disclaimer:
    'Risiko-Score ist eine technische Heuristik — keine automatische juristische DPIA-Entscheidung.',
} as const;

export interface PrivacyRiskFactorInput {
  dataCategories: string[];
  dataVolumeScope?: PrivacyRiskDataVolume | null;
  processingFrequency?: PrivacyRiskFrequency | null;
  processingDuration?: PrivacyRiskDuration | null;
  dataSubjectScale?: PrivacyRiskSubjectScale | null;
  systematicMonitoring?: boolean;
  locationData?: boolean;
  profiling?: boolean;
  automatedDecisionMaking?: boolean;
  vulnerableSubjects?: boolean;
  dataCombination?: boolean;
  thirdCountryTransfer?: boolean;
  externalRecipients?: boolean;
  securityMeasures?: string | null;
  potentialHarm?: string | null;
  likelihood?: PrivacyRiskLikelihood | null;
  orgRiskLevel?: DataAuthorizationRiskLevel | null;
}

export interface PrivacyRiskScoreResult {
  riskScore: number;
  dpiaRequired: boolean;
  factors: Array<{ key: string; weight: number; triggered: boolean }>;
  disclaimer: string;
}

const FACTOR_WEIGHTS = {
  sensitiveCategory: 15,
  highVolume: 10,
  continuousFrequency: 10,
  longDuration: 8,
  largeSubjectScale: 12,
  systematicMonitoring: 15,
  locationData: 12,
  profiling: 14,
  automatedDecisionMaking: 16,
  vulnerableSubjects: 14,
  dataCombination: 8,
  thirdCountryTransfer: 12,
  externalRecipients: 8,
  highLikelihood: 10,
  orgHighRisk: 20,
  orgCriticalRisk: 30,
} as const;

const SENSITIVE_CATEGORIES = new Set([
  'GPS_LOCATION',
  'HEALTH_SIGNALS',
  'DTC_CODES',
  'CUSTOMER_DATA',
  'FINANCIAL_DATA',
  'BIOMETRIC_DATA',
]);

export function computePrivacyRiskScore(input: PrivacyRiskFactorInput): PrivacyRiskScoreResult {
  const factors: PrivacyRiskScoreResult['factors'] = [];
  let score = 0;

  const sensitive = input.dataCategories.some((c) => SENSITIVE_CATEGORIES.has(c));
  if (sensitive) {
    score += FACTOR_WEIGHTS.sensitiveCategory;
    factors.push({ key: 'sensitiveDataCategories', weight: FACTOR_WEIGHTS.sensitiveCategory, triggered: true });
  }

  if (input.dataVolumeScope === PrivacyRiskDataVolume.LARGE || input.dataVolumeScope === PrivacyRiskDataVolume.VERY_LARGE) {
    score += FACTOR_WEIGHTS.highVolume;
    factors.push({ key: 'dataVolumeScope', weight: FACTOR_WEIGHTS.highVolume, triggered: true });
  }

  if (input.processingFrequency === PrivacyRiskFrequency.CONTINUOUS || input.processingFrequency === PrivacyRiskFrequency.REGULAR) {
    score += FACTOR_WEIGHTS.continuousFrequency;
    factors.push({ key: 'processingFrequency', weight: FACTOR_WEIGHTS.continuousFrequency, triggered: true });
  }

  if (input.processingDuration === PrivacyRiskDuration.LONG_TERM || input.processingDuration === PrivacyRiskDuration.INDEFINITE) {
    score += FACTOR_WEIGHTS.longDuration;
    factors.push({ key: 'processingDuration', weight: FACTOR_WEIGHTS.longDuration, triggered: true });
  }

  if (input.dataSubjectScale === PrivacyRiskSubjectScale.MANY || input.dataSubjectScale === PrivacyRiskSubjectScale.LARGE_SCALE) {
    score += FACTOR_WEIGHTS.largeSubjectScale;
    factors.push({ key: 'dataSubjectScale', weight: FACTOR_WEIGHTS.largeSubjectScale, triggered: true });
  }

  if (input.systematicMonitoring) {
    score += FACTOR_WEIGHTS.systematicMonitoring;
    factors.push({ key: 'systematicMonitoring', weight: FACTOR_WEIGHTS.systematicMonitoring, triggered: true });
  }
  if (input.locationData) {
    score += FACTOR_WEIGHTS.locationData;
    factors.push({ key: 'locationData', weight: FACTOR_WEIGHTS.locationData, triggered: true });
  }
  if (input.profiling) {
    score += FACTOR_WEIGHTS.profiling;
    factors.push({ key: 'profiling', weight: FACTOR_WEIGHTS.profiling, triggered: true });
  }
  if (input.automatedDecisionMaking) {
    score += FACTOR_WEIGHTS.automatedDecisionMaking;
    factors.push({ key: 'automatedDecisionMaking', weight: FACTOR_WEIGHTS.automatedDecisionMaking, triggered: true });
  }
  if (input.vulnerableSubjects) {
    score += FACTOR_WEIGHTS.vulnerableSubjects;
    factors.push({ key: 'vulnerableSubjects', weight: FACTOR_WEIGHTS.vulnerableSubjects, triggered: true });
  }
  if (input.dataCombination) {
    score += FACTOR_WEIGHTS.dataCombination;
    factors.push({ key: 'dataCombination', weight: FACTOR_WEIGHTS.dataCombination, triggered: true });
  }
  if (input.thirdCountryTransfer) {
    score += FACTOR_WEIGHTS.thirdCountryTransfer;
    factors.push({ key: 'thirdCountryTransfer', weight: FACTOR_WEIGHTS.thirdCountryTransfer, triggered: true });
  }
  if (input.externalRecipients) {
    score += FACTOR_WEIGHTS.externalRecipients;
    factors.push({ key: 'externalRecipients', weight: FACTOR_WEIGHTS.externalRecipients, triggered: true });
  }
  if (input.likelihood === PrivacyRiskLikelihood.HIGH) {
    score += FACTOR_WEIGHTS.highLikelihood;
    factors.push({ key: 'likelihood', weight: FACTOR_WEIGHTS.highLikelihood, triggered: true });
  }

  if (input.orgRiskLevel === 'HIGH') {
    score += FACTOR_WEIGHTS.orgHighRisk;
    factors.push({ key: 'orgRiskLevelHigh', weight: FACTOR_WEIGHTS.orgHighRisk, triggered: true });
  }
  if (input.orgRiskLevel === 'CRITICAL') {
    score += FACTOR_WEIGHTS.orgCriticalRisk;
    factors.push({ key: 'orgRiskLevelCritical', weight: FACTOR_WEIGHTS.orgCriticalRisk, triggered: true });
  }

  const capped = Math.min(100, score);
  const dpiaRequired =
    capped >= DPIA_RISK_CONFIG.dpiaScoreThreshold ||
    input.orgRiskLevel === 'HIGH' ||
    input.orgRiskLevel === 'CRITICAL';

  return {
    riskScore: capped,
    dpiaRequired,
    factors,
    disclaimer: DPIA_RISK_CONFIG.disclaimer,
  };
}

export function mapRiskScoreToOrgLevel(score: number): DataAuthorizationRiskLevel {
  if (score >= 75) return 'CRITICAL';
  if (score >= 55) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
}

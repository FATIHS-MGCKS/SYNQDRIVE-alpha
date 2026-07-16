import type { HvCapacityObservation, HvChargeSession } from '@prisma/client';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import { HV_CAPACITY_SHADOW_BLOCKED_SIDE_EFFECTS } from './hv-capacity-shadow.policy';
import { HV_CROSS_SESSION_FRESHNESS_MS } from './hv-capacity-cross-session.types';
import { HV_M2_MODEL_VERSION } from './hv-capacity-m2.types';
import { HV_M3_MODEL_VERSION } from './hv-capacity-m3.types';
import { HV_M2_SESSION_SUMMARY_MODEL_VERSION } from './hv-capacity-session-summary.types';
import {
  HV_CROSS_SESSION_ASSESSMENT_MODEL_VERSION,
} from './hv-capacity-cross-session.types';
import { HV_SOH_GATE_FRESHNESS_MS, HV_SOH_GATE_MODEL_VERSION } from './hv-soh-gate.types';
import type {
  HvCapacityShadowEvaluationCrossSession,
  HvCapacityShadowEvaluationM2Observation,
  HvCapacityShadowEvaluationReferenceCapacity,
  HvCapacityShadowEvaluationSession,
  HvCapacityShadowEvaluationSohGate,
  HvCapacityShadowPublicationBlocker,
} from './hv-capacity-shadow-evaluation.types';

const SENSITIVE_METADATA_KEYS = new Set([
  'dimoTokenId',
  'providerSegmentId',
  'changeHistory',
]);

export function sanitizeChargeSessionMetadata(
  metadata: HvChargeSessionMetadata | null | undefined,
): Omit<
  HvChargeSessionMetadata,
  'dimoTokenId' | 'providerSegmentId' | 'changeHistory'
> | null {
  if (!metadata) return null;
  const sanitized = { ...metadata };
  for (const key of SENSITIVE_METADATA_KEYS) {
    delete (sanitized as Record<string, unknown>)[key];
  }
  return sanitized;
}

export function mapM2ObservationRow(
  row: HvCapacityObservation,
): HvCapacityShadowEvaluationM2Observation {
  const metadata =
    row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : {};

  return {
    id: row.id,
    observedAt: row.observedAt.toISOString(),
    estimatedCapacityKwh: row.estimatedCapacityKwh,
    quality: row.quality,
    modelVersion: row.modelVersion,
    socPercent: typeof metadata.socPercent === 'number' ? metadata.socPercent : null,
    preferredSocBand:
      typeof metadata.preferredSocBand === 'boolean' ? metadata.preferredSocBand : null,
    outlier: typeof metadata.outlier === 'boolean' ? metadata.outlier : null,
  };
}

export function mapChargeSessionRow(input: {
  session: HvChargeSession;
  m2Observations: HvCapacityObservation[];
}): HvCapacityShadowEvaluationSession {
  const metadata = (input.session.metadata ?? {}) as unknown as HvChargeSessionMetadata;
  const sanitized = sanitizeChargeSessionMetadata(metadata);

  return {
    sessionId: input.session.id,
    source: input.session.source,
    startAt: input.session.startAt.toISOString(),
    endAt: input.session.endAt?.toISOString() ?? null,
    isOngoing: input.session.isOngoing,
    qualityStatus: sanitized?.qualityStatus ?? null,
    qualityReasonCodes: sanitized?.qualityReasonCodes ?? [],
    capacityShadowEligible: sanitized?.capacityShadowEligible === true,
    capacityValidationEligible: sanitized?.capacityValidationEligible === true,
    deltaSocPercent: input.session.deltaSocPercent,
    energyAddedKwh: input.session.energyAddedKwh,
    sessionMedianKwh: sanitized?.m2CapacitySummary?.stats.medianCapacityKwh ?? null,
    m2Summary: sanitized?.m2CapacitySummary ?? null,
    m3Validation: sanitized?.m3Validation ?? null,
    m2Observations: input.m2Observations.map(mapM2ObservationRow),
  };
}

export function mapReferenceCapacityRow(
  row: {
    id: string;
    capacityKwh: number;
    capacityType: string;
    source: string;
    verificationStatus: string;
    verifiedAt: Date | null;
    isActive: boolean;
  } | null,
): HvCapacityShadowEvaluationReferenceCapacity | null {
  if (!row) return null;
  return {
    id: row.id,
    capacityKwh: row.capacityKwh,
    capacityType: row.capacityType,
    source: row.source,
    verificationStatus: row.verificationStatus,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    isActive: row.isActive,
  };
}

export function mapCrossSessionAssessmentRow(
  row: {
    id: string;
    scoreValue: number | null;
    confidence: string | null;
    modelVersion: number;
    computedAt: Date;
    inputSummary: unknown;
  } | null,
): HvCapacityShadowEvaluationCrossSession | null {
  if (!row) return null;
  const summary =
    row.inputSummary && typeof row.inputSummary === 'object'
      ? (row.inputSummary as Record<string, unknown>)
      : {};

  return {
    assessmentId: row.id,
    computedAt: row.computedAt.toISOString(),
    estimatedUsableCapacityKwh: row.scoreValue,
    sessionCount: typeof summary.sessionCount === 'number' ? summary.sessionCount : 0,
    observationCount:
      typeof summary.observationCount === 'number' ? summary.observationCount : 0,
    confidence:
      typeof summary.confidence === 'string'
        ? summary.confidence
        : row.confidence,
    maturity: typeof summary.maturity === 'string' ? summary.maturity : null,
    shadowGatePassed: summary.shadowGatePassed === true,
    gateReasonCodes: Array.isArray(summary.gateReasonCodes)
      ? (summary.gateReasonCodes as string[])
      : [],
    spread:
      summary.spread && typeof summary.spread === 'object'
        ? (summary.spread as Record<string, unknown>)
        : null,
    methodAgreement:
      summary.methodAgreement && typeof summary.methodAgreement === 'object'
        ? (summary.methodAgreement as Record<string, unknown>)
        : null,
    capabilityVersion:
      typeof summary.capabilityVersion === 'number' ? summary.capabilityVersion : null,
    modelVersion: row.modelVersion,
  };
}

export function mapSohGateAssessmentRow(
  row: {
    id: string;
    scoreValue: number | null;
    confidence: string | null;
    modelVersion: number;
    computedAt: Date;
    inputSummary: unknown;
  } | null,
): HvCapacityShadowEvaluationSohGate | null {
  if (!row) return null;
  const summary =
    row.inputSummary && typeof row.inputSummary === 'object'
      ? (row.inputSummary as Record<string, unknown>)
      : {};

  return {
    assessmentId: row.id,
    computedAt: row.computedAt.toISOString(),
    sohAvailability:
      typeof summary.sohAvailability === 'string' ? summary.sohAvailability : null,
    estimatedSohPercent: row.scoreValue,
    estimatedUsableCapacityKwh:
      typeof summary.estimatedUsableCapacityKwh === 'number'
        ? summary.estimatedUsableCapacityKwh
        : null,
    verifiedReferenceCapacityKwh:
      typeof summary.verifiedReferenceCapacityKwh === 'number'
        ? summary.verifiedReferenceCapacityKwh
        : null,
    maturity: typeof summary.maturity === 'string' ? summary.maturity : null,
    confidence:
      typeof summary.confidence === 'string'
        ? summary.confidence
        : row.confidence,
    sohGatePassed: summary.sohGatePassed === true,
    gateReasonCodes: Array.isArray(summary.gateReasonCodes)
      ? (summary.gateReasonCodes as HvCapacityShadowEvaluationSohGate['gateReasonCodes'])
      : [],
    sohPublicationEnabled: summary.sohPublicationEnabled === true,
    modelVersion: row.modelVersion,
  };
}

const CROSS_SESSION_LABELS: Record<string, string> = {
  INSUFFICIENT_QUALIFIED_SESSIONS: 'Zu wenige qualifizierte Sessions',
  DOMINANT_SESSION: 'Dominante Session in der Beobachtungsbasis',
  CROSS_SESSION_SPREAD_HIGH: 'Cross-Session-Streuung zu hoch',
  INTRA_SESSION_INSTABILITY: 'Intra-Session-Instabilität',
  M3_METHOD_CONFLICT: 'M2/M3-Methodenkonflikt',
  STALE_SESSIONS: 'Sessions außerhalb des Freshness-Fensters',
  MODEL_VERSION_MISMATCH: 'Inkompatible M2-Modellversion',
  INCOMPATIBLE_REFERENCE_CAPACITY: 'Inkompatible Referenzkapazität',
  INSUFFICIENT_FRESH_SESSIONS: 'Zu wenige frische Sessions',
};

const SOH_GATE_LABELS: Record<string, string> = {
  NO_REFERENCE_CAPACITY: 'Keine Referenzkapazität',
  REFERENCE_NOT_VERIFIED: 'Referenz nicht verifiziert',
  INCOMPATIBLE_CAPACITY_TYPE: 'Inkompatible Referenzkapazitätstyp',
  CAPACITY_ASSESSMENT_NOT_STABLE: 'Kapazitäts-Assessment nicht stabil',
  INSUFFICIENT_SESSIONS: 'Zu wenige qualifizierte Sessions',
  ASSESSMENT_STALE: 'Assessment veraltet',
  CAPABILITY_CHANGED: 'Capability geändert',
  METHOD_CONFLICT: 'Methodenkonflikt',
  MODEL_VERSION_NOT_APPROVED: 'Modellversion nicht freigegeben',
  OUT_OF_PLAUSIBLE_BAND: 'SOH außerhalb plausibler Grenzen',
  PUBLICATION_DISABLED: 'SOH-Publication deaktiviert',
};

export function buildPublicationBlockers(input: {
  crossSession: HvCapacityShadowEvaluationCrossSession | null;
  sohGate: HvCapacityShadowEvaluationSohGate | null;
  sohPublicationEnabled: boolean;
}): HvCapacityShadowPublicationBlocker[] {
  const blockers: HvCapacityShadowPublicationBlocker[] = [];

  for (const code of input.crossSession?.gateReasonCodes ?? []) {
    blockers.push({
      code,
      labelDe: CROSS_SESSION_LABELS[code] ?? code,
      source: 'CROSS_SESSION',
    });
  }

  for (const code of input.sohGate?.gateReasonCodes ?? []) {
    if (code === 'PUBLICATION_DISABLED') {
      blockers.push({
        code,
        labelDe: SOH_GATE_LABELS[code],
        source: 'FLAG',
      });
      continue;
    }
    blockers.push({
      code,
      labelDe: SOH_GATE_LABELS[code] ?? code,
      source: 'SOH_GATE',
    });
  }

  for (const effect of HV_CAPACITY_SHADOW_BLOCKED_SIDE_EFFECTS) {
    blockers.push({
      code: effect,
      labelDe: `Shadow-Pipeline blockiert: ${effect}`,
      source: 'POLICY',
    });
  }

  if (!input.sohPublicationEnabled) {
    const alreadyFlagged = blockers.some(
      (row) => row.code === 'PUBLICATION_DISABLED' || row.code === 'hv_soh_percent',
    );
    if (!alreadyFlagged) {
      blockers.push({
        code: 'HV_SOH_PUBLICATION_DISABLED',
        labelDe: 'HV SOH Kundenpublication ist deaktiviert',
        source: 'FLAG',
      });
    }
  }

  return blockers;
}

export function resolveEvaluationFreshness(input: {
  now: Date;
  crossSessionComputedAt: string | null;
  sohGateComputedAt: string | null;
}): {
  crossSessionFresh: boolean | null;
  sohGateFresh: boolean | null;
  freshnessWindowMs: number;
} {
  const crossSessionFresh =
    input.crossSessionComputedAt == null
      ? null
      : input.now.getTime() - new Date(input.crossSessionComputedAt).getTime() <=
        HV_CROSS_SESSION_FRESHNESS_MS;

  const sohGateFresh =
    input.sohGateComputedAt == null
      ? null
      : input.now.getTime() - new Date(input.sohGateComputedAt).getTime() <=
        HV_SOH_GATE_FRESHNESS_MS;

  return {
    crossSessionFresh,
    sohGateFresh,
    freshnessWindowMs: HV_CROSS_SESSION_FRESHNESS_MS,
  };
}

export function defaultModelVersions(): {
  m2SessionSummary: number;
  m3Validation: number;
  crossSessionAssessment: number;
  sohGate: number;
} {
  return {
    m2SessionSummary: HV_M2_SESSION_SUMMARY_MODEL_VERSION,
    m3Validation: HV_M3_MODEL_VERSION,
    crossSessionAssessment: HV_CROSS_SESSION_ASSESSMENT_MODEL_VERSION,
    sohGate: HV_SOH_GATE_MODEL_VERSION,
  };
}

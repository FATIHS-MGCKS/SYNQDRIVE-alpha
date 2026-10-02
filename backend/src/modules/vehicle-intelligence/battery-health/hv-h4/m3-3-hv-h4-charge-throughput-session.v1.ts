import type { M3_3HvH4ChargeSessionScientificRowV1 } from './m3-3-hv-h4-charge-session-scientific-row.v1';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import {
  classifyM3_3HvH4ChargeSessionFutureThroughput,
  type M3_3HvH4ChargeSessionRowForClassification,
} from './m3-3-hv-h4-charge-session-source-authority';
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from './m3-3-hv-h4.constants';
import type { M3_3HvH4ChargeThroughputContributionEligibility } from './m3-3-hv-h4-charge-throughput.types';
import type { HvH2ReplacementBoundary } from '../hv-h2/m3-3-hv-h2-lifecycle-segmentation';

export type M3_3HvH4ChargeSessionRowForA2Classification =
  M3_3HvH4ChargeSessionRowForClassification & {
    organizationId?: string;
    vehicleId?: string;
    dimoSegmentId?: string | null;
    createdAt: Date;
    receivedAt: Date;
    updatedAt: Date;
  };

export function extractNativeProviderSegmentId(
  session: Pick<M3_3HvH4ChargeSessionScientificRowV1, 'metadata'>,
): string | null {
  const meta = (session.metadata ?? {}) as unknown as HvChargeSessionMetadata;
  const providerId = meta.providerSegmentId;
  if (providerId == null || providerId === '') return null;
  return providerId;
}

function classifySessionKnowledgeAsOfA2(input: {
  session: Pick<M3_3HvH4ChargeSessionScientificRowV1, 'createdAt' | 'receivedAt' | 'updatedAt'>;
  evaluationAt: Date;
}): { knowable: true } | { knowable: false; reasonCodes: string[] } {
  const reasons: string[] = [];
  if (input.session.createdAt.getTime() > input.evaluationAt.getTime()) {
    reasons.push('CURRENT_ROW_CREATED_AFTER_EVALUATION_AT');
  }
  if (input.session.receivedAt.getTime() > input.evaluationAt.getTime()) {
    reasons.push('CURRENT_ROW_RECEIVED_AFTER_EVALUATION_AT');
  }
  if (input.session.updatedAt.getTime() > input.evaluationAt.getTime()) {
    reasons.push('CURRENT_ROW_UPDATED_AFTER_EVALUATION_AT');
  }
  if (reasons.length > 0) {
    return { knowable: false, reasonCodes: reasons };
  }
  return { knowable: true };
}

export function classifyM3_3HvH4ChargeSessionA2Contribution(input: {
  session: M3_3HvH4ChargeSessionRowForA2Classification;
  replacementBoundaries: HvH2ReplacementBoundary[];
  expectedOrganizationId: string;
  expectedVehicleId: string;
  evaluationAt: Date;
}): {
  eligibility: M3_3HvH4ChargeThroughputContributionEligibility;
  reasonCodes: string[];
} {
  const reasons: string[] = [];
  if (
    input.session.organizationId &&
    input.session.organizationId !== input.expectedOrganizationId
  ) {
    reasons.push('TENANT_ORGANIZATION_MISMATCH');
    return { eligibility: 'INELIGIBLE_QUALITY', reasonCodes: reasons };
  }
  if (input.session.vehicleId && input.session.vehicleId !== input.expectedVehicleId) {
    reasons.push('TENANT_VEHICLE_MISMATCH');
    return { eligibility: 'INELIGIBLE_QUALITY', reasonCodes: reasons };
  }

  const knowledge = classifySessionKnowledgeAsOfA2({
    session: input.session,
    evaluationAt: input.evaluationAt,
  });
  if (!knowledge.knowable) {
    return {
      eligibility: 'INELIGIBLE_NOT_KNOWABLE_AT_EVALUATION',
      reasonCodes: [...knowledge.reasonCodes, ...reasons],
    };
  }

  const a1 = classifyM3_3HvH4ChargeSessionFutureThroughput({
    session: input.session,
    replacementBoundaries: input.replacementBoundaries,
  });
  if (a1.eligibility !== 'ELIGIBLE_NATIVE') {
    return { eligibility: a1.eligibility, reasonCodes: [...a1.reasonCodes, ...reasons] };
  }

  if (input.session.source !== HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE) {
    reasons.push('NON_NATIVE_SOURCE');
    return { eligibility: 'CONTEXT_ONLY', reasonCodes: reasons };
  }

  const meta = (input.session.metadata ?? {}) as HvChargeSessionMetadata;
  const provenance = meta.addedEnergyProvenance;
  if (provenance !== M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE) {
    reasons.push('ADDED_ENERGY_PROVENANCE_NOT_SEGMENT_EXTREMA');
    return { eligibility: 'INELIGIBLE_INVALID_ADDED_ENERGY_PROVENANCE', reasonCodes: reasons };
  }

  const energy = input.session.energyAddedKwh;
  if (energy == null || !Number.isFinite(energy)) {
    reasons.push('MISSING_ENERGY_ADDED');
    return { eligibility: 'INELIGIBLE_MISSING_ENERGY', reasonCodes: reasons };
  }
  if (energy <= 0) {
    reasons.push('NON_POSITIVE_ENERGY_ADDED');
    return { eligibility: 'INELIGIBLE_NON_POSITIVE_ENERGY', reasonCodes: reasons };
  }

  return { eligibility: 'ELIGIBLE_CONTRIBUTOR', reasonCodes: reasons };
}

export function sortM3_3HvH4ChargeSessionsCanonical(
  sessions: M3_3HvH4ChargeSessionScientificRowV1[],
): M3_3HvH4ChargeSessionScientificRowV1[] {
  return [...sessions].sort((a, b) => {
    const startDiff = a.startAt.getTime() - b.startAt.getTime();
    if (startDiff !== 0) return startDiff;
    const endA = a.endAt?.getTime() ?? 0;
    const endB = b.endAt?.getTime() ?? 0;
    const endDiff = endA - endB;
    if (endDiff !== 0) return endDiff;
    return a.id.localeCompare(b.id);
  });
}

export function hvChargeSessionsStrictlyOverlap(
  a: Pick<M3_3HvH4ChargeSessionScientificRowV1, 'startAt' | 'endAt'>,
  b: Pick<M3_3HvH4ChargeSessionScientificRowV1, 'startAt' | 'endAt'>,
): boolean {
  if (!a.endAt || !b.endAt) return false;
  return (
    a.startAt.getTime() < b.endAt.getTime() && b.startAt.getTime() < a.endAt.getTime()
  );
}

/** Provider session identity = metadata.providerSegmentId (not dimoSegmentId fingerprint). */
export function detectDuplicateProviderSegmentIdentity(
  sessions: M3_3HvH4ChargeSessionScientificRowV1[],
): boolean {
  const byProviderId = new Map<string, string>();
  for (const session of sessions) {
    const providerId = extractNativeProviderSegmentId(session);
    if (!providerId) continue;
    const priorSessionId = byProviderId.get(providerId);
    if (priorSessionId && priorSessionId !== session.id) {
      return true;
    }
    if (!priorSessionId) {
      byProviderId.set(providerId, session.id);
    }
  }
  return false;
}

export function detectOverlappingEligibleNativeSessions(
  sessions: M3_3HvH4ChargeSessionScientificRowV1[],
): boolean {
  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      if (hvChargeSessionsStrictlyOverlap(sessions[i]!, sessions[j]!)) {
        return true;
      }
    }
  }
  return false;
}

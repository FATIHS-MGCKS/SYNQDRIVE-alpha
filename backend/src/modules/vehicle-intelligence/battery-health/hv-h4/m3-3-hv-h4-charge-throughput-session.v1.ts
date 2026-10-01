import type { HvChargeSession } from '@prisma/client';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import {
  classifyM3_3HvH4ChargeSessionFutureThroughput,
  type M3_3HvH4ChargeSessionRowForClassification,
} from './m3-3-hv-h4-charge-session-source-authority';
import { M3_3_HV_H4_NATIVE_ADDED_ENERGY_PROVENANCE } from './m3-3-hv-h4.constants';
import type { M3_3HvH4ChargeThroughputContributionEligibility } from './m3-3-hv-h4-charge-throughput.types';
import type { HvH2ReplacementBoundary } from '../hv-h2/m3-3-hv-h2-lifecycle-segmentation';

export function classifyM3_3HvH4ChargeSessionA2Contribution(input: {
  session: M3_3HvH4ChargeSessionRowForClassification & {
    organizationId?: string;
    vehicleId?: string;
    dimoSegmentId?: string | null;
  };
  replacementBoundaries: HvH2ReplacementBoundary[];
  expectedOrganizationId: string;
  expectedVehicleId: string;
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
  sessions: HvChargeSession[],
): HvChargeSession[] {
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
  a: Pick<HvChargeSession, 'startAt' | 'endAt'>,
  b: Pick<HvChargeSession, 'startAt' | 'endAt'>,
): boolean {
  if (!a.endAt || !b.endAt) return false;
  return (
    a.startAt.getTime() < b.endAt.getTime() && b.startAt.getTime() < a.endAt.getTime()
  );
}

export function detectDuplicateProviderSegmentIdentity(
  sessions: HvChargeSession[],
): boolean {
  const byProviderId = new Map<string, string>();
  for (const session of sessions) {
    const providerId = session.dimoSegmentId;
    if (!providerId) continue;
    const prior = byProviderId.get(providerId);
    if (prior && prior !== session.segmentFingerprint) {
      return true;
    }
    if (!prior) {
      byProviderId.set(providerId, session.segmentFingerprint);
    }
  }
  return false;
}

export function detectOverlappingEligibleNativeSessions(sessions: HvChargeSession[]): boolean {
  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      if (hvChargeSessionsStrictlyOverlap(sessions[i]!, sessions[j]!)) {
        return true;
      }
    }
  }
  return false;
}

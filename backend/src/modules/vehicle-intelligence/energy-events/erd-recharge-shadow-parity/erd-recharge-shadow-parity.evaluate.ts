import type { HvChargeSession, VehicleEnergyEvent } from '@prisma/client';
import { HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.types';
import { buildCanonicalShadowCandidates } from './canonical-shadow-cohort.policy';
import { isLegacyDirectDimoRechargeRow } from './legacy-recharge-cohort.policy';
import { buildShadowComparisonFingerprint } from './erd-recharge-shadow-comparison-fingerprint';
import {
  classifyPairedParity,
  compareShadowProjectionFields,
} from './erd-recharge-shadow-field-diff.policy';
import { intervalsOverlap, resolveShadowPairings } from './erd-recharge-shadow-pairing.policy';
import {
  ERD_RECHARGE_SHADOW_FINALITY,
  ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE,
  ERD_RECHARGE_SHADOW_PARITY_CLASS,
  type ErdRechargeShadowLegacyCandidate,
  type ErdRechargeShadowLegacySnapshot,
  type ErdRechargeShadowObservationDraft,
} from './erd-recharge-shadow-parity.types';

function toLegacySnapshot(row: VehicleEnergyEvent): ErdRechargeShadowLegacySnapshot {
  const meta =
    row.rawDetectionMeta != null && typeof row.rawDetectionMeta === 'object'
      ? (row.rawDetectionMeta as Record<string, unknown>)
      : {};
  const coalesced = meta.coalescedFromSegmentIds;
  return {
    vehicleEnergyEventId: row.id,
    dimoSegmentId: row.dimoSegmentId,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    durationSeconds: row.durationSeconds,
    socDeltaPercent: row.socDeltaPercent,
    energyDeltaKwh: row.energyDeltaKwh,
    odometerStartKm: row.odometerStartKm,
    odometerEndKm: row.odometerEndKm,
    confidence: row.confidence,
    startLatitude: row.startLatitude,
    startLongitude: row.startLongitude,
    endLatitude: row.endLatitude,
    endLongitude: row.endLongitude,
    coalescedFromSegmentIds: Array.isArray(coalesced)
      ? coalesced.filter((id): id is string => typeof id === 'string')
      : [],
  };
}

function buildLegacyCandidates(rows: VehicleEnergyEvent[]): ErdRechargeShadowLegacyCandidate[] {
  return rows
    .filter((row) => isLegacyDirectDimoRechargeRow(row))
    .map((row) => ({
      vehicleEnergyEventId: row.id,
      snapshot: toLegacySnapshot(row),
    }));
}

function resolveUnpairedCanonicalFinality(input: {
  session: HvChargeSession;
  hasNativeDimo: boolean;
}): (typeof ERD_RECHARGE_SHADOW_FINALITY)[keyof typeof ERD_RECHARGE_SHADOW_FINALITY] {
  if (input.session.source === HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK) {
    return ERD_RECHARGE_SHADOW_FINALITY.PENDING_SETTLEMENT;
  }
  if (input.hasNativeDimo) {
    return ERD_RECHARGE_SHADOW_FINALITY.SETTLED;
  }
  return ERD_RECHARGE_SHADOW_FINALITY.OBSERVED;
}

export function evaluateRechargeShadowParity(input: {
  organizationId: string;
  vehicleId: string;
  windowFrom: Date;
  windowTo: Date;
  sessions: HvChargeSession[];
  legacyRows: VehicleEnergyEvent[];
}): ErdRechargeShadowObservationDraft[] {
  const canonical = buildCanonicalShadowCandidates({
    sessions: input.sessions,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    windowFrom: input.windowFrom,
    windowTo: input.windowTo,
  });
  const legacy = buildLegacyCandidates(input.legacyRows);
  const sessionById = new Map(input.sessions.map((s) => [s.id, s]));

  const { pairs, ambiguousCanonicalIds, ambiguousLegacyIds } = resolveShadowPairings({
    canonical,
    legacy,
  });

  const drafts: ErdRechargeShadowObservationDraft[] = [];

  for (const canonicalId of ambiguousCanonicalIds) {
    const c = canonical.find((row) => row.sessionId === canonicalId)!;
    const draftBase = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      canonicalChargeSessionId: c.sessionId,
      legacyVehicleEnergyEventId: null,
      pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.AMBIGUOUS,
      parityClass: ERD_RECHARGE_SHADOW_PARITY_CLASS.AMBIGUOUS_MATCH,
      finality: ERD_RECHARGE_SHADOW_FINALITY.OBSERVED,
      canonicalProjectionSnapshot: c.snapshot,
      legacyProjectionSnapshot: null,
      fieldDiff: null,
    };
    drafts.push({
      ...draftBase,
      comparisonFingerprint: buildShadowComparisonFingerprint({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        draft: draftBase,
      }),
    });
  }

  for (const legacyId of ambiguousLegacyIds) {
    const l = legacy.find((row) => row.vehicleEnergyEventId === legacyId)!;
    const draftBase = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      canonicalChargeSessionId: null,
      legacyVehicleEnergyEventId: l.vehicleEnergyEventId,
      pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.AMBIGUOUS,
      parityClass: ERD_RECHARGE_SHADOW_PARITY_CLASS.AMBIGUOUS_MATCH,
      finality: ERD_RECHARGE_SHADOW_FINALITY.SETTLED,
      canonicalProjectionSnapshot: null,
      legacyProjectionSnapshot: l.snapshot,
      fieldDiff: null,
    };
    drafts.push({
      ...draftBase,
      comparisonFingerprint: buildShadowComparisonFingerprint({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        draft: draftBase,
      }),
    });
  }

  const pairedCanonicalIds = new Set(pairs.map((p) => p.canonical.sessionId));
  const pairedLegacyIds = new Set(pairs.map((p) => p.legacy.vehicleEnergyEventId));

  for (const pair of pairs) {
    const fieldDiff = compareShadowProjectionFields({
      canonical: pair.canonical.snapshot,
      legacy: pair.legacy.snapshot,
    });
    const parityClass = classifyPairedParity(fieldDiff);
    const draftBase = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      canonicalChargeSessionId: pair.canonical.sessionId,
      legacyVehicleEnergyEventId: pair.legacy.vehicleEnergyEventId,
      pairingEvidence: pair.pairingEvidence,
      parityClass,
      finality: ERD_RECHARGE_SHADOW_FINALITY.SETTLED,
      canonicalProjectionSnapshot: pair.canonical.snapshot,
      legacyProjectionSnapshot: pair.legacy.snapshot,
      fieldDiff,
    };
    drafts.push({
      ...draftBase,
      comparisonFingerprint: buildShadowComparisonFingerprint({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        draft: draftBase,
      }),
    });
  }

  for (const c of canonical) {
    if (pairedCanonicalIds.has(c.sessionId)) continue;
    if (ambiguousCanonicalIds.includes(c.sessionId)) continue;
    const overlappingLegacyUnpaired = legacy.filter(
      (l) =>
        !pairedLegacyIds.has(l.vehicleEnergyEventId) &&
        intervalsOverlap(
          c.snapshot.draft.startTime,
          c.snapshot.draft.endTime,
          new Date(l.snapshot.startTime),
          new Date(l.snapshot.endTime),
        ),
    );
    if (overlappingLegacyUnpaired.length > 1) {
      continue;
    }
    const session = sessionById.get(c.sessionId)!;
    const finality = resolveUnpairedCanonicalFinality({
      session,
      hasNativeDimo: (c.snapshot.dimoSegmentId ?? '').trim() !== '',
    });
    const parityClass =
      finality === ERD_RECHARGE_SHADOW_FINALITY.PENDING_SETTLEMENT
        ? ERD_RECHARGE_SHADOW_PARITY_CLASS.PENDING_SETTLEMENT
        : ERD_RECHARGE_SHADOW_PARITY_CLASS.CANONICAL_ONLY;
    const draftBase = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      canonicalChargeSessionId: c.sessionId,
      legacyVehicleEnergyEventId: null,
      pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.NONE,
      parityClass,
      finality,
      canonicalProjectionSnapshot: c.snapshot,
      legacyProjectionSnapshot: null,
      fieldDiff: null,
    };
    drafts.push({
      ...draftBase,
      comparisonFingerprint: buildShadowComparisonFingerprint({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        draft: draftBase,
      }),
    });
  }

  for (const l of legacy) {
    if (pairedLegacyIds.has(l.vehicleEnergyEventId)) continue;
    if (ambiguousLegacyIds.includes(l.vehicleEnergyEventId)) continue;

    const overlappingCanonical = canonical.filter((c) =>
      intervalsOverlap(
        c.snapshot.draft.startTime,
        c.snapshot.draft.endTime,
        new Date(l.snapshot.startTime),
        new Date(l.snapshot.endTime),
      ),
    );
    if (overlappingCanonical.length > 1) {
      const draftBase = {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        canonicalChargeSessionId: null,
        legacyVehicleEnergyEventId: l.vehicleEnergyEventId,
        pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.NONE,
        parityClass: ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_COALESCED_MULTIPLE_CANONICAL,
        finality: ERD_RECHARGE_SHADOW_FINALITY.SETTLED,
        canonicalProjectionSnapshot: null,
        legacyProjectionSnapshot: l.snapshot,
        fieldDiff: {
          numericDeltas: {
            startDeltaSeconds: null,
            endDeltaSeconds: null,
            durationDeltaSeconds: null,
            socDeltaDifferencePercent: null,
            energyDeltaDifferenceKwh: null,
            odometerStartDifferenceKm: null,
            odometerEndDifferenceKm: null,
          },
          mismatches: [],
          relatedCanonicalSessionIds: overlappingCanonical.map((c) => c.sessionId),
        },
      };
      drafts.push({
        ...draftBase,
        comparisonFingerprint: buildShadowComparisonFingerprint({
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          draft: draftBase,
        }),
      });
      continue;
    }

    const draftBase = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      canonicalChargeSessionId: null,
      legacyVehicleEnergyEventId: l.vehicleEnergyEventId,
      pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.NONE,
      parityClass: ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_ONLY,
      finality: ERD_RECHARGE_SHADOW_FINALITY.SETTLED,
      canonicalProjectionSnapshot: null,
      legacyProjectionSnapshot: l.snapshot,
      fieldDiff: null,
    };
    drafts.push({
      ...draftBase,
      comparisonFingerprint: buildShadowComparisonFingerprint({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        draft: draftBase,
      }),
    });
  }

  for (const c of canonical) {
    if (pairedCanonicalIds.has(c.sessionId)) continue;
    const overlappingLegacy = legacy.filter((l) =>
      intervalsOverlap(
        c.snapshot.draft.startTime,
        c.snapshot.draft.endTime,
        new Date(l.snapshot.startTime),
        new Date(l.snapshot.endTime),
      ),
    );
    if (overlappingLegacy.length <= 1) continue;
    const draftBase = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      canonicalChargeSessionId: c.sessionId,
      legacyVehicleEnergyEventId: null,
      pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.NONE,
      parityClass: ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL,
      finality: ERD_RECHARGE_SHADOW_FINALITY.SETTLED,
      canonicalProjectionSnapshot: c.snapshot,
      legacyProjectionSnapshot: null,
      fieldDiff: {
        numericDeltas: {
          startDeltaSeconds: null,
          endDeltaSeconds: null,
          durationDeltaSeconds: null,
          socDeltaDifferencePercent: null,
          energyDeltaDifferenceKwh: null,
          odometerStartDifferenceKm: null,
          odometerEndDifferenceKm: null,
        },
        mismatches: [],
        relatedLegacyVehicleEnergyEventIds: overlappingLegacy.map(
          (l) => l.vehicleEnergyEventId,
        ),
      },
    };
    drafts.push({
      ...draftBase,
      comparisonFingerprint: buildShadowComparisonFingerprint({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        draft: draftBase,
      }),
    });
  }

  return drafts;
}

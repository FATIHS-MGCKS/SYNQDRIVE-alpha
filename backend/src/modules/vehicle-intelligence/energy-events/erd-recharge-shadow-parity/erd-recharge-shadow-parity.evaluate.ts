import type { HvChargeSession, VehicleEnergyEvent } from '@prisma/client';
import { HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.types';
import { buildCanonicalShadowCandidates } from './canonical-shadow-cohort.policy';
import { isLegacyDirectDimoRechargeRow } from './legacy-recharge-cohort.policy';
import { buildShadowComparisonFingerprint } from './erd-recharge-shadow-comparison-fingerprint';
import {
  classifyPairedParity,
  compareShadowProjectionFields,
} from './erd-recharge-shadow-field-diff.policy';
import {
  emptyShadowFieldDiffForTopologyDiagnostic,
  resolveLegacyFragmentSiblingsByPrimaryPair,
} from './erd-recharge-shadow-fragment.policy';
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
    }))
    .sort((a, b) => a.vehicleEnergyEventId.localeCompare(b.vehicleEnergyEventId));
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

function pushDraft(
  drafts: ErdRechargeShadowObservationDraft[],
  input: {
    organizationId: string;
    vehicleId: string;
    draftBase: Omit<ErdRechargeShadowObservationDraft, 'comparisonFingerprint'>;
  },
): void {
  drafts.push({
    ...input.draftBase,
    comparisonFingerprint: buildShadowComparisonFingerprint({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      draft: input.draftBase,
    }),
  });
}

function sortObservationDrafts(
  drafts: ErdRechargeShadowObservationDraft[],
): ErdRechargeShadowObservationDraft[] {
  return [...drafts].sort((a, b) => {
    const keyA = [
      a.canonicalChargeSessionId ?? '',
      a.legacyVehicleEnergyEventId ?? '',
      a.parityClass,
      a.pairingEvidence,
    ].join('\0');
    const keyB = [
      b.canonicalChargeSessionId ?? '',
      b.legacyVehicleEnergyEventId ?? '',
      b.parityClass,
      b.pairingEvidence,
    ].join('\0');
    return keyA.localeCompare(keyB);
  });
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
  }).sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  const legacy = buildLegacyCandidates(input.legacyRows);
  const sessionById = new Map(input.sessions.map((s) => [s.id, s]));

  const { pairs, ambiguousCanonicalIds, ambiguousLegacyIds } = resolveShadowPairings({
    canonical,
    legacy,
  });

  const drafts: ErdRechargeShadowObservationDraft[] = [];

  for (const canonicalId of [...ambiguousCanonicalIds].sort()) {
    const c = canonical.find((row) => row.sessionId === canonicalId)!;
    pushDraft(drafts, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      draftBase: {
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
      },
    });
  }

  for (const legacyId of [...ambiguousLegacyIds].sort()) {
    const l = legacy.find((row) => row.vehicleEnergyEventId === legacyId)!;
    pushDraft(drafts, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      draftBase: {
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
      },
    });
  }

  const pairedCanonicalIds = new Set(pairs.map((p) => p.canonical.sessionId));
  const pairedLegacyIds = new Set(pairs.map((p) => p.legacy.vehicleEnergyEventId));

  const fragmentSiblingsByCanonical = resolveLegacyFragmentSiblingsByPrimaryPair({
    pairs,
    canonical,
    legacy,
    pairedLegacyIds,
    ambiguousLegacyIds,
  });
  const provenFragmentLegacyIds = new Set<string>();
  for (const ids of fragmentSiblingsByCanonical.values()) {
    for (const id of ids) {
      provenFragmentLegacyIds.add(id);
    }
  }

  for (const pair of [...pairs].sort((a, b) =>
    a.canonical.sessionId.localeCompare(b.canonical.sessionId),
  )) {
    const fieldDiff = compareShadowProjectionFields({
      canonical: pair.canonical.snapshot,
      legacy: pair.legacy.snapshot,
    });
    const parityClass = classifyPairedParity(fieldDiff);
    pushDraft(drafts, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      draftBase: {
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
      },
    });
  }

  for (const canonicalId of [...fragmentSiblingsByCanonical.keys()].sort()) {
    const fragmentIds = fragmentSiblingsByCanonical.get(canonicalId)!;
    if (fragmentIds.length === 0) continue;
    const c = canonical.find((row) => row.sessionId === canonicalId)!;
    const fieldDiff = emptyShadowFieldDiffForTopologyDiagnostic();
    fieldDiff.relatedLegacyVehicleEnergyEventIds = fragmentIds;
    pushDraft(drafts, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      draftBase: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        canonicalChargeSessionId: c.sessionId,
        legacyVehicleEnergyEventId: null,
        pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.NONE,
        parityClass: ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL,
        finality: ERD_RECHARGE_SHADOW_FINALITY.SETTLED,
        canonicalProjectionSnapshot: c.snapshot,
        legacyProjectionSnapshot: null,
        fieldDiff,
      },
    });
  }

  for (const c of canonical) {
    if (pairedCanonicalIds.has(c.sessionId)) continue;
    if (ambiguousCanonicalIds.includes(c.sessionId)) continue;
    const overlappingLegacyUnpaired = legacy.filter(
      (l) =>
        !pairedLegacyIds.has(l.vehicleEnergyEventId) &&
        !provenFragmentLegacyIds.has(l.vehicleEnergyEventId) &&
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
    pushDraft(drafts, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      draftBase: {
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
      },
    });
  }

  for (const l of legacy) {
    if (pairedLegacyIds.has(l.vehicleEnergyEventId)) continue;
    if (provenFragmentLegacyIds.has(l.vehicleEnergyEventId)) continue;
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
          relatedCanonicalSessionIds: overlappingCanonical
            .map((c) => c.sessionId)
            .sort(),
        },
      };
      pushDraft(drafts, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        draftBase,
      });
      continue;
    }

    pushDraft(drafts, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      draftBase: {
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
      },
    });
  }

  for (const c of canonical) {
    if (pairedCanonicalIds.has(c.sessionId)) continue;
    const overlappingLegacy = legacy.filter(
      (l) =>
        !pairedLegacyIds.has(l.vehicleEnergyEventId) &&
        !provenFragmentLegacyIds.has(l.vehicleEnergyEventId) &&
        intervalsOverlap(
          c.snapshot.draft.startTime,
          c.snapshot.draft.endTime,
          new Date(l.snapshot.startTime),
          new Date(l.snapshot.endTime),
        ),
    );
    if (overlappingLegacy.length <= 1) continue;
    const fieldDiff = emptyShadowFieldDiffForTopologyDiagnostic();
    fieldDiff.relatedLegacyVehicleEnergyEventIds = overlappingLegacy
      .map((row) => row.vehicleEnergyEventId)
      .sort();
    pushDraft(drafts, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      draftBase: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        canonicalChargeSessionId: c.sessionId,
        legacyVehicleEnergyEventId: null,
        pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.NONE,
        parityClass: ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL,
        finality: ERD_RECHARGE_SHADOW_FINALITY.SETTLED,
        canonicalProjectionSnapshot: c.snapshot,
        legacyProjectionSnapshot: null,
        fieldDiff,
      },
    });
  }

  return sortObservationDrafts(drafts);
}

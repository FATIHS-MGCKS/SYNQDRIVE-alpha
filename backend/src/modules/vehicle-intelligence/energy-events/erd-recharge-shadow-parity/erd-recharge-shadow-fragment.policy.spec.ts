import { EnergyEventConfidence, VehicleEnergyEventDetectionSource } from '@prisma/client';
import { ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM } from '../erd-recharge-projection/erd-recharge-projection.constants';
import { buildShadowComparisonFingerprint } from './erd-recharge-shadow-comparison-fingerprint';
import { ERD_RECHARGE_SHADOW_COMPARATOR_VERSION } from './erd-recharge-shadow-parity.constants';
import {
  ERD_RECHARGE_SHADOW_FINALITY,
  ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE,
  ERD_RECHARGE_SHADOW_PARITY_CLASS,
  type ErdRechargeShadowCanonicalCandidate,
  type ErdRechargeShadowLegacyCandidate,
} from './erd-recharge-shadow-parity.types';
import {
  hasStrongLegacyIdentityToCanonical,
  isStrictlyContainedLegacyFragment,
  resolveLegacyFragmentSiblingsByPrimaryPair,
} from './erd-recharge-shadow-fragment.policy';
import {
  resolveShadowPairings,
  type ErdRechargeShadowPairProposal,
} from './erd-recharge-shadow-pairing.policy';
import { evaluateRechargeShadowParity } from './erd-recharge-shadow-parity.evaluate';
import {
  buildTopologyLegacyVee,
  buildTopologyNativeSession,
  TOPOLOGY_EVALUATE_SCOPE,
} from './erd-recharge-shadow-topology.fixture';

function canonical(
  id: string,
  dimo: string | null,
  start: string,
  end: string,
): ErdRechargeShadowCanonicalCandidate {
  return {
    sessionId: id,
    snapshot: {
      chargeSessionId: id,
      segmentFingerprint: `fp-${id}`,
      source: 'DIMO_RECHARGE_SEGMENT',
      dimoSegmentId: dimo,
      draft: {
        startTime: new Date(start),
        endTime: new Date(end),
        durationSeconds: 3600,
        socDeltaPercent: 10,
        energyDeltaKwh: 5,
        odometerStartKm: null,
        odometerEndKm: null,
        confidence: EnergyEventConfidence.MEDIUM,
        dimoSegmentId: dimo,
        startLatitude: null,
        startLongitude: null,
        endLatitude: null,
        endLongitude: null,
        sourceEventKey: `erd:physical:v1:v:${id}`,
        detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
        detectionMechanism: ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
      },
    },
  };
}

function legacyRow(
  id: string,
  dimo: string,
  start: string,
  end: string,
  lineage: string[] = [],
): ErdRechargeShadowLegacyCandidate {
  return {
    vehicleEnergyEventId: id,
    snapshot: {
      vehicleEnergyEventId: id,
      dimoSegmentId: dimo,
      startTime: start,
      endTime: end,
      durationSeconds: 3600,
      socDeltaPercent: 10,
      energyDeltaKwh: 5,
      odometerStartKm: null,
      odometerEndKm: null,
      confidence: EnergyEventConfidence.MEDIUM,
      startLatitude: null,
      startLongitude: null,
      endLatitude: null,
      endLongitude: null,
      coalescedFromSegmentIds: lineage,
    },
  };
}

/** Pre-fix v2 bug: strong-identity firewall consulted paired canonicals only. */
function preFixCountOwnersPairedOnly(input: {
  legacy: ErdRechargeShadowLegacyCandidate;
  pairs: ReturnType<typeof resolveShadowPairings>['pairs'];
  canonicalById: Map<string, ErdRechargeShadowCanonicalCandidate>;
}): string[] {
  const owners: string[] = [];
  for (const pair of input.pairs) {
    const c = input.canonicalById.get(pair.canonical.sessionId);
    if (!c) continue;
    if (!isStrictlyContainedLegacyFragment({ canonical: c, legacy: input.legacy.snapshot })) {
      continue;
    }
    owners.push(pair.canonical.sessionId);
  }
  const uniqueOwners = [...new Set(owners)];
  if (uniqueOwners.length !== 1) return [];
  const ownerId = uniqueOwners[0]!;
  for (const pair of input.pairs) {
    if (pair.canonical.sessionId === ownerId) continue;
    if (
      hasStrongLegacyIdentityToCanonical({
        canonical: pair.canonical,
        legacy: input.legacy.snapshot,
      })
    ) {
      return [];
    }
  }
  return uniqueOwners;
}

describe('erd-recharge-shadow-fragment.policy (Step 1.1)', () => {
  const c1Window = {
    start: '2026-06-01T08:00:00.000Z',
    end: '2026-06-01T14:00:00.000Z',
  };
  const c2Window = {
    start: '2026-06-01T09:00:00.000Z',
    end: '2026-06-01T13:00:00.000Z',
  };

  it('PRE-FIX: unpaired C2 strong identity allowed incorrect fragment capture (paired-only firewall)', () => {
    const canonicals = [
      canonical('c1', 'dimo-a', c1Window.start, c1Window.end),
      canonical('c2', 'dimo-c2', c2Window.start, c2Window.end),
    ];
    const legacy = [
      legacyRow('l1', 'dimo-a', c1Window.start, c1Window.end),
      legacyRow('l2a', 'dimo-c2', c2Window.start, c2Window.end),
      legacyRow('l2b', 'dimo-c2', c2Window.start, c2Window.end),
      legacyRow('f', 'dimo-c2', '2026-06-01T10:00:00.000Z', '2026-06-01T11:00:00.000Z'),
    ];
    const { pairs, ambiguousLegacyIds, ambiguousCanonicalIds } = resolveShadowPairings({
      canonical: canonicals,
      legacy,
    });
    expect(ambiguousCanonicalIds).toContain('c2');
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.canonical.sessionId).toBe('c1');
    const canonicalById = new Map(canonicals.map((c) => [c.sessionId, c]));
    const preFixOwners = preFixCountOwnersPairedOnly({
      legacy: legacy[3]!,
      pairs,
      canonicalById,
    });
    expect(preFixOwners).toEqual(['c1']);
    const postFixMap = resolveLegacyFragmentSiblingsByPrimaryPair({
      pairs,
      canonical: canonicals,
      legacy,
      pairedLegacyIds: new Set(pairs.map((p) => p.legacy.vehicleEnergyEventId)),
      ambiguousLegacyIds,
    });
    expect(postFixMap.get('c1') ?? []).not.toContain('f');
  });

  it('blocks fragment when strong EXACT identity to unpaired other canonical', () => {
    const sessions = [
      buildTopologyNativeSession({
        sessionId: 'c1',
        dimoSegmentId: 'dimo-a',
        startAt: new Date(c1Window.start),
        endAt: new Date(c1Window.end),
      }),
      buildTopologyNativeSession({
        sessionId: 'c2',
        dimoSegmentId: 'dimo-c2',
        startAt: new Date(c2Window.start),
        endAt: new Date(c2Window.end),
      }),
    ];
    const legacyRows = [
      buildTopologyLegacyVee({
        id: 'l1',
        dimoSegmentId: 'dimo-a',
        startTime: new Date(c1Window.start),
        endTime: new Date(c1Window.end),
      }),
      buildTopologyLegacyVee({
        id: 'f-exact',
        dimoSegmentId: 'dimo-c2',
        startTime: new Date('2026-06-01T10:00:00.000Z'),
        endTime: new Date('2026-06-01T11:00:00.000Z'),
      }),
    ];
    const observations = evaluateRechargeShadowParity({
      ...TOPOLOGY_EVALUATE_SCOPE,
      sessions,
      legacyRows,
    });
    const diagnostic = observations.find(
      (o) =>
        o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL &&
        o.canonicalChargeSessionId === 'c1',
    );
    expect(diagnostic?.fieldDiff?.relatedLegacyVehicleEnergyEventIds ?? []).not.toContain(
      'f-exact',
    );
  });

  it('blocks fragment when strong COALESCED identity to other canonical', () => {
    const sessions = [
      buildTopologyNativeSession({
        sessionId: 'c1',
        dimoSegmentId: 'dimo-a',
        startAt: new Date(c1Window.start),
        endAt: new Date(c1Window.end),
      }),
      buildTopologyNativeSession({
        sessionId: 'c2',
        dimoSegmentId: 'dimo-c2',
        startAt: new Date(c2Window.start),
        endAt: new Date(c2Window.end),
      }),
    ];
    const legacyRows = [
      buildTopologyLegacyVee({
        id: 'l1',
        dimoSegmentId: 'dimo-a',
        startTime: new Date(c1Window.start),
        endTime: new Date(c1Window.end),
      }),
      buildTopologyLegacyVee({
        id: 'f-coalesced',
        dimoSegmentId: 'dimo-frag-coalesced',
        startTime: new Date('2026-06-01T10:00:00.000Z'),
        endTime: new Date('2026-06-01T11:00:00.000Z'),
        coalescedFromSegmentIds: ['dimo-c2'],
      }),
    ];
    const observations = evaluateRechargeShadowParity({
      ...TOPOLOGY_EVALUATE_SCOPE,
      sessions,
      legacyRows,
    });
    expect(
      observations.some(
        (o) =>
          o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL &&
          (o.fieldDiff?.relatedLegacyVehicleEnergyEventIds ?? []).includes('f-coalesced'),
      ),
    ).toBe(false);
  });

  it('blocks fragment when strong identity to paired other canonical', () => {
    const canonicals = [
      canonical('c1', 'dimo-a', c1Window.start, c1Window.end),
      canonical('c2', 'dimo-c2', c2Window.start, c2Window.end),
    ];
    const l1 = legacyRow('l1', 'dimo-a', c1Window.start, c1Window.end);
    const l2 = legacyRow('l2', 'dimo-c2', c2Window.start, c2Window.end);
    const f = legacyRow('f', 'dimo-frag-other', '2026-06-01T10:00:00.000Z', '2026-06-01T11:00:00.000Z', [
      'dimo-c2',
    ]);
    const legacy = [l1, l2, f];
    // Resolver marks C2 ambiguous when F also lineage-pairs to C2; firewall still must
    // reject when both primaries are settled (e.g. prior pairing generation).
    const pairs: ErdRechargeShadowPairProposal[] = [
      {
        canonical: canonicals[0]!,
        legacy: l1,
        pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.EXACT_NATIVE_DIMO_ID,
        priority: 1,
      },
      {
        canonical: canonicals[1]!,
        legacy: l2,
        pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.EXACT_NATIVE_DIMO_ID,
        priority: 1,
      },
    ];
    const map = resolveLegacyFragmentSiblingsByPrimaryPair({
      pairs,
      canonical: canonicals,
      legacy,
      pairedLegacyIds: new Set(['l1', 'l2']),
      ambiguousLegacyIds: [],
    });
    expect(map.get('c1') ?? []).not.toContain('f');
  });

  it('same v2 comparator: fragment set change changes topology diagnostic fingerprint', () => {
    const buildDiagnosticDraft = (fragmentIds: string[]) => ({
      organizationId: 'o',
      vehicleId: 'v',
      canonicalChargeSessionId: 'c1',
      legacyVehicleEnergyEventId: null,
      pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.NONE,
      parityClass: ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL,
      finality: ERD_RECHARGE_SHADOW_FINALITY.SETTLED,
      canonicalProjectionSnapshot: null,
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
        relatedLegacyVehicleEnergyEventIds: [...fragmentIds].sort(),
      },
    });
    const fpA = buildShadowComparisonFingerprint({
      organizationId: 'o',
      vehicleId: 'v',
      draft: buildDiagnosticDraft(['f1']),
    });
    const fpB = buildShadowComparisonFingerprint({
      organizationId: 'o',
      vehicleId: 'v',
      draft: buildDiagnosticDraft(['f1', 'f2']),
    });
    expect(ERD_RECHARGE_SHADOW_COMPARATOR_VERSION).toBe('erd_recharge_shadow_comparator_v2');
    expect(fpA).not.toBe(fpB);
  });

  it('same fragment set different input order → identical fingerprint', () => {
    const draft = (ids: string[]) => ({
      organizationId: 'o',
      vehicleId: 'v',
      canonicalChargeSessionId: 'c1',
      legacyVehicleEnergyEventId: null,
      pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.NONE,
      parityClass: ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL,
      finality: ERD_RECHARGE_SHADOW_FINALITY.SETTLED,
      canonicalProjectionSnapshot: null,
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
        relatedLegacyVehicleEnergyEventIds: ids,
      },
    });
    const fp1 = buildShadowComparisonFingerprint({
      organizationId: 'o',
      vehicleId: 'v',
      draft: draft(['f1', 'f2']),
    });
    const fp2 = buildShadowComparisonFingerprint({
      organizationId: 'o',
      vehicleId: 'v',
      draft: draft(['f2', 'f1']),
    });
    expect(fp1).toBe(fp2);
  });

  it('blocks fragment when strong identity to ambiguous other canonical', () => {
    const canonicals = [
      canonical('c1', 'dimo-a', c1Window.start, c1Window.end),
      canonical('c2', 'dimo-c2', c2Window.start, c2Window.end),
    ];
    const legacy = [
      legacyRow('l1', 'dimo-a', c1Window.start, c1Window.end),
      legacyRow('l2a', 'dimo-c2', c2Window.start, c2Window.end),
      legacyRow('l2b', 'dimo-c2', c2Window.start, c2Window.end),
      legacyRow('f', 'dimo-frag-amb', '2026-06-01T10:00:00.000Z', '2026-06-01T11:00:00.000Z', [
        'dimo-c2',
      ]),
    ];
    const { pairs, ambiguousCanonicalIds, ambiguousLegacyIds } = resolveShadowPairings({
      canonical: canonicals,
      legacy,
    });
    expect(ambiguousCanonicalIds).toContain('c2');
    expect(pairs.some((p) => p.canonical.sessionId === 'c1')).toBe(true);
    const map = resolveLegacyFragmentSiblingsByPrimaryPair({
      pairs,
      canonical: canonicals,
      legacy,
      pairedLegacyIds: new Set(pairs.map((p) => p.legacy.vehicleEnergyEventId)),
      ambiguousLegacyIds,
    });
    expect(map.get('c1') ?? []).not.toContain('f');
  });
});

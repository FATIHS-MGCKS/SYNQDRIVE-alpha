import { EnergyEventConfidence, VehicleEnergyEventDetectionSource } from '@prisma/client';
import { ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM } from '../erd-recharge-projection/erd-recharge-projection.constants';
import { buildShadowComparisonFingerprint } from './erd-recharge-shadow-comparison-fingerprint';
import { aggregateRechargeShadowParityReport } from './erd-recharge-shadow-parity.aggregator';
import {
  ERD_RECHARGE_SHADOW_FINALITY,
  ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE,
  ERD_RECHARGE_SHADOW_PARITY_CLASS,
  type ErdRechargeShadowCanonicalCandidate,
  type ErdRechargeShadowLegacyCandidate,
} from './erd-recharge-shadow-parity.types';
import { evaluateRechargeShadowParity } from './erd-recharge-shadow-parity.evaluate';
import { resolveShadowPairings } from './erd-recharge-shadow-pairing.policy';
import {
  buildProductionShapedFragmentFixture,
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

function reportForCase(input: {
  sessions: ReturnType<typeof buildTopologyNativeSession>[];
  legacyRows: ReturnType<typeof buildTopologyLegacyVee>[];
}) {
  const observations = evaluateRechargeShadowParity({
    ...TOPOLOGY_EVALUATE_SCOPE,
    sessions: input.sessions,
    legacyRows: input.legacyRows,
  });
  const report = aggregateRechargeShadowParityReport({
    observations,
    canonicalEpisodeCount: input.sessions.length,
    legacyEpisodeCount: input.legacyRows.length,
  });
  return { observations, report };
}

describe('erd-recharge-shadow ambiguity accounting', () => {
  const window = {
    start: '2026-06-01T08:00:00.000Z',
    end: '2026-06-01T14:00:00.000Z',
  };

  it('A1: one canonical + two competing legacy exact proposals (Case A)', () => {
    const sessions = [
      buildTopologyNativeSession({
        sessionId: 'c1',
        dimoSegmentId: 'dimo-x',
        startAt: new Date(window.start),
        endAt: new Date(window.end),
      }),
    ];
    const legacyRows = [
      buildTopologyLegacyVee({
        id: 'l1',
        dimoSegmentId: 'dimo-x',
        startTime: new Date(window.start),
        endTime: new Date(window.end),
      }),
      buildTopologyLegacyVee({
        id: 'l2',
        dimoSegmentId: 'dimo-x',
        startTime: new Date(window.start),
        endTime: new Date(window.end),
      }),
    ];
    const { observations, report } = reportForCase({ sessions, legacyRows });
    const pairing = resolveShadowPairings({
      canonical: [canonical('c1', 'dimo-x', window.start, window.end)],
      legacy: [
        legacyRow('l1', 'dimo-x', window.start, window.end),
        legacyRow('l2', 'dimo-x', window.start, window.end),
      ],
    });
    expect(pairing.ambiguityComponents).toHaveLength(1);
    expect(pairing.ambiguousCanonicalIds).toEqual(['c1']);
    expect(pairing.ambiguousLegacyIds).toEqual(['l1', 'l2']);
    expect(
      observations.filter((o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_ONLY),
    ).toHaveLength(0);
    expect(
      observations.filter((o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.CANONICAL_ONLY),
    ).toHaveLength(0);
    expect(report.settledParityDenominator).toBe(0);
    expect(report.ambiguousPhysicalClusterGroupCount).toBe(1);
    expect(report.ambiguousLegacyRowCount).toBe(2);
    expect(report.resolvedLegacyPhysicalClusterCount).toBe(0);
    expect(report.legacyPhysicalClusterLowerBound).toBe(1);
    expect(report.legacyPhysicalClusterUpperBound).toBe(2);
    expect(report.legacyPhysicalClusterCount).toBeNull();
  });

  it('A2: two canonicals + one competing legacy proposal (Case B)', () => {
    const sessions = [
      buildTopologyNativeSession({
        sessionId: 'c1',
        dimoSegmentId: 'dimo-a',
        startAt: new Date(window.start),
        endAt: new Date(window.end),
      }),
      buildTopologyNativeSession({
        sessionId: 'c2',
        dimoSegmentId: 'dimo-b',
        startAt: new Date('2026-06-01T09:00:00.000Z'),
        endAt: new Date('2026-06-01T13:00:00.000Z'),
      }),
    ];
    const legacyRows = [
      buildTopologyLegacyVee({
        id: 'l1',
        dimoSegmentId: 'dimo-other',
        startTime: new Date('2026-06-01T10:00:00.000Z'),
        endTime: new Date('2026-06-01T11:00:00.000Z'),
        coalescedFromSegmentIds: ['dimo-a', 'dimo-b'],
      }),
    ];
    const { observations, report } = reportForCase({ sessions, legacyRows });
    expect(
      observations.filter((o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_ONLY),
    ).toHaveLength(0);
    expect(
      observations.filter((o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.CANONICAL_ONLY),
    ).toHaveLength(0);
    expect(report.settledParityDenominator).toBe(0);
    expect(report.ambiguousPhysicalClusterGroupCount).toBe(1);
    expect(report.ambiguousLegacyRowCount).toBe(1);
    expect(report.resolvedLegacyPhysicalClusterCount).toBe(0);
    expect(report.legacyPhysicalClusterLowerBound).toBe(1);
    expect(report.legacyPhysicalClusterUpperBound).toBe(1);
    expect(report.legacyPhysicalClusterCount).toBe(1);
  });

  it('A3: two disconnected ambiguity components', () => {
    const canonicals = [
      canonical('c1', 'dimo-a', window.start, window.end),
      canonical('c2', 'dimo-b', window.start, window.end),
      canonical('c3', 'dimo-c', window.start, window.end),
    ];
    const legacy = [
      legacyRow('l1', 'dimo-a', window.start, window.end),
      legacyRow('l2', 'dimo-a', window.start, window.end),
      legacyRow('l3', 'dimo-coalesced', window.start, window.end, ['dimo-b', 'dimo-c']),
    ];
    const pairing = resolveShadowPairings({ canonical: canonicals, legacy });
    expect(pairing.ambiguityComponents).toHaveLength(2);
    const sessions = canonicals.map((c) =>
      buildTopologyNativeSession({
        sessionId: c.sessionId,
        dimoSegmentId: c.snapshot.dimoSegmentId ?? 'dimo-unknown',
        startAt: c.snapshot.draft.startTime,
        endAt: c.snapshot.draft.endTime,
      }),
    );
    const legacyRows = legacy.map((l) =>
      buildTopologyLegacyVee({
        id: l.vehicleEnergyEventId,
        dimoSegmentId: l.snapshot.dimoSegmentId ?? 'dimo-unknown',
        startTime: new Date(l.snapshot.startTime),
        endTime: new Date(l.snapshot.endTime),
        coalescedFromSegmentIds: l.snapshot.coalescedFromSegmentIds,
      }),
    );
    const { report } = reportForCase({ sessions, legacyRows });
    expect(report.ambiguousPhysicalClusterGroupCount).toBe(2);
    expect(report.ambiguousLegacyRowCount).toBe(3);
    expect(report.legacyPhysicalClusterLowerBound).toBe(2);
    expect(report.legacyPhysicalClusterUpperBound).toBe(3);
    expect(report.legacyPhysicalClusterCount).toBeNull();
  });

  it('A4: input-order permutation → same components, fingerprints, report', () => {
    const canonicals = [canonical('c1', 'dimo-x', window.start, window.end)];
    const legacyForward = [
      legacyRow('l1', 'dimo-x', window.start, window.end),
      legacyRow('l2', 'dimo-x', window.start, window.end),
    ];
    const legacyReverse = [...legacyForward].reverse();
    const forward = resolveShadowPairings({ canonical: canonicals, legacy: legacyForward });
    const reverse = resolveShadowPairings({ canonical: canonicals, legacy: legacyReverse });
    expect(forward.ambiguityComponents).toEqual(reverse.ambiguityComponents);

    const obsForward = evaluateRechargeShadowParity({
      ...TOPOLOGY_EVALUATE_SCOPE,
      sessions: [
        buildTopologyNativeSession({
          sessionId: 'c1',
          dimoSegmentId: 'dimo-x',
          startAt: new Date(window.start),
          endAt: new Date(window.end),
        }),
      ],
      legacyRows: legacyForward.map((l) =>
        buildTopologyLegacyVee({
          id: l.vehicleEnergyEventId,
          dimoSegmentId: l.snapshot.dimoSegmentId ?? 'dimo-x',
          startTime: new Date(l.snapshot.startTime),
          endTime: new Date(l.snapshot.endTime),
        }),
      ),
    });
    const obsReverse = evaluateRechargeShadowParity({
      ...TOPOLOGY_EVALUATE_SCOPE,
      sessions: [
        buildTopologyNativeSession({
          sessionId: 'c1',
          dimoSegmentId: 'dimo-x',
          startAt: new Date(window.start),
          endAt: new Date(window.end),
        }),
      ],
      legacyRows: legacyReverse.map((l) =>
        buildTopologyLegacyVee({
          id: l.vehicleEnergyEventId,
          dimoSegmentId: l.snapshot.dimoSegmentId ?? 'dimo-x',
          startTime: new Date(l.snapshot.startTime),
          endTime: new Date(l.snapshot.endTime),
        }),
      ),
    });
    const reportForward = aggregateRechargeShadowParityReport({
      observations: obsForward,
      canonicalEpisodeCount: 1,
      legacyEpisodeCount: 2,
    });
    const reportReverse = aggregateRechargeShadowParityReport({
      observations: obsReverse,
      canonicalEpisodeCount: 1,
      legacyEpisodeCount: 2,
    });
    expect(reportForward).toEqual(reportReverse);
    const fpsForward = obsForward
      .filter((o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.AMBIGUOUS_MATCH)
      .map((o) => o.comparisonFingerprint)
      .sort();
    const fpsReverse = obsReverse
      .filter((o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.AMBIGUOUS_MATCH)
      .map((o) => o.comparisonFingerprint)
      .sort();
    expect(fpsForward).toEqual(fpsReverse);
  });

  it('A5: resolved primary + fragment + true LEGACY_ONLY + ambiguity component', () => {
    const sessions = [
      buildTopologyNativeSession({
        sessionId: 'c-resolved',
        dimoSegmentId: 'dimo-r',
        startAt: new Date(window.start),
        endAt: new Date(window.end),
      }),
      buildTopologyNativeSession({
        sessionId: 'c-amb',
        dimoSegmentId: 'dimo-amb',
        startAt: new Date(window.start),
        endAt: new Date(window.end),
      }),
    ];
    const legacyRows = [
      buildTopologyLegacyVee({
        id: 'l-anchor',
        dimoSegmentId: 'dimo-r',
        startTime: new Date(window.start),
        endTime: new Date(window.end),
      }),
      buildTopologyLegacyVee({
        id: 'l-frag',
        dimoSegmentId: 'dimo-frag',
        startTime: new Date('2026-06-01T10:00:00.000Z'),
        endTime: new Date('2026-06-01T11:00:00.000Z'),
      }),
      buildTopologyLegacyVee({
        id: 'l-only',
        dimoSegmentId: 'dimo-only',
        startTime: new Date('2026-06-02T08:00:00.000Z'),
        endTime: new Date('2026-06-02T09:00:00.000Z'),
      }),
      buildTopologyLegacyVee({
        id: 'l-amb-a',
        dimoSegmentId: 'dimo-amb',
        startTime: new Date(window.start),
        endTime: new Date(window.end),
      }),
      buildTopologyLegacyVee({
        id: 'l-amb-b',
        dimoSegmentId: 'dimo-amb',
        startTime: new Date(window.start),
        endTime: new Date(window.end),
      }),
    ];
    const { observations, report } = reportForCase({ sessions, legacyRows });
    expect(report.pairedPhysicalEpisodeCount).toBe(1);
    expect(report.legacyFragmentRowCount).toBe(1);
    expect(report.trueLegacyOnlyPhysicalClusterCount).toBe(1);
    expect(report.ambiguousPhysicalClusterGroupCount).toBe(1);
    expect(report.settledParityDenominator).toBe(2);
    expect(
      observations.filter((o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_ONLY),
    ).toHaveLength(1);
    expect(
      observations.filter(
        (o) =>
          o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.AMBIGUOUS_MATCH &&
          o.legacyVehicleEnergyEventId === 'l-amb-a',
      ).length,
    ).toBe(1);
  });

  it('A6: ambiguity component legacy rows cannot become fragments', () => {
    const { observations } = reportForCase({
      sessions: [
        buildTopologyNativeSession({
          sessionId: 'c1',
          dimoSegmentId: 'dimo-x',
          startAt: new Date(window.start),
          endAt: new Date(window.end),
        }),
      ],
      legacyRows: [
        buildTopologyLegacyVee({
          id: 'l1',
          dimoSegmentId: 'dimo-x',
          startTime: new Date(window.start),
          endTime: new Date(window.end),
        }),
        buildTopologyLegacyVee({
          id: 'l2',
          dimoSegmentId: 'dimo-x',
          startTime: new Date('2026-06-01T10:00:00.000Z'),
          endTime: new Date('2026-06-01T11:00:00.000Z'),
        }),
      ],
    });
    expect(
      observations.some(
        (o) =>
          o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL &&
          (o.fieldDiff?.relatedLegacyVehicleEnergyEventIds ?? []).includes('l2'),
      ),
    ).toBe(false);
  });

  it('A7: T8 production-shaped fixture remains exact cluster count 1', () => {
    const { sessions, legacyRows } = buildProductionShapedFragmentFixture();
    const { report } = reportForCase({ sessions, legacyRows });
    expect(report.resolvedLegacyPhysicalClusterCount).toBe(1);
    expect(report.ambiguousPhysicalClusterGroupCount).toBe(0);
    expect(report.ambiguousLegacyRowCount).toBe(0);
    expect(report.legacyPhysicalClusterLowerBound).toBe(1);
    expect(report.legacyPhysicalClusterUpperBound).toBe(1);
    expect(report.legacyPhysicalClusterCount).toBe(1);
    expect(report.settledParityDenominator).toBe(1);
  });

  it('different component membership → different fingerprint', () => {
    const draftBase = (
      canonicalIds: string[],
      legacyIds: string[],
    ): Parameters<typeof buildShadowComparisonFingerprint>[0]['draft'] => ({
      canonicalChargeSessionId: canonicalIds[0] ?? null,
      legacyVehicleEnergyEventId: legacyIds[0] ?? null,
      pairingEvidence: ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.AMBIGUOUS,
      parityClass: ERD_RECHARGE_SHADOW_PARITY_CLASS.AMBIGUOUS_MATCH,
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
        relatedCanonicalSessionIds: canonicalIds,
        relatedLegacyVehicleEnergyEventIds: legacyIds,
      },
    });
    const fpA = buildShadowComparisonFingerprint({
      organizationId: 'o',
      vehicleId: 'v',
      draft: draftBase(['c1'], ['l1', 'l2']),
    });
    const fpB = buildShadowComparisonFingerprint({
      organizationId: 'o',
      vehicleId: 'v',
      draft: draftBase(['c1', 'c2'], ['l1']),
    });
    expect(fpA).not.toBe(fpB);
  });
});

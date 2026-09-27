import { aggregateRechargeShadowParityReport } from './erd-recharge-shadow-parity.aggregator';
import { ERD_RECHARGE_SHADOW_COMPARATOR_VERSION } from './erd-recharge-shadow-parity.constants';
import { evaluateRechargeShadowParity } from './erd-recharge-shadow-parity.evaluate';
import {
  ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE,
  ERD_RECHARGE_SHADOW_PARITY_CLASS,
} from './erd-recharge-shadow-parity.types';
import {
  buildProductionShapedFragmentFixture,
  buildTopologyLegacyVee,
  buildTopologyNativeSession,
  TOPOLOGY_EVALUATE_SCOPE,
} from './erd-recharge-shadow-topology.fixture';

const C_START = new Date('2026-06-01T10:00:00.000Z');
const C_END = new Date('2026-06-01T11:00:00.000Z');
const DIMO = 'dimo-native-topology';

function evaluateTopology(input: {
  sessions: ReturnType<typeof buildTopologyNativeSession>[];
  legacyRows: ReturnType<typeof buildTopologyLegacyVee>[];
}) {
  return evaluateRechargeShadowParity({
    ...TOPOLOGY_EVALUATE_SCOPE,
    sessions: input.sessions,
    legacyRows: input.legacyRows,
  });
}

describe('erd-recharge-shadow topology (E5.4 Step 1)', () => {
  it('PRE-FIX regression evidence: contained sibling is not LEGACY_ONLY post v2', () => {
    const sessions = [
      buildTopologyNativeSession({
        sessionId: 'c1',
        dimoSegmentId: DIMO,
        startAt: C_START,
        endAt: C_END,
      }),
    ];
    const legacyRows = [
      buildTopologyLegacyVee({
        id: 'l1',
        dimoSegmentId: DIMO,
        startTime: C_START,
        endTime: C_END,
      }),
      buildTopologyLegacyVee({
        id: 'f1',
        dimoSegmentId: 'dimo-fragment-1',
        startTime: new Date('2026-06-01T10:10:00.000Z'),
        endTime: new Date('2026-06-01T10:20:00.000Z'),
      }),
    ];
    const observations = evaluateTopology({ sessions, legacyRows });
    expect(
      observations.some(
        (o) =>
          o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_ONLY &&
          o.legacyVehicleEnergyEventId === 'f1',
      ),
    ).toBe(false);
    expect(
      observations.some(
        (o) =>
          o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL &&
          o.canonicalChargeSessionId === 'c1',
      ),
    ).toBe(true);
  });

  it('T1: one canonical + exact anchor → primary only', () => {
    const sessions = [
      buildTopologyNativeSession({
        sessionId: 'c1',
        dimoSegmentId: DIMO,
        startAt: C_START,
        endAt: C_END,
      }),
    ];
    const legacyRows = [
      buildTopologyLegacyVee({
        id: 'l1',
        dimoSegmentId: DIMO,
        startTime: C_START,
        endTime: C_END,
      }),
    ];
    const observations = evaluateTopology({ sessions, legacyRows });
    expect(observations).toHaveLength(1);
    expect(observations[0]?.legacyVehicleEnergyEventId).toBe('l1');
    expect([
      ERD_RECHARGE_SHADOW_PARITY_CLASS.EXACT_MATCH,
      ERD_RECHARGE_SHADOW_PARITY_CLASS.SEMANTIC_MATCH,
      ERD_RECHARGE_SHADOW_PARITY_CLASS.FIELD_MISMATCH,
    ]).toContain(observations[0]?.parityClass);
  });

  it('T2: anchor + contained sibling → primary + topology diagnostic', () => {
    const sessions = [
      buildTopologyNativeSession({
        sessionId: 'c1',
        dimoSegmentId: DIMO,
        startAt: C_START,
        endAt: C_END,
      }),
    ];
    const legacyRows = [
      buildTopologyLegacyVee({
        id: 'l1',
        dimoSegmentId: DIMO,
        startTime: C_START,
        endTime: C_END,
      }),
      buildTopologyLegacyVee({
        id: 'f1',
        dimoSegmentId: 'dimo-frag',
        startTime: new Date('2026-06-01T10:05:00.000Z'),
        endTime: new Date('2026-06-01T10:55:00.000Z'),
      }),
    ];
    const observations = evaluateTopology({ sessions, legacyRows });
    const diagnostic = observations.find(
      (o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL,
    );
    expect(diagnostic?.fieldDiff?.relatedLegacyVehicleEnergyEventIds).toEqual(['f1']);
    expect(diagnostic?.fieldDiff?.relatedLegacyVehicleEnergyEventIds).not.toContain('l1');
    expect(
      observations.filter((o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_ONLY),
    ).toHaveLength(0);
  });

  it('T3: N contained siblings → one diagnostic with sorted IDs', () => {
    const sessions = [
      buildTopologyNativeSession({
        sessionId: 'c1',
        dimoSegmentId: DIMO,
        startAt: C_START,
        endAt: C_END,
      }),
    ];
    const legacyRows = [
      buildTopologyLegacyVee({
        id: 'l1',
        dimoSegmentId: DIMO,
        startTime: C_START,
        endTime: C_END,
      }),
      buildTopologyLegacyVee({
        id: 'f-b',
        dimoSegmentId: 'frag-b',
        startTime: new Date('2026-06-01T10:20:00.000Z'),
        endTime: new Date('2026-06-01T10:25:00.000Z'),
      }),
      buildTopologyLegacyVee({
        id: 'f-a',
        dimoSegmentId: 'frag-a',
        startTime: new Date('2026-06-01T10:10:00.000Z'),
        endTime: new Date('2026-06-01T10:15:00.000Z'),
      }),
    ];
    const observations = evaluateTopology({ sessions, legacyRows });
    const diagnostics = observations.filter(
      (o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.fieldDiff?.relatedLegacyVehicleEnergyEventIds).toEqual(['f-a', 'f-b']);
  });

  it('T4: sibling contained under two primary-paired canonicals → fail closed (no fragment)', () => {
    const sessions = [
      buildTopologyNativeSession({
        sessionId: 'c1',
        dimoSegmentId: 'dimo-a',
        startAt: new Date('2026-06-01T08:00:00.000Z'),
        endAt: new Date('2026-06-01T12:00:00.000Z'),
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
        dimoSegmentId: 'dimo-a',
        startTime: new Date('2026-06-01T08:00:00.000Z'),
        endTime: new Date('2026-06-01T12:00:00.000Z'),
      }),
      buildTopologyLegacyVee({
        id: 'l2',
        dimoSegmentId: 'dimo-b',
        startTime: new Date('2026-06-01T09:00:00.000Z'),
        endTime: new Date('2026-06-01T13:00:00.000Z'),
      }),
      buildTopologyLegacyVee({
        id: 'f-shared',
        dimoSegmentId: 'dimo-shared-frag',
        startTime: new Date('2026-06-01T10:00:00.000Z'),
        endTime: new Date('2026-06-01T11:00:00.000Z'),
      }),
    ];
    const observations = evaluateTopology({ sessions, legacyRows });
    expect(
      observations.some(
        (o) =>
          o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.MULTIPLE_LEGACY_ONE_CANONICAL &&
          (o.fieldDiff?.relatedLegacyVehicleEnergyEventIds ?? []).includes('f-shared'),
      ),
    ).toBe(false);
    expect(
      observations.some(
        (o) =>
          o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_COALESCED_MULTIPLE_CANONICAL &&
          o.legacyVehicleEnergyEventId === 'f-shared',
      ),
    ).toBe(true);
  });

  it('T5: unrelated legacy episode → LEGACY_ONLY', () => {
    const sessions = [
      buildTopologyNativeSession({
        sessionId: 'c1',
        dimoSegmentId: DIMO,
        startAt: C_START,
        endAt: C_END,
      }),
    ];
    const legacyRows = [
      buildTopologyLegacyVee({
        id: 'l1',
        dimoSegmentId: DIMO,
        startTime: C_START,
        endTime: C_END,
      }),
      buildTopologyLegacyVee({
        id: 'l-unrelated',
        dimoSegmentId: 'dimo-other',
        startTime: new Date('2026-06-01T14:00:00.000Z'),
        endTime: new Date('2026-06-01T15:00:00.000Z'),
      }),
    ];
    const observations = evaluateTopology({ sessions, legacyRows });
    expect(
      observations.filter((o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_ONLY),
    ).toHaveLength(1);
    expect(
      observations.find((o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_ONLY)
        ?.legacyVehicleEnergyEventId,
    ).toBe('l-unrelated');
  });

  it('T6: settled native canonical without legacy → CANONICAL_ONLY', () => {
    const sessions = [
      buildTopologyNativeSession({
        sessionId: 'c1',
        dimoSegmentId: DIMO,
        startAt: C_START,
        endAt: C_END,
      }),
    ];
    const observations = evaluateTopology({ sessions, legacyRows: [] });
    expect(observations).toHaveLength(1);
    expect(observations[0]?.parityClass).toBe(ERD_RECHARGE_SHADOW_PARITY_CLASS.CANONICAL_ONLY);
  });

  it('T7: permuted legacy input → identical observations and fingerprints', () => {
    const sessions = [
      buildTopologyNativeSession({
        sessionId: 'c1',
        dimoSegmentId: DIMO,
        startAt: C_START,
        endAt: C_END,
      }),
    ];
    const baseLegacy = [
      buildTopologyLegacyVee({
        id: 'l1',
        dimoSegmentId: DIMO,
        startTime: C_START,
        endTime: C_END,
      }),
      buildTopologyLegacyVee({
        id: 'f1',
        dimoSegmentId: 'frag-1',
        startTime: new Date('2026-06-01T10:10:00.000Z'),
        endTime: new Date('2026-06-01T10:20:00.000Z'),
      }),
    ];
    const forward = evaluateTopology({ sessions, legacyRows: baseLegacy });
    const reverse = evaluateTopology({
      sessions,
      legacyRows: [...baseLegacy].reverse(),
    });
    const shuffled = evaluateTopology({
      sessions,
      legacyRows: [baseLegacy[1]!, baseLegacy[0]!],
    });
    const fp = (rows: typeof forward) =>
      rows.map((o) => o.comparisonFingerprint).sort().join('|');
    expect(fp(forward)).toBe(fp(reverse));
    expect(fp(forward)).toBe(fp(shuffled));
    expect(forward.map((o) => o.parityClass).sort()).toEqual(
      reverse.map((o) => o.parityClass).sort(),
    );
  });

  it('T8: production-shaped 64-fragment fixture → physical denominator 1', () => {
    const { sessions, legacyRows } = buildProductionShapedFragmentFixture();
    const observations = evaluateRechargeShadowParity({
      ...TOPOLOGY_EVALUATE_SCOPE,
      sessions,
      legacyRows,
    });
    const report = aggregateRechargeShadowParityReport({
      observations,
      canonicalEpisodeCount: 1,
      legacyEpisodeCount: legacyRows.length,
    });
    expect(report.legacyRowCount).toBe(65);
    expect(report.canonicalPhysicalEpisodeCount).toBe(1);
    expect(report.pairedPhysicalEpisodeCount).toBe(1);
    expect(report.legacyFragmentRowCount).toBe(64);
    expect(report.resolvedLegacyPhysicalClusterCount).toBe(1);
    expect(report.ambiguousPhysicalClusterGroupCount).toBe(0);
    expect(report.legacyPhysicalClusterLowerBound).toBe(1);
    expect(report.legacyPhysicalClusterUpperBound).toBe(1);
    expect(report.legacyPhysicalClusterCount).toBe(1);
    expect(report.trueLegacyOnlyPhysicalClusterCount).toBe(0);
    expect(report.multipleLegacyOneCanonicalCount).toBe(1);
    expect(
      observations.filter((o) => o.parityClass === ERD_RECHARGE_SHADOW_PARITY_CLASS.LEGACY_ONLY),
    ).toHaveLength(0);
    expect(report.settledParityDenominator).toBe(1);
    expect(report.settledParityNumerator).toBe(1);
    expect(report.settledParityRate).toBe(1);
    expect(ERD_RECHARGE_SHADOW_COMPARATOR_VERSION).toBe('erd_recharge_shadow_comparator_v2');
  });

  it('S27b: fragment topology diagnostic excluded from settled denominator', () => {
    const { sessions, legacyRows } = buildProductionShapedFragmentFixture();
    const observations = evaluateRechargeShadowParity({
      ...TOPOLOGY_EVALUATE_SCOPE,
      sessions,
      legacyRows,
    });
    const report = aggregateRechargeShadowParityReport({
      observations,
      canonicalEpisodeCount: 1,
      legacyEpisodeCount: 65,
    });
    expect(report.settledParityDenominator).toBe(1);
    const primaryPairs = observations.filter(
      (o) => o.canonicalChargeSessionId != null && o.legacyVehicleEnergyEventId != null,
    );
    expect(primaryPairs.length).toBe(1);
  });

  it('primary pair preserves pairing evidence EXACT_NATIVE_DIMO_ID', () => {
    const { sessions, legacyRows } = buildProductionShapedFragmentFixture();
    const observations = evaluateRechargeShadowParity({
      ...TOPOLOGY_EVALUATE_SCOPE,
      sessions,
      legacyRows,
    });
    const primary = observations.find(
      (o) => o.legacyVehicleEnergyEventId === 'l-anchor' && o.canonicalChargeSessionId != null,
    );
    expect(primary?.pairingEvidence).toBe(
      ERD_RECHARGE_SHADOW_PAIRING_EVIDENCE.EXACT_NATIVE_DIMO_ID,
    );
  });
});

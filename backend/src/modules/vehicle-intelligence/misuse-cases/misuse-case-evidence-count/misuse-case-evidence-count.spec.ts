import {
  MisuseAttributionScope,
  MisuseCaseCategory,
  MisuseCaseType,
  MisuseEvidenceSourceType,
} from '@prisma/client';
import {
  buildEvidenceQualificationKey,
  isQualifiedEvidenceCandidate,
  recalculateMisuseCaseEvidenceCounts,
  selectQualifiedEvidence,
} from './misuse-case-evidence-count';
import { MISUSE_EVENT_COUNT_VERSION } from './misuse-case-evidence-count.config';

describe('misuse-case-evidence-count', () => {
  const anchored = {
    sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
    sourceId: 'ev-1',
    eventType: 'KICKDOWN',
    occurredAt: new Date('2026-07-16T10:00:00Z'),
  };

  it('counts unique qualified evidence units, not inflated candidate.eventCount', () => {
    const recalc = recalculateMisuseCaseEvidenceCounts([
      anchored,
      { ...anchored, sourceId: 'ev-2', occurredAt: new Date('2026-07-16T10:05:00Z') },
    ]);
    expect(recalc.eventCount).toBe(2);
  });

  it('is deterministic across identical evaluations', () => {
    const batch = [
      anchored,
      { ...anchored, sourceId: 'ev-2', occurredAt: new Date('2026-07-16T10:05:00Z') },
      {
        sourceType: MisuseEvidenceSourceType.VEHICLE_TRIP_COUNTER,
        eventType: 'kickdownCount',
        occurredAt: new Date('2026-07-16T10:00:00Z'),
      },
      { ...anchored, sourceId: 'ev-2', occurredAt: new Date('2026-07-16T10:05:00Z') },
    ];

    const a = recalculateMisuseCaseEvidenceCounts(batch);
    const b = recalculateMisuseCaseEvidenceCounts(batch);
    const c = recalculateMisuseCaseEvidenceCounts(batch);

    expect(a.eventCount).toBe(2);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a.modelVersion).toBe(MISUSE_EVENT_COUNT_VERSION);
  });

  it('rejects aggregate proxy sources', () => {
    const recalc = recalculateMisuseCaseEvidenceCounts([
      anchored,
      {
        sourceType: MisuseEvidenceSourceType.VEHICLE_TRIP_COUNTER,
        eventType: 'kickdownCount',
        occurredAt: new Date('2026-07-16T10:00:00Z'),
      },
    ]);

    expect(recalc.eventCount).toBe(1);
    expect(recalc.rejectedEvidence).toHaveLength(1);
    expect(recalc.rejectedEvidence[0]?.reason).toBe('AGGREGATE_SOURCE');
  });

  it('rejects unqualified proxy inputs without sourceId', () => {
    const recalc = recalculateMisuseCaseEvidenceCounts([
      anchored,
      {
        sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
        eventType: 'KICKDOWN',
        occurredAt: new Date('2026-07-16T10:01:00Z'),
      },
    ]);

    expect(recalc.eventCount).toBe(1);
    expect(recalc.rejectedEvidence[0]?.reason).toBe('UNQUALIFIED_PROXY');
  });

  it('allows derived patterns without sourceId via temporal bucket', () => {
    const recalc = recalculateMisuseCaseEvidenceCounts([
      {
        sourceType: MisuseEvidenceSourceType.DERIVED_PATTERN,
        eventType: 'PATTERN_A',
        occurredAt: new Date('2026-07-16T10:00:00Z'),
      },
    ]);
    expect(recalc.eventCount).toBe(1);
    expect(isQualifiedEvidenceCandidate(recalc.qualifiedEvidence[0]!)).toBe(true);
  });

  it('supports downgrade when fewer qualified units remain', () => {
    const first = recalculateMisuseCaseEvidenceCounts([
      anchored,
      { ...anchored, sourceId: 'ev-2', occurredAt: new Date('2026-07-16T10:05:00Z') },
    ]);
    const second = recalculateMisuseCaseEvidenceCounts([anchored]);

    expect(first.eventCount).toBe(2);
    expect(second.eventCount).toBe(1);
  });

  it('deduplicates within the same evaluation', () => {
    const { qualified, rejected } = selectQualifiedEvidence([anchored, anchored]);
    expect(qualified).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBe('DUPLICATE_IN_EVALUATION');
  });

  it('builds stable qualification keys', () => {
    expect(buildEvidenceQualificationKey(anchored)).toBe('TRIP_BEHAVIOR_EVENT:ev-1');
  });
});

describe('misuse-case-evidence-count fingerprint alignment', () => {
  it('qualified keys match fingerprint module output', () => {
    const evidence = [
      {
        sourceType: MisuseEvidenceSourceType.DRIVING_EVENT,
        sourceId: 'de-1',
        eventType: 'HARSH_ACCELERATION',
        occurredAt: new Date('2026-07-16T11:00:00Z'),
      },
      {
        sourceType: MisuseEvidenceSourceType.VEHICLE_TRIP_COUNTER,
        eventType: 'abuseEvents',
        occurredAt: new Date('2026-07-16T11:00:00Z'),
      },
    ];

    const recalc = recalculateMisuseCaseEvidenceCounts(evidence);
    expect(recalc.qualifiedEvidenceKeys).toEqual(['DRIVING_EVENT:de-1']);
  });
});

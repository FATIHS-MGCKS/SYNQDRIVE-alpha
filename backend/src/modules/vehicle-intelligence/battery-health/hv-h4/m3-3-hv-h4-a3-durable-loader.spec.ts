import type { BatteryHvChargeSessionEvidenceRevision } from '@prisma/client';
import {
  collapseModeAEffectiveRevisionsV1,
  selectModeAEffectiveRevisionV1,
} from './m3-3-hv-h4-a3-mode-a-effective-revision.v1';
import { H4EvidenceEffectiveRevisionAmbiguityError } from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';
import { applyM3_3HvH4ChargeSessionSourcePopulationV1 } from './m3-3-hv-h4-charge-session-source-population.v1';
import type { M3_3HvH4ChargeSessionScientificRowV1 } from './m3-3-hv-h4-charge-session-scientific-row.v1';
import { reconstructM3_3HvH4ChargeSessionScientificRowFromRevisionV1 } from './m3-3-hv-h4-a3-durable-revision-reconstruction.v1';
import { buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';

function revisionStub(
  partial: Partial<BatteryHvChargeSessionEvidenceRevision> &
    Pick<BatteryHvChargeSessionEvidenceRevision, 'segmentFingerprint' | 'sourceRevisionFingerprint'>,
): BatteryHvChargeSessionEvidenceRevision {
  return {
    id: partial.id ?? 'rev-id',
    organizationId: 'org',
    vehicleId: 'veh',
    sourceHvChargeSessionId: partial.sourceHvChargeSessionId ?? 'sess',
    segmentFingerprint: partial.segmentFingerprint,
    evidenceContractVersion: 'M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1',
    sourceRevisionFingerprint: partial.sourceRevisionFingerprint,
    scientificEvidenceJson: partial.scientificEvidenceJson ?? {},
    dimoSegmentId: null,
    providerSegmentId: null,
    source: 'dimo_recharge',
    startAt: new Date('2026-01-01T00:00:00.000Z'),
    endAt: new Date('2026-01-01T01:00:00.000Z'),
    isOngoing: false,
    energyAddedKwh: 1,
    providerObservedAt: null,
    addedEnergyProvenance: null,
    qualityStatus: null,
    supersededBySegmentFingerprint: null,
    startedBeforeRange: false,
    sourceCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
    sourceReceivedAt: new Date('2026-01-01T00:00:00.000Z'),
    sourceUpdatedAt: partial.sourceUpdatedAt ?? new Date('2026-01-01T00:00:00.000Z'),
    capturedAt: partial.capturedAt ?? new Date('2026-01-01T00:00:00.000Z'),
    createdAt: partial.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('M3.3-HV-H4-A3.3 MODE_A effective revision selection', () => {
  it('selects latest sourceUpdatedAt as current/final state', () => {
    const fp = 'fp-one';
    const older = revisionStub({
      segmentFingerprint: fp,
      sourceRevisionFingerprint: 'a'.repeat(64),
      sourceUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const newer = revisionStub({
      segmentFingerprint: fp,
      sourceRevisionFingerprint: 'b'.repeat(64),
      sourceUpdatedAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    expect(selectModeAEffectiveRevisionV1([older, newer]).sourceRevisionFingerprint).toBe(
      'b'.repeat(64),
    );
  });

  it('P) fails closed on ambiguous tie with differing fingerprints', () => {
    const tieTime = new Date('2026-03-01T00:00:00.000Z');
    const a = revisionStub({
      segmentFingerprint: 'fp-tie',
      sourceRevisionFingerprint: 'c'.repeat(64),
      sourceUpdatedAt: tieTime,
      capturedAt: tieTime,
      createdAt: tieTime,
    });
    const b = revisionStub({
      segmentFingerprint: 'fp-tie',
      sourceRevisionFingerprint: 'd'.repeat(64),
      sourceUpdatedAt: tieTime,
      capturedAt: tieTime,
      createdAt: tieTime,
    });
    expect(() => selectModeAEffectiveRevisionV1([a, b])).toThrow(
      H4EvidenceEffectiveRevisionAmbiguityError,
    );
  });

  it('E) collapse keeps one revision per canonical session', () => {
    const effective = collapseModeAEffectiveRevisionsV1([
      revisionStub({
        segmentFingerprint: 'fp-a',
        sourceRevisionFingerprint: '1'.repeat(64),
        sourceUpdatedAt: new Date('2026-01-02T00:00:00.000Z'),
      }),
      revisionStub({
        segmentFingerprint: 'fp-a',
        sourceRevisionFingerprint: '2'.repeat(64),
        sourceUpdatedAt: new Date('2026-01-03T00:00:00.000Z'),
      }),
      revisionStub({
        segmentFingerprint: 'fp-b',
        sourceRevisionFingerprint: '3'.repeat(64),
      }),
    ]);
    expect(effective).toHaveLength(2);
  });
});

describe('M3.3-HV-H4-A3.3 source population hard limit', () => {
  function row(id: string, startAt: Date): M3_3HvH4ChargeSessionScientificRowV1 {
    return {
      id,
      organizationId: 'org',
      vehicleId: 'veh',
      segmentFingerprint: `fp-${id}`,
      dimoSegmentId: null,
      source: 'dimo_recharge',
      startAt,
      endAt: startAt,
      isOngoing: false,
      energyAddedKwh: 1,
      providerObservedAt: null,
      metadata: {},
      createdAt: startAt,
      receivedAt: startAt,
      updatedAt: startAt,
    };
  }

  it('F) applies 5000 canonical-session limit with probe semantics', () => {
    const evaluationAt = new Date('2026-12-31T00:00:00.000Z');
    const sessions: M3_3HvH4ChargeSessionScientificRowV1[] = [];
    for (let i = 0; i < 5001; i += 1) {
      const id = `sess-${String(i).padStart(5, '0')}`;
      sessions.push(row(id, new Date(Date.UTC(2020, 0, 1, 0, 0, i % 60))));
    }
    const result = applyM3_3HvH4ChargeSessionSourcePopulationV1({ sessions, evaluationAt });
    expect(result.sourceLoad.loadedCount).toBe(5000);
    expect(result.sourceLoad.sourceTruncated).toBe(true);
    expect(result.sourceLoad.hardLimitReached).toBe(true);
  });

  it('G) orders same startAt by sourceHvChargeSessionId ASC', () => {
    const t = new Date('2026-06-01T00:00:00.000Z');
    const result = applyM3_3HvH4ChargeSessionSourcePopulationV1({
      sessions: [row('b-id', t), row('a-id', t)],
      evaluationAt: t,
    });
    expect(result.sessions.map((s) => s.id)).toEqual(['a-id', 'b-id']);
  });
});

describe('M3.3-HV-H4-A3.3 scientific JSON reconstruction', () => {
  it('J) decodes non-finite tagged energy (not Float mirror)', () => {
    const anchor = new Date('2026-01-01T00:00:00.000Z');
    const projection = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1({
      id: 'sess-nf',
      organizationId: 'org',
      vehicleId: 'veh',
      segmentFingerprint: 'fp-nf',
      dimoSegmentId: null,
      source: 'dimo_recharge',
      startAt: anchor,
      endAt: new Date('2026-01-01T01:00:00.000Z'),
      isOngoing: false,
      energyAddedKwh: Number.NaN,
      providerObservedAt: null,
      createdAt: anchor,
      receivedAt: anchor,
      updatedAt: anchor,
      metadata: {},
      measurementSessionId: null,
      startSocPercent: null,
      endSocPercent: null,
      startEnergyKwh: null,
      endEnergyKwh: null,
      deltaSocPercent: null,
      quality: null,
      idempotencyKey: 'k',
    });
    const revision = revisionStub({
      segmentFingerprint: 'fp-nf',
      sourceRevisionFingerprint: 'e'.repeat(64),
      scientificEvidenceJson: projection,
      energyAddedKwh: null,
      sourceHvChargeSessionId: 'sess-nf',
    });
    const row = reconstructM3_3HvH4ChargeSessionScientificRowFromRevisionV1(revision);
    expect(Number.isNaN(row.energyAddedKwh!)).toBe(true);
  });
});

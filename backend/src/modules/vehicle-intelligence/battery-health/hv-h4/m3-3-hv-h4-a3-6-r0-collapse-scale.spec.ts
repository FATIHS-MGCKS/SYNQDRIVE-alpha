import type { BatteryHvChargeSessionEvidenceRevision } from '@prisma/client';
import { collapseModeAEffectiveRevisionsV1 } from './m3-3-hv-h4-a3-mode-a-effective-revision.v1';

function syntheticRevision(input: {
  segmentFingerprint: string;
  sourceUpdatedAtMs: number;
  capturedAtMs: number;
  createdAtMs: number;
  fingerprint: string;
}): BatteryHvChargeSessionEvidenceRevision {
  return {
    id: input.fingerprint.slice(0, 36),
    organizationId: 'org',
    vehicleId: 'veh',
    sourceHvChargeSessionId: input.fingerprint,
    segmentFingerprint: input.segmentFingerprint,
    evidenceContractVersion: 'M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1',
    sourceRevisionFingerprint: input.fingerprint,
    scientificEvidenceJson: {},
    dimoSegmentId: null,
    providerSegmentId: null,
    source: 'DIMO_RECHARGE',
    startAt: new Date('2020-01-01T00:00:00.000Z'),
    endAt: new Date('2020-01-01T01:00:00.000Z'),
    isOngoing: false,
    energyAddedKwh: 10,
    providerObservedAt: null,
    addedEnergyProvenance: 'SEGMENT_EXTREMA',
    qualityStatus: 'QUALIFIED',
    supersededBySegmentFingerprint: null,
    startedBeforeRange: false,
    sourceCreatedAt: new Date('2020-01-01T00:00:00.000Z'),
    sourceReceivedAt: new Date('2020-01-01T00:00:00.000Z'),
    sourceUpdatedAt: new Date(input.sourceUpdatedAtMs),
    capturedAt: new Date(input.capturedAtMs),
    createdAt: new Date(input.createdAtMs),
  };
}

describe('M3.3-HV-H4-A3.6-R0 collapse scale (in-memory)', () => {
  it('collapse cost scales with revision rows not canonical session cap', () => {
    const sessions = 5_000;
    const depth = 2;
    const revisions: BatteryHvChargeSessionEvidenceRevision[] = [];
    for (let s = 0; s < sessions; s += 1) {
      const fp = `fp-${String(s).padStart(6, '0')}`;
      for (let d = 0; d < depth; d += 1) {
        revisions.push(
          syntheticRevision({
            segmentFingerprint: fp,
            sourceUpdatedAtMs: Date.UTC(2020, 0, 1) + d * 1_000,
            capturedAtMs: Date.UTC(2020, 0, 1) + d,
            createdAtMs: Date.UTC(2020, 0, 1) + d,
            fingerprint: `${'a'.repeat(63)}${d % 10}`,
          }),
        );
      }
    }
    expect(revisions.length).toBe(sessions * depth);
    const effective = collapseModeAEffectiveRevisionsV1(revisions);
    expect(effective.length).toBe(sessions);
  });
});

import {
  buildOperatorMutationManifest,
  buildPreMutationBackupArtifact,
  validatePostMutationInvariants,
  validatePreMutationInvariants,
  type PersistedEnergyEventRow,
} from './energy-events-operator-mutation-manifest';
import type { EnergyEventsTableSnapshot } from './energy-events-recovery-write-backfill';

function row(
  overrides: Partial<PersistedEnergyEventRow> & Pick<PersistedEnergyEventRow, 'id' | 'dimoSegmentId'>,
): PersistedEnergyEventRow {
  return {
    vehicleId: 'veh-ev',
    kind: 'RECHARGE',
    detectionMechanism: 'recharge',
    startTime: new Date('2026-07-16T19:00:00.000Z'),
    endTime: new Date('2026-07-16T19:30:00.000Z'),
    durationSeconds: 1800,
    fuelDeltaLiters: null,
    fuelDeltaPercent: null,
    socDeltaPercent: 1.2,
    energyDeltaKwh: 0.6,
    odometerStartKm: null,
    odometerEndKm: null,
    confidence: 'LOW',
    rawDetectionMeta: {
      coalescedFromCount: 1,
      coalescedFromSegmentIds: [overrides.dimoSegmentId],
    },
    ...overrides,
  };
}

const snapshot: EnergyEventsTableSnapshot = {
  capturedAt: '2026-08-28T00:00:00.000Z',
  totalRows: 132,
  outageWindowRows: 20,
  newestCreatedAt: '2026-08-28T18:35:12.883Z',
  newestUpdatedAt: '2026-08-28T19:42:47.615Z',
  tableDigest: 'digest-pre',
};

describe('energy-events operator mutation manifest', () => {
  it('builds a closed-set 16-row prune manifest for contained legacy population', () => {
    const m1Start = new Date('2026-07-16T16:42:18.893Z');
    const m1End = new Date('2026-07-16T23:54:02.926Z');
    const contained: PersistedEnergyEventRow[] = Array.from({ length: 16 }, (_, index) =>
      row({
        id: `legacy-${index + 1}`,
        dimoSegmentId: `dimo-recharge-1-${index}`,
        startTime: new Date(m1Start.getTime() + index * 60_000),
        endTime: new Date(m1Start.getTime() + (index + 1) * 60_000 + 1_800_000),
      }),
    );
    const overlapTail = row({
      id: 'legacy-tail',
      dimoSegmentId: 'dimo-recharge-1-tail',
      startTime: new Date('2026-07-16T23:23:02.926Z'),
      endTime: new Date('2026-07-16T23:57:02.926Z'),
    });
    const independent = row({
      id: 'independent-jul-17',
      dimoSegmentId: 'dimo-recharge-1-jul17',
      startTime: new Date('2026-07-17T00:05:02.926Z'),
      endTime: new Date('2026-07-17T07:22:51.875Z'),
      durationSeconds: 26268,
      socDeltaPercent: 3.2,
      energyDeltaKwh: 2.24,
    });

    const manifest = buildOperatorMutationManifest({
      reviewProvenance: 'test',
      forensicClosureReference: 'test',
      preMutationSnapshot: snapshot,
      m1DetectorPayload: {
        dimoSegmentId: 'dimo-recharge-1-m1',
        vehicleId: 'veh-ev',
        mechanism: 'recharge',
        startTime: m1Start,
        endTime: m1End,
        durationSeconds: 25904,
        socDeltaPercent: 23.6,
        energyDeltaKwh: 11.88,
        fuelDeltaLiters: null,
        odometerStartKm: 179360.33,
        odometerEndKm: 179360.33,
        confidence: 'HIGH',
        coalescedFromSegmentIds: ['dimo-recharge-1-m1'],
        rawDetectionMeta: { coalescedFromCount: 1 },
      },
      vehicleRechargeRows: [...contained, overlapTail, independent],
    });

    expect(manifest.explicitOperatorAuthorizedPrunes).toHaveLength(16);
    expect(manifest.excludedFromPrune).toHaveLength(1);
    expect(manifest.excludedFromPrune[0].rowId).toBe('legacy-tail');
    expect(manifest.overlapPopulationAssessment.pruneAuthority).toBe(false);
    expect(manifest.expectedPostMutation.expectedFinalRowCount).toBe(117);
    expect(
      manifest.explicitOperatorAuthorizedPrunes.every(
        (entry) => entry.disposition === 'EXPLICIT_OPERATOR_AUTHORIZED_PRUNE',
      ),
    ).toBe(true);
    expect(manifest.m1.disposition).toBe('APPROVE_FOR_BACKFILL');
  });

  it('aborts pre-mutation validation when a legacy fingerprint drifts', () => {
    const legacy = row({ id: 'legacy-1', dimoSegmentId: 'dimo-recharge-1-0' });
    const manifest = buildOperatorMutationManifest({
      reviewProvenance: 'test',
      forensicClosureReference: 'test',
      preMutationSnapshot: snapshot,
      m1DetectorPayload: {
        dimoSegmentId: 'dimo-recharge-1-m1',
        vehicleId: 'veh-ev',
        mechanism: 'recharge',
        startTime: new Date('2026-07-16T16:42:18.893Z'),
        endTime: new Date('2026-07-16T23:54:02.926Z'),
        durationSeconds: 25904,
        socDeltaPercent: 23.6,
        energyDeltaKwh: 11.88,
        fuelDeltaLiters: null,
        odometerStartKm: null,
        odometerEndKm: null,
        confidence: 'HIGH',
        coalescedFromSegmentIds: ['dimo-recharge-1-m1'],
        rawDetectionMeta: {},
      },
      vehicleRechargeRows: [legacy],
    });

    const drifted = new Map<string, PersistedEnergyEventRow>([
      ['legacy-1', { ...legacy, socDeltaPercent: 9.9 }],
    ]);
    const violations = validatePreMutationInvariants(
      manifest,
      drifted,
      snapshot,
      false,
    );
    expect(violations.some((entry) => entry.kind === 'FINGERPRINT_MISMATCH')).toBe(
      true,
    );
  });

  it('builds a backup artifact containing every prune row', () => {
    const legacy = row({ id: 'legacy-1', dimoSegmentId: 'dimo-recharge-1-0' });
    const manifest = buildOperatorMutationManifest({
      reviewProvenance: 'test',
      forensicClosureReference: 'test',
      preMutationSnapshot: snapshot,
      m1DetectorPayload: {
        dimoSegmentId: 'dimo-recharge-1-m1',
        vehicleId: 'veh-ev',
        mechanism: 'recharge',
        startTime: new Date('2026-07-16T16:42:18.893Z'),
        endTime: new Date('2026-07-16T23:54:02.926Z'),
        durationSeconds: 25904,
        socDeltaPercent: 23.6,
        energyDeltaKwh: 11.88,
        fuelDeltaLiters: null,
        odometerStartKm: null,
        odometerEndKm: null,
        confidence: 'HIGH',
        coalescedFromSegmentIds: ['dimo-recharge-1-m1'],
        rawDetectionMeta: {},
      },
      vehicleRechargeRows: [legacy],
    });
    const backup = buildPreMutationBackupArtifact(
      manifest,
      new Map([[legacy.id, legacy]]),
    );
    expect(backup.rows).toHaveLength(1);
    expect(backup.rows[0].id).toBe('legacy-1');
  });

  it('validates post-mutation absence of pruned rows', () => {
    const legacy = row({ id: 'legacy-1', dimoSegmentId: 'dimo-recharge-1-0' });
    const manifest = buildOperatorMutationManifest({
      reviewProvenance: 'test',
      forensicClosureReference: 'test',
      preMutationSnapshot: snapshot,
      m1DetectorPayload: {
        dimoSegmentId: 'dimo-recharge-1-m1',
        vehicleId: 'veh-ev',
        mechanism: 'recharge',
        startTime: new Date('2026-07-16T16:42:18.893Z'),
        endTime: new Date('2026-07-16T23:54:02.926Z'),
        durationSeconds: 25904,
        socDeltaPercent: 23.6,
        energyDeltaKwh: 11.88,
        fuelDeltaLiters: null,
        odometerStartKm: null,
        odometerEndKm: null,
        confidence: 'HIGH',
        coalescedFromSegmentIds: ['dimo-recharge-1-m1'],
        rawDetectionMeta: {},
      },
      vehicleRechargeRows: [legacy],
    });

    const postSnapshot: EnergyEventsTableSnapshot = {
      ...snapshot,
      totalRows: manifest.expectedPostMutation.expectedFinalRowCount,
    };
    const violations = validatePostMutationInvariants(
      manifest,
      new Map([
        [
          'm1',
          row({
            id: 'm1',
            dimoSegmentId: 'dimo-recharge-1-m1',
            startTime: new Date('2026-07-16T16:42:18.893Z'),
            endTime: new Date('2026-07-16T23:54:02.926Z'),
          }),
        ],
        ['legacy-1', legacy],
      ]),
      postSnapshot,
    );
    expect(
      violations.some((entry) => entry.kind === 'UNEXPECTED_LEGACY_PRUNE_ROW_PRESENT'),
    ).toBe(true);
  });
});

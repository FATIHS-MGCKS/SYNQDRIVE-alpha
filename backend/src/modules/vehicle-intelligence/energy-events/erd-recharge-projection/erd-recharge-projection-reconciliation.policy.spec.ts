import {
  EnergyEventConfidence,
  EnergyEventKind,
  VehicleEnergyEventDetectionSource,
} from '@prisma/client';
import type { ErdRechargeProjectionDraft } from './erd-recharge-projection-mapper';
import {
  projectionDraftMatchesPersistedRow,
  readAnchorSegmentFingerprintFromVee,
} from './erd-recharge-projection-reconciliation.policy';

describe('erd-recharge-projection-reconciliation.policy', () => {
  it('reads anchorSegmentFingerprint from rawDetectionMeta', () => {
    const row = {
      sourceEventKey: 'erd:physical:v1:v1:fp-anchor',
      rawDetectionMeta: { anchorSegmentFingerprint: 'fp-meta' },
    } as never;
    expect(readAnchorSegmentFingerprintFromVee(row)).toBe('fp-meta');
  });

  it('detects projection draft deltas for reconcile', () => {
    const start = new Date('2026-06-01T10:00:00.000Z');
    const end = new Date('2026-06-01T11:00:00.000Z');
    const row = {
      dimoSegmentId: null,
      startTime: start,
      endTime: end,
      durationSeconds: 3600,
      socDeltaPercent: 20,
      energyDeltaKwh: 10,
      odometerStartKm: null,
      odometerEndKm: null,
      confidence: EnergyEventConfidence.MEDIUM,
      rawDetectionMeta: { projectionVersion: 1 },
    } as never;
    const draft: ErdRechargeProjectionDraft = {
      vehicleId: 'v1',
      kind: EnergyEventKind.RECHARGE,
      detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
      sourceEventKey: 'k',
      canonicalChargeSessionId: 's1',
      dimoSegmentId: null,
      detectionMechanism: 'ERD_HV_CHARGE_SESSION_PROJECTION',
      startTime: start,
      endTime: end,
      durationSeconds: 3600,
      startLatitude: null,
      startLongitude: null,
      endLatitude: null,
      endLongitude: null,
      fuelDeltaLiters: null,
      fuelDeltaPercent: null,
      socDeltaPercent: 45,
      energyDeltaKwh: 28,
      odometerStartKm: null,
      odometerEndKm: null,
      confidence: EnergyEventConfidence.HIGH,
      rawDetectionMeta: { projectionVersion: 1 },
      fuelLevelRiseStart: null,
      fuelLevelRiseEnd: null,
      fuelLevelRiseDurationSeconds: null,
      anchorSegmentFingerprint: 'fp',
    };
    expect(projectionDraftMatchesPersistedRow(row, draft)).toBe(false);
  });

  it('treats rawDetectionMeta with different key order as equal', () => {
    const start = new Date('2026-06-01T10:00:00.000Z');
    const end = new Date('2026-06-01T11:00:00.000Z');
    const row = {
      dimoSegmentId: 'dimo-1',
      startTime: start,
      endTime: end,
      durationSeconds: 3600,
      socDeltaPercent: 40,
      energyDeltaKwh: 22,
      odometerStartKm: null,
      odometerEndKm: null,
      confidence: EnergyEventConfidence.HIGH,
      rawDetectionMeta: {
        dimoSegmentId: 'dimo-1',
        qualityStatus: 'QUALIFIED',
        sessionSource: 'DIMO_RECHARGE_SEGMENT',
        projectionVersion: 1,
        qualityReasonCodes: null,
        segmentFingerprint: 'fp',
        anchorSegmentFingerprint: 'fp',
        canonicalChargeSessionId: 'sess',
      },
    } as never;
    const draft: ErdRechargeProjectionDraft = {
      vehicleId: 'v1',
      kind: EnergyEventKind.RECHARGE,
      detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
      sourceEventKey: 'k',
      canonicalChargeSessionId: 'sess',
      dimoSegmentId: 'dimo-1',
      detectionMechanism: 'ERD_HV_CHARGE_SESSION_PROJECTION',
      startTime: start,
      endTime: end,
      durationSeconds: 3600,
      startLatitude: null,
      startLongitude: null,
      endLatitude: null,
      endLongitude: null,
      fuelDeltaLiters: null,
      fuelDeltaPercent: null,
      socDeltaPercent: 40,
      energyDeltaKwh: 22,
      odometerStartKm: null,
      odometerEndKm: null,
      confidence: EnergyEventConfidence.HIGH,
      rawDetectionMeta: {
        projectionVersion: 1,
        canonicalChargeSessionId: 'sess',
        sessionSource: 'DIMO_RECHARGE_SEGMENT',
        segmentFingerprint: 'fp',
        anchorSegmentFingerprint: 'fp',
        dimoSegmentId: 'dimo-1',
        qualityStatus: 'QUALIFIED',
        qualityReasonCodes: null,
      },
      fuelLevelRiseStart: null,
      fuelLevelRiseEnd: null,
      fuelLevelRiseDurationSeconds: null,
      anchorSegmentFingerprint: 'fp',
    };
    expect(projectionDraftMatchesPersistedRow(row, draft)).toBe(true);
  });
});

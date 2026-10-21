import {
  EnergyEventConfidence,
  EnergyEventKind,
  VehicleEnergyEventDetectionSource,
  type HvChargeSession,
} from '@prisma/client';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session-quality.status';
import {
  ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME,
} from './erd-canonical-recharge-projector.types';
import { projectCanonicalRecharge } from './erd-canonical-recharge-projector';
import { mapCanonicalHvChargeSessionToErdRechargeProjectionDraft } from './erd-recharge-projection-mapper';
import {
  ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
  ERD_RECHARGE_PROJECTION_META_VERSION,
} from './erd-recharge-projection.constants';
import { projectionDraftMatchesPersistedRow } from './erd-recharge-projection-reconciliation.policy';

function nativeSession(overrides: Partial<HvChargeSession> = {}): HvChargeSession {
  const startAt = new Date('2026-06-01T10:00:00.000Z');
  const endAt = new Date('2026-06-01T11:00:00.000Z');
  return {
    id: 'session-native',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    measurementSessionId: null,
    segmentFingerprint: 'dimo-recharge-anchor',
    dimoSegmentId: 'dimo-native-1',
    source: 'DIMO_RECHARGE_SEGMENT',
    startAt,
    endAt,
    startSocPercent: 20,
    endSocPercent: 80,
    startEnergyKwh: 10,
    endEnergyKwh: 40,
    energyAddedKwh: 47,
    deltaSocPercent: 60,
    isOngoing: false,
    quality: 'SHADOW',
    idempotencyKey: 'idem-native',
    providerObservedAt: endAt,
    receivedAt: endAt,
    metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
    createdAt: startAt,
    updatedAt: endAt,
    ...overrides,
  };
}

describe('erd-recharge projection Step 2 stored-energy alignment (unit)', () => {
  const scope = { organizationId: 'org-1', vehicleId: 'veh-1' };

  it('E1: different added vs stored → canonical energyDeltaKwh uses stored delta only', () => {
    const mapped = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({
      session: nativeSession(),
      scope,
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.draft.energyDeltaKwh).toBe(30);
    expect(mapped.draft.rawDetectionMeta.projectionVersion).toBe(ERD_RECHARGE_PROJECTION_META_VERSION);
    expect(mapped.draft.rawDetectionMeta.energyDeltaSemantic).toBe(
      'STORED_TRACTION_BATTERY_ENERGY_DELTA',
    );
  });

  it('F1: fallback with stored evidence uses stored delta', () => {
    const mapped = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({
      session: nativeSession({
        source: 'TELEMETRY_POLL_FALLBACK',
        dimoSegmentId: null,
        segmentFingerprint: 'poll-charge:veh-1:1',
        startEnergyKwh: 20,
        endEnergyKwh: 32,
        energyAddedKwh: 18,
        deltaSocPercent: 35,
      }),
      scope,
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.draft.energyDeltaKwh).toBe(12);
  });

  it('F2: fallback without stored evidence → energyDeltaKwh null', () => {
    const mapped = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({
      session: nativeSession({
        source: 'TELEMETRY_POLL_FALLBACK',
        dimoSegmentId: null,
        segmentFingerprint: 'poll-charge:veh-1:2',
        startEnergyKwh: null,
        endEnergyKwh: null,
        energyAddedKwh: 18,
      }),
      scope,
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.draft.energyDeltaKwh).toBeNull();
  });

  it('old v1 added-energy row mismatches v2 stored-energy draft until reconcile', () => {
    const session = nativeSession();
    const mapped = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({ session, scope });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const row = {
      dimoSegmentId: mapped.draft.dimoSegmentId,
      startTime: mapped.draft.startTime,
      endTime: mapped.draft.endTime,
      durationSeconds: mapped.draft.durationSeconds,
      startLatitude: mapped.draft.startLatitude,
      startLongitude: mapped.draft.startLongitude,
      endLatitude: mapped.draft.endLatitude,
      endLongitude: mapped.draft.endLongitude,
      socDeltaPercent: mapped.draft.socDeltaPercent,
      energyDeltaKwh: 47,
      odometerStartKm: mapped.draft.odometerStartKm,
      odometerEndKm: mapped.draft.odometerEndKm,
      confidence: mapped.draft.confidence,
      rawDetectionMeta: { projectionVersion: 1 },
    } as never;
    expect(projectionDraftMatchesPersistedRow(row, mapped.draft)).toBe(false);
    const fixed = {
      dimoSegmentId: mapped.draft.dimoSegmentId,
      startTime: mapped.draft.startTime,
      endTime: mapped.draft.endTime,
      durationSeconds: mapped.draft.durationSeconds,
      startLatitude: mapped.draft.startLatitude,
      startLongitude: mapped.draft.startLongitude,
      endLatitude: mapped.draft.endLatitude,
      endLongitude: mapped.draft.endLongitude,
      socDeltaPercent: mapped.draft.socDeltaPercent,
      energyDeltaKwh: 30,
      odometerStartKm: mapped.draft.odometerStartKm,
      odometerEndKm: mapped.draft.odometerEndKm,
      confidence: mapped.draft.confidence,
      rawDetectionMeta: mapped.draft.rawDetectionMeta,
    } as never;
    expect(projectionDraftMatchesPersistedRow(fixed, mapped.draft)).toBe(true);
  });
});

describe('projectCanonicalRecharge (Step 2 reconcile contract)', () => {
  it('exports projector outcome enum including RECONCILED', () => {
    expect(ERD_CANONICAL_RECHARGE_PROJECTOR_OUTCOME.RECONCILED).toBe('reconciled');
    expect(typeof projectCanonicalRecharge).toBe('function');
  });
});

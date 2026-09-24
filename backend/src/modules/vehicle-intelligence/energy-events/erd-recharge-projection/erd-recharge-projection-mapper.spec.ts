import {
  EnergyEventKind,
  VehicleEnergyEventDetectionSource,
  type HvChargeSession,
} from '@prisma/client';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session-quality.status';
import { mapCanonicalHvChargeSessionToErdRechargeProjectionDraft } from './erd-recharge-projection-mapper';
import { ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM } from './erd-recharge-projection.constants';

function session(overrides: Partial<HvChargeSession>): HvChargeSession {
  const startAt = new Date('2026-06-01T10:00:00.000Z');
  const endAt = new Date('2026-06-01T11:00:00.000Z');
  return {
    id: 'session-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    measurementSessionId: null,
    segmentFingerprint: 'dimo-recharge-99-1000',
    dimoSegmentId: 'dimo-recharge-99-1000',
    source: 'DIMO_RECHARGE_SEGMENT',
    startAt,
    endAt,
    startSocPercent: 20,
    endSocPercent: 80,
    startEnergyKwh: 10,
    endEnergyKwh: 40,
    energyAddedKwh: 30,
    deltaSocPercent: 60,
    isOngoing: false,
    quality: 'SHADOW',
    idempotencyKey: 'idem-1',
    providerObservedAt: endAt,
    receivedAt: endAt,
    metadata: {
      qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED,
      odometerStartKm: 1000,
      odometerEndKm: 1000,
    },
    createdAt: startAt,
    updatedAt: endAt,
    ...overrides,
  };
}

describe('erd-recharge-projection-mapper', () => {
  const scope = { organizationId: 'org-1', vehicleId: 'veh-1' };

  it('maps native session with real dimoSegmentId', () => {
    const result = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({
      session: session({}),
      scope,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.kind).toBe(EnergyEventKind.RECHARGE);
    expect(result.draft.detectionSource).toBe(
      VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
    );
    expect(result.draft.detectionMechanism).toBe(ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM);
    expect(result.draft.dimoSegmentId).toBe('dimo-recharge-99-1000');
    expect(result.draft.fuelDeltaLiters).toBeNull();
    expect(result.draft.startLatitude).toBeNull();
    expect(result.draft.energyDeltaKwh).toBe(30);
    expect(result.draft.rawDetectionMeta.projectionVersion).toBe(1);
  });

  it('maps fallback session without fake dimoSegmentId', () => {
    const result = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({
      session: session({
        source: 'TELEMETRY_POLL_FALLBACK',
        dimoSegmentId: null,
        segmentFingerprint: 'poll-charge:veh-1:1000',
      }),
      scope,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.draft.dimoSegmentId).toBeNull();
  });

  it('fail-closes ineligible session', () => {
    const result = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({
      session: session({ isOngoing: true, endAt: null }),
      scope,
    });
    expect(result.ok).toBe(false);
  });
});

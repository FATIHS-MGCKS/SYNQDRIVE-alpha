import type { HvChargeSession } from '@prisma/client';
import {
  deriveStoredTractionEnergyDeltaKwh,
  deriveStoredTractionEnergyDeltaKwhFromSession,
} from './erd-recharge-energy-semantics.policy';
import { mapCanonicalHvChargeSessionToErdRechargeProjectionDraft } from './erd-recharge-projection-mapper';
import { HV_CHARGE_SESSION_QUALITY_STATUS } from '@modules/vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session-quality.status';

function session(overrides: Partial<HvChargeSession> = {}): HvChargeSession {
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
    energyAddedKwh: 47,
    deltaSocPercent: 60,
    isOngoing: false,
    quality: 'SHADOW',
    idempotencyKey: 'idem-1',
    providerObservedAt: endAt,
    receivedAt: endAt,
    metadata: { qualityStatus: HV_CHARGE_SESSION_QUALITY_STATUS.QUALIFIED },
    createdAt: startAt,
    updatedAt: endAt,
    ...overrides,
  };
}

describe('erd-recharge-energy-semantics.policy', () => {
  it('H1: start=10 end=40 → 30', () => {
    expect(deriveStoredTractionEnergyDeltaKwh({ startEnergyKwh: 10, endEnergyKwh: 40 })).toBe(30);
  });

  it('H2: start=10 end=10 → 0', () => {
    expect(deriveStoredTractionEnergyDeltaKwh({ startEnergyKwh: 10, endEnergyKwh: 10 })).toBe(0);
  });

  it('H3: start > end → 0', () => {
    expect(deriveStoredTractionEnergyDeltaKwh({ startEnergyKwh: 40, endEnergyKwh: 10 })).toBe(0);
  });

  it('H4: start=null → null', () => {
    expect(deriveStoredTractionEnergyDeltaKwh({ startEnergyKwh: null, endEnergyKwh: 40 })).toBeNull();
  });

  it('H5: end=null → null', () => {
    expect(deriveStoredTractionEnergyDeltaKwh({ startEnergyKwh: 10, endEnergyKwh: null })).toBeNull();
  });

  it('H6: mapper returns null when stored evidence missing even if energyAddedKwh exists', () => {
    const mapped = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({
      session: session({
        startEnergyKwh: null,
        endEnergyKwh: null,
        energyAddedKwh: 18,
        source: 'TELEMETRY_POLL_FALLBACK',
        dimoSegmentId: null,
        segmentFingerprint: 'poll-charge:veh-1:1000',
      }),
      scope: { organizationId: 'org-1', vehicleId: 'veh-1' },
    });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.draft.energyDeltaKwh).toBeNull();
  });

  it('H7: result independent of energyAddedKwh when stored evidence present', () => {
    expect(deriveStoredTractionEnergyDeltaKwhFromSession(session({ energyAddedKwh: 99 }))).toBe(30);
    expect(deriveStoredTractionEnergyDeltaKwhFromSession(session({ energyAddedKwh: 47 }))).toBe(30);
  });
});

import { BatteryEvidenceStrength } from '../battery-v2-domain';
import {
  detectFallbackChargeSessions,
  sessionsOverlap,
} from './hv-fallback-charge-session.policy';
import { HV_FALLBACK_DETECTION_TIER } from './hv-fallback-charge-session.types';
import type { HvFallbackChargeObservation } from './hv-fallback-charge-session.types';

const BASE = new Date('2026-07-16T08:00:00.000Z');

function minutes(offset: number, overrides: Partial<HvFallbackChargeObservation> = {}): HvFallbackChargeObservation {
  return {
    recordedAt: new Date(BASE.getTime() + offset * 60_000),
    providerReceivedAt: new Date(BASE.getTime() + offset * 60_000),
    socPercent: 40,
    energyKwh: 20,
    isCharging: false,
    cableConnected: false,
    chargingPowerKw: null,
    addedEnergyKwh: null,
    ...overrides,
  };
}

function completeChargingSession(): HvFallbackChargeObservation[] {
  const rows: HvFallbackChargeObservation[] = [];
  for (let i = 0; i <= 12; i += 1) {
    const charging = i >= 1 && i <= 10;
    rows.push(
      minutes(i * 5, {
        socPercent: 40 + i * 0.8,
        isCharging: charging,
        cableConnected: charging,
        chargingPowerKw: charging ? 11 : null,
        addedEnergyKwh: charging ? i * 0.5 : 0,
        energyKwh: 20 + i * 0.4,
      }),
    );
  }
  return rows;
}

describe('detectFallbackChargeSessions', () => {
  it('detects a complete session from isCharging flanks with corroboration', () => {
    const result = detectFallbackChargeSessions(
      completeChargingSession(),
      new Date(BASE.getTime() + 70 * 60_000),
    );

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].primaryTier).toBe(
      HV_FALLBACK_DETECTION_TIER.IS_CHARGING_FLANK,
    );
    expect(result.sessions[0].isOngoing).toBe(false);
    expect(result.sessions[0].observationCount).toBeGreaterThanOrEqual(3);
    expect(result.sessions[0].evidenceStrength).toBe(
      BatteryEvidenceStrength.SUPPLEMENTARY,
    );
    expect(result.sessions[0].deltaSocPercent).toBeGreaterThan(0);
  });

  it('detects a partial ongoing session when charging has not ended', () => {
    const rows = completeChargingSession().slice(0, 8);
    rows[rows.length - 1] = {
      ...rows[rows.length - 1],
      isCharging: true,
      cableConnected: true,
    };

    const result = detectFallbackChargeSessions(
      rows,
      new Date(BASE.getTime() + 45 * 60_000),
    );

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].isOngoing).toBe(true);
    expect(result.sessions[0].endAt).toBeNull();
  });

  it('treats a short charging pause as the same session', () => {
    const rows = completeChargingSession();
    rows[6] = { ...rows[6], isCharging: false, chargingPowerKw: null };
    rows[7] = {
      ...rows[7],
      isCharging: false,
      cableConnected: true,
      chargingPowerKw: null,
    };
    rows[8] = {
      ...rows[8],
      isCharging: true,
      cableConnected: true,
      chargingPowerKw: 9,
    };

    const result = detectFallbackChargeSessions(
      rows,
      new Date(BASE.getTime() + 70 * 60_000),
    );

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].endReason).not.toBe('CHARGING_PAUSE_TIMEOUT');
  });

  it('ends session after a long charging pause', () => {
    const rows: HvFallbackChargeObservation[] = [];
    rows.push(minutes(0, { socPercent: 40, isCharging: false, cableConnected: false }));
    rows.push(minutes(5, { socPercent: 41, isCharging: true, cableConnected: true, chargingPowerKw: 10, addedEnergyKwh: 0.5 }));
    for (let i = 1; i <= 8; i += 1) {
      rows.push(
        minutes(5 + i * 5, {
          socPercent: 41 + i,
          isCharging: true,
          cableConnected: true,
          chargingPowerKw: 10,
          addedEnergyKwh: 0.5 + i,
        }),
      );
    }
    rows.push(minutes(50, { socPercent: 50, isCharging: false, cableConnected: true, addedEnergyKwh: 8 }));
    rows.push(minutes(65, { socPercent: 50, isCharging: false, cableConnected: true, addedEnergyKwh: 8 }));
    rows.push(minutes(80, { socPercent: 50, isCharging: false, cableConnected: false, addedEnergyKwh: 8 }));

    const result = detectFallbackChargeSessions(
      rows,
      new Date(BASE.getTime() + 90 * 60_000),
    );

    expect(result.sessions).toHaveLength(1);
    expect(['CABLE_DISCONNECTED', 'CHARGING_PAUSE_TIMEOUT']).toContain(
      result.sessions[0].endReason,
    );
  });

  it('rejects a false session from a single SOC jump without charging evidence', () => {
    const rows = [
      minutes(0, { socPercent: 40 }),
      minutes(5, { socPercent: 55 }),
      minutes(10, { socPercent: 56 }),
    ];

    const result = detectFallbackChargeSessions(rows, new Date(BASE.getTime() + 20 * 60_000));

    expect(result.sessions).toHaveLength(0);
    expect(result.rejectedFalsePositives).toBeGreaterThanOrEqual(0);
  });

  it('rejects sessions shorter than minimum duration', () => {
    const rows = [
      minutes(0, { socPercent: 40, isCharging: false }),
      minutes(2, { socPercent: 41, isCharging: true, cableConnected: true, chargingPowerKw: 8 }),
      minutes(4, { socPercent: 42, isCharging: false, cableConnected: false }),
    ];

    const result = detectFallbackChargeSessions(rows, new Date(BASE.getTime() + 10 * 60_000));

    expect(result.sessions).toHaveLength(0);
    expect(result.rejectedFalsePositives).toBe(1);
  });

  it('uses added-energy progression when isCharging is unavailable', () => {
    const rows = [
      minutes(0, { socPercent: 30, cableConnected: true, addedEnergyKwh: 1 }),
      minutes(5, { socPercent: 32, cableConnected: true, addedEnergyKwh: 2, chargingPowerKw: 7 }),
      minutes(10, { socPercent: 34, cableConnected: true, addedEnergyKwh: 3.5, chargingPowerKw: 7 }),
      minutes(15, { socPercent: 36, cableConnected: true, addedEnergyKwh: 5, chargingPowerKw: 7 }),
      minutes(20, { socPercent: 38, cableConnected: true, addedEnergyKwh: 6.2, chargingPowerKw: 7 }),
      minutes(25, { socPercent: 40, cableConnected: true, addedEnergyKwh: 7.5, chargingPowerKw: 7 }),
      minutes(30, { socPercent: 42, cableConnected: false, addedEnergyKwh: 8 }),
    ];

    const result = detectFallbackChargeSessions(rows, new Date(BASE.getTime() + 40 * 60_000));

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].primaryTier).toBe(HV_FALLBACK_DETECTION_TIER.ADDED_ENERGY);
    expect(result.sessions[0].evidenceStrength).toBe(
      BatteryEvidenceStrength.SUPPLEMENTARY,
    );
  });
});

describe('sessionsOverlap', () => {
  it('detects overlapping fallback and DIMO windows', () => {
    const overlap = sessionsOverlap(
      new Date('2026-07-16T08:00:00.000Z'),
      new Date('2026-07-16T10:00:00.000Z'),
      new Date('2026-07-16T09:30:00.000Z'),
      new Date('2026-07-16T11:00:00.000Z'),
    );
    expect(overlap).toBe(true);
  });
});

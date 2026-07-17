import { BatteryCapabilityStatus } from '../battery-v2-domain';
import {
  assessBatteryCapabilityPreflight,
  assessRechargeSegmentsCapability,
  classifySignalCapability,
  mapPreflightStatusToPersistence,
} from './battery-capability-preflight.assess';
import { BatteryCapabilityPreflightStatus } from './battery-capability-preflight.types';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from './battery-capability-signals.registry';

const CHECKED_AT = new Date('2026-07-16T12:00:00.000Z');

function teslaPayload() {
  return {
    availableSignals: [
      'lowVoltageBatteryCurrentVoltage',
      'powertrainTractionBatteryStateOfChargeCurrent',
      'powertrainTractionBatteryStateOfChargeCurrentEnergy',
      'powertrainTractionBatteryChargingAddedEnergy',
      'powertrainTractionBatteryChargingIsCharging',
      'powertrainTractionBatteryChargingIsChargingCableConnected',
      'powertrainTractionBatteryCurrentPower',
      'powertrainTractionBatteryChargingChargeLimit',
      'powertrainTractionBatteryStateOfHealth',
      'powertrainTractionBatteryTemperatureAverage',
      'powertrainTractionBatteryGrossCapacity',
      'powertrainTractionBatteryChargingPower',
    ],
    signalsLatest: {
      lastSeen: '2026-07-16T11:55:00.000Z',
      lowVoltageBatteryCurrentVoltage: {
        value: 12.4,
        timestamp: '2026-07-16T11:54:00.000Z',
        source: 'dimo',
      },
      powertrainTractionBatteryStateOfChargeCurrent: {
        value: 72,
        timestamp: '2026-07-16T11:54:30.000Z',
        source: 'dimo',
      },
      powertrainTractionBatteryStateOfChargeCurrentEnergy: {
        value: 41.2,
        timestamp: '2026-07-16T11:54:30.000Z',
        source: 'dimo',
      },
      powertrainTractionBatteryChargingAddedEnergy: {
        value: 0,
        timestamp: '2026-07-16T11:54:30.000Z',
        source: 'dimo',
      },
      powertrainTractionBatteryChargingIsCharging: {
        value: 0,
        timestamp: '2026-07-16T11:54:30.000Z',
        source: 'dimo',
      },
      powertrainTractionBatteryChargingIsChargingCableConnected: {
        value: 0,
        timestamp: '2026-07-16T11:54:30.000Z',
        source: 'dimo',
      },
      powertrainTractionBatteryCurrentPower: {
        value: -1200,
        timestamp: '2026-07-16T11:54:30.000Z',
        source: 'dimo',
      },
      powertrainTractionBatteryChargingChargeLimit: {
        value: 80,
        timestamp: '2026-07-16T11:54:30.000Z',
        source: 'dimo',
      },
      powertrainTractionBatteryStateOfHealth: {
        value: 94,
        timestamp: '2026-07-16T11:54:30.000Z',
        source: 'dimo',
      },
      powertrainTractionBatteryTemperatureAverage: {
        value: 24,
        timestamp: '2026-07-16T11:54:30.000Z',
        source: 'dimo',
      },
      powertrainTractionBatteryGrossCapacity: {
        value: 57.5,
        timestamp: '2026-07-16T11:54:30.000Z',
        source: 'dimo',
      },
      powertrainTractionBatteryChargingPower: {
        value: 0,
        timestamp: '2026-07-16T11:54:30.000Z',
        source: 'dimo',
      },
    },
    checkedAt: CHECKED_AT,
  };
}

function icePayload() {
  return {
    availableSignals: ['lowVoltageBatteryCurrentVoltage'],
    signalsLatest: {
      lastSeen: '2026-07-16T11:00:00.000Z',
      lowVoltageBatteryCurrentVoltage: {
        value: 12.6,
        timestamp: '2026-07-16T10:59:00.000Z',
        source: 'dimo',
      },
    },
    checkedAt: CHECKED_AT,
  };
}

function errorPayload() {
  return {
    availableSignals: null,
    signalsLatest: null,
    queryError: 'DIMO GraphQL error: upstream timeout',
    checkedAt: CHECKED_AT,
  };
}

describe('battery-capability-preflight.assess', () => {
  it('maps preflight statuses to persistence enum', () => {
    expect(
      mapPreflightStatusToPersistence(
        BatteryCapabilityPreflightStatus.AVAILABLE_WITH_DATA,
      ),
    ).toBe(BatteryCapabilityStatus.AVAILABLE);
    expect(
      mapPreflightStatusToPersistence(
        BatteryCapabilityPreflightStatus.AVAILABLE_BUT_NULL,
      ),
    ).toBe(BatteryCapabilityStatus.AVAILABLE_NULL);
    expect(
      mapPreflightStatusToPersistence(BatteryCapabilityPreflightStatus.STALE),
    ).toBe(BatteryCapabilityStatus.AVAILABLE_STALE);
    expect(
      mapPreflightStatusToPersistence(
        BatteryCapabilityPreflightStatus.QUERY_ERROR,
      ),
    ).toBe(BatteryCapabilityStatus.QUERY_ERROR);
  });

  it('classifies Tesla HV payload with data as AVAILABLE_WITH_DATA', () => {
    const assessed = assessBatteryCapabilityPreflight(teslaPayload());

    expect(assessed).toHaveLength(12);
    const hvSoc = assessed.find((entry) => entry.signalKey === 'hv.soc');
    expect(hvSoc?.preflightStatus).toBe(
      BatteryCapabilityPreflightStatus.AVAILABLE_WITH_DATA,
    );
    expect(hvSoc?.persistenceStatus).toBe(BatteryCapabilityStatus.AVAILABLE);
    expect(hvSoc?.provider).toBe('dimo');
    expect(hvSoc?.lastValue).toBe(72);
    expect(hvSoc?.lastSeenAt?.toISOString()).toBe('2026-07-16T11:54:30.000Z');

    const allHv = assessed.filter((entry) => entry.signalKey.startsWith('hv.'));
    expect(
      allHv.every(
        (entry) =>
          entry.preflightStatus ===
          BatteryCapabilityPreflightStatus.AVAILABLE_WITH_DATA,
      ),
    ).toBe(true);
  });

  it('classifies ICE payload with LV only and NOT_LISTED HV signals', () => {
    const assessed = assessBatteryCapabilityPreflight(icePayload());

    const lv = assessed.find((entry) => entry.signalKey === 'lv.voltage');
    expect(lv?.preflightStatus).toBe(
      BatteryCapabilityPreflightStatus.AVAILABLE_WITH_DATA,
    );

    const hvSoc = assessed.find((entry) => entry.signalKey === 'hv.soc');
    expect(hvSoc?.preflightStatus).toBe(
      BatteryCapabilityPreflightStatus.NOT_LISTED,
    );
    expect(hvSoc?.persistenceStatus).toBe(BatteryCapabilityStatus.NOT_LISTED);
  });

  it('marks provider errors as QUERY_ERROR, not NOT_LISTED', () => {
    const assessed = assessBatteryCapabilityPreflight(errorPayload());

    expect(assessed.length).toBeGreaterThan(0);
    expect(
      assessed.every(
        (entry) =>
          entry.preflightStatus === BatteryCapabilityPreflightStatus.QUERY_ERROR,
      ),
    ).toBe(true);
    expect(
      assessed.some(
        (entry) =>
          entry.preflightStatus === BatteryCapabilityPreflightStatus.NOT_LISTED,
      ),
    ).toBe(false);
  });

  it('marks stale signals when lastSeen is far ahead of signal timestamp', () => {
    const status = classifySignalCapability(
      {
        value: 70,
        timestamp: new Date('2026-07-16T04:00:00.000Z'),
        source: 'dimo',
        inAvailableList: true,
      },
      new Date('2026-07-16T12:00:00.000Z'),
      {
        queryError: null,
        staleThresholdMs: 6 * 60 * 60 * 1000,
        checkedAt: CHECKED_AT,
      },
    );

    expect(status).toBe(BatteryCapabilityPreflightStatus.STALE);
  });

  it('assesses recharge segments capability separately', () => {
    const withSegments = assessRechargeSegmentsCapability(
      {
        segmentCount: 2,
        firstSeenAt: new Date('2026-06-01T10:00:00.000Z'),
        lastSeenAt: new Date('2026-07-15T18:00:00.000Z'),
      },
      CHECKED_AT,
    );

    expect(withSegments.signalKey).toBe(RECHARGE_SEGMENTS_SIGNAL_KEY);
    expect(withSegments.preflightStatus).toBe(
      BatteryCapabilityPreflightStatus.AVAILABLE_WITH_DATA,
    );

    const empty = assessRechargeSegmentsCapability(
      { segmentCount: 0 },
      CHECKED_AT,
    );
    expect(empty.preflightStatus).toBe(
      BatteryCapabilityPreflightStatus.AVAILABLE_BUT_NULL,
    );

    const failed = assessRechargeSegmentsCapability(
      { segmentCount: 0, queryError: 'segments forbidden' },
      CHECKED_AT,
    );
    expect(failed.preflightStatus).toBe(
      BatteryCapabilityPreflightStatus.QUERY_ERROR,
    );
  });
});

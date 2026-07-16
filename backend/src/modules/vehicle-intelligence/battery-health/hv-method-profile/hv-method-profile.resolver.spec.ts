import { TESLA_HV_AUDIT_SIGNALS_LATEST } from '../../../dimo/mappers/dimo-battery-signal.fixtures';
import { BatteryCapabilityStatus } from '../battery-v2-domain';
import {
  assessBatteryCapabilityPreflight,
  assessRechargeSegmentsCapability,
  mapPreflightStatusToPersistence,
} from '../capability-preflight/battery-capability-preflight.assess';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '../capability-preflight/battery-capability-signals.registry';
import { resolveHvMethodProfile } from './hv-method-profile.resolver';
import type { HvMethodProfileCapabilityInput } from './hv-method-profile.types';

const CHECKED_AT = new Date('2026-07-16T13:03:44.000Z');
const VEHICLE_ID = '68868291-5478-42cd-b0c4-cc77b2a78e21';

/** KS FH 660E audit §5 — signals present in availableSignals. */
const KS_FH_660E_AVAILABLE_SIGNALS = [
  'powertrainTractionBatteryStateOfChargeCurrent',
  'powertrainTractionBatteryStateOfChargeCurrentEnergy',
  'powertrainTractionBatteryChargingAddedEnergy',
  'powertrainTractionBatteryChargingIsCharging',
  'powertrainTractionBatteryChargingIsChargingCableConnected',
  'powertrainTractionBatteryCurrentPower',
  'powertrainTractionBatteryChargingChargeLimit',
  'powertrainRange',
  'speed',
  'exteriorAirTemperature',
  'powertrainTransmissionTravelledDistance',
] as const;

function toCapabilityInputs(
  assessed: Array<{
    signalKey: string;
    persistenceStatus: BatteryCapabilityStatus;
    lastSeenAt: Date | null;
    sourceTimestamp: Date | null;
    lastValue: number | null;
  }>,
  checkedAt: Date,
): HvMethodProfileCapabilityInput[] {
  return assessed.map((row) => ({
    signalKey: row.signalKey,
    status: row.persistenceStatus,
    checkedAt,
    lastSeenAt: row.lastSeenAt,
    sourceTimestamp: row.sourceTimestamp,
    lastValue: row.lastValue,
  }));
}

function buildKsFh660eCapabilities(): HvMethodProfileCapabilityInput[] {
  const assessed = assessBatteryCapabilityPreflight({
    availableSignals: [...KS_FH_660E_AVAILABLE_SIGNALS],
    signalsLatest: TESLA_HV_AUDIT_SIGNALS_LATEST as Record<string, unknown>,
    checkedAt: CHECKED_AT,
  }).filter((row) => row.signalKey.startsWith('hv.'));

  const recharge = assessRechargeSegmentsCapability(
    {
      segmentCount: 8,
      firstSeenAt: new Date('2026-06-20T08:00:00.000Z'),
      lastSeenAt: new Date('2026-07-16T10:00:00.000Z'),
    },
    CHECKED_AT,
  );

  return [
    ...toCapabilityInputs(assessed, CHECKED_AT),
    {
      signalKey: recharge.signalKey,
      status: mapPreflightStatusToPersistence(recharge.preflightStatus),
      checkedAt: CHECKED_AT,
      lastSeenAt: recharge.lastSeenAt,
      sourceTimestamp: recharge.sourceTimestamp,
      lastValue: recharge.lastValue,
    },
  ];
}

function buildIceCapabilities(): HvMethodProfileCapabilityInput[] {
  return [
    {
      signalKey: 'hv.soc',
      status: BatteryCapabilityStatus.NOT_LISTED,
      checkedAt: CHECKED_AT,
    },
    {
      signalKey: 'hv.current_energy',
      status: BatteryCapabilityStatus.NOT_LISTED,
      checkedAt: CHECKED_AT,
    },
    {
      signalKey: RECHARGE_SEGMENTS_SIGNAL_KEY,
      status: BatteryCapabilityStatus.NOT_LISTED,
      checkedAt: CHECKED_AT,
    },
  ];
}

function buildProviderSohBevCapabilities(): HvMethodProfileCapabilityInput[] {
  return [
    {
      signalKey: 'hv.soc',
      status: BatteryCapabilityStatus.AVAILABLE,
      checkedAt: CHECKED_AT,
      lastSeenAt: CHECKED_AT,
      sourceTimestamp: CHECKED_AT,
      lastValue: 82,
    },
    {
      signalKey: 'hv.current_energy',
      status: BatteryCapabilityStatus.AVAILABLE,
      checkedAt: CHECKED_AT,
      lastSeenAt: CHECKED_AT,
      sourceTimestamp: CHECKED_AT,
      lastValue: 45,
    },
    {
      signalKey: 'hv.added_energy',
      status: BatteryCapabilityStatus.AVAILABLE,
      checkedAt: CHECKED_AT,
      lastSeenAt: CHECKED_AT,
      sourceTimestamp: CHECKED_AT,
      lastValue: 12,
    },
    {
      signalKey: RECHARGE_SEGMENTS_SIGNAL_KEY,
      status: BatteryCapabilityStatus.AVAILABLE,
      checkedAt: CHECKED_AT,
      lastSeenAt: CHECKED_AT,
      sourceTimestamp: CHECKED_AT,
      lastValue: 5,
    },
    {
      signalKey: 'hv.provider_soh',
      status: BatteryCapabilityStatus.AVAILABLE,
      checkedAt: CHECKED_AT,
      lastSeenAt: CHECKED_AT,
      sourceTimestamp: CHECKED_AT,
      lastValue: 91,
    },
    {
      signalKey: 'hv.gross_capacity',
      status: BatteryCapabilityStatus.AVAILABLE,
      checkedAt: CHECKED_AT,
      lastSeenAt: CHECKED_AT,
      sourceTimestamp: CHECKED_AT,
      lastValue: 77,
    },
    {
      signalKey: 'hv.charging_power',
      status: BatteryCapabilityStatus.AVAILABLE,
      checkedAt: CHECKED_AT,
      lastSeenAt: CHECKED_AT,
      sourceTimestamp: CHECKED_AT,
      lastValue: 11,
    },
    {
      signalKey: 'hv.pack_temperature',
      status: BatteryCapabilityStatus.AVAILABLE,
      checkedAt: CHECKED_AT,
      lastSeenAt: CHECKED_AT,
      sourceTimestamp: CHECKED_AT,
      lastValue: 28,
    },
    {
      signalKey: 'hv.current_power',
      status: BatteryCapabilityStatus.AVAILABLE,
      checkedAt: CHECKED_AT,
      lastSeenAt: CHECKED_AT,
      sourceTimestamp: CHECKED_AT,
      lastValue: 8500,
    },
    {
      signalKey: 'hv.is_charging',
      status: BatteryCapabilityStatus.AVAILABLE,
      checkedAt: CHECKED_AT,
      lastSeenAt: CHECKED_AT,
      sourceTimestamp: CHECKED_AT,
      lastValue: 1,
    },
    {
      signalKey: 'hv.cable_connected',
      status: BatteryCapabilityStatus.AVAILABLE,
      checkedAt: CHECKED_AT,
      lastSeenAt: CHECKED_AT,
      sourceTimestamp: CHECKED_AT,
      lastValue: 1,
    },
  ];
}

describe('hv-method-profile.resolver', () => {
  it('matches KS FH 660E audit capability profile', () => {
    const profile = resolveHvMethodProfile({
      vehicleId: VEHICLE_ID,
      capabilities: buildKsFh660eCapabilities(),
      now: CHECKED_AT,
    });

    expect(profile.socAvailable).toBe(true);
    expect(profile.currentEnergyAvailable).toBe(true);
    expect(profile.addedEnergyAvailable).toBe(true);
    expect(profile.rechargeSegmentsAvailable).toBe(true);
    expect(profile.isChargingAvailable).toBe(true);
    expect(profile.chargingCableConnectedAvailable).toBe(true);
    expect(profile.currentPowerAvailable).toBe(true);
    expect(profile.providerSohAvailable).toBe(false);
    expect(profile.packTemperatureAvailable).toBe(false);
    expect(profile.grossCapacityAvailable).toBe(false);
    expect(profile.chargingPowerAvailable).toBe(false);
    expect(profile.supportedCapacityMethods).toEqual([
      'M2_CURRENT_ENERGY_SOC',
      'M3_ADDED_ENERGY_DELTA_SOC',
      'SESSION_CHARGE_CAPACITY',
    ]);
    expect(
      profile.unsupportedReasons.some(
        (row) =>
          row.signalKey === 'hv.provider_soh' &&
          row.code === 'signal_not_listed',
      ),
    ).toBe(true);
    expect(profile.lastCheckedAt).toBe(CHECKED_AT.toISOString());
    expect(profile.dataQuality.decisionCapable).toBe(true);
  });

  it('marks ICE vehicles without HV telemetry as unsupported', () => {
    const profile = resolveHvMethodProfile({
      vehicleId: 'veh-ice-1',
      capabilities: buildIceCapabilities(),
      now: CHECKED_AT,
    });

    expect(profile.socAvailable).toBe(false);
    expect(profile.currentEnergyAvailable).toBe(false);
    expect(profile.rechargeSegmentsAvailable).toBe(false);
    expect(profile.supportedCapacityMethods).toEqual([]);
    expect(profile.unsupportedReasons.length).toBeGreaterThan(0);
    expect(profile.dataQuality.status).toBe('UNAVAILABLE');
  });

  it('supports provider SOH and gross capacity methods when signals exist', () => {
    const profile = resolveHvMethodProfile({
      vehicleId: 'veh-bev-provider-soh',
      capabilities: buildProviderSohBevCapabilities(),
      now: CHECKED_AT,
    });

    expect(profile.providerSohAvailable).toBe(true);
    expect(profile.grossCapacityAvailable).toBe(true);
    expect(profile.chargingPowerAvailable).toBe(true);
    expect(profile.packTemperatureAvailable).toBe(true);
    expect(profile.supportedCapacityMethods).toEqual([
      'M2_CURRENT_ENERGY_SOC',
      'M3_ADDED_ENERGY_DELTA_SOC',
      'PROVIDER_HV_SOH',
      'SESSION_CHARGE_CAPACITY',
      'GROSS_CAPACITY_REFERENCE',
    ]);
  });

  it('does not perform capacity calculation — only method eligibility', () => {
    const profile = resolveHvMethodProfile({
      vehicleId: VEHICLE_ID,
      capabilities: buildKsFh660eCapabilities(),
      now: CHECKED_AT,
    });

    expect(profile).not.toHaveProperty('estimatedCapacityKwh');
    expect(profile).not.toHaveProperty('sohPercent');
    expect(profile.supportedCapacityMethods.length).toBeGreaterThan(0);
  });
});

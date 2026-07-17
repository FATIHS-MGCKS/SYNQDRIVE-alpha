import {
  mapDimoBatterySignals,
  resolveLvBatteryObservedAt,
  toHvBatterySignalObservedAt,
  toVlsBatteryFields,
} from './dimo-battery-signal.mapper';
import {
  HV_CHARGING_POWER_KW_SIGNAL,
  HV_CURRENT_POWER_WRONG_UNIT_SIGNAL,
  ICE_LV_AUDIT_SIGNALS_LATEST,
  TESLA_HV_AUDIT_SIGNALS_LATEST,
} from './dimo-battery-signal.fixtures';

describe('mapDimoBatterySignals', () => {
  it('maps Tesla HV audit payload with per-signal timestamps and units', () => {
    const map = mapDimoBatterySignals(TESLA_HV_AUDIT_SIGNALS_LATEST);

    expect(map.collectionLastSeenAt?.toISOString()).toBe(
      '2026-07-16T13:00:08.000Z',
    );
    expect(map.evSoc).toMatchObject({
      value: 73.82,
      status: 'valid',
      sourceUnit: 'percent',
      targetUnit: 'percent',
      observedAt: new Date('2026-07-16T12:59:35.000Z'),
    });
    expect(map.tractionBatteryCurrentEnergyKwh).toMatchObject({
      value: 41.38,
      status: 'valid',
      sourceUnit: 'kWh',
      targetUnit: 'kWh',
      observedAt: new Date('2026-07-16T12:59:14.000Z'),
    });
    expect(map.tractionBatteryAddedEnergyKwh).toMatchObject({
      value: 16.08,
      status: 'valid',
      observedAt: new Date('2026-07-16T12:58:13.000Z'),
    });
    expect(map.tractionBatteryIsCharging).toMatchObject({
      value: false,
      status: 'valid',
      observedAt: new Date('2026-07-16T12:58:13.000Z'),
    });
    expect(map.tractionBatteryChargingCableConnected).toMatchObject({
      value: false,
      status: 'valid',
    });
    expect(map.tractionBatteryPowerKw).toMatchObject({
      value: 0,
      status: 'valid',
      sourceUnit: 'W',
      targetUnit: 'kW',
    });
    expect(map.tractionBatteryChargeLimitPercent).toMatchObject({
      value: 100,
      status: 'valid',
      sourceUnit: 'percent',
    });
    expect(map.tractionBatterySohPercent.status).toBe('missing');
    expect(map.tractionBatteryChargingPowerKw.status).toBe('missing');
    expect(map.lvBatteryVoltage.status).toBe('missing');
  });

  it('does not treat current energy as consumed energy in VLS fields', () => {
    const fields = toVlsBatteryFields(
      mapDimoBatterySignals(TESLA_HV_AUDIT_SIGNALS_LATEST),
    );

    expect(fields.tractionBatteryCurrentEnergyKwh).toBe(41.38);
    expect(fields.evSoc).toBe(73.82);
  });

  it('converts CurrentPower from W to kW without scaling ChargingPower', () => {
    const map = mapDimoBatterySignals({
      ...TESLA_HV_AUDIT_SIGNALS_LATEST,
      powertrainTractionBatteryCurrentPower: {
        timestamp: '2026-07-16T12:58:13.000Z',
        value: 8500,
      },
      powertrainTractionBatteryChargingPower: HV_CHARGING_POWER_KW_SIGNAL,
    });

    expect(map.tractionBatteryPowerKw).toMatchObject({
      value: 8.5,
      status: 'valid',
      sourceUnit: 'W',
      targetUnit: 'kW',
    });
    expect(map.tractionBatteryChargingPowerKw).toMatchObject({
      value: 11.2,
      status: 'valid',
      sourceUnit: 'kW',
      targetUnit: 'kW',
    });
  });

  it('marks unknown declared units as unsupported instead of converting', () => {
    const map = mapDimoBatterySignals({
      ...TESLA_HV_AUDIT_SIGNALS_LATEST,
      powertrainTractionBatteryCurrentPower: HV_CURRENT_POWER_WRONG_UNIT_SIGNAL,
    });

    expect(map.tractionBatteryPowerKw).toMatchObject({
      value: null,
      status: 'unsupported_unit',
      sourceUnit: 'W',
    });
  });

  it('preserves provider timestamps separately from collection lastSeen', () => {
    const observed = toHvBatterySignalObservedAt(
      mapDimoBatterySignals(TESLA_HV_AUDIT_SIGNALS_LATEST),
    );

    expect(observed.soc?.toISOString()).toBe('2026-07-16T12:59:35.000Z');
    expect(observed.currentEnergyKwh?.toISOString()).toBe(
      '2026-07-16T12:59:14.000Z',
    );
    expect(observed.addedEnergyKwh?.toISOString()).toBe(
      '2026-07-16T12:58:13.000Z',
    );
    expect(observed.soc?.toISOString()).not.toBe(
      TESLA_HV_AUDIT_SIGNALS_LATEST.lastSeen,
    );
  });

  it('maps ICE LV voltage with per-signal observedAt', () => {
    const map = mapDimoBatterySignals(ICE_LV_AUDIT_SIGNALS_LATEST);

    expect(map.lvBatteryVoltage).toMatchObject({
      value: 12.41,
      status: 'valid',
      sourceUnit: 'V',
      observedAt: new Date('2026-07-16T08:14:58.000Z'),
    });
    expect(resolveLvBatteryObservedAt(map)?.toISOString()).toBe(
      '2026-07-16T08:14:58.000Z',
    );
    expect(map.evSoc.status).toBe('missing');
  });

  it('rejects boolean signals outside 0/1', () => {
    const map = mapDimoBatterySignals({
      ...TESLA_HV_AUDIT_SIGNALS_LATEST,
      powertrainTractionBatteryChargingIsCharging: {
        timestamp: '2026-07-16T12:58:13.000Z',
        value: 2,
      },
    });

    expect(map.tractionBatteryIsCharging).toMatchObject({
      value: null,
      status: 'invalid_value',
    });
  });
});

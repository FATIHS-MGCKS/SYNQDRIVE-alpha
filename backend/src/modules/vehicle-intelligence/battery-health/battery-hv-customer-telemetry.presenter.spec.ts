import {
  isVerifiedHvReferenceCapacity,
  presentHvCustomerTelemetryFields,
  resolveCustomerHvNominalCapacityKwh,
} from './battery-hv-customer-telemetry.presenter';

describe('battery-hv-customer-telemetry.presenter', () => {
  const raw = {
    socPercent: 87,
    rangeKm: 278,
    currentEnergyKwh: 50,
    grossCapacityKwhFromTelemetry: 76,
    addedEnergyKwh: 6,
    chargingPowerKw: 11,
    currentVoltageV: 351,
    temperatureC: 24,
    isCharging: true,
    chargingCableConnected: true,
    providerSohPercent: 82,
  };

  it('masks all carrier-bound dynamic fields when observation is stale', () => {
    const presented = presentHvCustomerTelemetryFields({
      raw,
      carrierObservationFresh: false,
      providerSohObservationFresh: false,
    });
    expect(presented).toEqual({
      socPercent: null,
      rangeKm: null,
      currentEnergyKwh: null,
      grossCapacityKwh: null,
      addedEnergyKwh: null,
      chargingPowerKw: null,
      currentVoltageV: null,
      temperatureC: null,
      isCharging: null,
      chargingCableConnected: null,
      providerSohPercent: null,
    });
  });

  it('preserves fresh carrier telemetry and gates provider SOH separately', () => {
    const presented = presentHvCustomerTelemetryFields({
      raw,
      carrierObservationFresh: true,
      providerSohObservationFresh: false,
    });
    expect(presented.socPercent).toBe(87);
    expect(presented.currentEnergyKwh).toBe(50);
    expect(presented.providerSohPercent).toBeNull();
  });

  it('uses verified reference capacity instead of legacy nominal fallback', () => {
    const reference = {
      id: 'ref-1',
      capacityKwh: 77.5,
      capacityType: 'GROSS',
      source: 'DOCUMENT',
      verificationStatus: 'VERIFIED',
      verifiedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(isVerifiedHvReferenceCapacity(reference)).toBe(true);
    expect(
      resolveCustomerHvNominalCapacityKwh({
        referenceCapacity: reference,
        legacyNominalCapacityKwh: 60,
        telemetryGrossCapacityKwh: 76,
        carrierObservationFresh: false,
      }),
    ).toBe(77.5);
    expect(
      resolveCustomerHvNominalCapacityKwh({
        referenceCapacity: null,
        legacyNominalCapacityKwh: 60,
        telemetryGrossCapacityKwh: 76,
        carrierObservationFresh: false,
      }),
    ).toBeNull();
  });
});

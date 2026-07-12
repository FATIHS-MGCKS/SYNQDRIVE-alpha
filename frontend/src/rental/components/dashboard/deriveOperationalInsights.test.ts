import { describe, expect, it } from 'vitest';
import { deriveOperationalInsights } from './deriveOperationalInsights';

const baseInput = {
  locale: 'de',
  vehicles: [{ id: 'v1' }, { id: 'v2' }] as never[],
  fleetById: new Map(),
  pickupItems: [],
  returnItems: [],
  healthAlerts: [],
  healthMap: new Map(),
  telemetry: {
    hasReliableTimestamps: false,
    softOfflineCount: 0,
    offlineCount: 0,
    staleCount: 0,
    freshCount: 0,
    totalInScope: 0,
  },
  fleetLoading: false,
  todayBookingsLoaded: true,
};

describe('deriveOperationalInsights', () => {
  it('emits critical tariff insight when unassigned vehicles exist', () => {
    const items = deriveOperationalInsights({
      ...baseInput,
      unassignedTariffVehicleCount: 3,
      unassignedTariffVehicles: [
        { id: 'v1', label: 'KS MX 2024 · Mercedes-Benz C 63 AMG 2018' },
        { id: 'v2', label: 'KS MS 661 · Audi A4 2016' },
        { id: 'v3', label: 'KS FH 660E · Tesla Model 3 2023' },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'derived-vehicles-without-tariff',
      severity: 'critical',
      cta: 'open-price-tariffs',
    });
    expect(items[0].affectedVehicles).toHaveLength(3);
    expect(items[0].title).toContain('3');
  });

  it('skips tariff insight while fleet or bookings are still loading', () => {
    expect(
      deriveOperationalInsights({
        ...baseInput,
        fleetLoading: true,
        unassignedTariffVehicleCount: 2,
      }),
    ).toHaveLength(0);

    expect(
      deriveOperationalInsights({
        ...baseInput,
        todayBookingsLoaded: false,
        unassignedTariffVehicleCount: 2,
      }),
    ).toHaveLength(0);
  });
});

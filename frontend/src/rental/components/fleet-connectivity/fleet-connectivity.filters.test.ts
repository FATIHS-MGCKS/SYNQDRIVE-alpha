import { describe, expect, it } from 'vitest';
import type { FleetConnectivityListItem } from '../../../lib/api';
import {
  filterFleetConnectivityItems,
  matchesKpiFilter,
} from './fleet-connectivity.filters';

function item(
  partial: Partial<FleetConnectivityListItem> & {
    vehicleId: string;
    overallState?: FleetConnectivityListItem['overallState'];
  },
): FleetConnectivityListItem {
  return {
    vehicle: {
      vehicleId: partial.vehicleId,
      licensePlate: partial.vehicle?.licensePlate ?? 'M-AB 123',
      make: partial.vehicle?.make ?? 'VW',
      model: partial.vehicle?.model ?? 'Golf',
      year: partial.vehicle?.year ?? 2022,
      station: partial.vehicle?.station ?? null,
    },
    overallState: partial.overallState ?? 'TELEMETRY_ACTIVE',
    telemetryState: partial.telemetryState ?? 'live',
    attentionState: partial.attentionState ?? 'NONE',
    lastTelemetryAt: partial.lastTelemetryAt ?? new Date().toISOString(),
    primaryReasonCode: partial.primaryReasonCode ?? null,
    recommendedAction: partial.recommendedAction ?? 'NONE',
    requiresAction: partial.requiresAction ?? false,
    sortPriority: partial.sortPriority ?? 70,
  };
}

describe('fleet-connectivity.filters', () => {
  it('filters action required including soft-offline and offline', () => {
    const rows = [
      item({ vehicleId: '1', overallState: 'TELEMETRY_ACTIVE' }),
      item({ vehicleId: '2', overallState: 'OFFLINE', requiresAction: true }),
      item({ vehicleId: '3', overallState: 'SOFT_OFFLINE', requiresAction: true }),
      item({ vehicleId: '4', overallState: 'DEVICE_UNPLUGGED', attentionState: 'CRITICAL' }),
    ];
    const filtered = filterFleetConnectivityItems(rows, {
      search: '',
      kpiFilter: 'action_required',
      stateFilter: 'all',
    });
    expect(filtered.map((r) => r.vehicle.vehicleId)).toEqual(['2', '3', '4']);
  });

  it('filters telemetry active KPI', () => {
    const rows = [
      item({ vehicleId: '1', overallState: 'TELEMETRY_ACTIVE' }),
      item({ vehicleId: '2', overallState: 'STANDBY' }),
    ];
    expect(
      filterFleetConnectivityItems(rows, {
        search: '',
        kpiFilter: 'telemetry_active',
        stateFilter: 'all',
      }),
    ).toHaveLength(1);
  });

  it('matches no data source KPI', () => {
    const row = item({ vehicleId: '1', overallState: 'NO_ACTIVE_DATA_SOURCE' });
    expect(matchesKpiFilter(row, 'no_data_source')).toBe(true);
    expect(matchesKpiFilter(row, 'telemetry_active')).toBe(false);
  });

  it('searches by plate and station', () => {
    const rows = [
      item({
        vehicleId: '1',
        vehicle: {
          vehicleId: '1',
          licensePlate: 'B-XY 99',
          make: 'BMW',
          model: 'i3',
          year: 2021,
          station: 'Airport',
        },
      }),
      item({ vehicleId: '2' }),
    ];
    const filtered = filterFleetConnectivityItems(rows, {
      search: 'airport',
      kpiFilter: 'all',
      stateFilter: 'all',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].vehicle.vehicleId).toBe('1');
  });
});

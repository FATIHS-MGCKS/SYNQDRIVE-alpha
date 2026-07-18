import { describe, expect, it } from 'vitest';
import type { StationFleetReadModel } from '../../lib/api';
import {
  fleetHasAnyVehicles,
  fleetSearchIsActive,
  formatFleetConfirmationAt,
  formatFleetStationRef,
  mergeFleetGroupPage,
} from './station-fleet-read-model.utils';

function modelFixture(overrides: Partial<StationFleetReadModel> = {}): StationFleetReadModel {
  return {
    version: 1,
    stationId: 'station-a',
    organizationId: 'org-a',
    evaluatedAt: '2026-07-18T12:00:00.000Z',
    search: null,
    groupFilter: null,
    groups: [
      {
        key: 'on_site',
        total: 1,
        vehicles: [],
        pagination: { page: 1, pageSize: 10, totalPages: 1 },
      },
      {
        key: 'home_fleet_away',
        total: 0,
        vehicles: [],
        pagination: { page: 1, pageSize: 10, totalPages: 1 },
      },
      {
        key: 'foreign_on_site',
        total: 0,
        vehicles: [],
        pagination: { page: 1, pageSize: 10, totalPages: 1 },
      },
      {
        key: 'expected',
        total: 0,
        vehicles: [],
        pagination: { page: 1, pageSize: 10, totalPages: 1 },
      },
      {
        key: 'currently_rented',
        total: 0,
        vehicles: [],
        pagination: { page: 1, pageSize: 10, totalPages: 1 },
      },
    ],
    scope: { applied: false, mode: 'ALL_STATIONS' },
    frontendRecomputation: false,
    ...overrides,
  };
}

describe('station-fleet-read-model.utils', () => {
  it('formats station refs with code', () => {
    expect(formatFleetStationRef({ id: 's1', name: 'Berlin', code: 'BER' })).toBe('Berlin (BER)');
    expect(formatFleetStationRef(null)).toBe('—');
  });

  it('detects active search state', () => {
    expect(fleetSearchIsActive(' golf ')).toBe(true);
    expect(fleetSearchIsActive('')).toBe(false);
  });

  it('detects whether any fleet group has vehicles', () => {
    expect(fleetHasAnyVehicles(modelFixture())).toBe(true);
    expect(
      fleetHasAnyVehicles(
        modelFixture({
          groups: modelFixture().groups.map((group) => ({ ...group, total: 0 })),
        }),
      ),
    ).toBe(false);
  });

  it('merges paginated group updates into the existing model', () => {
    const current = modelFixture();
    const incoming = modelFixture({
      groups: current.groups.map((group) =>
        group.key === 'on_site'
          ? {
              ...group,
              pagination: { page: 2, pageSize: 10, totalPages: 2 },
              vehicles: [
                {
                  id: 'vehicle-2',
                  licensePlate: 'B-XY 1',
                  make: 'VW',
                  model: 'Polo',
                  vehicleName: null,
                  runtimeState: 'AVAILABLE',
                  runtimeStateLabel: 'Available',
                  homeStation: { id: 'station-a', name: 'Berlin', code: 'BER' },
                  currentStation: { id: 'station-a', name: 'Berlin', code: 'BER' },
                  expectedStation: null,
                  positionSource: 'MANUAL',
                  lastConfirmationAt: null,
                  nextAction: null,
                  group: 'on_site',
                },
              ],
            }
          : group,
      ),
    });

    const merged = mergeFleetGroupPage(current, incoming, 'on_site');
    expect(merged.groups.find((group) => group.key === 'on_site')?.pagination.page).toBe(2);
    expect(merged.groups.find((group) => group.key === 'on_site')?.vehicles[0]?.licensePlate).toBe('B-XY 1');
  });

  it('formats confirmation timestamps in locale', () => {
    const label = formatFleetConfirmationAt('2026-07-18T10:00:00.000Z', 'en-GB');
    expect(label).not.toBe('—');
  });
});

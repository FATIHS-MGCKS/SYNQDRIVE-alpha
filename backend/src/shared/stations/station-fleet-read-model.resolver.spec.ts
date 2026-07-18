import { VehicleStatus } from '@prisma/client';
import { describe, expect, it } from '@jest/globals';
import { StationFleetGroupKey } from './station-fleet-read-model.contract';
import {
  classifyStationFleetGroup,
  resolveStationFleetReadModel,
  type StationFleetResolverVehicle,
} from './station-fleet-read-model.resolver';

const STATION = 'station-a';
const OTHER = 'station-b';

function vehicle(
  overrides: Partial<StationFleetResolverVehicle> = {},
): StationFleetResolverVehicle {
  return {
    id: 'vehicle-1',
    vehicleName: null,
    make: 'VW',
    model: 'Golf',
    licensePlate: 'B-AB 1234',
    status: VehicleStatus.AVAILABLE,
    homeStationId: STATION,
    currentStationId: STATION,
    expectedStationId: null,
    currentStationSource: 'MANUAL',
    currentStationConfirmedAt: '2026-07-18T10:00:00.000Z',
    ...overrides,
  };
}

const directory = new Map([
  [STATION, { id: STATION, name: 'Berlin', code: 'BER' }],
  [OTHER, { id: OTHER, name: 'Munich', code: 'MUC' }],
]);

describe('station-fleet-read-model.resolver', () => {
  it('classifies home fleet on site', () => {
    expect(classifyStationFleetGroup(vehicle(), STATION)).toBe(StationFleetGroupKey.ON_SITE);
  });

  it('classifies foreign vehicles on site separately', () => {
    expect(
      classifyStationFleetGroup(
        vehicle({
          id: 'foreign-1',
          homeStationId: OTHER,
          currentStationId: STATION,
        }),
        STATION,
      ),
    ).toBe(StationFleetGroupKey.FOREIGN_ON_SITE);
  });

  it('classifies home fleet away from station', () => {
    expect(
      classifyStationFleetGroup(
        vehicle({
          currentStationId: OTHER,
        }),
        STATION,
      ),
    ).toBe(StationFleetGroupKey.HOME_FLEET_AWAY);
  });

  it('classifies expected arrivals that are not yet on site', () => {
    expect(
      classifyStationFleetGroup(
        vehicle({
          currentStationId: OTHER,
          expectedStationId: STATION,
        }),
        STATION,
      ),
    ).toBe(StationFleetGroupKey.EXPECTED);
  });

  it('classifies currently rented home fleet away from station', () => {
    expect(
      classifyStationFleetGroup(
        vehicle({
          status: VehicleStatus.RENTED,
          currentStationId: OTHER,
          expectedStationId: null,
        }),
        STATION,
      ),
    ).toBe(StationFleetGroupKey.CURRENTLY_RENTED);
  });

  it('builds grouped read model without mixing vehicles across groups', () => {
    const model = resolveStationFleetReadModel({
      organizationId: 'org-a',
      stationId: STATION,
      evaluatedAt: '2026-07-18T12:00:00.000Z',
      stationDirectory: directory,
      vehicles: [
        vehicle({ id: 'on-site' }),
        vehicle({
          id: 'away',
          currentStationId: OTHER,
        }),
        vehicle({
          id: 'foreign',
          homeStationId: OTHER,
          currentStationId: STATION,
        }),
        vehicle({
          id: 'expected',
          currentStationId: OTHER,
          expectedStationId: STATION,
        }),
        vehicle({
          id: 'rented',
          status: VehicleStatus.RENTED,
          currentStationId: OTHER,
        }),
      ],
    });

    const totals = Object.fromEntries(model.groups.map((group) => [group.key, group.total]));
    expect(totals).toEqual({
      on_site: 1,
      home_fleet_away: 1,
      foreign_on_site: 1,
      expected: 1,
      currently_rented: 1,
    });
    expect(model.groups.flatMap((group) => group.vehicles).map((row) => row.group)).toEqual([
      'on_site',
      'home_fleet_away',
      'foreign_on_site',
      'expected',
      'currently_rented',
    ]);
  });

  it('applies search and pagination within groups', () => {
    const model = resolveStationFleetReadModel({
      organizationId: 'org-a',
      stationId: STATION,
      evaluatedAt: '2026-07-18T12:00:00.000Z',
      stationDirectory: directory,
      search: 'golf',
      page: 1,
      pageSize: 1,
      groupFilter: StationFleetGroupKey.ON_SITE,
      vehicles: [
        vehicle({ id: 'one', licensePlate: 'B-GO 1' }),
        vehicle({ id: 'two', licensePlate: 'B-XY 2', model: 'Polo' }),
      ],
    });

    expect(model.groups).toHaveLength(1);
    expect(model.groups[0]?.total).toBe(1);
    expect(model.groups[0]?.vehicles).toHaveLength(1);
    expect(model.groups[0]?.vehicles[0]?.id).toBe('one');
  });
});

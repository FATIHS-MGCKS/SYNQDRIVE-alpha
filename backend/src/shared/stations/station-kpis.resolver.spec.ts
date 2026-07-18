import { VehicleStatus } from '@prisma/client';
import { StationCapacityStatus } from './station-capacity-policy.contract';
import {
  StationKpiReasonCode,
  type StationKpiBookingSnapshot,
  type StationKpiTransferSnapshot,
  type StationKpiVehicleSnapshot,
} from './station-kpis.contract';
import { getStationKpisContractMetadata, resolveStationKpis } from './station-kpis.resolver';

const STATION_ID = 'station-a';
const OTHER_STATION = 'station-b';
const EVALUATED_AT = '2026-07-18T14:30:00.000Z';
const TZ = 'Europe/Berlin';

function vehicle(
  overrides: Partial<StationKpiVehicleSnapshot> & { id: string },
): StationKpiVehicleSnapshot {
  return {
    homeStationId: STATION_ID,
    currentStationId: STATION_ID,
    expectedStationId: null,
    status: VehicleStatus.AVAILABLE,
    ...overrides,
  };
}

function booking(
  overrides: Partial<StationKpiBookingSnapshot> & { id: string },
): StationKpiBookingSnapshot {
  return {
    status: 'CONFIRMED',
    pickupStationId: STATION_ID,
    returnStationId: STATION_ID,
    startDate: '2026-07-18T08:00:00.000Z',
    endDate: '2026-07-18T18:00:00.000Z',
    ...overrides,
  };
}

function transfer(
  overrides: Partial<StationKpiTransferSnapshot> & { id: string },
): StationKpiTransferSnapshot {
  return {
    fromStationId: OTHER_STATION,
    toStationId: STATION_ID,
    status: 'PLANNED',
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<Parameters<typeof resolveStationKpis>[0]> = {},
) {
  return {
    stationId: STATION_ID,
    timezone: TZ,
    evaluatedAt: EVALUATED_AT,
    configuredCapacity: 10,
    scope: {
      applied: true,
      mode: 'SCOPED_STATIONS' as const,
      stationId: STATION_ID,
    },
    vehicles: [],
    bookings: [],
    transfers: [],
    openOperationalTasksCount: 0,
    ...overrides,
  };
}

describe('station-kpis.resolver', () => {
  it('exposes canonical metric names and deprecates bookedVehicles', () => {
    const metadata = getStationKpisContractMetadata();
    expect(metadata.metrics).toContain('homeFleetCount');
    expect(metadata.metrics).toContain('currentlyRentedHomeVehicles');
    expect(metadata.deprecatedMetricNames).toEqual(['bookedVehicles']);
    expect(metadata.todayBasis).toBe('station.timezone');
  });

  it('computes home fleet and on-site presence KPIs from runtime vehicle state', () => {
    const result = resolveStationKpis(
      baseInput({
        vehicles: [
          vehicle({ id: 'v1' }),
          vehicle({
            id: 'v2',
            homeStationId: OTHER_STATION,
            currentStationId: STATION_ID,
          }),
          vehicle({
            id: 'v3',
            homeStationId: STATION_ID,
            currentStationId: OTHER_STATION,
            status: VehicleStatus.RENTED,
          }),
          vehicle({
            id: 'v4',
            homeStationId: STATION_ID,
            currentStationId: null,
            expectedStationId: STATION_ID,
          }),
        ],
      }),
    );

    expect(result.metrics.homeFleetCount).toEqual(
      expect.objectContaining({ value: 3, known: true }),
    );
    expect(result.metrics.currentOnSiteCount.value).toBe(2);
    expect(result.metrics.foreignVehiclesOnSiteCount.value).toBe(1);
    expect(result.metrics.expectedArrivalCount.value).toBe(1);
    expect(result.metrics.currentlyRentedHomeVehicles.value).toBe(1);
    expect(result.metrics.currentlyRentedHomeVehicles.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: StationKpiReasonCode.DEPRECATED_BOOKED_VEHICLES,
        }),
      ]),
    );
  });

  it('computes ready and blocked on-site counts from vehicle runtime status', () => {
    const result = resolveStationKpis(
      baseInput({
        vehicles: [
          vehicle({ id: 'v1', status: VehicleStatus.AVAILABLE }),
          vehicle({ id: 'v2', status: VehicleStatus.IN_SERVICE }),
          vehicle({
            id: 'v3',
            status: VehicleStatus.OUT_OF_SERVICE,
            currentStationId: STATION_ID,
          }),
          vehicle({
            id: 'v4',
            status: VehicleStatus.RENTED,
            currentStationId: STATION_ID,
          }),
        ],
      }),
    );

    expect(result.metrics.readyToRentOnSite.value).toBe(1);
    expect(result.metrics.blockedOrMaintenanceOnSite.value).toBe(2);
  });

  it('uses station timezone for pickupsToday and returnsToday', () => {
    const result = resolveStationKpis(
      baseInput({
        bookings: [
          booking({
            id: 'b1',
            pickupStationId: STATION_ID,
            returnStationId: OTHER_STATION,
            startDate: '2026-07-18T06:00:00.000Z',
            endDate: '2026-07-19T18:00:00.000Z',
          }),
          booking({
            id: 'b2',
            pickupStationId: STATION_ID,
            returnStationId: OTHER_STATION,
            startDate: '2026-07-17T22:30:00.000Z',
            endDate: '2026-07-19T18:00:00.000Z',
            status: 'CANCELLED',
          }),
          booking({
            id: 'b3',
            pickupStationId: OTHER_STATION,
            returnStationId: STATION_ID,
            endDate: '2026-07-18T20:00:00.000Z',
          }),
          booking({
            id: 'b4',
            pickupStationId: OTHER_STATION,
            returnStationId: OTHER_STATION,
            endDate: '2026-07-18T20:00:00.000Z',
          }),
        ],
      }),
    );

    expect(result.calendarDay).toBe('2026-07-18');
    expect(result.metrics.pickupsToday.value).toBe(1);
    expect(result.metrics.returnsToday.value).toBe(1);
    expect(result.metrics.pickupsToday.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: StationKpiReasonCode.STATION_TIMEZONE_USED }),
      ]),
    );
  });

  it('counts overdue active returns for the station', () => {
    const result = resolveStationKpis(
      baseInput({
        bookings: [
          booking({
            id: 'overdue',
            status: 'ACTIVE',
            returnStationId: STATION_ID,
            endDate: '2026-07-18T10:00:00.000Z',
          }),
          booking({
            id: 'future-active',
            status: 'ACTIVE',
            returnStationId: STATION_ID,
            endDate: '2026-07-18T20:00:00.000Z',
          }),
        ],
      }),
    );

    expect(result.metrics.overdueReturns.value).toBe(1);
  });

  it('counts incoming and outgoing active transfers', () => {
    const result = resolveStationKpis(
      baseInput({
        transfers: [
          transfer({ id: 'in-1' }),
          transfer({
            id: 'in-done',
            status: 'COMPLETED',
          }),
          transfer({
            id: 'out-1',
            fromStationId: STATION_ID,
            toStationId: OTHER_STATION,
          }),
        ],
      }),
    );

    expect(result.metrics.incomingTransfers.value).toBe(1);
    expect(result.metrics.outgoingTransfers.value).toBe(1);
  });

  it('marks missing snapshots as unknown partial data', () => {
    const result = resolveStationKpis(
      baseInput({
        vehicles: null,
        bookings: null,
        transfers: null,
        openOperationalTasksCount: null,
      }),
    );

    expect(result.metrics.homeFleetCount.known).toBe(false);
    expect(result.metrics.pickupsToday.known).toBe(false);
    expect(result.metrics.incomingTransfers.known).toBe(false);
    expect(result.metrics.openOperationalTasks.known).toBe(false);
    expect(result.metrics.homeFleetCount.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: StationKpiReasonCode.VEHICLE_SNAPSHOT_MISSING }),
      ]),
    );
  });

  it('derives capacityStatus from capacity policy', () => {
    const result = resolveStationKpis(
      baseInput({
        configuredCapacity: 2,
        vehicles: [
          vehicle({ id: 'v1' }),
          vehicle({ id: 'v2', homeStationId: OTHER_STATION, currentStationId: STATION_ID }),
        ],
      }),
    );

    expect(result.metrics.capacityStatus.known).toBe(true);
    expect(result.metrics.capacityStatus.value).toBe(StationCapacityStatus.FULL);
  });

  it('records scope context on the result envelope', () => {
    const result = resolveStationKpis(
      baseInput({
        scope: {
          applied: true,
          mode: 'ALL_STATIONS',
          stationId: STATION_ID,
        },
      }),
    );

    expect(result.scope).toEqual({
      applied: true,
      mode: 'ALL_STATIONS',
      stationId: STATION_ID,
    });
    expect(result.deprecatedAliases.bookedVehicles).toBeNull();
  });
});

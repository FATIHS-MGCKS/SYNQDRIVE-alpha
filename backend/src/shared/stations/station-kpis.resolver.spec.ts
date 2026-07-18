import { CleaningStatus, VehicleStatus } from '@prisma/client';
import { StationCapacityStatus } from './station-capacity-policy.contract';
import {
  StationKpiReasonCode,
  type StationKpiBookingSnapshot,
  type StationKpiTransferSnapshot,
  type StationKpiVehicleRuntimeSnapshot,
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

function runtimeSnapshot(
  overrides: Partial<StationKpiVehicleRuntimeSnapshot> & { vehicleId: string },
): StationKpiVehicleRuntimeSnapshot {
  const { vehicleId, ...rest } = overrides;
  return {
    vehicleId,
    vehicleStatus: VehicleStatus.AVAILABLE,
    cleaningStatus: CleaningStatus.CLEAN,
    operational: {
      token: 'AVAILABLE',
      reason: null,
      dataQualityState: 'RELIABLE',
      dataQualityReasons: [],
      isReliable: true,
      maintenanceReason: null,
    },
    telemetry: {
      lastSignalAt: EVALUATED_AT,
      signalAgeMs: 60_000,
    },
    health: null,
    ...rest,
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
    vehicleRuntime: [],
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
    expect(metadata.metrics).toContain('notReadyOnSite');
    expect(metadata.metrics).toContain('vehiclesWithHealthWarningsOnSite');
    expect(metadata.deprecatedMetricNames).toEqual(['bookedVehicles']);
    expect(metadata.vehicleTruth).toBe('vehicle_runtime_state_engine');
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
        vehicleRuntime: [
          runtimeSnapshot({ vehicleId: 'v1' }),
          runtimeSnapshot({ vehicleId: 'v2' }),
          runtimeSnapshot({ vehicleId: 'v3' }),
          runtimeSnapshot({ vehicleId: 'v4' }),
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
  });

  it('computes on-site runtime breakdown from canonical runtime snapshots', () => {
    const result = resolveStationKpis(
      baseInput({
        vehicles: [
          vehicle({ id: 'ready', currentStationId: STATION_ID }),
          vehicle({
            id: 'dirty',
            currentStationId: STATION_ID,
            status: VehicleStatus.AVAILABLE,
          }),
          vehicle({
            id: 'maintenance',
            currentStationId: STATION_ID,
            status: VehicleStatus.IN_SERVICE,
          }),
        ],
        vehicleRuntime: [
          runtimeSnapshot({ vehicleId: 'ready' }),
          runtimeSnapshot({
            vehicleId: 'dirty',
            cleaningStatus: CleaningStatus.NEEDS_CLEANING,
          }),
          runtimeSnapshot({
            vehicleId: 'maintenance',
            vehicleStatus: VehicleStatus.IN_SERVICE,
            operational: {
              token: 'MAINTENANCE',
              reason: 'SCHEDULED_SERVICE',
              dataQualityState: 'RELIABLE',
              dataQualityReasons: [],
              isReliable: true,
              maintenanceReason: 'SCHEDULED_SERVICE',
            },
          }),
        ],
      }),
    );

    expect(result.metrics.readyToRentOnSite.value).toBe(1);
    expect(result.metrics.notReadyOnSite.value).toBe(1);
    expect(result.metrics.blockedOrMaintenanceOnSite.value).toBe(1);
    expect(result.metrics.warningOnSite.value).toBe(1);
    expect(result.metrics.criticalOnSite.value).toBe(1);
  });

  it('does not count home-fleet-only vehicles in on-site runtime KPIs', () => {
    const result = resolveStationKpis(
      baseInput({
        vehicles: [
          vehicle({
            id: 'home-only',
            homeStationId: STATION_ID,
            currentStationId: OTHER_STATION,
          }),
        ],
        vehicleRuntime: [runtimeSnapshot({ vehicleId: 'home-only' })],
      }),
    );

    expect(result.metrics.readyToRentOnSite.value).toBe(0);
    expect(result.metrics.notReadyOnSite.value).toBe(0);
    expect(result.metrics.blockedOrMaintenanceOnSite.value).toBe(0);
  });

  it('marks runtime KPIs partial when runtime snapshots are missing for on-site vehicles', () => {
    const result = resolveStationKpis(
      baseInput({
        vehicles: [vehicle({ id: 'v1', currentStationId: STATION_ID })],
        vehicleRuntime: [],
      }),
    );

    expect(result.metrics.readyToRentOnSite.known).toBe(false);
    expect(result.metrics.readyToRentOnSite.partial).toBe(true);
    expect(result.metrics.readyToRentOnSite.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: StationKpiReasonCode.RUNTIME_STATE_MISSING }),
      ]),
    );
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
        ],
      }),
    );

    expect(result.calendarDay).toBe('2026-07-18');
    expect(result.metrics.pickupsToday.value).toBe(1);
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
          transfer({ id: 'out-1', fromStationId: STATION_ID, toStationId: OTHER_STATION }),
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
        vehicleRuntime: null,
        bookings: null,
        transfers: null,
        openOperationalTasksCount: null,
      }),
    );

    expect(result.metrics.homeFleetCount.known).toBe(false);
    expect(result.metrics.readyToRentOnSite.known).toBe(false);
  });

  it('derives capacityStatus from capacity policy', () => {
    const result = resolveStationKpis(
      baseInput({
        configuredCapacity: 2,
        vehicles: [
          vehicle({ id: 'v1' }),
          vehicle({ id: 'v2', homeStationId: OTHER_STATION, currentStationId: STATION_ID }),
        ],
        vehicleRuntime: [
          runtimeSnapshot({ vehicleId: 'v1' }),
          runtimeSnapshot({ vehicleId: 'v2' }),
        ],
      }),
    );

    expect(result.metrics.capacityStatus.value).toBe(StationCapacityStatus.FULL);
  });
});

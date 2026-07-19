import {
  buildFleetConnectivityKpiSummary,
  computeConnectivitySortPriority,
  mapFleetConnectivityListItem,
  pickPrimaryReasonCode,
  sortFleetConnectivityListItems,
} from './fleet-connectivity-api.mapper';
import { mockConnectivityRuntime } from './connectivity/connectivity-runtime.test-fixture';
import type { FleetConnectivityVehicleDto } from './fleet-connectivity.types';

function vehicleRow(
  overrides: Partial<FleetConnectivityVehicleDto> = {},
): FleetConnectivityVehicleDto {
  const runtime = mockConnectivityRuntime({
    vehicleId: 'v-1',
    overallState: 'TELEMETRY_ACTIVE',
    telemetryState: 'live',
    attentionState: 'NONE',
    reasonCodes: ['TELEMETRY_FRESH'],
    ...overrides.connectivityRuntime,
  });
  return {
    vehicleId: 'v-1',
    vin: 'VIN123',
    licensePlate: 'B-FC 1',
    make: 'VW',
    model: 'Golf',
    year: 2022,
    station: 'Berlin',
    provider: 'DIMO',
    connectionType: 'DIMO',
    sourceType: 'DIMO Platform',
    connectionStatus: 'online',
    telemetryFreshness: 'live',
    statusNote: '',
    lastSeenAt: '2026-07-18T12:00:00.000Z',
    lastSyncedAt: null,
    freshnessLabel: 'Live',
    pairedAt: null,
    hasTelemetry: true,
    odometerKm: 1000,
    latitude: 52.5,
    longitude: 13.4,
    obdIsPluggedIn: null,
    jammingDetectedCount: 0,
    jammingSnapshotNote: null,
    jammingIncidents: [],
    maskedDeviceSerial: null,
    maskedDimoTokenId: null,
    maskedSyntheticTokenId: null,
    readinessScore: 80,
    readinessLevel: 'good',
    signalCoveragePercent: 80,
    coverageState: 'GOOD',
    coveragePercent: 80,
    expectedSignalCount: 6,
    freshSignalCount: 5,
    staleSignalCount: 0,
    missingSignalCount: 1,
    reasonCodes: [],
    signals: {
      gps: 'available',
      odometer: 'available',
      speed: 'available',
      fuel: 'available',
      evSoc: 'missing',
      dtc: 'missing',
      obdPlug: 'unknown',
      jamming: 'unknown',
    },
    deviceSerial: null,
    dimoTokenId: null,
    syntheticTokenId: null,
    online: true,
    deviceConnection: null,
    connectivityRuntime: runtime,
    ...overrides,
  };
}

describe('fleet-connectivity-api.mapper', () => {
  it('sorts incident before active telemetry', () => {
    const active = mapFleetConnectivityListItem(vehicleRow());
    const unplugged = mapFleetConnectivityListItem(
      vehicleRow({
        connectivityRuntime: mockConnectivityRuntime({
          overallState: 'DEVICE_UNPLUGGED',
          telemetryState: 'live',
          attentionState: 'ACTION_REQUIRED',
          reasonCodes: ['DEVICE_UNPLUG_WEBHOOK'],
        }),
      }),
    );
    const sorted = sortFleetConnectivityListItems([active, unplugged]);
    expect(sorted[0].overallState).toBe('DEVICE_UNPLUGGED');
  });

  it('builds KPI summary with action required drilldown counts', () => {
    const items = [
      mapFleetConnectivityListItem(
        vehicleRow({
          connectivityRuntime: mockConnectivityRuntime({
            overallState: 'OFFLINE',
            attentionState: 'ACTION_REQUIRED',
            requiresAction: true,
          }),
        }),
      ),
      mapFleetConnectivityListItem(
        vehicleRow({
          connectivityRuntime: mockConnectivityRuntime({
            overallState: 'SOFT_OFFLINE',
            telemetryState: 'signal_delayed',
            attentionState: 'WATCH',
          }),
        }),
      ),
      mapFleetConnectivityListItem(vehicleRow()),
      mapFleetConnectivityListItem(
        vehicleRow({
          connectivityRuntime: mockConnectivityRuntime({
            overallState: 'STANDBY',
            telemetryState: 'standby',
          }),
        }),
      ),
    ];
    const kpi = buildFleetConnectivityKpiSummary(items);
    expect(kpi.total).toBe(4);
    expect(kpi.actionRequired).toBeGreaterThanOrEqual(2);
    expect(kpi.actionRequiredOffline).toBe(1);
    expect(kpi.actionRequiredSoftOffline).toBe(1);
    expect(kpi.telemetryActive).toBe(1);
    expect(kpi.standby).toBe(1);
  });

  it('picks primary reason by priority', () => {
    expect(
      pickPrimaryReasonCode(['TELEMETRY_FRESH', 'DEVICE_UNPLUG_WEBHOOK']),
    ).toBe('DEVICE_UNPLUG_WEBHOOK');
  });

  it('assigns lower sort priority to critical attention', () => {
    expect(
      computeConnectivitySortPriority('STANDBY', 'CRITICAL'),
    ).toBeLessThan(computeConnectivitySortPriority('TELEMETRY_ACTIVE', 'NONE'));
  });
});

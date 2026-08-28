/**
 * Endpoint-level guarantee: the Master-Admin connectivity diagnostic dimension
 * never reaches a tenant response.
 *
 * `VehicleConnectivityRuntimeState` now carries `diagnostic` internally, so a
 * single careless spread anywhere between the projection and a controller would
 * leak it. These tests drive the real service methods behind the tenant fleet
 * and vehicle-detail endpoints and assert on the serialized payload, rather
 * than trusting the DTO serializer unit test alone.
 */
import { VehiclesService } from '../vehicles.service';
import { FleetMapCacheService } from '../fleet-map-cache.service';
import { mockConnectivityRuntime } from './connectivity-runtime.test-fixture';
import { ConnectivityDiagnosticState } from './domain/connectivity-diagnostic-state';

const ORG = 'org-leak-a';
const VEHICLE = 'veh-leak-a';

/**
 * Every field that must stay Master-Admin-only.
 *
 * `deviceBindingRef` is deliberately absent: it predates this dimension as part
 * of the tenant-facing `evidence` block (`VehicleConnectivityTechnicalEvidence`)
 * and is a same-tenant internal id, not a credential. The admin DTO re-exposes
 * the same value, so it cannot be asserted against here.
 */
const MASTER_ADMIN_ONLY_KEYS = [
  'diagnostic',
  'diagnosticState',
  'providerApiReachable',
  'providerReachable',
  'providerFetchAgeMs',
  'lastProviderFetchAgeMs',
  'observationAgeMs',
  'lastVehicleObservationAgeMs',
  'bindingState',
  'consentState',
  'bindingActive',
  'providerErrorCategory',
  'providerPollEligible',
  'providerPollScheduled',
  'connectivityDiagnostic',
];

/** Diagnostic-only values that must not appear as substrings either. */
const MASTER_ADMIN_ONLY_VALUES = [
  'PROVIDER_REACHABLE_DATA_STALE',
  'PROVIDER_REACHABLE_DATA_FRESH',
  'PROVIDER_UNREACHABLE',
  'AUTH_OR_BINDING_ERROR',
];

function collectKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
    return into;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      into.add(key);
      collectKeys(child, into);
    }
  }
  return into;
}

function expectNoDiagnosticLeak(payload: unknown): void {
  const keys = collectKeys(payload);
  for (const forbidden of MASTER_ADMIN_ONLY_KEYS) {
    expect([...keys]).not.toContain(forbidden);
  }
  const serialized = JSON.stringify(payload);
  for (const forbidden of MASTER_ADMIN_ONLY_VALUES) {
    expect(serialized).not.toContain(forbidden);
  }
}

/** Stale observation + fresh provider fetch — the incident signature. */
function staleRuntime() {
  return mockConnectivityRuntime({
    vehicleId: VEHICLE,
    organizationId: ORG,
    telemetryState: 'signal_delayed',
    overallState: 'SOFT_OFFLINE',
    attentionState: 'WATCH',
    reasonCodes: ['TELEMETRY_SOFT_OFFLINE', 'LINK_ACTIVE'],
    lastTelemetryAt: '2026-08-27T09:00:00.000Z',
    lastProviderObservedAt: '2026-08-27T09:00:00.000Z',
    lastReceivedAt: '2026-08-28T11:59:40.000Z',
    calculatedAt: '2026-08-28T12:00:00.000Z',
    evidence: { providerConnectionStatus: 'CONNECTED', deviceBindingRef: 'binding-1' },
  });
}

const vehicleRow = {
  id: VEHICLE,
  vin: 'WVWZZZ1JZXW000009',
  licensePlate: 'KS MX 2024',
  make: 'VW',
  model: 'ID.4',
  year: 2024,
  organizationId: ORG,
  hardwareType: null,
  dimoVehicleId: 'dimo-1',
  dimoVehicle: {
    tokenId: 190497,
    lastSignal: new Date('2026-08-27T09:00:00.000Z'),
    syncedAt: new Date('2026-08-28T11:59:40.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    rawJson: {},
  },
  latestState: {
    lastSeenAt: new Date('2026-08-27T09:00:00.000Z'),
    sourceTimestamp: new Date('2026-08-27T09:00:00.000Z'),
    providerFetchedAt: new Date('2026-08-28T11:59:40.000Z'),
    providerSource: 'DIMO',
    latitude: 51.3,
    longitude: 9.5,
    speedKmh: 0,
    odometerKm: 12000,
    fuelLevelRelative: null,
    fuelLevelAbsolute: null,
    evSoc: 62,
    obdDtcList: null,
    lastDtcPollAt: null,
    rawPayloadJson: {},
  },
  homeStation: { name: 'Kassel' },
};

function makeService(prisma: Record<string, unknown>): VehiclesService {
  const stub = (): unknown => ({});
  const deviceConnectionQuery = {
    getFleetSummariesForVehicles: jest.fn().mockResolvedValue(new Map()),
    getVehicleSummary: jest.fn().mockResolvedValue({
      vehicleId: VEHICLE,
      lteR1Capable: false,
      lastWebhookReceivedAt: null,
    }),
  };
  const connectivityRuntimeProjection = {
    projectForVehicles: jest
      .fn()
      .mockImplementation(async (_orgId: string, ids: string[]) => {
        const map = new Map();
        for (const id of ids) map.set(id, staleRuntime());
        return map;
      }),
    projectForVehicle: jest.fn().mockResolvedValue(staleRuntime()),
  };

  return new (VehiclesService as unknown as {
    new (...args: unknown[]): VehiclesService;
  })(
    prisma,
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    stub(),
    deviceConnectionQuery,
    stub(),
    connectivityRuntimeProjection,
    stub(),
    stub(),
    new FleetMapCacheService({ del: jest.fn() } as never),
    stub(),
  );
}

describe('connectivity diagnostic — tenant endpoint isolation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('the runtime carries the diagnostic dimension (guards against a vacuous test)', () => {
    expect(staleRuntime().diagnostic.state).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
    );
  });

  it('tenant fleet connectivity response leaks no diagnostic internals', async () => {
    const service = makeService({
      vehicle: { findMany: jest.fn().mockResolvedValue([vehicleRow]) },
    });

    const res = await service.getFleetConnectivity(ORG, {});

    expect(res.vehicles).toHaveLength(1);
    expect(res.vehicles[0].connectivityRuntime.telemetryState).toBe('signal_delayed');
    expectNoDiagnosticLeak(res);
  });

  it('tenant vehicle connectivity detail response leaks no diagnostic internals', async () => {
    const service = makeService({
      vehicle: { findFirst: jest.fn().mockResolvedValue(vehicleRow) },
    });

    const detail = await service.getFleetConnectivityDetail(ORG, VEHICLE);

    expect(detail.telemetryState).toBe('signal_delayed');
    expectNoDiagnosticLeak(detail);
  });

  it('tenant device connection response leaks no diagnostic internals', async () => {
    const service = makeService({ vehicle: { findFirst: jest.fn() } });

    const res = await service.getDeviceConnection(ORG, VEHICLE);

    expectNoDiagnosticLeak(res);
  });

  it('the Master Admin diagnostics response does expose the dimension', async () => {
    const service = makeService({
      vehicle: { findFirst: jest.fn().mockResolvedValue(vehicleRow) },
    });

    const res = await service.getFleetConnectivityAdminDiagnostics(ORG, VEHICLE);

    expect(res.connectivityDiagnostic.diagnosticState).toBe(
      ConnectivityDiagnosticState.PROVIDER_REACHABLE_DATA_STALE,
    );
    expect(res.connectivityDiagnostic.providerApiReachable).toBe(true);
    expect(res.connectivityDiagnostic.lastVehicleObservationAt).toBe(
      '2026-08-27T09:00:00.000Z',
    );
    expect(res.connectivityDiagnostic.lastProviderFetchAt).toBe(
      '2026-08-28T11:59:40.000Z',
    );
    // Same tenant detail contract, plus the extra block.
    expect(res.telemetryState).toBe('signal_delayed');
  });

  it('admin diagnostics stay org-scoped — a foreign org lookup finds nothing', async () => {
    const findFirst = jest
      .fn()
      .mockImplementation(async (args: { where: { organizationId: string } }) =>
        args.where.organizationId === ORG ? vehicleRow : null,
      );
    const service = makeService({ vehicle: { findFirst } });

    await expect(
      service.getFleetConnectivityAdminDiagnostics('org-other', VEHICLE),
    ).rejects.toThrow('Vehicle not found');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: VEHICLE, organizationId: 'org-other' },
      }),
    );
  });
});

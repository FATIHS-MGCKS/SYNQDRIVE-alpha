import { DrivingCapabilityStatus } from '@prisma/client';
import { DimoAvailableSignalsPreflightService } from './dimo-available-signals-preflight.service';
import {
  DIMO_CAPABILITY_PREFLIGHT_VERSION,
  DIMO_PREFLIGHT_MIN_INTERVAL_MS,
} from './dimo-preflight-classifier.config';
import { DRIVING_CAPABILITY_PROVIDER } from './vehicle-driving-capability.types';

function makePrisma() {
  return {
    vehicle: { findFirst: jest.fn() },
  } as any;
}

function makeRepository() {
  return {
    findByVehicle: jest.fn(),
    upsertProbe: jest.fn(),
  } as any;
}

function makeDimoAuth() {
  return {
    getVehicleJwt: jest.fn(),
  } as any;
}

function makeDimoTelemetry() {
  return {
    queryGraphQL: jest.fn(),
  } as any;
}

describe('DimoAvailableSignalsPreflightService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repository: ReturnType<typeof makeRepository>;
  let dimoAuth: ReturnType<typeof makeDimoAuth>;
  let dimoTelemetry: ReturnType<typeof makeDimoTelemetry>;
  let service: DimoAvailableSignalsPreflightService;

  beforeEach(() => {
    prisma = makePrisma();
    repository = makeRepository();
    dimoAuth = makeDimoAuth();
    dimoTelemetry = makeDimoTelemetry();
    service = new DimoAvailableSignalsPreflightService(
      prisma,
      repository,
      dimoAuth,
      dimoTelemetry,
    );
  });

  it('uses a 7-day minimum interval — not 30 seconds', () => {
    expect(DIMO_PREFLIGHT_MIN_INTERVAL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(DIMO_PREFLIGHT_MIN_INTERVAL_MS).toBeGreaterThan(30_000);
  });

  it('skips when recent preflight probes exist within min interval', async () => {
    repository.findByVehicle.mockResolvedValue([
      {
        providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
        capabilityVersion: DIMO_CAPABILITY_PREFLIGHT_VERSION,
        checkedAt: new Date(),
      },
    ]);

    const result = await service.runPreflightIfStale('org-1', 'vehicle-1');
    expect(result.ran).toBe(false);
    expect(result.skippedReason).toBe('preflight_not_stale');
    expect(dimoAuth.getVehicleJwt).not.toHaveBeenCalled();
  });

  it('runs preflight and persists probes for LTE_R1 ICE vehicle', async () => {
    repository.findByVehicle.mockResolvedValue([]);
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-ice',
      hardwareType: 'LTE_R1',
      fuelType: 'PETROL',
      dimoVehicle: { tokenId: 192922 },
    });
    dimoAuth.getVehicleJwt.mockResolvedValue('jwt-token');
    dimoTelemetry.queryGraphQL
      .mockResolvedValueOnce({
        data: {
          availableSignals: [
            'speed',
            'powertrainCombustionEngineSpeed',
            'obdThrottlePosition',
            'powertrainTransmissionTravelledDistance',
            'currentLocationAltitude',
            'currentLocationHeading',
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          dataSummary: {
            numberOfSignals: 1000,
            lastSignalSeen: '2026-07-16T10:00:00.000Z',
            eventDataSummary: [
              {
                name: 'behavior.harshAcceleration',
                numberOfEvents: 12,
                firstSeen: '2026-06-01T00:00:00.000Z',
                lastSeen: '2026-07-16T09:00:00.000Z',
              },
            ],
          },
        },
      });
    repository.upsertProbe.mockResolvedValue({ id: 'cap-1' });

    const result = await service.runPreflight('org-1', 'vehicle-ice');

    expect(result.ran).toBe(true);
    expect(result.probesWritten).toBeGreaterThan(0);
    expect(result.capabilityVersion).toBe(DIMO_CAPABILITY_PREFLIGHT_VERSION);
    expect(repository.upsertProbe).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        vehicleId: 'vehicle-ice',
        providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
        capabilityVersion: DIMO_CAPABILITY_PREFLIGHT_VERSION,
        metadata: expect.objectContaining({
          preflightVersion: DIMO_CAPABILITY_PREFLIGHT_VERSION,
        }),
      }),
    );

    const rpmCall = repository.upsertProbe.mock.calls.find(
      (call: any[]) => call[0].signalName === 'powertrainCombustionEngineSpeed',
    );
    expect(rpmCall?.[0].capabilityStatus).toBe(DrivingCapabilityStatus.SUPPORTED);
    expect(rpmCall?.[0].metadata.source).toBe('DIMO_AVAILABLE_SIGNALS');
  });

  it('persists DEGRADED probes when DIMO provider fails', async () => {
    repository.findByVehicle.mockResolvedValue([]);
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-ice',
      hardwareType: 'LTE_R1',
      fuelType: 'PETROL',
      dimoVehicle: { tokenId: 190497 },
    });
    dimoAuth.getVehicleJwt.mockRejectedValue(new Error('DIMO timeout'));

    const result = await service.runPreflight('org-1', 'vehicle-ice');

    expect(result.ran).toBe(true);
    expect(repository.upsertProbe).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityStatus: DrivingCapabilityStatus.DEGRADED,
        metadata: expect.objectContaining({
          providerError: true,
          reason: 'provider_error',
        }),
      }),
    );
  });

  it('skips when vehicle has no DIMO token', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-local',
      hardwareType: 'SMART5',
      fuelType: 'DIESEL',
      dimoVehicle: null,
    });

    const result = await service.runPreflight('org-1', 'vehicle-local');
    expect(result.ran).toBe(false);
    expect(result.skippedReason).toBe('no_dimo_token');
    expect(repository.upsertProbe).not.toHaveBeenCalled();
  });
});

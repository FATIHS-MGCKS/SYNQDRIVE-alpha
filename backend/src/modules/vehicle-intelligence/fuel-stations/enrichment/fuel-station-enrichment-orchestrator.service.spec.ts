import { EnergyEventKind } from '@prisma/client';
import { FuelStationEnrichmentOrchestratorService } from './fuel-station-enrichment-orchestrator.service';
import { FUEL_STATION_RESOLVER_VERSION } from '../fuel-station-location.types';
import { buildFuelStationEnrichmentInputFingerprint } from './fuel-station-enrichment-fingerprint.util';

describe('FuelStationEnrichmentOrchestratorService', () => {
  const prisma = {
    vehicleEnergyEvent: {
      findUnique: jest.fn(),
    },
    vehicleEnergyEventFuelStationEnrichment: {
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const resolver = {
    resolve: jest.fn(),
  };

  const service = new FuelStationEnrichmentOrchestratorService(prisma as never, resolver as never);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  const baseEvent = {
    id: 'evt-1',
    kind: EnergyEventKind.REFUEL,
    startLatitude: 51.31,
    startLongitude: 9.49,
    fuelStationEnrichment: null,
  };

  it('persists NO_COORDINATES without resolver call', async () => {
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue({
      ...baseEvent,
      startLatitude: null,
      startLongitude: null,
    });
    prisma.vehicleEnergyEventFuelStationEnrichment.upsert.mockResolvedValue({
      processingStatus: 'COMPLETED',
      resolutionStatus: 'NO_COORDINATES',
    });

    const result = await service.processEnergyEvent('evt-1');

    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(result.skipped).toBe(false);
    expect(prisma.vehicleEnergyEventFuelStationEnrichment.upsert).toHaveBeenCalled();
  });

  it('skips idempotent NO_COORDINATES with same fingerprint', async () => {
    const noCoordFingerprint = buildFuelStationEnrichmentInputFingerprint({
      energyEventId: 'evt-1',
      latitude: 0,
      longitude: 0,
    });
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue({
      ...baseEvent,
      startLatitude: null,
      startLongitude: null,
      fuelStationEnrichment: {
        processingStatus: 'COMPLETED',
        resolutionStatus: 'NO_COORDINATES',
        inputFingerprint: noCoordFingerprint,
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
      },
    });

    const result = await service.processEnergyEvent('evt-1');

    expect(result.skipped).toBe(true);
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(prisma.vehicleEnergyEventFuelStationEnrichment.upsert).not.toHaveBeenCalled();
  });

  it('runs enrichment when coordinates become valid after NO_COORDINATES', async () => {
    const noCoordFingerprint = buildFuelStationEnrichmentInputFingerprint({
      energyEventId: 'evt-1',
      latitude: 0,
      longitude: 0,
    });
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue({
      ...baseEvent,
      fuelStationEnrichment: {
        processingStatus: 'COMPLETED',
        resolutionStatus: 'NO_COORDINATES',
        inputFingerprint: noCoordFingerprint,
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
      },
    });
    prisma.vehicleEnergyEventFuelStationEnrichment.upsert.mockResolvedValue({});
    resolver.resolve.mockResolvedValue({
      status: 'MATCHED',
      confidence: 'HIGH',
      score: 120,
      station: { osmType: 'node', osmId: '1', name: 'Esso' },
      datasetVersion: 'geofabrik-germany-test',
      resolverVersion: FUEL_STATION_RESOLVER_VERSION,
    });

    await service.processEnergyEvent('evt-1');

    expect(resolver.resolve).toHaveBeenCalled();
  });

  it('skips automatic reprocessing when enrichment is FAILED with same fingerprint', async () => {
    const fingerprint = buildFuelStationEnrichmentInputFingerprint({
      energyEventId: 'evt-1',
      latitude: 51.31,
      longitude: 9.49,
    });
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue({
      ...baseEvent,
      fuelStationEnrichment: {
        processingStatus: 'FAILED',
        resolutionStatus: 'ERROR',
        inputFingerprint: fingerprint,
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
      },
    });

    const result = await service.processEnergyEvent('evt-1');

    expect(result.skipped).toBe(true);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('persists MATCHED HIGH result', async () => {
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue(baseEvent);
    prisma.vehicleEnergyEventFuelStationEnrichment.upsert.mockResolvedValue({});
    resolver.resolve.mockResolvedValue({
      status: 'MATCHED',
      confidence: 'HIGH',
      score: 120,
      station: {
        osmType: 'node',
        osmId: '1',
        name: 'Esso',
        brand: 'Esso',
        latitude: 51.31,
        longitude: 9.49,
        distanceMeters: 5,
      },
      datasetVersion: 'geofabrik-germany-test',
      resolverVersion: FUEL_STATION_RESOLVER_VERSION,
    });

    await service.processEnergyEvent('evt-1');

    expect(resolver.resolve).toHaveBeenCalledWith({ latitude: 51.31, longitude: 9.49 });
    expect(prisma.vehicleEnergyEventFuelStationEnrichment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          resolutionStatus: 'MATCHED',
          matchConfidence: 'HIGH',
          osmDatasetVersion: 'geofabrik-germany-test',
        }),
      }),
    );
  });

  it('persists MATCHED MEDIUM and LOW outcomes', async () => {
    for (const confidence of ['MEDIUM', 'LOW'] as const) {
      jest.resetAllMocks();
      prisma.vehicleEnergyEvent.findUnique.mockResolvedValue(baseEvent);
      prisma.vehicleEnergyEventFuelStationEnrichment.upsert.mockResolvedValue({});
      resolver.resolve.mockResolvedValue({
        status: 'MATCHED',
        confidence,
        score: confidence === 'MEDIUM' ? 80 : 60,
        station: { osmType: 'node', osmId: '1', name: 'Shell' },
        datasetVersion: 'geofabrik-germany-test',
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
      });

      await service.processEnergyEvent('evt-1');

      expect(prisma.vehicleEnergyEventFuelStationEnrichment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ matchConfidence: confidence }),
        }),
      );
    }
  });

  it('persists AMBIGUOUS and NOT_FOUND outcomes', async () => {
    for (const status of ['AMBIGUOUS', 'NOT_FOUND'] as const) {
      jest.resetAllMocks();
      prisma.vehicleEnergyEvent.findUnique.mockResolvedValue(baseEvent);
      prisma.vehicleEnergyEventFuelStationEnrichment.upsert.mockResolvedValue({});
      resolver.resolve.mockResolvedValue({
        status,
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
        datasetVersion: 'geofabrik-germany-test',
      });

      await service.processEnergyEvent('evt-1');

      expect(prisma.vehicleEnergyEventFuelStationEnrichment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ resolutionStatus: status }),
        }),
      );
    }
  });

  it('skips non-REFUEL events', async () => {
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue({
      ...baseEvent,
      kind: EnergyEventKind.RECHARGE,
    });

    const result = await service.processEnergyEvent('evt-1');
    expect(result.skipped).toBe(true);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('skips idempotent completed same fingerprint', async () => {
    const fingerprint = buildFuelStationEnrichmentInputFingerprint({
      energyEventId: 'evt-1',
      latitude: 51.31,
      longitude: 9.49,
    });
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue({
      ...baseEvent,
      fuelStationEnrichment: {
        processingStatus: 'COMPLETED',
        resolutionStatus: 'MATCHED',
        inputFingerprint: fingerprint,
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
      },
    });

    const result = await service.processEnergyEvent('evt-1');
    expect(result.skipped).toBe(true);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('re-resolves when canonical coordinates change', async () => {
    const oldFingerprint = buildFuelStationEnrichmentInputFingerprint({
      energyEventId: 'evt-1',
      latitude: 51.0,
      longitude: 9.0,
    });
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue({
      ...baseEvent,
      fuelStationEnrichment: {
        processingStatus: 'COMPLETED',
        resolutionStatus: 'MATCHED',
        inputFingerprint: oldFingerprint,
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
      },
    });
    prisma.vehicleEnergyEventFuelStationEnrichment.upsert.mockResolvedValue({});
    resolver.resolve.mockResolvedValue({
      status: 'NOT_FOUND',
      resolverVersion: FUEL_STATION_RESOLVER_VERSION,
      datasetVersion: 'geofabrik-germany-test',
    });

    await service.processEnergyEvent('evt-1');
    expect(resolver.resolve).toHaveBeenCalled();
  });

  it('throws on resolver ERROR for retry', async () => {
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue(baseEvent);
    prisma.vehicleEnergyEventFuelStationEnrichment.upsert.mockResolvedValue({
      resolutionStatus: 'ERROR',
      errorMessage: 'dataset unavailable',
    });
    resolver.resolve.mockResolvedValue({
      status: 'ERROR',
      resolverVersion: FUEL_STATION_RESOLVER_VERSION,
      errorMessage: 'dataset unavailable',
    });

    await expect(service.processEnergyEvent('evt-1')).rejects.toThrow('dataset unavailable');
  });

  it('does not skip idempotent when prior ERROR resolution exists', async () => {
    const fingerprint = buildFuelStationEnrichmentInputFingerprint({
      energyEventId: 'evt-1',
      latitude: 51.31,
      longitude: 9.49,
    });
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue({
      ...baseEvent,
      fuelStationEnrichment: {
        processingStatus: 'COMPLETED',
        resolutionStatus: 'ERROR',
        inputFingerprint: fingerprint,
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
      },
    });
    prisma.vehicleEnergyEventFuelStationEnrichment.upsert.mockResolvedValue({
      resolutionStatus: 'MATCHED',
      matchConfidence: 'HIGH',
    });
    resolver.resolve.mockResolvedValue({
      status: 'MATCHED',
      confidence: 'HIGH',
      score: 120,
      station: { osmType: 'node', osmId: '1', name: 'Esso' },
      datasetVersion: 'geofabrik-germany-test',
      resolverVersion: FUEL_STATION_RESOLVER_VERSION,
    });

    await service.processEnergyEvent('evt-1');
    expect(resolver.resolve).toHaveBeenCalled();
  });

  it('marks FAILED after max retries', async () => {
    prisma.vehicleEnergyEventFuelStationEnrichment.upsert.mockResolvedValue({
      processingStatus: 'FAILED',
      resolutionStatus: 'ERROR',
    });

    await service.markFailedAfterMaxRetries('evt-1', 'max retries exceeded');

    expect(prisma.vehicleEnergyEventFuelStationEnrichment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          processingStatus: 'FAILED',
          errorCode: 'WORKER_MAX_RETRIES',
        }),
      }),
    );
  });

  it('concurrent replays keep single upsert path per event', async () => {
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue(baseEvent);
    prisma.vehicleEnergyEventFuelStationEnrichment.upsert.mockResolvedValue({
      processingStatus: 'COMPLETED',
      resolutionStatus: 'MATCHED',
      matchConfidence: 'HIGH',
    });
    resolver.resolve.mockResolvedValue({
      status: 'MATCHED',
      confidence: 'HIGH',
      score: 120,
      station: { osmType: 'node', osmId: '1', name: 'Esso' },
      datasetVersion: 'geofabrik-germany-test',
      resolverVersion: FUEL_STATION_RESOLVER_VERSION,
    });

    await Promise.all([
      service.processEnergyEvent('evt-1'),
      service.processEnergyEvent('evt-1'),
    ]);

    expect(prisma.vehicleEnergyEventFuelStationEnrichment.upsert).toHaveBeenCalled();
    expect(resolver.resolve).toHaveBeenCalled();
  });
});

import { EnergyEventKind, VehicleEnergyEventDetectionSource } from '@prisma/client';
import { ChargingStationEnrichmentOrchestratorService } from './charging-station-enrichment-orchestrator.service';
import { CHARGING_STATION_RESOLVER_VERSION } from '../charging-station-location.types';
import { buildChargingStationEnrichmentInputFingerprint } from './charging-station-enrichment-fingerprint.util';
import { deriveCanonicalChargingStationEnrichmentCoordinate } from './derive-canonical-charging-station-enrichment-coordinate';

describe('ChargingStationEnrichmentOrchestratorService (O1–O14)', () => {
  const prisma = {
    vehicleEnergyEvent: { findUnique: jest.fn() },
    vehicleEnergyEventChargingStationEnrichment: { upsert: jest.fn(), updateMany: jest.fn() },
  };
  const resolver = { resolve: jest.fn() };
  const service = new ChargingStationEnrichmentOrchestratorService(prisma as never, resolver as never);

  beforeEach(() => jest.resetAllMocks());

  const canonicalRecharge = {
    id: 'evt-r1',
    kind: EnergyEventKind.RECHARGE,
    detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
    startLatitude: 50.001,
    startLongitude: 8.001,
    endLatitude: null,
    endLongitude: null,
    chargingStationEnrichment: null,
  };

  it('O1/O2: REFUEL and legacy RECHARGE not eligible', async () => {
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue({
      ...canonicalRecharge,
      kind: EnergyEventKind.REFUEL,
    });
    expect((await service.processEnergyEvent('evt-r1')).skipped).toBe(true);

    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue({
      ...canonicalRecharge,
      detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
    });
    expect((await service.processEnergyEvent('evt-r1')).skipped).toBe(true);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('O3: NO_COORDINATES without resolver', async () => {
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue({
      ...canonicalRecharge,
      startLatitude: null,
      startLongitude: null,
    });
    prisma.vehicleEnergyEventChargingStationEnrichment.upsert.mockResolvedValue({
      processingStatus: 'COMPLETED',
      resolutionStatus: 'NO_COORDINATES',
    });
    await service.processEnergyEvent('evt-r1');
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('O4: INCONSISTENT_COORDINATES without resolver', async () => {
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue({
      ...canonicalRecharge,
      startLatitude: 52,
      startLongitude: 13,
      endLatitude: 53,
      endLongitude: 14,
    });
    prisma.vehicleEnergyEventChargingStationEnrichment.upsert.mockResolvedValue({
      processingStatus: 'COMPLETED',
      resolutionStatus: 'INCONSISTENT_COORDINATES',
    });
    await service.processEnergyEvent('evt-r1');
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it('O8: AMBIGUOUS completes without station assignment', async () => {
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue(canonicalRecharge);
    prisma.vehicleEnergyEventChargingStationEnrichment.upsert.mockResolvedValue({});
    resolver.resolve.mockResolvedValue({
      status: 'AMBIGUOUS',
      resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
      candidates: [{ station: { osmId: '1' } }],
    });
    prisma.vehicleEnergyEventChargingStationEnrichment.upsert.mockResolvedValueOnce({
      processingStatus: 'COMPLETED',
      resolutionStatus: 'AMBIGUOUS',
      osmId: null,
    });
    await service.processEnergyEvent('evt-r1');
    expect(resolver.resolve).toHaveBeenCalled();
  });

  it('O10: resolver ERROR is retryable', async () => {
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue(canonicalRecharge);
    prisma.vehicleEnergyEventChargingStationEnrichment.upsert.mockResolvedValue({});
    resolver.resolve.mockResolvedValue({
      status: 'ERROR',
      errorMessage: 'boom',
      resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
    });
    prisma.vehicleEnergyEventChargingStationEnrichment.upsert.mockResolvedValueOnce({
      processingStatus: 'PROCESSING',
      resolutionStatus: 'ERROR',
      errorMessage: 'boom',
    });
    await expect(service.processEnergyEvent('evt-r1')).rejects.toThrow('boom');
  });

  it('O12/O13: same fingerprint skip; changed fingerprint reprocesses', async () => {
    const outcome = deriveCanonicalChargingStationEnrichmentCoordinate(canonicalRecharge);
    const fingerprint = buildChargingStationEnrichmentInputFingerprint({
      energyEventId: canonicalRecharge.id,
      coordinateOutcome: outcome,
    });
    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue({
      ...canonicalRecharge,
      chargingStationEnrichment: {
        processingStatus: 'COMPLETED',
        resolutionStatus: 'MATCHED',
        inputFingerprint: fingerprint,
        resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
        matchConfidence: 'HIGH',
      },
    });
    expect((await service.processEnergyEvent('evt-r1')).skipped).toBe(true);

    prisma.vehicleEnergyEvent.findUnique.mockResolvedValue({
      ...canonicalRecharge,
      startLatitude: 51,
      chargingStationEnrichment: {
        processingStatus: 'COMPLETED',
        resolutionStatus: 'NO_COORDINATES',
        inputFingerprint: 'old',
        resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
      },
    });
    prisma.vehicleEnergyEventChargingStationEnrichment.upsert.mockResolvedValue({});
    resolver.resolve.mockResolvedValue({
      status: 'MATCHED',
      confidence: 'HIGH',
      resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
      station: { osmType: 'node', osmId: '9', connectors: [{ type: 'type2' }] },
    });
    await service.processEnergyEvent('evt-r1');
    expect(resolver.resolve).toHaveBeenCalled();
  });
});

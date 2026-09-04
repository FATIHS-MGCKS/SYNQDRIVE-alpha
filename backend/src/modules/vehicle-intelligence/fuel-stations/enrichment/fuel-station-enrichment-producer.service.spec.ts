import { FuelStationEnrichmentProducerService } from './fuel-station-enrichment-producer.service';
import { EnergyEventKind } from '@prisma/client';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { buildFuelStationEnrichmentInputFingerprint } from './fuel-station-enrichment-fingerprint.util';
import { FUEL_STATION_RESOLVER_VERSION } from '../fuel-station-location.types';

describe('FuelStationEnrichmentProducerService', () => {
  const queue = {
    getJob: jest.fn(),
    add: jest.fn(),
  };

  const prisma = {
    vehicleEnergyEventFuelStationEnrichment: {
      findUnique: jest.fn(),
    },
  };

  const config = {
    enabled: true,
    cutoverAt: new Date('2026-09-01T00:00:00.000Z'),
    cutoverState: 'valid' as const,
    jobAttempts: 5,
    jobBackoffMs: 10_000,
  };

  const createService = () =>
    new FuelStationEnrichmentProducerService(queue as never, config as never, prisma as never);

  let service: FuelStationEnrichmentProducerService;

  const postCutoverInput = {
    energyEventId: 'evt-1',
    eventStartTime: new Date('2026-09-02T00:00:00.000Z'),
    startLatitude: 51.3,
    startLongitude: 9.5,
  };

  const fingerprint = buildFuelStationEnrichmentInputFingerprint({
    energyEventId: 'evt-1',
    latitude: 51.3,
    longitude: 9.5,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    service = createService();
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    queue.getJob.mockResolvedValue(null);
    queue.add.mockResolvedValue(undefined);
    prisma.vehicleEnergyEventFuelStationEnrichment.findUnique.mockResolvedValue(null);
  });

  it('does not enqueue when feature disabled', async () => {
    const disabled = new FuelStationEnrichmentProducerService(
      queue as never,
      { ...config, enabled: false } as never,
      prisma as never,
    );

    const result = await disabled.enqueueAfterPersist(postCutoverInput);
    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not enqueue when cutover is missing', async () => {
    const noCutover = new FuelStationEnrichmentProducerService(
      queue as never,
      { ...config, cutoverAt: null, cutoverState: 'missing' } as never,
      prisma as never,
    );

    const result = await noCutover.enqueueAfterPersist(postCutoverInput);
    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('K1 allows V2 enqueue when startTime is pre-cutover but observation is post-cutover', async () => {
    const result = await service.enqueueAfterPersist({
      energyEventId: 'evt-v2',
      eventStartTime: new Date('2026-08-20T00:00:00.000Z'),
      eventObservedAt: new Date('2026-09-02T00:00:00.000Z'),
      startLatitude: 51.3,
      startLongitude: 9.5,
      coordinateSource: 'physical_refuel_forecourt_dwell_v2',
      physicalRefuelReconciliationV2: true,
    });

    expect(result).toMatch(/^refuel-station_/);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('K2 keeps legacy startTime cutover behavior for non-V2 enqueue', async () => {
    const result = await service.enqueueAfterPersist({
      ...postCutoverInput,
      eventStartTime: new Date('2026-08-20T00:00:00.000Z'),
    });

    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('K3 rejects V2 enqueue when observation is before cutover', async () => {
    const result = await service.enqueueAfterPersist({
      energyEventId: 'evt-v2',
      eventStartTime: new Date('2026-09-02T00:00:00.000Z'),
      eventObservedAt: new Date('2026-08-20T00:00:00.000Z'),
      startLatitude: 51.3,
      startLongitude: 9.5,
      coordinateSource: 'physical_refuel_forecourt_dwell_v2',
      physicalRefuelReconciliationV2: true,
    });

    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('B8 deduplicates logical enqueue after queue.add succeeds before enrichmentEnqueuedAt update', async () => {
    const first = await service.enqueueAfterPersist({
      ...postCutoverInput,
      eventObservedAt: new Date('2026-09-02T00:00:00.000Z'),
      coordinateSource: 'physical_refuel_forecourt_dwell_v2',
      physicalRefuelReconciliationV2: true,
    });
    expect(first).toMatch(/^refuel-station_/);
    expect(queue.add).toHaveBeenCalledTimes(1);

    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('waiting'),
    });

    const second = await service.enqueueAfterPersist({
      ...postCutoverInput,
      eventObservedAt: new Date('2026-09-02T00:00:00.000Z'),
      coordinateSource: 'physical_refuel_forecourt_dwell_v2',
      physicalRefuelReconciliationV2: true,
    });

    expect(second).toBe(first);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('does not enqueue pre-cutover events by startTime', async () => {
    const result = await service.enqueueAfterPersist({
      ...postCutoverInput,
      eventStartTime: new Date('2026-08-20T00:00:00.000Z'),
    });

    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues post-cutover REFUEL event with deterministic job id', async () => {
    const result = await service.enqueueAfterPersistFromEvent({
      id: 'evt-1',
      startTime: new Date('2026-09-02T00:00:00.000Z'),
      createdAt: new Date('2026-09-02T00:00:00.000Z'),
      startLatitude: 51.3,
      startLongitude: 9.5,
      kind: EnergyEventKind.REFUEL,
    } as never);

    expect(result).toMatch(/^refuel-station_/);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('does not enqueue when DB row is FAILED with same fingerprint', async () => {
    prisma.vehicleEnergyEventFuelStationEnrichment.findUnique.mockResolvedValue({
      processingStatus: 'FAILED',
      inputFingerprint: fingerprint,
      resolverVersion: FUEL_STATION_RESOLVER_VERSION,
    });

    const failedJob = { getState: jest.fn().mockResolvedValue('failed'), remove: jest.fn() };
    queue.getJob.mockResolvedValue(failedJob);

    const result = await service.enqueueAfterPersist(postCutoverInput);

    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
    expect(failedJob.remove).not.toHaveBeenCalled();
  });

  it('does not enqueue when DB row is FAILED even if BullMQ job no longer exists', async () => {
    prisma.vehicleEnergyEventFuelStationEnrichment.findUnique.mockResolvedValue({
      processingStatus: 'FAILED',
      inputFingerprint: fingerprint,
      resolverVersion: FUEL_STATION_RESOLVER_VERSION,
    });
    queue.getJob.mockResolvedValue(null);

    const result = await service.enqueueAfterPersist(postCutoverInput);

    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not enqueue when DB row is COMPLETED with same fingerprint', async () => {
    prisma.vehicleEnergyEventFuelStationEnrichment.findUnique.mockResolvedValue({
      processingStatus: 'COMPLETED',
      resolutionStatus: 'MATCHED',
      inputFingerprint: fingerprint,
      resolverVersion: FUEL_STATION_RESOLVER_VERSION,
    });

    const completedJob = { getState: jest.fn().mockResolvedValue('completed'), remove: jest.fn() };
    queue.getJob.mockResolvedValue(completedJob);

    const result = await service.enqueueAfterPersist(postCutoverInput);

    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
    expect(completedJob.remove).not.toHaveBeenCalled();
  });

  it('permits a new job when coordinates change', async () => {
    prisma.vehicleEnergyEventFuelStationEnrichment.findUnique.mockResolvedValue({
      processingStatus: 'COMPLETED',
      resolutionStatus: 'MATCHED',
      inputFingerprint: fingerprint,
      resolverVersion: FUEL_STATION_RESOLVER_VERSION,
    });

    await service.enqueueAfterPersist({
      ...postCutoverInput,
      startLatitude: 51.31,
      startLongitude: 9.51,
    });

    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('keeps deterministic job id for same resolver input', async () => {
    const first = await service.enqueueAfterPersist(postCutoverInput);
    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('waiting'),
    });
    const second = await service.enqueueAfterPersist(postCutoverInput);

    expect(first).toBe(second);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('suppresses duplicate active jobs with same deterministic id', async () => {
    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('waiting'),
    });

    const first = await service.enqueueAfterPersist(postCutoverInput);
    const second = await service.enqueueAfterPersist(postCutoverInput);

    expect(first).toBe(second);
    expect(queue.add).not.toHaveBeenCalled();
  });
});

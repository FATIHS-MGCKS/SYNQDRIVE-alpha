import { FuelStationEnrichmentProducerService } from './fuel-station-enrichment-producer.service';
import { EnergyEventKind } from '@prisma/client';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';

describe('FuelStationEnrichmentProducerService', () => {
  const queue = {
    getJob: jest.fn(),
    add: jest.fn(),
  };

  const config = {
    enabled: true,
    cutoverAt: new Date('2026-08-31T00:00:00.000Z'),
    jobAttempts: 5,
    jobBackoffMs: 10_000,
  };

  const service = new FuelStationEnrichmentProducerService(queue as never, config as never);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    queue.getJob.mockResolvedValue(null);
    queue.add.mockResolvedValue(undefined);
  });

  it('does not enqueue when feature disabled', async () => {
    const disabled = new FuelStationEnrichmentProducerService(queue as never, {
      ...config,
      enabled: false,
    } as never);

    const result = await disabled.enqueueAfterPersist({
      energyEventId: 'evt-1',
      eventCreatedAt: new Date('2026-09-01T00:00:00.000Z'),
      startLatitude: 51.3,
      startLongitude: 9.5,
    });

    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does not enqueue pre-cutover events', async () => {
    const result = await service.enqueueAfterPersist({
      energyEventId: 'evt-1',
      eventCreatedAt: new Date('2026-08-01T00:00:00.000Z'),
      startLatitude: 51.3,
      startLongitude: 9.5,
    });

    expect(result).toBeNull();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues post-cutover REFUEL event with deterministic job id', async () => {
    const result = await service.enqueueAfterPersistFromEvent({
      id: 'evt-1',
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      startLatitude: 51.3,
      startLongitude: 9.5,
      kind: EnergyEventKind.REFUEL,
    } as never);

    expect(result).toMatch(/^refuel-station_/);
    expect(queue.add).toHaveBeenCalledWith(
      'refuel.station.enrich',
      { energyEventId: 'evt-1' },
      expect.objectContaining({ jobId: expect.any(String), attempts: 5 }),
    );
  });

  it('suppresses duplicate active jobs with same deterministic id', async () => {
    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('waiting'),
    });

    const first = await service.enqueueAfterPersist({
      energyEventId: 'evt-1',
      eventCreatedAt: new Date('2026-09-01T00:00:00.000Z'),
      startLatitude: 51.3,
      startLongitude: 9.5,
    });
    const second = await service.enqueueAfterPersist({
      energyEventId: 'evt-1',
      eventCreatedAt: new Date('2026-09-01T00:00:00.000Z'),
      startLatitude: 51.3,
      startLongitude: 9.5,
    });

    expect(first).toBe(second);
    expect(queue.add).not.toHaveBeenCalled();
  });
});

import { RefuelStationEnrichmentProcessor } from './refuel-station-enrichment.processor';
import { FuelStationEnrichmentOrchestratorService } from '../../modules/vehicle-intelligence/fuel-stations/enrichment/fuel-station-enrichment-orchestrator.service';

describe('RefuelStationEnrichmentProcessor max retries', () => {
  const orchestrator = {
    processEnergyEvent: jest.fn(),
    markFailedAfterMaxRetries: jest.fn(),
  };

  const config = {
    enabled: true,
    jobAttempts: 2,
  };

  const processor = new RefuelStationEnrichmentProcessor(
    orchestrator as unknown as FuelStationEnrichmentOrchestratorService,
    config as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    orchestrator.processEnergyEvent.mockRejectedValue(new Error('resolver down'));
    orchestrator.markFailedAfterMaxRetries.mockResolvedValue(undefined);
  });

  it('marks FAILED after max BullMQ retries', async () => {
    const job = {
      id: 'job-1',
      data: { energyEventId: 'evt-1' },
      attemptsMade: 1,
      opts: { attempts: 2 },
    };

    await expect(processor.process(job as never)).rejects.toThrow('resolver down');
    expect(orchestrator.markFailedAfterMaxRetries).toHaveBeenCalledWith(
      'evt-1',
      'resolver down',
    );
  });

  it('does not mark FAILED before final attempt', async () => {
    const job = {
      id: 'job-1',
      data: { energyEventId: 'evt-1' },
      attemptsMade: 0,
      opts: { attempts: 2 },
    };

    await expect(processor.process(job as never)).rejects.toThrow('resolver down');
    expect(orchestrator.markFailedAfterMaxRetries).not.toHaveBeenCalled();
  });
});

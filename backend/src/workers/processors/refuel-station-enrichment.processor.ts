import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import fuelStationEnrichmentConfig from '@config/fuel-station-enrichment.config';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { FuelStationEnrichmentOrchestratorService } from '../../modules/vehicle-intelligence/fuel-stations/enrichment/fuel-station-enrichment-orchestrator.service';
import type { RefuelStationEnrichmentJobData } from '../../modules/vehicle-intelligence/fuel-stations/enrichment/fuel-station-enrichment.types';

@Processor(QUEUE_NAMES.ENERGY_REFUEL_STATION_ENRICH)
@Injectable()
export class RefuelStationEnrichmentProcessor extends WorkerHost {
  private readonly logger = new Logger(RefuelStationEnrichmentProcessor.name);

  constructor(
    private readonly orchestrator: FuelStationEnrichmentOrchestratorService,
    @Inject(fuelStationEnrichmentConfig.KEY)
    private readonly config: ConfigType<typeof fuelStationEnrichmentConfig>,
  ) {
    super();
  }

  async process(job: Job<RefuelStationEnrichmentJobData>): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug(`Fuel station enrichment worker disabled — skipping job ${job.id}`);
      return;
    }

    const attemptNumber = job.attemptsMade + 1;
    this.logger.log(
      `Fuel station enrichment job started energyEventId=${job.data.energyEventId} attempt=${attemptNumber}`,
    );

    try {
      await this.orchestrator.processEnergyEvent(job.data.energyEventId);
    } catch (error) {
      const isLastAttempt = attemptNumber >= (job.opts.attempts ?? this.config.jobAttempts);
      if (isLastAttempt) {
        await this.orchestrator.markFailedAfterMaxRetries(
          job.data.energyEventId,
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }
  }
}

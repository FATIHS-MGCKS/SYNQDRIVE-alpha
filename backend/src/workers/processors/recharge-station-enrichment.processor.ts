import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigType } from '@nestjs/config';
import chargingStationEnrichmentConfig from '@config/charging-station-enrichment.config';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { ChargingStationEnrichmentOrchestratorService } from '../../modules/vehicle-intelligence/charging-stations/enrichment/charging-station-enrichment-orchestrator.service';
import type { RechargeStationEnrichmentJobData } from '../../modules/vehicle-intelligence/charging-stations/enrichment/charging-station-enrichment.types';
import { ChargingStationEnrichmentMetricsService } from '../../modules/vehicle-intelligence/charging-stations/enrichment/charging-station-enrichment.metrics';
import { Optional } from '@nestjs/common';

@Processor(QUEUE_NAMES.ENERGY_RECHARGE_STATION_ENRICH)
@Injectable()
export class RechargeStationEnrichmentProcessor extends WorkerHost {
  private readonly logger = new Logger(RechargeStationEnrichmentProcessor.name);

  constructor(
    private readonly orchestrator: ChargingStationEnrichmentOrchestratorService,
    @Inject(chargingStationEnrichmentConfig.KEY)
    private readonly config: ConfigType<typeof chargingStationEnrichmentConfig>,
    @Optional() private readonly metrics?: ChargingStationEnrichmentMetricsService,
  ) {
    super();
  }

  async process(job: Job<RechargeStationEnrichmentJobData>): Promise<void> {
    if (!this.config.enabled) {
      this.logger.debug(`Charging station enrichment worker disabled — skipping job ${job.id}`);
      return;
    }

    const attemptNumber = job.attemptsMade + 1;
    this.logger.log(
      `Charging station enrichment job started energyEventId=${job.data.energyEventId} attempt=${attemptNumber}`,
    );

    try {
      const result = await this.orchestrator.processEnergyEvent(job.data.energyEventId);
      if (result.skipped) {
        this.metrics?.recordWorker('skipped', result.reason ?? 'skipped');
      } else {
        this.metrics?.recordWorker('completed', 'ok');
      }
    } catch (error) {
      const isLastAttempt = attemptNumber >= (job.opts.attempts ?? this.config.jobAttempts);
      if (isLastAttempt) {
        await this.orchestrator.markFailedAfterMaxRetries(
          job.data.energyEventId,
          error instanceof Error ? error.message : String(error),
        );
        this.metrics?.recordWorker('failed', 'max_retries');
      } else {
        this.metrics?.recordWorker('retry', 'resolver_error');
      }
      throw error;
    }
  }
}

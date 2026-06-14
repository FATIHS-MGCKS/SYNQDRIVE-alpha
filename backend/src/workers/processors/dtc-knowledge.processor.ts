import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues/queue-names';
import { DtcKnowledgeEnrichmentService } from '@modules/vehicle-intelligence/dtc-knowledge/dtc-knowledge-enrichment.service';
import {
  DtcEnrichmentJobData,
  DTC_ENRICHMENT_JOB,
} from '@modules/vehicle-intelligence/dtc-knowledge/dtc-knowledge.types';

/**
 * BullMQ worker for the DTC Knowledge Base. Two job types on one queue:
 *   • DTC_GENERIC_ENRICHMENT — research a code's generic OBD-II meaning
 *   • DTC_VEHICLE_ENRICHMENT — research the make/model/year-specific reading
 *
 * Enrichment is idempotent (the service skips rows already READY) and never
 * blocks the DTC API — jobs are produced from the detail endpoint and consumed
 * here in the background. Low concurrency to be gentle on the AI/agent layer.
 */
@Processor(QUEUE_NAMES.DTC_KNOWLEDGE_ENRICHMENT, { concurrency: 2 })
@Injectable()
export class DtcKnowledgeProcessor extends WorkerHost {
  private readonly logger = new Logger(DtcKnowledgeProcessor.name);

  constructor(private readonly enrichment: DtcKnowledgeEnrichmentService) {
    super();
  }

  async process(job: Job<DtcEnrichmentJobData>): Promise<void> {
    const data = job.data;
    switch (job.name) {
      case DTC_ENRICHMENT_JOB.GENERIC:
        await this.enrichment.enrichGeneric(data);
        return;
      case DTC_ENRICHMENT_JOB.VEHICLE:
        await this.enrichment.enrichVehicle(data);
        return;
      default:
        this.logger.warn(`[DtcKnowledge] Unknown job name: ${job.name}`);
    }
  }
}

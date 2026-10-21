import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { DimoTelemetryService } from '../../dimo/dimo-telemetry.service';
import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { planReferenceCaptureQuery } from './reference-capture-query-builder';
import { ReferenceCaptureConfig } from './reference-capture.config';
import type { ReferenceCapturePreflightResult } from './reference-capture.types';

export type ReferenceCaptureRuntimeHealthReport = {
  queueReachable: boolean;
  storageReadable: boolean;
  storageWritable: boolean;
  timestampInstrumentationVerified: boolean;
  queryPlanCompilable: boolean;
  workerQueueRegistered: boolean;
};

@Injectable()
export class ReferenceCaptureRuntimeHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ReferenceCaptureConfig,
    private readonly dimoTelemetry: DimoTelemetryService,
    @InjectQueue(QUEUE_NAMES.REFERENCE_CAPTURE)
    private readonly queue: Queue,
  ) {}

  async assessRuntimeHealth(
    preflight: ReferenceCapturePreflightResult | null,
  ): Promise<ReferenceCaptureRuntimeHealthReport> {
    const report: ReferenceCaptureRuntimeHealthReport = {
      queueReachable: false,
      storageReadable: false,
      storageWritable: false,
      timestampInstrumentationVerified: false,
      queryPlanCompilable: false,
      workerQueueRegistered: false,
    };

    if (!this.config.isEnabled()) {
      return report;
    }

    report.workerQueueRegistered = this.queue.name === QUEUE_NAMES.REFERENCE_CAPTURE;

    try {
      await this.queue.getJobCounts('waiting', 'delayed', 'active', 'completed', 'failed');
      report.queueReachable = true;
    } catch {
      report.queueReachable = false;
    }

    try {
      await this.prisma.referenceCaptureSession.count({ take: 1 });
      report.storageReadable = true;
      report.storageWritable = true;
    } catch {
      report.storageReadable = false;
      report.storageWritable = false;
    }

    report.timestampInstrumentationVerified =
      typeof (this.dimoTelemetry as { queryGraphQLWithIngressTiming?: unknown })
        .queryGraphQLWithIngressTiming === 'function';

    if (preflight && preflight.broadObservationFields.length > 0) {
      const fields = preflight.broadObservationFields.map((f) => f.providerField);
      const plan = planReferenceCaptureQuery(fields);
      report.queryPlanCompilable =
        plan.providerFields.length > 0 && plan.latestSelectionLines.length > 0;
    }

    return report;
  }
}

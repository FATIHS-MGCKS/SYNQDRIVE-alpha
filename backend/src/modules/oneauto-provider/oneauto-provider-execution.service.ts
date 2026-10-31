import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { OneAutoProviderJobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '../../workers/queues/queue-names';
import { OneAutoHttpClient } from './client/oneauto-http.client';
import { getOneAutoCatalogEntry } from './catalog/oneauto-service-catalog';
import { redactOneAutoErrorMessage, redactProviderResponseBody } from './oneauto-provider-redact.util';

export type OneAutoProviderJobPayload = {
  jobId: string;
};

const TERMINAL_SUCCESS = new Set([200, 206]);
const AWAITING = new Set([202]);

@Injectable()
export class OneAutoProviderExecutionService {
  private readonly logger = new Logger(OneAutoProviderExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: OneAutoHttpClient,
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.ONEAUTO_PROVIDER) private readonly queue: Queue<OneAutoProviderJobPayload>,
  ) {}

  async enqueueExecution(jobId: string): Promise<void> {
    await this.prisma.oneAutoProviderJob.update({
      where: { id: jobId },
      data: { status: OneAutoProviderJobStatus.QUEUED },
    });
    await this.queue.add(
      'execute',
      { jobId },
      { jobId: `oneauto:${jobId}`, removeOnComplete: true, removeOnFail: false },
    );
  }

  async processJob(jobId: string): Promise<void> {
    const job = await this.prisma.oneAutoProviderJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    if (
      job.status === OneAutoProviderJobStatus.SUCCEEDED ||
      job.status === OneAutoProviderJobStatus.FAILED ||
      job.status === OneAutoProviderJobStatus.EXPIRED
    ) {
      return;
    }

    const entry = getOneAutoCatalogEntry(job.serviceSku);
    if (!entry) {
      await this.failJob(jobId, 'ONEAUTO_UNKNOWN_SKU', 'Unknown service SKU');
      return;
    }
    if (entry.availabilityStatus === 'PATH_UNVERIFIED') {
      await this.failJob(jobId, 'ONEAUTO_PATH_UNVERIFIED', 'Provider path not verified');
      return;
    }

    const cfgEnabled = this.config.get<{ enabled?: boolean }>('oneautoProvider')?.enabled === true;
    if (!cfgEnabled) {
      await this.failJob(jobId, 'ONEAUTO_DISABLED', 'Provider disabled');
      return;
    }

    await this.prisma.oneAutoProviderJob.update({
      where: { id: jobId },
      data: { status: OneAutoProviderJobStatus.RUNNING },
    });

    try {
      const result = await this.http.getVinLookup({
        relativePath: entry.providerPathTemplate,
        vin: job.vinSnapshot,
      });

      await this.prisma.oneAutoProviderResponse.create({
        data: {
          jobId,
          httpStatus: result.httpStatus,
          providerStatusHeader: result.providerStatusHeader,
          responseBodyJson: redactProviderResponseBody(result.body) as Prisma.InputJsonValue,
        },
      });

      if (TERMINAL_SUCCESS.has(result.httpStatus)) {
        await this.prisma.oneAutoProviderJob.update({
          where: { id: jobId },
          data: {
            status: OneAutoProviderJobStatus.SUCCEEDED,
            actualChargeKnown: false,
            actualChargeMinor: null,
          },
        });
        return;
      }

      if (AWAITING.has(result.httpStatus)) {
        const cfg = this.config.get<{ maxPollAttempts?: number; pollIntervalMs?: number }>('oneautoProvider');
        const maxPoll = cfg?.maxPollAttempts ?? 12;
        const nextCount = job.pollAttemptCount + 1;
        if (nextCount >= maxPoll) {
          await this.failJob(jobId, 'ONEAUTO_POLL_EXHAUSTED', 'Provider async poll limit reached');
          return;
        }
        await this.prisma.oneAutoProviderJob.update({
          where: { id: jobId },
          data: {
            status: OneAutoProviderJobStatus.AWAITING_PROVIDER,
            pollAttemptCount: nextCount,
          },
        });
        const delay = cfg?.pollIntervalMs ?? 5_000;
        await this.queue.add(
          'poll',
          { jobId },
          {
            jobId: `oneauto:poll:${jobId}:${nextCount}`,
            delay,
            removeOnComplete: true,
          },
        );
        return;
      }

      await this.failJob(
        jobId,
        'ONEAUTO_PROVIDER_ERROR',
        `Provider HTTP ${result.httpStatus}`,
      );
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
          ? (err as { code: string }).code
          : 'ONEAUTO_EXECUTION_FAILED';
      const message =
        err instanceof Error ? redactOneAutoErrorMessage(err.message) : 'One Auto execution failed';
      await this.failJob(jobId, code, message);
    }
  }

  private async failJob(jobId: string, code: string, message: string): Promise<void> {
    this.logger.warn(`OneAuto job ${jobId} failed: ${code}`);
    await this.prisma.oneAutoProviderJob.update({
      where: { id: jobId },
      data: {
        status: OneAutoProviderJobStatus.FAILED,
        lastErrorCode: code,
        lastErrorMessageRedacted: redactOneAutoErrorMessage(message),
      },
    });
  }
}

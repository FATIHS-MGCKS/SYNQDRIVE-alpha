import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { randomUUID } from 'crypto';
import {
  getBatteryCapabilityRefreshIntervalMs,
  getBatteryCapabilitySignalLossRecheckMs,
} from '@config/battery-health-v2.config';
import { BatteryV2JobProducerService } from '../jobs/battery-v2-job-producer.service';
import {
  buildCapabilityRefreshJobIdempotencyKey,
  buildCapabilityRefreshPeriodBucket,
} from '../jobs/battery-v2-job-idempotency.policy';
import {
  BatteryCapabilityRefreshTrigger,
  type BatteryCapabilityRefreshTrigger as BatteryCapabilityRefreshTriggerType,
} from './battery-capability-lifecycle.policy';

export interface EnqueueCapabilityRefreshInput {
  organizationId: string;
  vehicleId: string;
  trigger: BatteryCapabilityRefreshTriggerType;
  providerSource?: string;
  signalScope?: string;
  correlationId?: string;
  delayMs?: number;
}

@Injectable()
export class BatteryCapabilityRefreshService {
  private readonly logger = new Logger(BatteryCapabilityRefreshService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobProducer: BatteryV2JobProducerService,
  ) {}

  async enqueue(input: EnqueueCapabilityRefreshInput): Promise<string | null> {
    const providerSource = input.providerSource ?? 'DIMO';
    const signalScope = input.signalScope ?? 'all';
    const correlationId = input.correlationId ?? randomUUID();

    const idempotencyKey = this.buildIdempotencyKey(
      input.vehicleId,
      providerSource,
      signalScope,
      input.trigger,
    );

    const jobId = await this.jobProducer.enqueue(
      'HV_CAPABILITY_REFRESH',
      {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        idempotencyKey,
        providerSource,
        signalScope,
        refreshTrigger: input.trigger,
        correlationId,
      },
      { delayMs: input.delayMs ?? 0 },
    );

    if (jobId) {
      this.logger.debug(
        `Enqueued HV_CAPABILITY_REFRESH vehicle=${input.vehicleId} trigger=${input.trigger} jobId=${jobId}`,
      );
    }

    return jobId;
  }

  async enqueueForDimoVehicle(
    organizationId: string,
    vehicleId: string,
    trigger: BatteryCapabilityRefreshTriggerType,
    options?: { correlationId?: string; delayMs?: number },
  ): Promise<string | null> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { dimoVehicle: { select: { tokenId: true } } },
    });

    if (!vehicle?.dimoVehicle?.tokenId) {
      this.logger.debug(
        `Skip capability refresh enqueue — no DIMO token vehicle=${vehicleId}`,
      );
      return null;
    }

    return this.enqueue({
      organizationId,
      vehicleId,
      trigger,
      correlationId: options?.correlationId,
      delayMs: options?.delayMs,
    });
  }

  async reconcilePeriodicRefresh(batchSize: number): Promise<number> {
    const intervalMs = getBatteryCapabilityRefreshIntervalMs();
    const staleBefore = new Date(Date.now() - intervalMs);
    const vehicleIds = new Set<string>();
    const enqueueTargets: Array<{ vehicleId: string; organizationId: string }> = [];

    const staleRows = await this.prisma.vehicleBatteryCapability.findMany({
      where: {
        checkedAt: { lte: staleBefore },
        vehicle: { dimoVehicle: { is: { tokenId: { not: null } } } },
      },
      distinct: ['vehicleId'],
      take: batchSize,
      select: { vehicleId: true, organizationId: true },
    });

    for (const row of staleRows) {
      if (!vehicleIds.has(row.vehicleId)) {
        vehicleIds.add(row.vehicleId);
        enqueueTargets.push(row);
      }
    }

    if (enqueueTargets.length < batchSize) {
      const missing = await this.prisma.vehicle.findMany({
        where: {
          dimoVehicle: { is: { tokenId: { not: null } } },
          vehicleBatteryCapabilities: { none: {} },
          ...(vehicleIds.size > 0 ? { id: { notIn: [...vehicleIds] } } : {}),
        },
        take: batchSize - enqueueTargets.length,
        select: { id: true, organizationId: true },
      });

      for (const row of missing) {
        enqueueTargets.push({ vehicleId: row.id, organizationId: row.organizationId });
      }
    }

    let enqueued = 0;
    for (const target of enqueueTargets) {
      const jobId = await this.enqueue({
        organizationId: target.organizationId,
        vehicleId: target.vehicleId,
        trigger: BatteryCapabilityRefreshTrigger.PERIODIC,
      });
      if (jobId) enqueued += 1;
    }

    return enqueued;
  }

  async reconcileSignalLossRefresh(batchSize: number): Promise<number> {
    const recheckMs = getBatteryCapabilitySignalLossRecheckMs();
    const staleBefore = new Date(Date.now() - recheckMs);

    const degraded = await this.prisma.vehicleBatteryCapability.findMany({
      where: {
        status: { in: ['DEGRADED', 'UNAVAILABLE'] },
        checkedAt: { lte: staleBefore },
        vehicle: { dimoVehicle: { is: { tokenId: { not: null } } } },
      },
      take: batchSize,
      distinct: ['vehicleId'],
      select: {
        vehicleId: true,
        organizationId: true,
      },
    });

    let enqueued = 0;
    for (const row of degraded) {
      const jobId = await this.enqueue({
        organizationId: row.organizationId,
        vehicleId: row.vehicleId,
        trigger: BatteryCapabilityRefreshTrigger.SIGNAL_LOSS,
      });
      if (jobId) enqueued += 1;
    }

    return enqueued;
  }

  private buildIdempotencyKey(
    vehicleId: string,
    providerSource: string,
    signalScope: string,
    trigger: BatteryCapabilityRefreshTriggerType,
  ): string {
    if (trigger === BatteryCapabilityRefreshTrigger.PERIODIC) {
      return buildCapabilityRefreshJobIdempotencyKey({
        vehicleId,
        providerSource,
        signalScope,
        trigger,
        periodBucket: buildCapabilityRefreshPeriodBucket(
          new Date(),
          getBatteryCapabilityRefreshIntervalMs(),
        ),
      });
    }

    if (trigger === BatteryCapabilityRefreshTrigger.SIGNAL_LOSS) {
      return buildCapabilityRefreshJobIdempotencyKey({
        vehicleId,
        providerSource,
        signalScope,
        trigger,
        periodBucket: buildCapabilityRefreshPeriodBucket(
          new Date(),
          getBatteryCapabilitySignalLossRecheckMs(),
        ),
      });
    }

    const nonce =
      trigger === BatteryCapabilityRefreshTrigger.MANUAL_ADMIN
        ? randomUUID()
        : vehicleId;

    return buildCapabilityRefreshJobIdempotencyKey({
      vehicleId,
      providerSource,
      signalScope,
      trigger,
      nonce,
    });
  }
}

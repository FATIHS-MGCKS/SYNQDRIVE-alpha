import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  DeviceConnectionWebhookMappingStatus,
  DimoDeviceConnectionEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { buildCanonicalDeviceBinding } from '../device-binding-lifecycle';
import { DeviceConnectionWebhookService } from '../device-connection-webhook.service';
import {
  DEVICE_CONNECTION_WEBHOOK_ERROR_CODES,
  DEVICE_CONNECTION_WEBHOOK_QUEUE_ATTEMPTS,
  DEVICE_CONNECTION_WEBHOOK_QUEUE_BACKOFF_MS,
} from './device-connection-webhook-ingestion.constants';
import { DeviceConnectionWebhookInboxRepository } from './device-connection-webhook-inbox.repository';
import {
  assertDeviceConnectionPayloadWithinLimit,
  extractDimoDeviceConnectionProviderEventId,
  hashDeviceConnectionWebhookPayload,
  redactDeviceConnectionWebhookPayload,
} from './device-connection-webhook-payload.util';

export type DeviceConnectionWebhookIngestJobData = {
  inboxId: string;
  replay?: boolean;
};

export type DeviceConnectionWebhookIngestResult = {
  accepted: boolean;
  duplicate: boolean;
  inboxId: string;
  queued: boolean;
  processingStatus: string;
};

@Injectable()
export class DeviceConnectionWebhookQueueProducer {
  constructor(
    @InjectQueue(QUEUE_NAMES.DEVICE_CONNECTION_WEBHOOK_PROCESS)
    private readonly queue: Queue<DeviceConnectionWebhookIngestJobData>,
  ) {}

  async enqueue(inboxId: string, replay = false): Promise<void> {
    await this.queue.add(
      replay ? 'replay' : 'process',
      { inboxId, replay },
      {
        jobId: replay
          ? `device-connection-webhook-replay:${inboxId}:${Date.now()}`
          : `device-connection-webhook:${inboxId}`,
        attempts: DEVICE_CONNECTION_WEBHOOK_QUEUE_ATTEMPTS,
        backoff: { type: 'exponential', delay: DEVICE_CONNECTION_WEBHOOK_QUEUE_BACKOFF_MS },
        removeOnComplete: { count: 2000, age: 24 * 3600 },
        removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
      },
    );
  }
}

@Injectable()
export class DeviceConnectionWebhookIngestService {
  private readonly logger = new Logger(DeviceConnectionWebhookIngestService.name);

  constructor(
    private readonly inbox: DeviceConnectionWebhookInboxRepository,
    private readonly prisma: PrismaService,
    private readonly queue: DeviceConnectionWebhookQueueProducer,
  ) {}

  async receiveObdPlugWebhook(input: {
    rawBody: Buffer;
    body: unknown;
    tokenId: number | null;
    vehicle: { id: string; organizationId: string } | null;
    pluggedIn: boolean | null;
    observedAt: Date | null;
  }): Promise<DeviceConnectionWebhookIngestResult> {
    assertDeviceConnectionPayloadWithinLimit(input.rawBody);
    const receivedAt = new Date();
    const rawPayloadHash = hashDeviceConnectionWebhookPayload(input.rawBody);
    const redacted =
      input.body && typeof input.body === 'object' && !Array.isArray(input.body)
        ? redactDeviceConnectionWebhookPayload(input.body as Record<string, unknown>)
        : { raw: '[non-object-payload]' };

    const eventType =
      input.pluggedIn == null
        ? null
        : DeviceConnectionWebhookService.eventTypeForPlugState(input.pluggedIn);

    const providerEventId = extractDimoDeviceConnectionProviderEventId(input.body, {
      tokenId: input.tokenId,
      eventType,
      observedAt: input.observedAt,
      rawPayloadHash,
    });

    const dedupBucket =
      input.observedAt != null
        ? DeviceConnectionWebhookService.dedupBucket(input.observedAt)
        : null;

    const { inbox: row, created } = await this.inbox.persistOrGet({
      organizationId: input.vehicle?.organizationId ?? null,
      vehicleId: input.vehicle?.id ?? null,
      tokenId: input.tokenId,
      providerEventId,
      eventType,
      rawPayloadHash,
      redactedPayloadJson: redacted as Prisma.InputJsonValue,
      observedAt: input.observedAt,
      receivedAt,
      dedupBucket,
    });

    if (!created) {
      this.logger.debug(`Duplicate device connection webhook inbox ${row.id}`);
      return {
        accepted: true,
        duplicate: true,
        inboxId: row.id,
        queued: false,
        processingStatus: row.processingStatus,
      };
    }

    if (input.pluggedIn == null) {
      await this.inbox.markPermanentlyFailed(row.id, {
        errorCode: DEVICE_CONNECTION_WEBHOOK_ERROR_CODES.PARSE_FAILED,
        errorMessage: 'non_boolean_plug_state',
      });
      return {
        accepted: true,
        duplicate: false,
        inboxId: row.id,
        queued: false,
        processingStatus: 'PERMANENTLY_FAILED',
      };
    }

    if (!input.vehicle || input.tokenId == null) {
      await this.inbox.markPermanentlyFailed(row.id, {
        errorCode: DEVICE_CONNECTION_WEBHOOK_ERROR_CODES.VEHICLE_NOT_MAPPED,
        errorMessage: input.tokenId == null ? 'missing_token_id' : 'unknown_vehicle',
      });
      await this.inbox.markValidated(row.id, {
        vehicleMappingStatus: DeviceConnectionWebhookMappingStatus.UNMAPPED_VEHICLE,
        bindingMappingStatus: DeviceConnectionWebhookMappingStatus.UNKNOWN,
        eventType,
        observedAt: input.observedAt,
      });
      return {
        accepted: true,
        duplicate: false,
        inboxId: row.id,
        queued: false,
        processingStatus: 'PERMANENTLY_FAILED',
      };
    }

    const binding = await this.resolveBinding(input.vehicle.id, input.tokenId);
    const bindingMappingStatus =
      binding.bindingId != null
        ? DeviceConnectionWebhookMappingStatus.MAPPED
        : DeviceConnectionWebhookMappingStatus.UNMAPPED_BINDING;

    await this.inbox.markValidated(row.id, {
      organizationId: input.vehicle.organizationId,
      vehicleId: input.vehicle.id,
      tokenId: input.tokenId,
      eventType,
      observedAt: input.observedAt,
      vehicleMappingStatus: DeviceConnectionWebhookMappingStatus.MAPPED,
      bindingMappingStatus,
      dedupBucket,
      deviceBindingId: binding.bindingId,
      providerDeviceIdHash: binding.providerDeviceIdHash,
    });

    await this.queue.enqueue(row.id);

    this.logger.log(
      JSON.stringify({
        event: 'device_connection_webhook_accepted',
        inboxId: row.id,
        vehicleId: input.vehicle.id,
        eventType,
        providerEventId,
      }),
    );

    return {
      accepted: true,
      duplicate: false,
      inboxId: row.id,
      queued: true,
      processingStatus: 'VALIDATED',
    };
  }

  private async resolveBinding(vehicleId: string, tokenId: number) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        hardwareType: true,
        dataSourceLinks: {
          where: { deactivatedAt: null },
          orderBy: { activatedAt: 'desc' },
          take: 1,
          select: {
            id: true,
            sourceType: true,
            sourceSubtype: true,
            sourceReferenceId: true,
            activatedAt: true,
            deactivatedAt: true,
          },
        },
      },
    });

    const link = vehicle?.dataSourceLinks[0] ?? null;
    const binding = buildCanonicalDeviceBinding({
      provider: 'DIMO',
      dimoTokenId: tokenId,
      hardwareType: vehicle?.hardwareType ?? null,
      link,
    });

    return {
      bindingId: binding.bindingId,
      providerDeviceIdHash: binding.providerDeviceIdHash,
    };
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  BillingQuantityEventSource,
  BillingQuantityEventType,
  BillingSubscriptionItemRole,
  BillingSubscriptionItemStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  BillingQuantityErrorCode,
  buildQuantityIdempotencyKey,
  compareQuantityTimeline,
  computeQuantityTransition,
  isRetroactiveEvent,
  QuantityTimelineEvent,
  replayQuantityAt,
} from './domain/billing-quantity-ledger';

export interface RecordQuantityEventInput {
  organizationId: string;
  subscriptionId?: string | null;
  subscriptionItemId: string;
  vehicleId?: string | null;
  eventType: BillingQuantityEventType;
  delta: number;
  effectiveAt: Date;
  recordedAt?: Date;
  source: BillingQuantityEventSource;
  actorUserId?: string | null;
  reason?: string | null;
  idempotencyKey: string;
  retroactiveAuthorized?: boolean;
}

export interface QuantityEventRecord {
  id: string;
  organizationId: string;
  subscriptionId: string | null;
  subscriptionItemId: string;
  vehicleId: string | null;
  eventType: BillingQuantityEventType;
  delta: number;
  quantityBefore: number;
  quantityAfter: number;
  effectiveAt: Date;
  recordedAt: Date;
  source: BillingQuantityEventSource;
  actorUserId: string | null;
  reason: string | null;
  idempotencyKey: string;
}

export interface RecordQuantityEventResult {
  created: boolean;
  event: QuantityEventRecord;
}

@Injectable()
export class BillingQuantityService {
  private readonly logger = new Logger(BillingQuantityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(input: RecordQuantityEventInput): Promise<RecordQuantityEventResult> {
    const recordedAt = input.recordedAt ?? new Date();

    if (input.delta === 0) {
      throw new BadRequestException({
        code: BillingQuantityErrorCode.INVALID_DELTA,
        message: BillingQuantityErrorCode.INVALID_DELTA,
      });
    }

    if (
      isRetroactiveEvent(input.effectiveAt, recordedAt) &&
      !input.retroactiveAuthorized
    ) {
      throw new BadRequestException({
        code: BillingQuantityErrorCode.RETROACTIVE_NOT_AUTHORIZED,
        message: BillingQuantityErrorCode.RETROACTIVE_NOT_AUTHORIZED,
      });
    }

    const existing = await this.prisma.billingQuantityEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return { created: false, event: this.mapEvent(existing) };
    }

    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.billingQuantityEvent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (duplicate) {
        return { created: false, event: this.mapEvent(duplicate) };
      }

      await tx.$executeRaw`SELECT id FROM billing_subscription_items WHERE id = ${input.subscriptionItemId} FOR UPDATE`;

      const context = await this.loadScopedContext(tx, input);
      const timeline = await this.loadTimeline(tx, input.subscriptionItemId);
      const { quantityBefore, quantityAfter } = computeQuantityTransition(timeline, {
        effectiveAt: input.effectiveAt,
        recordedAt,
        delta: input.delta,
      });

      if (quantityAfter < 0) {
        throw new ConflictException({
          code: BillingQuantityErrorCode.QUANTITY_NEGATIVE,
          message: BillingQuantityErrorCode.QUANTITY_NEGATIVE,
          quantityBefore,
          quantityAfter,
        });
      }

      const created = await tx.billingQuantityEvent.create({
        data: {
          organizationId: input.organizationId,
          subscriptionId: context.subscriptionId,
          subscriptionItemId: input.subscriptionItemId,
          vehicleId: input.vehicleId ?? null,
          eventType: input.eventType,
          delta: input.delta,
          quantityBefore,
          quantityAfter,
          effectiveAt: input.effectiveAt,
          source: input.source,
          actorUserId: input.actorUserId ?? null,
          reason: input.reason ?? null,
          idempotencyKey: input.idempotencyKey,
          createdAt: recordedAt,
        },
      });

      const currentQuantity = replayQuantityAt(
        [
          ...timeline,
          {
            effectiveAt: created.effectiveAt,
            recordedAt: created.createdAt,
            delta: created.delta,
            tieBreaker: timeline.length,
          },
        ],
        new Date(),
      ).quantity;

      await tx.billingSubscriptionItem.update({
        where: { id: input.subscriptionItemId },
        data: { quantity: currentQuantity },
      });

      this.logger.log({
        msg: 'billing.quantity.event_recorded',
        eventType: input.eventType,
        organizationId: input.organizationId,
        subscriptionItemId: input.subscriptionItemId,
        vehicleId: input.vehicleId ?? null,
        quantityBefore,
        quantityAfter,
        idempotencyKey: input.idempotencyKey,
      });

      return { created: true, event: this.mapEvent(created) };
    });
  }

  async reconstructQuantity(
    subscriptionItemId: string,
    asOf: Date = new Date(),
  ): Promise<number> {
    const timeline = await this.loadTimeline(this.prisma, subscriptionItemId);
    return replayQuantityAt(timeline, asOf).quantity;
  }

  async listEvents(
    subscriptionItemId: string,
    opts?: { limit?: number },
  ): Promise<QuantityEventRecord[]> {
    const rows = await this.prisma.billingQuantityEvent.findMany({
      where: { subscriptionItemId },
      orderBy: [{ effectiveAt: 'asc' }, { createdAt: 'asc' }],
      take: opts?.limit,
    });
    return rows.map((row) => this.mapEvent(row));
  }

  async resolveBaseSubscriptionItem(organizationId: string) {
    return this.prisma.billingSubscriptionItem.findFirst({
      where: {
        organizationId,
        itemRole: BillingSubscriptionItemRole.BASE_PLAN,
        status: {
          in: [BillingSubscriptionItemStatus.ACTIVE, BillingSubscriptionItemStatus.TRIALING],
        },
      },
      orderBy: { validFrom: 'desc' },
      select: {
        id: true,
        subscriptionId: true,
        organizationId: true,
        quantity: true,
      },
    });
  }

  async recordVehicleLicenseAdded(input: {
    organizationId: string;
    subscriptionId: string;
    subscriptionItemId: string;
    vehicleId: string;
    effectiveAt?: Date;
    recordedAt?: Date;
    source?: BillingQuantityEventSource;
    actorUserId?: string | null;
    reason?: string | null;
    idempotencyKey: string;
    retroactiveAuthorized?: boolean;
  }) {
    return this.recordEvent({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      subscriptionItemId: input.subscriptionItemId,
      vehicleId: input.vehicleId,
      eventType: BillingQuantityEventType.VEHICLE_CONNECTED,
      delta: 1,
      effectiveAt: input.effectiveAt ?? new Date(),
      recordedAt: input.recordedAt,
      source: input.source ?? BillingQuantityEventSource.SYSTEM,
      actorUserId: input.actorUserId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      retroactiveAuthorized: input.retroactiveAuthorized,
    });
  }

  async recordVehicleLicenseRemoved(input: {
    organizationId: string;
    subscriptionId: string;
    subscriptionItemId: string;
    vehicleId: string;
    effectiveAt?: Date;
    source?: BillingQuantityEventSource;
    actorUserId?: string | null;
    reason?: string | null;
    idempotencyKey: string;
    retroactiveAuthorized?: boolean;
  }) {
    return this.recordEvent({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      subscriptionItemId: input.subscriptionItemId,
      vehicleId: input.vehicleId,
      eventType: BillingQuantityEventType.VEHICLE_DISCONNECTED,
      delta: -1,
      effectiveAt: input.effectiveAt ?? new Date(),
      source: input.source ?? BillingQuantityEventSource.SYSTEM,
      actorUserId: input.actorUserId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      retroactiveAuthorized: input.retroactiveAuthorized,
    });
  }

  async recordExclusionActivated(input: {
    organizationId: string;
    subscriptionId: string;
    subscriptionItemId: string;
    vehicleId: string;
    effectiveAt?: Date;
    actorUserId?: string | null;
    reason?: string | null;
    idempotencyKey: string;
    retroactiveAuthorized?: boolean;
  }) {
    return this.recordEvent({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      subscriptionItemId: input.subscriptionItemId,
      vehicleId: input.vehicleId,
      eventType: BillingQuantityEventType.VEHICLE_EXCLUDED,
      delta: -1,
      effectiveAt: input.effectiveAt ?? new Date(),
      source: BillingQuantityEventSource.ADMIN,
      actorUserId: input.actorUserId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      retroactiveAuthorized: input.retroactiveAuthorized,
    });
  }

  async recordExclusionLifted(input: {
    organizationId: string;
    subscriptionId: string;
    subscriptionItemId: string;
    vehicleId: string;
    effectiveAt?: Date;
    actorUserId?: string | null;
    reason?: string | null;
    idempotencyKey: string;
    retroactiveAuthorized?: boolean;
  }) {
    return this.recordEvent({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      subscriptionItemId: input.subscriptionItemId,
      vehicleId: input.vehicleId,
      eventType: BillingQuantityEventType.VEHICLE_INCLUDED,
      delta: 1,
      effectiveAt: input.effectiveAt ?? new Date(),
      source: BillingQuantityEventSource.ADMIN,
      actorUserId: input.actorUserId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      retroactiveAuthorized: input.retroactiveAuthorized,
    });
  }

  async recordVehicleOrgTransfer(input: {
    fromOrganizationId: string;
    toOrganizationId: string;
    fromSubscriptionId: string;
    toSubscriptionId: string;
    fromSubscriptionItemId: string;
    toSubscriptionItemId: string;
    vehicleId: string;
    effectiveAt?: Date;
    actorUserId?: string | null;
    reason?: string | null;
    idempotencyKey: string;
    retroactiveAuthorized?: boolean;
  }) {
    const effectiveAt = input.effectiveAt ?? new Date();
    const remove = await this.recordVehicleLicenseRemoved({
      organizationId: input.fromOrganizationId,
      subscriptionId: input.fromSubscriptionId,
      subscriptionItemId: input.fromSubscriptionItemId,
      vehicleId: input.vehicleId,
      effectiveAt,
      source: BillingQuantityEventSource.API,
      actorUserId: input.actorUserId,
      reason: input.reason ?? 'Vehicle transferred out of organization',
      idempotencyKey: buildQuantityIdempotencyKey([
        input.idempotencyKey,
        'remove',
      ]),
      retroactiveAuthorized: input.retroactiveAuthorized,
    });

    const add = await this.recordVehicleLicenseAdded({
      organizationId: input.toOrganizationId,
      subscriptionId: input.toSubscriptionId,
      subscriptionItemId: input.toSubscriptionItemId,
      vehicleId: input.vehicleId,
      effectiveAt,
      source: BillingQuantityEventSource.API,
      actorUserId: input.actorUserId,
      reason: input.reason ?? 'Vehicle transferred into organization',
      idempotencyKey: buildQuantityIdempotencyKey([input.idempotencyKey, 'add']),
      retroactiveAuthorized: input.retroactiveAuthorized,
    });

    return { remove, add };
  }

  async recordSubscriptionActivated(input: {
    organizationId: string;
    subscriptionId: string;
    subscriptionItemId: string;
    quantityDelta: number;
    effectiveAt?: Date;
    actorUserId?: string | null;
    reason?: string | null;
    idempotencyKey: string;
    retroactiveAuthorized?: boolean;
  }) {
    return this.recordEvent({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      subscriptionItemId: input.subscriptionItemId,
      eventType: BillingQuantityEventType.SUBSCRIPTION_ACTIVATED,
      delta: input.quantityDelta,
      effectiveAt: input.effectiveAt ?? new Date(),
      source: BillingQuantityEventSource.SYSTEM,
      actorUserId: input.actorUserId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      retroactiveAuthorized: input.retroactiveAuthorized,
    });
  }

  async recordSubscriptionPaused(input: {
    organizationId: string;
    subscriptionId: string;
    subscriptionItemId: string;
    quantityDelta: number;
    effectiveAt?: Date;
    actorUserId?: string | null;
    reason?: string | null;
    idempotencyKey: string;
    retroactiveAuthorized?: boolean;
  }) {
    return this.recordEvent({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      subscriptionItemId: input.subscriptionItemId,
      eventType: BillingQuantityEventType.SUBSCRIPTION_PAUSED,
      delta: input.quantityDelta,
      effectiveAt: input.effectiveAt ?? new Date(),
      source: BillingQuantityEventSource.SYSTEM,
      actorUserId: input.actorUserId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      retroactiveAuthorized: input.retroactiveAuthorized,
    });
  }

  async recordBasePlanChanged(input: {
    organizationId: string;
    subscriptionId: string;
    subscriptionItemId: string;
    quantityDelta: number;
    effectiveAt?: Date;
    actorUserId?: string | null;
    reason?: string | null;
    idempotencyKey: string;
    retroactiveAuthorized?: boolean;
  }) {
    return this.recordEvent({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      subscriptionItemId: input.subscriptionItemId,
      eventType: BillingQuantityEventType.BASE_PLAN_CHANGED,
      delta: input.quantityDelta,
      effectiveAt: input.effectiveAt ?? new Date(),
      source: BillingQuantityEventSource.ADMIN,
      actorUserId: input.actorUserId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      retroactiveAuthorized: input.retroactiveAuthorized,
    });
  }

  async recordOrgBillingDeactivated(input: {
    organizationId: string;
    subscriptionId: string;
    subscriptionItemId: string;
    quantityDelta: number;
    effectiveAt?: Date;
    actorUserId?: string | null;
    reason?: string | null;
    idempotencyKey: string;
    retroactiveAuthorized?: boolean;
  }) {
    return this.recordEvent({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      subscriptionItemId: input.subscriptionItemId,
      eventType: BillingQuantityEventType.ORG_BILLING_DEACTIVATED,
      delta: input.quantityDelta,
      effectiveAt: input.effectiveAt ?? new Date(),
      source: BillingQuantityEventSource.ADMIN,
      actorUserId: input.actorUserId,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      retroactiveAuthorized: input.retroactiveAuthorized,
    });
  }

  private async loadScopedContext(
    tx: Prisma.TransactionClient,
    input: RecordQuantityEventInput,
  ): Promise<{ subscriptionId: string | null }> {
    const item = await tx.billingSubscriptionItem.findUnique({
      where: { id: input.subscriptionItemId },
      select: {
        id: true,
        organizationId: true,
        subscriptionId: true,
      },
    });

    if (!item) {
      throw new BadRequestException({
        code: BillingQuantityErrorCode.SUBSCRIPTION_ITEM_NOT_FOUND,
        message: BillingQuantityErrorCode.SUBSCRIPTION_ITEM_NOT_FOUND,
      });
    }

    if (item.organizationId !== input.organizationId) {
      throw new ConflictException({
        code: BillingQuantityErrorCode.CROSS_TENANT_ORGANIZATION,
        message: BillingQuantityErrorCode.CROSS_TENANT_ORGANIZATION,
      });
    }

    const subscriptionId = input.subscriptionId ?? item.subscriptionId;
    const subscription = await tx.billingSubscription.findUnique({
      where: { id: subscriptionId },
      select: { organizationId: true },
    });

    if (!subscription || subscription.organizationId !== input.organizationId) {
      throw new ConflictException({
        code: BillingQuantityErrorCode.CROSS_TENANT_SUBSCRIPTION,
        message: BillingQuantityErrorCode.CROSS_TENANT_SUBSCRIPTION,
      });
    }

    if (input.vehicleId) {
      const vehicle = await tx.vehicle.findUnique({
        where: { id: input.vehicleId },
        select: { organizationId: true },
      });
      if (!vehicle || vehicle.organizationId !== input.organizationId) {
        throw new ConflictException({
          code: BillingQuantityErrorCode.CROSS_TENANT_VEHICLE,
          message: BillingQuantityErrorCode.CROSS_TENANT_VEHICLE,
        });
      }
    }

    return { subscriptionId };
  }

  private async loadTimeline(
    client: Prisma.TransactionClient | PrismaService,
    subscriptionItemId: string,
  ): Promise<QuantityTimelineEvent[]> {
    const rows = await client.billingQuantityEvent.findMany({
      where: { subscriptionItemId },
      select: {
        effectiveAt: true,
        createdAt: true,
        delta: true,
      },
      orderBy: [{ effectiveAt: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.map((row, index) => ({
      effectiveAt: row.effectiveAt,
      recordedAt: row.createdAt,
      delta: row.delta,
      tieBreaker: index,
    }));
  }

  private mapEvent(row: {
    id: string;
    organizationId: string;
    subscriptionId: string | null;
    subscriptionItemId: string;
    vehicleId: string | null;
    eventType: BillingQuantityEventType;
    delta: number;
    quantityBefore: number;
    quantityAfter: number;
    effectiveAt: Date;
    createdAt: Date;
    source: BillingQuantityEventSource;
    actorUserId: string | null;
    reason: string | null;
    idempotencyKey: string;
  }): QuantityEventRecord {
    return {
      id: row.id,
      organizationId: row.organizationId,
      subscriptionId: row.subscriptionId,
      subscriptionItemId: row.subscriptionItemId,
      vehicleId: row.vehicleId,
      eventType: row.eventType,
      delta: row.delta,
      quantityBefore: row.quantityBefore,
      quantityAfter: row.quantityAfter,
      effectiveAt: row.effectiveAt,
      recordedAt: row.createdAt,
      source: row.source,
      actorUserId: row.actorUserId,
      reason: row.reason,
      idempotencyKey: row.idempotencyKey,
    };
  }
}

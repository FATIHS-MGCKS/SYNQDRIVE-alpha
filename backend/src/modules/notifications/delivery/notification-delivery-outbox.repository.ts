import { Injectable } from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  NotificationCategory,
  NotificationDeliveryChannel,
  NotificationDeliveryOutboxStatus,
  NotificationDeliveryTransition,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import type { NotificationTx } from '../notification.repository';

export interface CreateOutboxEntryInput {
  organizationId: string;
  notificationId: string;
  lifecycleGeneration: number;
  eventType: string;
  deliveryTransition: NotificationDeliveryTransition;
  channel: NotificationDeliveryChannel;
  recipientId: string;
  audienceKey: string;
  payloadRef: Prisma.InputJsonValue;
  idempotencyKey: string;
  availableAt?: Date;
}

@Injectable()
export class NotificationDeliveryOutboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  private client(tx?: NotificationTx) {
    return tx ?? this.prisma;
  }

  async createEntry(input: CreateOutboxEntryInput, tx?: NotificationTx) {
    return this.client(tx).notificationDeliveryOutbox.create({
      data: {
        organizationId: input.organizationId,
        notificationId: input.notificationId,
        lifecycleGeneration: input.lifecycleGeneration,
        eventType: input.eventType,
        deliveryTransition: input.deliveryTransition,
        channel: input.channel,
        recipientId: input.recipientId,
        audienceKey: input.audienceKey,
        payloadRef: input.payloadRef,
        idempotencyKey: input.idempotencyKey,
        availableAt: input.availableAt ?? new Date(),
        status: NotificationDeliveryOutboxStatus.PENDING,
      },
    });
  }

  async createEntryIdempotent(input: CreateOutboxEntryInput, tx?: NotificationTx) {
    try {
      return await this.createEntry(input, tx);
    } catch (err) {
      const code =
        err instanceof Prisma.PrismaClientKnownRequestError
          ? err.code
          : err && typeof err === 'object' && 'code' in err
            ? String((err as { code: unknown }).code)
            : undefined;
      if (code === 'P2002') {
        return null;
      }
      throw err;
    }
  }

  findById(id: string, organizationId?: string) {
    return this.prisma.notificationDeliveryOutbox.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
    });
  }

  findNotificationForDelivery(notificationId: string) {
    return this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: {
        entityType: true,
        entityId: true,
        actionTarget: true,
        templateParams: true,
      },
    });
  }

  findPendingBatch(limit: number, now: Date = new Date()) {
    return this.prisma.notificationDeliveryOutbox.findMany({
      where: {
        status: NotificationDeliveryOutboxStatus.PENDING,
        availableAt: { lte: now },
      },
      orderBy: { availableAt: 'asc' },
      take: limit,
    });
  }

  countBacklog() {
    return this.prisma.notificationDeliveryOutbox.count({
      where: {
        status: {
          in: [
            NotificationDeliveryOutboxStatus.PENDING,
            NotificationDeliveryOutboxStatus.FAILED,
          ],
        },
      },
    });
  }

  async claimForProcessing(id: string) {
    const result = await this.prisma.notificationDeliveryOutbox.updateMany({
      where: {
        id,
        status: {
          in: [
            NotificationDeliveryOutboxStatus.PENDING,
            NotificationDeliveryOutboxStatus.FAILED,
          ],
        },
      },
      data: {
        status: NotificationDeliveryOutboxStatus.PROCESSING,
        attempts: { increment: 1 },
      },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  markCompleted(id: string, outboundEmailId?: string) {
    return this.prisma.notificationDeliveryOutbox.update({
      where: { id },
      data: {
        status: NotificationDeliveryOutboxStatus.COMPLETED,
        processedAt: new Date(),
        outboundEmailId: outboundEmailId ?? undefined,
        lastError: null,
      },
    });
  }

  markSuppressed(id: string, reason: string) {
    return this.prisma.notificationDeliveryOutbox.update({
      where: { id },
      data: {
        status: NotificationDeliveryOutboxStatus.SUPPRESSED,
        processedAt: new Date(),
        lastError: reason,
      },
    });
  }

  async markRetry(id: string, error: string, retryAt: Date) {
    return this.prisma.notificationDeliveryOutbox.update({
      where: { id },
      data: {
        status: NotificationDeliveryOutboxStatus.PENDING,
        lastError: error.slice(0, 2000),
        availableAt: retryAt,
      },
    });
  }

  markDeadLetter(id: string, error: string) {
    return this.prisma.notificationDeliveryOutbox.update({
      where: { id },
      data: {
        status: NotificationDeliveryOutboxStatus.DEAD_LETTER,
        processedAt: new Date(),
        lastError: error.slice(0, 2000),
      },
    });
  }

  listEligibleMemberships(organizationId: string, supportedRoles: readonly MembershipRole[]) {
    return this.prisma.organizationMembership.findMany({
      where: {
        organizationId,
        status: MembershipStatus.ACTIVE,
        role: { in: [...supportedRoles] },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            timezone: true,
            language: true,
            notificationPreferences: {
              where: { organizationId },
            },
          },
        },
      },
    });
  }

  getOrganizationTimezone(organizationId: string) {
    return this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
  }

  isDigestCategory(category: NotificationCategory): boolean {
    return category === NotificationCategory.WEEKLY_REPORTS;
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationSeverity } from '@prisma/client';
import { NotificationRepository } from '../notification.repository';
import {
  assertReceiptBelongsToUser,
  canPersonallyHideNotification,
} from './notification-receipt.policy';

/**
 * Per-user receipt operations — strictly separated from org-wide lifecycle.
 *
 * - readAt / acknowledgedAt / snoozedUntil / hiddenAt / lastSeenAt → per user
 * - OPEN / RESOLVED / ARCHIVED → notification row (org-wide)
 */
@Injectable()
export class NotificationReceiptService {
  constructor(private readonly repository: NotificationRepository) {}

  async markRead(notificationId: string, organizationId: string, userId: string, at = new Date()) {
    await this.requireNotificationInOrg(notificationId, organizationId);
    return this.repository.upsertReceipt({
      notificationId,
      userId,
      organizationId,
      readAt: at,
      lastSeenAt: at,
    });
  }

  async markUnread(notificationId: string, organizationId: string, userId: string) {
    await this.requireNotificationInOrg(notificationId, organizationId);
    return this.repository.upsertReceipt({
      notificationId,
      userId,
      organizationId,
      readAt: null,
    });
  }

  /** Personal „gesehen und übernommen“ — does NOT change org notification.status. */
  async acknowledgePersonal(
    notificationId: string,
    organizationId: string,
    userId: string,
    at = new Date(),
  ) {
    await this.requireNotificationInOrg(notificationId, organizationId);
    return this.repository.upsertReceipt({
      notificationId,
      userId,
      organizationId,
      acknowledgedAt: at,
      readAt: at,
      lastSeenAt: at,
    });
  }

  /** Per-user snooze — hides from personal feed until expiry. */
  async snoozePersonal(
    notificationId: string,
    organizationId: string,
    userId: string,
    until: Date,
  ) {
    await this.requireNotificationInOrg(notificationId, organizationId);
    return this.repository.upsertReceipt({
      notificationId,
      userId,
      organizationId,
      snoozedUntil: until,
    });
  }

  async unsnoozePersonal(notificationId: string, organizationId: string, userId: string) {
    await this.requireNotificationInOrg(notificationId, organizationId);
    return this.repository.upsertReceipt({
      notificationId,
      userId,
      organizationId,
      snoozedUntil: null,
    });
  }

  /** Soft-hide from personal inbox — never deletes the org-wide notification row. */
  async hidePersonal(
    notificationId: string,
    organizationId: string,
    userId: string,
    eventType: string,
    severity: NotificationSeverity,
    at = new Date(),
  ) {
    if (!canPersonallyHideNotification(eventType, severity)) {
      throw new BadRequestException('This notification cannot be hidden');
    }
    await this.requireNotificationInOrg(notificationId, organizationId);
    return this.repository.upsertReceipt({
      notificationId,
      userId,
      organizationId,
      hiddenAt: at,
    });
  }

  async unhidePersonal(notificationId: string, organizationId: string, userId: string) {
    await this.requireNotificationInOrg(notificationId, organizationId);
    return this.repository.upsertReceipt({
      notificationId,
      userId,
      organizationId,
      hiddenAt: null,
    });
  }

  async touchLastSeen(notificationId: string, organizationId: string, userId: string, at = new Date()) {
    await this.requireNotificationInOrg(notificationId, organizationId);
    return this.repository.upsertReceipt({
      notificationId,
      userId,
      organizationId,
      lastSeenAt: at,
    });
  }

  async getReceiptForUser(
    notificationId: string,
    organizationId: string,
    userId: string,
  ) {
    const receipt = await this.repository.findReceiptForUserInOrg(notificationId, userId, organizationId);
    if (receipt) {
      assertReceiptBelongsToUser(receipt.userId, userId);
    }
    return receipt;
  }

  isUserSnoozed(
    receipt: { snoozedUntil: Date | null } | null | undefined,
    referenceNow = new Date(),
  ): boolean {
    return !!receipt?.snoozedUntil && receipt.snoozedUntil.getTime() > referenceNow.getTime();
  }

  isPersonallyAcknowledged(receipt: { acknowledgedAt: Date | null } | null | undefined): boolean {
    return receipt?.acknowledgedAt != null;
  }

  private async requireNotificationInOrg(notificationId: string, organizationId: string) {
    const row = await this.repository.findById(notificationId, organizationId);
    if (!row) {
      throw new NotFoundException('Notification not found');
    }
    return row;
  }

  /** Cross-tenant guard when loading another user's receipt is attempted. */
  assertActingUser(userId: string, actingUserId: string): void {
    if (userId !== actingUserId) {
      throw new ForbiddenException('Cannot access receipts of another user');
    }
  }
}

import { Injectable } from '@nestjs/common';
import { NotificationRepository } from '../notification.repository';

/**
 * Per-user receipt operations — strictly separated from org-wide lifecycle.
 *
 * - readAt / acknowledgedAt / snoozedUntil / hiddenAt → per user
 * - OPEN / RESOLVED / ARCHIVED → notification row (org-wide)
 */
@Injectable()
export class NotificationReceiptService {
  constructor(private readonly repository: NotificationRepository) {}

  async markRead(notificationId: string, organizationId: string, userId: string, at = new Date()) {
    await this.repository.upsertReceipt({
      notificationId,
      userId,
      organizationId,
      readAt: at,
    });
  }

  async markUnread(notificationId: string, organizationId: string, userId: string) {
    await this.repository.upsertReceipt({
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
    return this.repository.upsertReceipt({
      notificationId,
      userId,
      organizationId,
      acknowledgedAt: at,
      readAt: at,
    });
  }

  /** Per-user snooze — hides from personal feed until expiry. */
  async snoozePersonal(
    notificationId: string,
    organizationId: string,
    userId: string,
    until: Date,
  ) {
    return this.repository.upsertReceipt({
      notificationId,
      userId,
      organizationId,
      snoozedUntil: until,
    });
  }

  async unsnoozePersonal(notificationId: string, organizationId: string, userId: string) {
    return this.repository.upsertReceipt({
      notificationId,
      userId,
      organizationId,
      snoozedUntil: null,
    });
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
}

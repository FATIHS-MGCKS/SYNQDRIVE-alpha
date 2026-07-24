import { Injectable, Optional } from '@nestjs/common';
import {
  NotificationDeliveryChannel,
  OutboundEmailEventType,
  OutboundEmailSourceType,
  OutboundEmailStatus,
  type NotificationDeliveryOutbox,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { OutboundEmailPolicyService } from '@modules/outbound-email/outbound-email-policy.service';
import { OutboundEmailService } from '@modules/outbound-email/outbound-email.service';
import { EmailProviderRegistry } from '@modules/outbound-email/providers/email-provider.registry';
import { NotificationEnforcementService } from '@modules/data-authorizations/notification-enforcement/notification-enforcement.service';
import {
  minimizeNotificationDeliveryBody,
} from '@modules/data-authorizations/notification-enforcement/notification-preview-minimizer';

export interface ChannelDeliveryResult {
  success: boolean;
  outboundEmailId?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
}

@Injectable()
export class NotificationEmailChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: OutboundEmailPolicyService,
    private readonly outboundEmail: OutboundEmailService,
    private readonly providers: EmailProviderRegistry,
    @Optional() private readonly notificationEnforcement?: NotificationEnforcementService,
  ) {}

  async deliver(row: NotificationDeliveryOutbox): Promise<ChannelDeliveryResult> {
    if (!row.recipientId) {
      return {
        success: false,
        errorCode: 'NO_RECIPIENT',
        errorMessage: 'Missing recipient',
        retryable: false,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: row.recipientId },
      select: { email: true },
    });
    if (!user?.email || !this.policy.isValidEmail(user.email)) {
      return {
        success: false,
        errorCode: 'INVALID_RECIPIENT',
        errorMessage: 'Invalid user email',
        retryable: false,
      };
    }

    const notification = await this.prisma.notification.findFirst({
      where: { id: row.notificationId, organizationId: row.organizationId },
    });
    if (!notification) {
      return {
        success: false,
        errorCode: 'NOT_FOUND',
        errorMessage: 'Notification not found',
        retryable: false,
      };
    }

    const identity = await this.policy.resolveIdentity(row.organizationId);
    const templateParams = (notification.templateParams ?? {}) as Record<
      string,
      string | number | boolean | null
    >;

    let deliveryAllowed = true;
    if (this.notificationEnforcement) {
      const vehicleId =
        notification.entityType === 'VEHICLE'
          ? notification.entityId
          : (notification.actionTarget as Record<string, unknown> | null)?.vehicleId as
              | string
              | undefined;
      const auth = await this.notificationEnforcement.checkDelivery({
        organizationId: row.organizationId,
        eventType: notification.eventType,
        vehicleId: vehicleId ?? null,
        entityType: notification.entityType,
        entityId: notification.entityId,
        correlationId: `notification-email:${row.id}`,
      });
      deliveryAllowed = auth.mayProceed;
    }

    const minimized = minimizeNotificationDeliveryBody(
      notification.titleKey,
      notification.bodyKey,
      templateParams,
      deliveryAllowed,
    );

    const subject = `[SynqDrive] ${minimized.titleKey}`;
    const bodyText = this.renderBody(
      minimized.titleKey,
      minimized.bodyKey,
      minimized.params,
    );
    const bodyHtml = `<p>${this.escapeHtml(bodyText)}</p>`;

    const outbound = await this.prisma.outboundEmail.create({
      data: {
        organizationId: row.organizationId,
        sourceType: OutboundEmailSourceType.NOTIFICATION,
        status: OutboundEmailStatus.QUEUED,
        fromEmail: identity.fromEmail,
        fromName: identity.fromName,
        replyToEmail: identity.replyToEmail,
        toEmail: user.email,
        subject,
        bodyText,
        bodyHtml,
        events: { create: { eventType: OutboundEmailEventType.QUEUED } },
      },
    });

    await this.prisma.outboundEmail.update({
      where: { id: outbound.id },
      data: { status: OutboundEmailStatus.SENDING },
    });
    await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.SENDING);

    try {
      const provider = this.providers.resolve();
      const result = await provider.sendEmail({
        fromEmail: identity.fromEmail,
        fromName: identity.fromName,
        replyToEmail: identity.replyToEmail,
        toEmail: user.email,
        subject,
        bodyText,
        bodyHtml,
        idempotencyKey: row.idempotencyKey,
      });

      const finalStatus =
        result.status === 'SENT'
          ? OutboundEmailStatus.SENT
          : result.status === 'SENT_SIMULATED'
            ? OutboundEmailStatus.SENT_SIMULATED
            : OutboundEmailStatus.FAILED;

      if (finalStatus === OutboundEmailStatus.FAILED) {
        await this.prisma.outboundEmail.update({
          where: { id: outbound.id },
          data: {
            status: finalStatus,
            provider: result.provider,
            errorCode: result.errorCode ?? 'SEND_FAILED',
            errorMessage: result.errorMessage ?? 'Provider send failed',
          },
        });
        await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.FAILED);
        return {
          success: false,
          errorCode: result.errorCode ?? 'SEND_FAILED',
          errorMessage: result.errorMessage ?? 'Provider send failed',
          retryable: true,
        };
      }

      await this.prisma.outboundEmail.update({
        where: { id: outbound.id },
        data: {
          status: finalStatus,
          provider: result.provider,
          providerMessageId: result.providerMessageId,
          sentAt: new Date(),
        },
      });
      await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.SENT);

      return { success: true, outboundEmailId: outbound.id };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      const retryable = this.isRetryableError(err);
      await this.prisma.outboundEmail.update({
        where: { id: outbound.id },
        data: {
          status: OutboundEmailStatus.FAILED,
          errorCode: retryable ? 'TRANSIENT' : 'PERMANENT',
          errorMessage: message.slice(0, 2000),
        },
      });
      await this.outboundEmail.recordEvent(outbound.id, OutboundEmailEventType.FAILED, { message });
      return {
        success: false,
        errorCode: retryable ? 'TRANSIENT' : 'PERMANENT',
        errorMessage: message,
        retryable,
      };
    }
  }

  private renderBody(titleKey: string, bodyKey: string, templateParams: unknown): string {
    const params = (templateParams ?? {}) as Record<string, string | number | boolean | null>;
    const paramSummary = Object.entries(params)
      .slice(0, 8)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(', ');
    return `${titleKey} — ${bodyKey}${paramSummary ? ` (${paramSummary})` : ''}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private isRetryableError(err: unknown): boolean {
    if (err && typeof err === 'object' && 'statusCode' in err) {
      const code = Number((err as { statusCode: unknown }).statusCode);
      return code === 429 || code >= 500;
    }
    return true;
  }
}

@Injectable()
export class NotificationPushChannelService {
  deliver(_row: NotificationDeliveryOutbox): Promise<ChannelDeliveryResult> {
    return Promise.resolve({
      success: false,
      errorCode: 'PUSH_NOT_IMPLEMENTED',
      errorMessage: 'Push infrastructure not configured',
      retryable: false,
    });
  }
}

@Injectable()
export class NotificationChannelDispatcher {
  constructor(
    private readonly email: NotificationEmailChannelService,
    private readonly push: NotificationPushChannelService,
  ) {}

  deliver(row: NotificationDeliveryOutbox): Promise<ChannelDeliveryResult> {
    if (row.channel === NotificationDeliveryChannel.EMAIL) {
      return this.email.deliver(row);
    }
    if (row.channel === NotificationDeliveryChannel.PUSH) {
      return this.push.deliver(row);
    }
    return Promise.resolve({
      success: false,
      errorCode: 'UNSUPPORTED_CHANNEL',
      errorMessage: `Channel ${row.channel} not handled by worker`,
      retryable: false,
    });
  }
}

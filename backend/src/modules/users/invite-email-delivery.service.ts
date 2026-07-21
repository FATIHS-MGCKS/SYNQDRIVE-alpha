import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { INVITE_EMAIL_OUTBOX } from './invite-email.constants';
import { InviteEmailOutboxRepository } from './invite-email-outbox.repository';
import { TransactionalMailService } from './transactional-mail.service';
import { decryptInviteToken, encryptInviteToken } from './utils/invite-secret-crypto.util';
import { maskRecipientEmail } from './utils/invite-admin-response.util';

@Injectable()
export class InviteEmailDeliveryService {
  private readonly logger = new Logger(InviteEmailDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxRepo: InviteEmailOutboxRepository,
    private readonly mail: TransactionalMailService,
  ) {}

  async enqueueInviteDelivery(input: {
    organizationId: string;
    inviteId: string;
    plainToken: string;
    sentByUserId: string;
    idempotencyKey: string;
  }): Promise<{ outboxId: string | null }> {
    const row = await this.outboxRepo.createEntryIdempotent({
      organizationId: input.organizationId,
      inviteId: input.inviteId,
      idempotencyKey: input.idempotencyKey,
      tokenCiphertext: encryptInviteToken(input.plainToken),
      sentByUserId: input.sentByUserId,
    });
    return { outboxId: row?.id ?? null };
  }

  async processOutboxId(
    outboxId: string,
  ): Promise<'completed' | 'retry' | 'dead_letter' | 'skipped'> {
    const claimed = await this.outboxRepo.claimForProcessing(outboxId);
    if (!claimed?.tokenCiphertext) {
      return 'skipped';
    }

    const invite = await this.prisma.organizationUserInvite.findFirst({
      where: {
        id: claimed.inviteId,
        organizationId: claimed.organizationId,
      },
      include: {
        organization: { select: { companyName: true } },
        invitedBy: { select: { name: true, email: true } },
      },
    });
    if (!invite) {
      await this.outboxRepo.markDeadLetter(claimed.id, 'INVITE_NOT_FOUND');
      return 'dead_letter';
    }

    let plainToken: string;
    try {
      plainToken = decryptInviteToken(claimed.tokenCiphertext);
    } catch {
      await this.outboxRepo.markDeadLetter(claimed.id, 'TOKEN_DECRYPT_FAILED');
      return 'dead_letter';
    }

    const inviteUrl = this.buildInviteUrl(plainToken);
    const result = await this.mail.sendOrganizationInvite({
      to: invite.email,
      organizationName: invite.organization.companyName,
      inviteUrl,
      expiresAt: invite.expiresAt,
      invitedByName: invite.invitedBy?.name ?? invite.invitedBy?.email ?? undefined,
    });

    if (result.sent || result.fallback) {
      await this.outboxRepo.markCompleted(claimed.id);
      this.logger.log(
        `invite delivery completed inviteId=${invite.id} recipient=${maskRecipientEmail(invite.email)} provider=${result.provider ?? 'unknown'}`,
      );
      return 'completed';
    }

    const errorMessage = 'INVITE_EMAIL_SEND_FAILED';
    if (claimed.attempts >= INVITE_EMAIL_OUTBOX.maxAttempts) {
      await this.outboxRepo.markDeadLetter(claimed.id, errorMessage);
      return 'dead_letter';
    }

    const retryAt = new Date(
      Date.now() +
        INVITE_EMAIL_OUTBOX.backoffMs * Math.pow(2, Math.max(0, claimed.attempts - 1)),
    );
    await this.outboxRepo.markRetry(claimed.id, errorMessage, retryAt);
    this.logger.warn(
      `invite delivery retry scheduled inviteId=${invite.id} recipient=${maskRecipientEmail(invite.email)} attempt=${claimed.attempts}`,
    );
    return 'retry';
  }

  async processOutboxIds(outboxIds: Array<string | null | undefined>): Promise<void> {
    for (const outboxId of outboxIds) {
      if (!outboxId) continue;
      try {
        await this.processOutboxId(outboxId);
      } catch (err) {
        this.logger.error(
          `invite delivery processing failed outboxId=${outboxId}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }

  private buildInviteUrl(plainToken: string): string {
    const base =
      process.env.APP_PUBLIC_URL?.trim() ||
      process.env.FRONTEND_URL?.trim() ||
      'http://localhost:5173';
    return `${base.replace(/\/$/, '')}/accept-invite?token=${encodeURIComponent(plainToken)}`;
  }
}

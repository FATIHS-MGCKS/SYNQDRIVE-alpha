import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  INVITE_RATE_LIMIT_MESSAGE,
  INVITE_RATE_LIMITS,
  type InviteRateLimitScope,
} from './invite-email.constants';

@Injectable()
export class InviteRateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCreateAllowed(
    organizationId: string,
    actorUserId: string,
    recipientEmail: string,
  ): Promise<void> {
    const email = recipientEmail.toLowerCase().trim();
    await this.assertWithinLimit('INVITE_CREATE_ORG', organizationId, organizationId);
    await this.assertWithinLimit('INVITE_CREATE_ACTOR', actorUserId, organizationId);
    await this.assertWithinLimit('INVITE_CREATE_RECIPIENT', email, organizationId);
  }

  async assertResendAllowed(
    organizationId: string,
    actorUserId: string,
    recipientEmail: string,
  ): Promise<void> {
    const email = recipientEmail.toLowerCase().trim();
    await this.assertWithinLimit('INVITE_RESEND_ORG', organizationId, organizationId);
    await this.assertWithinLimit('INVITE_RESEND_ACTOR', actorUserId, organizationId);
    await this.assertWithinLimit('INVITE_RESEND_RECIPIENT', email, organizationId);
  }

  private async assertWithinLimit(
    scope: InviteRateLimitScope,
    scopeKey: string,
    organizationId: string,
  ): Promise<void> {
    const limit = this.limitForScope(scope);
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const count = await this.prisma.organizationInviteAttempt.count({
      where: {
        scope,
        scopeKey,
        createdAt: { gte: since },
      },
    });
    if (count >= limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'INVITE_RATE_LIMITED',
          message: INVITE_RATE_LIMIT_MESSAGE,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.prisma.organizationInviteAttempt.create({
      data: {
        scope,
        scopeKey,
        organizationId,
      },
    });
  }

  private limitForScope(scope: InviteRateLimitScope): number {
    switch (scope) {
      case 'INVITE_CREATE_ORG':
        return INVITE_RATE_LIMITS.createOrgPerHour;
      case 'INVITE_CREATE_ACTOR':
        return INVITE_RATE_LIMITS.createActorPerHour;
      case 'INVITE_CREATE_RECIPIENT':
        return INVITE_RATE_LIMITS.createRecipientPerHour;
      case 'INVITE_RESEND_ORG':
        return INVITE_RATE_LIMITS.resendOrgPerHour;
      case 'INVITE_RESEND_ACTOR':
        return INVITE_RATE_LIMITS.resendActorPerHour;
      case 'INVITE_RESEND_RECIPIENT':
        return INVITE_RATE_LIMITS.resendRecipientPerHour;
      default:
        return INVITE_RATE_LIMITS.createOrgPerHour;
    }
  }
}

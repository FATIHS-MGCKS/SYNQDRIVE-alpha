import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  PASSWORD_RESET_RATE_LIMITS,
  PASSWORD_RESET_REQUEST_NEUTRAL,
  type PasswordResetRateScope,
} from './password-reset.constants';

@Injectable()
export class PasswordResetRateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async assertWithinLimit(
    scope: PasswordResetRateScope,
    scopeKey: string,
    organizationId?: string | null,
  ): Promise<void> {
    const limit = this.limitForScope(scope);
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const count = await this.prisma.passwordResetAttempt.count({
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
          code: 'PASSWORD_RESET_RATE_LIMITED',
          message: PASSWORD_RESET_REQUEST_NEUTRAL.message,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.prisma.passwordResetAttempt.create({
      data: {
        scope,
        scopeKey,
        organizationId: organizationId ?? null,
      },
    });
  }

  private limitForScope(scope: PasswordResetRateScope): number {
    switch (scope) {
      case 'IP':
        return PASSWORD_RESET_RATE_LIMITS.ipPerHour;
      case 'EMAIL':
        return PASSWORD_RESET_RATE_LIMITS.emailPerHour;
      case 'ORGANIZATION':
        return PASSWORD_RESET_RATE_LIMITS.orgPerHour;
      default:
        return PASSWORD_RESET_RATE_LIMITS.ipPerHour;
    }
  }
}

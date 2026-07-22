import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { RefreshTokenService } from './refresh-token.service';
import { PasswordResetService } from './password-reset.service';
import { OrganizationSwitchService } from './organization-switch.service';
import { AuthSessionContextService } from './auth-session-context.service';
import { PasswordResetRateLimitService } from './password-reset-rate-limit.service';
import {
  IamSessionNotificationService,
  IamSessionPolicyService,
} from './iam-session-policy.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { UserAccessAuditService } from '@modules/users/user-access-audit.service';
import { TransactionalMailService } from '@modules/users/transactional-mail.service';
import { PasswordPolicyService } from '@shared/auth/password-policy.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AuthController],
  providers: [
    RefreshTokenService,
    OrganizationSwitchService,
    AuthSessionContextService,
    IamSessionNotificationService,
    IamSessionPolicyService,
    UserAccessAuditService,
    TransactionalMailService,
    PasswordPolicyService,
    PasswordResetRateLimitService,
    PasswordResetService,
  ],
  exports: [
    RefreshTokenService,
    IamSessionPolicyService,
    PasswordPolicyService,
    PasswordResetService,
  ],
})
export class AuthApiModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { RefreshTokenService } from './refresh-token.service';
import {
  IamSessionNotificationService,
  IamSessionPolicyService,
} from './iam-session-policy.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { UserAccessAuditService } from '@modules/users/user-access-audit.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AuthController],
  providers: [
    RefreshTokenService,
    IamSessionNotificationService,
    IamSessionPolicyService,
    UserAccessAuditService,
  ],
  exports: [RefreshTokenService, IamSessionPolicyService],
})
export class AuthApiModule {}

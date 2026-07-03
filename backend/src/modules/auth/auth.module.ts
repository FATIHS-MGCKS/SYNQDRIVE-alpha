import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { RefreshTokenService } from './refresh-token.service';
import { MfaLoginService } from './mfa-login.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { TwoFactorModule } from '@modules/account/two-factor/two-factor.module';

@Module({
  imports: [ConfigModule, PrismaModule, TwoFactorModule],
  controllers: [AuthController],
  providers: [RefreshTokenService, MfaLoginService],
  exports: [RefreshTokenService, MfaLoginService, TwoFactorModule],
})
export class AuthApiModule {}

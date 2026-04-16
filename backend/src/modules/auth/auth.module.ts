import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { RefreshTokenService } from './refresh-token.service';
import { PrismaModule } from '@shared/database/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [AuthController],
  providers: [RefreshTokenService],
  exports: [RefreshTokenService],
})
export class AuthApiModule {}

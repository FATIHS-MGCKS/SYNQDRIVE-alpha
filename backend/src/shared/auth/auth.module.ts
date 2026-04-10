import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '@shared/database/prisma.module';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [PrismaModule],
  providers: [
    AuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthGuard, RolesGuard],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '@shared/database/prisma.module';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { OrgScopingGuard } from './org-scoping.guard';
import { VehicleOwnershipGuard } from './vehicle-ownership.guard';

@Module({
  imports: [PrismaModule],
  providers: [
    AuthGuard,
    RolesGuard,
    OrgScopingGuard,
    VehicleOwnershipGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthGuard, RolesGuard, OrgScopingGuard, VehicleOwnershipGuard],
})
export class AuthModule {}

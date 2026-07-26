import { Module, forwardRef } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '@shared/database/prisma.module';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { OrgScopingGuard } from './org-scoping.guard';
import { VehicleOwnershipGuard } from './vehicle-ownership.guard';
import { MasterAdminMfaGuard } from './master-admin-mfa.guard';
import { IamMfaModule } from '@modules/iam-mfa/iam-mfa.module';

@Module({
  imports: [PrismaModule, forwardRef(() => IamMfaModule)],
  providers: [
    AuthGuard,
    RolesGuard,
    OrgScopingGuard,
    VehicleOwnershipGuard,
    MasterAdminMfaGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthGuard, RolesGuard, OrgScopingGuard, VehicleOwnershipGuard, MasterAdminMfaGuard],
})
export class AuthModule {}

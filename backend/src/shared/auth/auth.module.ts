import { Module, forwardRef } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '@shared/database/prisma.module';
import { AuthGuard } from './auth.guard';
import { UserAccessAuthorityService } from './user-access-authority.service';
import { RolesGuard } from './roles.guard';
import { OrgScopingGuard } from './org-scoping.guard';
import { VehicleOwnershipGuard } from './vehicle-ownership.guard';
import { MasterAdminMfaGuard } from './master-admin-mfa.guard';
import { MasterBillingDelegateMfaGuard } from './master-billing-delegate-mfa.guard';
import { IamMfaModule } from '@modules/iam-mfa/iam-mfa.module';
import { PlatformPermissionsModule } from '@modules/users/platform-permissions/platform-permissions.module';

@Module({
  imports: [PrismaModule, PlatformPermissionsModule, forwardRef(() => IamMfaModule)],
  providers: [
    UserAccessAuthorityService,
    AuthGuard,
    RolesGuard,
    OrgScopingGuard,
    VehicleOwnershipGuard,
    MasterAdminMfaGuard,
    MasterBillingDelegateMfaGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [
    UserAccessAuthorityService,
    AuthGuard,
    RolesGuard,
    OrgScopingGuard,
    VehicleOwnershipGuard,
    MasterAdminMfaGuard,
    MasterBillingDelegateMfaGuard,
  ],
})
export class AuthModule {}
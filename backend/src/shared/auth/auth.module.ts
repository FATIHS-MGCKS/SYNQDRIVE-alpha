import { Module, forwardRef } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from '@shared/database/prisma.module';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { OrgScopingGuard } from './org-scoping.guard';
import { VehicleOwnershipGuard } from './vehicle-ownership.guard';
import { MasterAdminMfaGuard } from './master-admin-mfa.guard';
import { MasterBillingDelegateMfaGuard } from './master-billing-delegate-mfa.guard';
import { IamMfaModule } from '@modules/iam-mfa/iam-mfa.module';
import { UiAuditModule } from '@modules/ui-audit/ui-audit.module';
import { UiAuditWriteDenyGuard } from '@modules/ui-audit/ui-audit-write-deny.guard';
import { UiAuditSessionEnforcementGuard } from '@modules/ui-audit/ui-audit-session-enforcement.guard';

@Module({
  imports: [PrismaModule, forwardRef(() => IamMfaModule), UiAuditModule],
  providers: [
    AuthGuard,
    RolesGuard,
    OrgScopingGuard,
    VehicleOwnershipGuard,
    MasterAdminMfaGuard,
    MasterBillingDelegateMfaGuard,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: UiAuditSessionEnforcementGuard },
    { provide: APP_GUARD, useClass: UiAuditWriteDenyGuard },
  ],
  exports: [
    AuthGuard,
    RolesGuard,
    OrgScopingGuard,
    VehicleOwnershipGuard,
    MasterAdminMfaGuard,
    MasterBillingDelegateMfaGuard,
  ],
})
export class AuthModule {}
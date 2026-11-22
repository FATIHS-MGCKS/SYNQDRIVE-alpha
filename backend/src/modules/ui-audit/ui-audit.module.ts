import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { PlatformPermissionsModule } from '@modules/users/platform-permissions/platform-permissions.module';
import { UiAuditWriteDenyGuard } from './ui-audit-write-deny.guard';
import { UiAuditSessionEnforcementGuard } from './ui-audit-session-enforcement.guard';

@Global()
@Module({
  imports: [PrismaModule, PlatformPermissionsModule],
  providers: [UiAuditWriteDenyGuard, UiAuditSessionEnforcementGuard],
  exports: [UiAuditWriteDenyGuard, UiAuditSessionEnforcementGuard],
})
export class UiAuditModule {}
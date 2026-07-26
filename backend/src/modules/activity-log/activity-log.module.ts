import { Global, Module } from '@nestjs/common';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogExportService } from './activity-log-export.service';
import { AuditService } from './audit.service';
import { MasterAdminAuditService } from './master-admin-audit.service';
import { PrismaModule } from '@shared/database/prisma.module';

/**
 * @Global() ensures AuditService is injectable across all feature modules
 * without requiring explicit imports. This is intentional — audit is a
 * cross-cutting infrastructure concern, not a feature module.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ActivityLogController],
  providers: [ActivityLogService, ActivityLogExportService, AuditService, MasterAdminAuditService],
  exports: [ActivityLogService, ActivityLogExportService, AuditService, MasterAdminAuditService],
})
export class ActivityLogModule {}

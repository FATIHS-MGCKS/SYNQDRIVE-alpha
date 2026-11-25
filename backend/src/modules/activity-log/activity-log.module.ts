import { Global, Module } from '@nestjs/common';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogExportService } from './activity-log-export.service';
import { AuditService } from './audit.service';
import { MasterAdminAuditService } from './master-admin-audit.service';
import { MasterAdminAuditDeliveryService } from './master-admin-audit-delivery.service';
import { MasterCatalogAdminAuditService } from './master-catalog-admin-audit.service';
import { MasterVoiceProvisioningAdminAuditService } from './master-voice-provisioning-admin-audit.service';
import { PrismaModule } from '@shared/database/prisma.module';
import { MasterAdminAuditOutboxRepository } from './master-admin-audit-outbox.repository';
import { MasterAdminAuditOutboxProcessorService } from './master-admin-audit-outbox.processor';
import { MasterAdminAuditOutboxSchedulerService } from './master-admin-audit-outbox.scheduler.service';

/**
 * @Global() ensures AuditService is injectable across all feature modules
 * without requiring explicit imports. This is intentional — audit is a
 * cross-cutting infrastructure concern, not a feature module.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ActivityLogController],
  providers: [
    ActivityLogService,
    ActivityLogExportService,
    AuditService,
    MasterAdminAuditService,
    MasterAdminAuditDeliveryService,
    MasterAdminAuditOutboxRepository,
    MasterAdminAuditOutboxProcessorService,
    MasterAdminAuditOutboxSchedulerService,
    MasterCatalogAdminAuditService,
    MasterVoiceProvisioningAdminAuditService,
  ],
  exports: [
    ActivityLogService,
    ActivityLogExportService,
    AuditService,
    MasterAdminAuditService,
    MasterAdminAuditDeliveryService,
    MasterAdminAuditOutboxRepository,
    MasterAdminAuditOutboxProcessorService,
    MasterAdminAuditOutboxSchedulerService,
    MasterCatalogAdminAuditService,
    MasterVoiceProvisioningAdminAuditService,
  ],
})
export class ActivityLogModule {}

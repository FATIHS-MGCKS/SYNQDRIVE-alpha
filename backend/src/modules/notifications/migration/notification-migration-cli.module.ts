import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { NotificationRepository } from '../notification.repository';
import { NotificationArchitectureAuditService } from './notification-architecture-audit.service';
import { NotificationMigrationAcceptanceService } from './notification-migration-acceptance.service';
import { NotificationMigrationAnalysisService } from './notification-migration-analysis.service';
import { NotificationMigrationBackfillService } from './notification-migration-backfill.service';

/**
 * Lean Nest context for migration CLI scripts — avoids full AppModule circular imports.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    NotificationRepository,
    NotificationMigrationAnalysisService,
    NotificationMigrationBackfillService,
    NotificationMigrationAcceptanceService,
    NotificationArchitectureAuditService,
  ],
  exports: [
    NotificationMigrationAnalysisService,
    NotificationMigrationBackfillService,
    NotificationMigrationAcceptanceService,
    NotificationArchitectureAuditService,
  ],
})
export class NotificationMigrationCliModule {}

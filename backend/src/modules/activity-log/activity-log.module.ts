import { Global, Module } from '@nestjs/common';
import { ActivityLogController } from './activity-log.controller';
import { ActivityLogService } from './activity-log.service';
import { AuditService } from './audit.service';
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
  providers: [ActivityLogService, AuditService],
  exports: [ActivityLogService, AuditService],
})
export class ActivityLogModule {}

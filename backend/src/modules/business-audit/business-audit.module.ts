import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { BusinessAuditOutboxRepository } from './business-audit-outbox.repository';
import { BusinessAuditOutboxProcessorService } from './business-audit-outbox.processor';
import { BusinessAuditOutboxSchedulerService } from './business-audit-outbox.scheduler.service';
import { BusinessAuditOutboxMetricsService } from './business-audit-outbox.metrics';
import { BusinessAuditService } from './business-audit.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    BusinessAuditOutboxRepository,
    BusinessAuditOutboxProcessorService,
    BusinessAuditOutboxSchedulerService,
    BusinessAuditOutboxMetricsService,
    BusinessAuditService,
  ],
  exports: [
    BusinessAuditOutboxRepository,
    BusinessAuditOutboxProcessorService,
    BusinessAuditOutboxMetricsService,
    BusinessAuditService,
  ],
})
export class BusinessAuditModule {}

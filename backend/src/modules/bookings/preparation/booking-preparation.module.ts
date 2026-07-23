import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { DocumentsModule } from '@modules/documents/documents.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { TasksModule } from '@modules/tasks/tasks.module';
import { PaymentsModule } from '@modules/payments/payments.module';
import { BusinessAuditModule } from '@modules/business-audit/business-audit.module';
import { ObservabilityModule } from '@modules/observability/observability.module';
import { BookingPreparationStateRepository } from './booking-preparation-state.repository';
import { BookingPreparationStateService } from './booking-preparation-state.service';
import { BookingPreparationRecoveryService } from './booking-preparation-recovery.service';
import { BookingPreparationController } from './booking-preparation.controller';
import { BookingPreparationObservabilityService } from './booking-preparation-observability.service';
import { BookingPreparationMonitoringSchedulerService } from './booking-preparation-monitoring.scheduler';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => DocumentsModule),
    forwardRef(() => InvoicesModule),
    OutboundEmailModule,
    TasksModule,
    forwardRef(() => PaymentsModule),
    BusinessAuditModule,
    ObservabilityModule,
  ],
  controllers: [BookingPreparationController],
  providers: [
    BookingPreparationStateRepository,
    BookingPreparationStateService,
    BookingPreparationRecoveryService,
    BookingPreparationObservabilityService,
    BookingPreparationMonitoringSchedulerService,
  ],
  exports: [BookingPreparationStateService, BookingPreparationRecoveryService],
})
export class BookingPreparationModule {}

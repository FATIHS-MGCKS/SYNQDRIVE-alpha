import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import invoiceProcessConfig from '@config/invoice-process.config';
import { DocumentsModule } from '@modules/documents/documents.module';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { PrismaModule } from '@shared/database/prisma.module';
import { InvoicesModule } from '../invoices.module';
import { InvoiceProcessController } from './invoice-process.controller';
import { InvoiceProcessExecutorService } from './invoice-process-executor.service';
import { InvoiceProcessOutboxService } from './invoice-process-outbox.service';
import { InvoiceProcessProcessorService } from './invoice-process-processor.service';
import { InvoiceProcessReconciliationService } from './invoice-process-reconciliation.service';
import { InvoiceProcessRecoveryScheduler } from './invoice-process-recovery.scheduler';
import { InvoiceProcessReconciliationScheduler } from './invoice-process-reconciliation.scheduler';
import { InvoiceProcessRepository } from './invoice-process.repository';

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forFeature(invoiceProcessConfig),
    forwardRef(() => InvoicesModule),
    forwardRef(() => DocumentsModule),
    forwardRef(() => OutboundEmailModule),
  ],
  controllers: [InvoiceProcessController],
  providers: [
    InvoiceProcessRepository,
    InvoiceProcessOutboxService,
    InvoiceProcessExecutorService,
    InvoiceProcessProcessorService,
    InvoiceProcessReconciliationService,
    InvoiceProcessRecoveryScheduler,
    InvoiceProcessReconciliationScheduler,
  ],
  exports: [InvoiceProcessOutboxService, InvoiceProcessProcessorService],
})
export class InvoiceProcessModule {}

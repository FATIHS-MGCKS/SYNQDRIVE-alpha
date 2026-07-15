import { Module, forwardRef } from '@nestjs/common';
import { DocumentsModule } from '@modules/documents/documents.module';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceNumberService } from './invoice-number.service';
import { BookingInvoiceLifecycleService } from './booking-invoice-lifecycle.service';
import { FakePaidCardAuditService } from './fake-paid-card-audit.service';
import { InvoiceDocumentsService } from './invoice-documents.service';
import { InvoiceListReadService } from './invoice-list-read.service';
import { InvoiceTimelineService } from './invoice-timeline.service';
import { InvoiceOverdueSchedulerService } from './invoice-overdue-scheduler.service';
import { InvoiceAttachmentsService } from './invoice-attachments.service';
import { InvoicePaymentTaskService } from './invoice-payment-task.service';
import { TasksModule } from '@modules/tasks/tasks.module';

@Module({
  imports: [TasksModule, forwardRef(() => DocumentsModule), OutboundEmailModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoiceNumberService,
    BookingInvoiceLifecycleService,
    FakePaidCardAuditService,
    InvoiceDocumentsService,
    InvoiceTimelineService,
    InvoiceListReadService,
    InvoiceOverdueSchedulerService,
    InvoiceAttachmentsService,
    InvoicePaymentTaskService,
  ],
  exports: [InvoicesService, BookingInvoiceLifecycleService, FakePaidCardAuditService, InvoiceDocumentsService, InvoiceTimelineService, InvoiceListReadService, InvoicePaymentTaskService],
})
export class InvoicesModule {}

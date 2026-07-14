import { Module } from '@nestjs/common';
import { DocumentsModule } from '@modules/documents/documents.module';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceNumberService } from './invoice-number.service';
import { BookingInvoiceLifecycleService } from './booking-invoice-lifecycle.service';
import { FakePaidCardAuditService } from './fake-paid-card-audit.service';
import { InvoiceDocumentsService } from './invoice-documents.service';
import { TasksModule } from '@modules/tasks/tasks.module';

@Module({
  imports: [TasksModule, DocumentsModule, OutboundEmailModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoiceNumberService,
    BookingInvoiceLifecycleService,
    FakePaidCardAuditService,
    InvoiceDocumentsService,
  ],
  exports: [InvoicesService, BookingInvoiceLifecycleService, FakePaidCardAuditService, InvoiceDocumentsService],
})
export class InvoicesModule {}

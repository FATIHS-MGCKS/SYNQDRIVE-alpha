import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { OutboundEmailModule } from '@modules/outbound-email/outbound-email.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceNumberService } from './invoice-number.service';
import { BookingInvoiceLifecycleService } from './booking-invoice-lifecycle.service';
import { InvoiceDocumentsReadService } from './invoice-documents-read.service';
import { InvoiceDetailReadService } from './invoice-detail-read.service';
import { InvoiceExternalSendService } from './invoice-external-send.service';
import { InvoicePaymentService } from './invoice-payment.service';
import { TasksModule } from '@modules/tasks/tasks.module';

@Module({
  imports: [TasksModule, PrismaModule, forwardRef(() => OutboundEmailModule)],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoiceNumberService,
    BookingInvoiceLifecycleService,
    InvoiceDocumentsReadService,
    InvoiceDetailReadService,
    InvoiceExternalSendService,
    InvoicePaymentService,
  ],
  exports: [InvoicesService, BookingInvoiceLifecycleService, InvoiceDocumentsReadService, InvoiceDetailReadService, InvoiceExternalSendService, InvoicePaymentService],
})
export class InvoicesModule {}

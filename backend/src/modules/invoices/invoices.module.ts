import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceNumberService } from './invoice-number.service';
import { BookingInvoiceLifecycleService } from './booking-invoice-lifecycle.service';
import { FakePaidCardAuditService } from './fake-paid-card-audit.service';
import { TasksModule } from '@modules/tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoiceNumberService,
    BookingInvoiceLifecycleService,
    FakePaidCardAuditService,
  ],
  exports: [InvoicesService, BookingInvoiceLifecycleService, FakePaidCardAuditService],
})
export class InvoicesModule {}

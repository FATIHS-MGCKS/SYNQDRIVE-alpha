import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceNumberService } from './invoice-number.service';
import { BookingInvoiceLifecycleService } from './booking-invoice-lifecycle.service';
import { TasksModule } from '@modules/tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceNumberService, BookingInvoiceLifecycleService],
  exports: [InvoicesService, BookingInvoiceLifecycleService],
})
export class InvoicesModule {}

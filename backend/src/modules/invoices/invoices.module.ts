import { Module } from '@nestjs/common';
import { PrismaModule } from '@shared/database/prisma.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceNumberService } from './invoice-number.service';
import { BookingInvoiceLifecycleService } from './booking-invoice-lifecycle.service';
import { InvoiceDocumentsReadService } from './invoice-documents-read.service';
import { TasksModule } from '@modules/tasks/tasks.module';

@Module({
  imports: [TasksModule, PrismaModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoiceNumberService,
    BookingInvoiceLifecycleService,
    InvoiceDocumentsReadService,
  ],
  exports: [InvoicesService, BookingInvoiceLifecycleService, InvoiceDocumentsReadService],
})
export class InvoicesModule {}

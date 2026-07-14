import { Module, forwardRef } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceNumberService } from './invoice-number.service';
import { BookingInvoiceLifecycleService } from './booking-invoice-lifecycle.service';
import { FakePaidCardAuditService } from './fake-paid-card-audit.service';
import { InvoiceProcessModule } from './invoice-process/invoice-process.module';
import { TasksModule } from '@modules/tasks/tasks.module';

@Module({
  imports: [TasksModule, forwardRef(() => InvoiceProcessModule)],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoiceNumberService,
    BookingInvoiceLifecycleService,
    FakePaidCardAuditService,
  ],
  exports: [
    InvoicesService,
    BookingInvoiceLifecycleService,
    FakePaidCardAuditService,
    InvoiceProcessModule,
  ],
})
export class InvoicesModule {}

import { Module, forwardRef } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingsHandoverService } from './bookings-handover.service';
import { RentalDrivingAnalysisModule } from '../rental-driving-analysis/rental-driving-analysis.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
// V4.6.76 Rental Health V1 — BookingsService.create enforces the
// rental_blocked hard-gate via RentalHealthService.
import { RentalHealthModule } from '@modules/rental-health/rental-health.module';
// Booking Document Lifecycle — confirmed-booking + handover document triggers.
import { DocumentsModule } from '@modules/documents/documents.module';
// V4.8.3 Task Action Layer — booking lifecycle task automation.
import { TasksModule } from '@modules/tasks/tasks.module';
import { CustomersModule } from '@modules/customers/customers.module';

@Module({
  imports: [
    RentalDrivingAnalysisModule,
    forwardRef(() => InvoicesModule),
    forwardRef(() => RentalHealthModule),
    forwardRef(() => DocumentsModule),
    TasksModule,
    CustomersModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsHandoverService],
  exports: [BookingsService, BookingsHandoverService],
})
export class BookingsModule {}

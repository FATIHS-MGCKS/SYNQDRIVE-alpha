import { Module, forwardRef } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingsHandoverService } from './bookings-handover.service';
import { RentalDrivingAnalysisModule } from '../rental-driving-analysis/rental-driving-analysis.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
// V4.6.76 Rental Health V1 — BookingsService.create enforces the
// rental_blocked hard-gate via RentalHealthService.
import { RentalHealthModule } from '@modules/rental-health/rental-health.module';

@Module({
  imports: [
    RentalDrivingAnalysisModule,
    forwardRef(() => InvoicesModule),
    forwardRef(() => RentalHealthModule),
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsHandoverService],
  exports: [BookingsService, BookingsHandoverService],
})
export class BookingsModule {}

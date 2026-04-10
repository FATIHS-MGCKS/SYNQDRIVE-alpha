import { Module, forwardRef } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { RentalDrivingAnalysisModule } from '../rental-driving-analysis/rental-driving-analysis.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';

@Module({
  imports: [RentalDrivingAnalysisModule, forwardRef(() => InvoicesModule)],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}

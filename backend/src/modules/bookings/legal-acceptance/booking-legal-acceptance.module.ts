import { Module } from '@nestjs/common';
import {
  BookingLegalAcceptanceController,
  CustomerLegalAcceptanceController,
} from './booking-legal-acceptance.controller';
import { BookingLegalAcceptanceService } from './booking-legal-acceptance.service';

@Module({
  controllers: [BookingLegalAcceptanceController, CustomerLegalAcceptanceController],
  providers: [BookingLegalAcceptanceService],
  exports: [BookingLegalAcceptanceService],
})
export class BookingLegalAcceptanceModule {}

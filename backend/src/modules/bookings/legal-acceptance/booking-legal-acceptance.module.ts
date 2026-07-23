import { Module, forwardRef } from '@nestjs/common';
import {
  BookingLegalAcceptanceController,
  CustomerLegalAcceptanceController,
} from './booking-legal-acceptance.controller';
import { BookingLegalAcceptanceService } from './booking-legal-acceptance.service';
import { DocumentsModule } from '@modules/documents/documents.module';

@Module({
  imports: [forwardRef(() => DocumentsModule)],
  controllers: [BookingLegalAcceptanceController, CustomerLegalAcceptanceController],
  providers: [BookingLegalAcceptanceService],
  exports: [BookingLegalAcceptanceService],
})
export class BookingLegalAcceptanceModule {}

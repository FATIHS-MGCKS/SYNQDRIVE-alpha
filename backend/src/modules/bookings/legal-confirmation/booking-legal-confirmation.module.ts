import { Module, forwardRef } from '@nestjs/common';
import { DocumentsModule } from '@modules/documents/documents.module';
import { BookingLegalConfirmationEnforcementService } from './booking-legal-confirmation-enforcement.service';
import { BookingLegalAcceptanceModule } from '../legal-acceptance/booking-legal-acceptance.module';

@Module({
  imports: [forwardRef(() => DocumentsModule), BookingLegalAcceptanceModule],
  providers: [BookingLegalConfirmationEnforcementService],
  exports: [BookingLegalConfirmationEnforcementService],
})
export class BookingLegalConfirmationModule {}

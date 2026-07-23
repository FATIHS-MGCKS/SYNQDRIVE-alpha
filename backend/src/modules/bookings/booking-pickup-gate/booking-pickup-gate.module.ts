import { Module, forwardRef } from '@nestjs/common';
import { DocumentsModule } from '@modules/documents/documents.module';
import { BookingPreparationModule } from '../preparation/booking-preparation.module';
import { BookingPickupGateService } from './booking-pickup-gate.service';
import { BookingPickupGateAuditService } from './booking-pickup-gate-audit.service';

@Module({
  imports: [DocumentsModule, forwardRef(() => BookingPreparationModule)],
  providers: [BookingPickupGateService, BookingPickupGateAuditService],
  exports: [BookingPickupGateService, BookingPickupGateAuditService],
})
export class BookingPickupGateModule {}

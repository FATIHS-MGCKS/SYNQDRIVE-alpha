import { Module } from '@nestjs/common';
import { DocumentsModule } from '@modules/documents/documents.module';
import { BookingPickupGateService } from './booking-pickup-gate.service';
import { BookingPickupGateAuditService } from './booking-pickup-gate-audit.service';

@Module({
  imports: [DocumentsModule],
  providers: [BookingPickupGateService, BookingPickupGateAuditService],
  exports: [BookingPickupGateService, BookingPickupGateAuditService],
})
export class BookingPickupGateModule {}

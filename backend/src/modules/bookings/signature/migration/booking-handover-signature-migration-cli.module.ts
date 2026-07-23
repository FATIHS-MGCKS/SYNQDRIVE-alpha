import { Module } from '@nestjs/common';
import { DocumentsModule } from '@modules/documents/documents.module';
import { BookingHandoverSignatureMigrationService } from './booking-handover-signature-migration.service';

@Module({
  imports: [DocumentsModule],
  providers: [BookingHandoverSignatureMigrationService],
  exports: [BookingHandoverSignatureMigrationService],
})
export class BookingHandoverSignatureMigrationCliModule {}

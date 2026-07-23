import { Module, forwardRef } from '@nestjs/common';
import { DocumentsModule } from '@modules/documents/documents.module';
import { BookingHandoverSignatureService } from './booking-handover-signature.service';
import { BookingHandoverSignatureController } from './booking-handover-signature.controller';
import { BookingHandoverSignatureAccessController } from './booking-handover-signature-access.controller';
import { BookingHandoverSignatureMigrationService } from './migration/booking-handover-signature-migration.service';

@Module({
  imports: [forwardRef(() => DocumentsModule)],
  controllers: [
    BookingHandoverSignatureController,
    BookingHandoverSignatureAccessController,
  ],
  providers: [BookingHandoverSignatureService, BookingHandoverSignatureMigrationService],
  exports: [BookingHandoverSignatureService, BookingHandoverSignatureMigrationService],
})
export class BookingHandoverSignatureModule {}

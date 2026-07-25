import { Module, forwardRef } from '@nestjs/common';
import { BookingsModule } from '@modules/bookings/bookings.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { DocumentsModule } from '@modules/documents/documents.module';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { OperatorAppController } from './operator-app.controller';
import { OperatorAppService } from './operator-app.service';
import { OperatorDocumentAuditService } from './operator-document-audit.service';
import { OperatorDocumentPreviewService } from './operator-document-preview.service';

@Module({
  imports: [
    forwardRef(() => BookingsModule),
    CustomersModule,
    forwardRef(() => DocumentsModule),
    ActivityLogModule,
  ],
  controllers: [OperatorAppController],
  providers: [OperatorAppService, OperatorDocumentAuditService, OperatorDocumentPreviewService],
  exports: [OperatorAppService],
})
export class OperatorAppModule {}

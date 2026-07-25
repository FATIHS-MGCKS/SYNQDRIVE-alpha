import { Module, forwardRef } from '@nestjs/common';
import { BookingsModule } from '@modules/bookings/bookings.module';
import { CustomersModule } from '@modules/customers/customers.module';
import { DocumentsModule } from '@modules/documents/documents.module';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { VehicleIntelligenceModule } from '@modules/vehicle-intelligence/vehicle-intelligence.module';
import { OperatorAppController } from './operator-app.controller';
import { OperatorAppService } from './operator-app.service';
import { OperatorDocumentAuditService } from './operator-document-audit.service';
import { OperatorDocumentPreviewService } from './operator-document-preview.service';
import { OperatorDamageController } from './damage/operator-damage.controller';
import { OperatorDamageService } from './damage/operator-damage.service';
import { OperatorDamageAuditService } from './damage/operator-damage-audit.service';
import { OperatorTireMeasureController } from './tire-measure/operator-tire-measure.controller';
import { OperatorTireMeasureService } from './tire-measure/operator-tire-measure.service';
import { OperatorTireMeasureAuditService } from './tire-measure/operator-tire-measure-audit.service';

@Module({
  imports: [
    forwardRef(() => BookingsModule),
    CustomersModule,
    forwardRef(() => DocumentsModule),
    ActivityLogModule,
    forwardRef(() => VehicleIntelligenceModule),
  ],
  controllers: [OperatorAppController, OperatorDamageController, OperatorTireMeasureController],
  providers: [
    OperatorAppService,
    OperatorDocumentAuditService,
    OperatorDocumentPreviewService,
    OperatorDamageService,
    OperatorDamageAuditService,
    OperatorTireMeasureService,
    OperatorTireMeasureAuditService,
  ],
  exports: [OperatorAppService, OperatorDamageService, OperatorTireMeasureService],
})
export class OperatorAppModule {}

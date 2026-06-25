import { Module, forwardRef } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerDocumentsService } from './customer-documents.service';
import { CustomerEligibilityService } from './customer-eligibility.service';
import { CustomerTimelineService } from './customer-timeline.service';
import { CustomerRetentionService } from './customer-retention.service';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { CustomerVerificationModule } from '@modules/customer-verification/customer-verification.module';

@Module({
  imports: [VehicleIntelligenceModule, CustomerVerificationModule],
  controllers: [CustomersController],
  providers: [
    CustomersService,
    CustomerDocumentsService,
    CustomerEligibilityService,
    CustomerTimelineService,
    CustomerRetentionService,
  ],
  exports: [
    CustomersService,
    CustomerEligibilityService,
    CustomerTimelineService,
  ],
})
export class CustomersModule {}

import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { CustomerDocumentsService } from './customer-documents.service';
import { CustomerEligibilityService } from './customer-eligibility.service';
import { CustomerTimelineService } from './customer-timeline.service';
import { CustomerRetentionService } from './customer-retention.service';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';

@Module({
  imports: [VehicleIntelligenceModule],
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

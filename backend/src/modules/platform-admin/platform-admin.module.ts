import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { VehicleLogbookService } from './vehicle-logbook.service';
import {
  PlatformConnectivitySummaryService,
  PlatformDashboardService,
  PlatformResilienceStatusService,
} from './platform-dashboard.service';
import { DimoModule } from '../dimo/dimo.module';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { HealthModule } from '../health/health.module';
import { BillingModule } from '../billing/billing.module';
import { SupportModule } from '../support/support.module';

@Module({
  imports: [DimoModule, VehicleIntelligenceModule, HealthModule, BillingModule, SupportModule],
  controllers: [PlatformAdminController],
  providers: [
    PlatformAdminService,
    VehicleLogbookService,
    PlatformResilienceStatusService,
    PlatformConnectivitySummaryService,
    PlatformDashboardService,
  ],
  exports: [PlatformAdminService, PlatformDashboardService, PlatformConnectivitySummaryService],
})
export class PlatformAdminModule {}

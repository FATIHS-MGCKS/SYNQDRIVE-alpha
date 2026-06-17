import { Module, forwardRef } from '@nestjs/common';
import { BusinessInsightsService } from './business-insights.service';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';
import { InsightRankingService } from './insight-ranking.service';
import { InsightGroupingService } from './insight-grouping.service';
import { InsightFormatterService } from './insight-formatter.service';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { InsightTaskBridgeService } from './insight-task-bridge.service';
import { BusinessInsightsScheduler } from './business-insights-scheduler.service';
import { BusinessInsightsTriggerService } from './business-insights-trigger.service';

import { TightHandoverDetector } from './detectors/tight-handover.detector';
import { ReturnNeedsInspectionDetector } from './detectors/return-needs-inspection.detector';
import { StationShortageDetector } from './detectors/station-shortage.detector';
import { LowUtilizationDetector } from './detectors/low-utilization.detector';
import { ServiceWindowDetector } from './detectors/service-window.detector';
import { ServiceBeforeBookingDetector } from './detectors/service-before-booking.detector';
import { BatteryCriticalDetector } from './detectors/battery-critical.detector';
import { TireCriticalDetector } from './detectors/tire-critical.detector';
import { BrakeCriticalDetector } from './detectors/brake-critical.detector';
import { ComplianceOperationalDetector } from './detectors/compliance-operational.detector';
import { PickupOverdueDetector } from './detectors/pickup-overdue.detector';

import { DashboardInsightsController } from './dashboard-insights.controller';
import { InternalBusinessInsightsController } from './internal-business-insights.controller';
import { TasksModule } from '../tasks/tasks.module';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';

@Module({
  imports: [TasksModule, forwardRef(() => VehicleIntelligenceModule)],
  controllers: [DashboardInsightsController, InternalBusinessInsightsController],
  providers: [
    BusinessInsightsService,
    TenantInsightPolicyService,
    InsightRankingService,
    InsightGroupingService,
    InsightFormatterService,
    DashboardInsightsRepository,
    InsightTaskBridgeService,
    BusinessInsightsScheduler,
    BusinessInsightsTriggerService,
    TightHandoverDetector,
    ReturnNeedsInspectionDetector,
    StationShortageDetector,
    LowUtilizationDetector,
    ServiceWindowDetector,
    ServiceBeforeBookingDetector,
    BatteryCriticalDetector,
    TireCriticalDetector,
    BrakeCriticalDetector,
    ComplianceOperationalDetector,
    PickupOverdueDetector,
  ],
  exports: [BusinessInsightsService, BusinessInsightsTriggerService],
})
export class BusinessInsightsModule {}

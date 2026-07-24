import { Module, forwardRef } from '@nestjs/common';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { BusinessInsightsService } from './business-insights.service';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';
import { InsightRankingService } from './insight-ranking.service';
import { InsightGroupingService } from './insight-grouping.service';
import { InsightFormatterService } from './insight-formatter.service';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { DashboardInsightsAnalyticsService } from './dashboard-insights-analytics.service';
import { EvaluationsAnalyticsSummaryRepository } from './evaluations-analytics-summary.repository';
import { EvaluationsAnalyticsSummaryService } from './evaluations-analytics-summary.service';
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
import { DrivingAssessmentDeviceQualityDetector } from './detectors/driving-assessment-device-quality.detector';

import { DashboardInsightsController } from './dashboard-insights.controller';
import { EvaluationsInsightsController } from './evaluations-insights.controller';
import { EvaluationsAnalyticsController } from './evaluations-analytics.controller';
import { EvaluationsAnalyticsFilterService } from './evaluations-analytics-filter.service';
import { InternalBusinessInsightsController } from './internal-business-insights.controller';
import { TasksModule } from '../tasks/tasks.module';
import { VehicleIntelligenceModule } from '../vehicle-intelligence/vehicle-intelligence.module';
import { RentalHealthModule } from '../rental-health/rental-health.module';

@Module({
  imports: [
    TasksModule,
    forwardRef(() => NotificationsModule),
    forwardRef(() => VehicleIntelligenceModule),
    forwardRef(() => RentalHealthModule),
  ],
  controllers: [
    DashboardInsightsController,
    EvaluationsInsightsController,
    EvaluationsAnalyticsController,
    InternalBusinessInsightsController,
  ],
  providers: [
    BusinessInsightsService,
    TenantInsightPolicyService,
    InsightRankingService,
    InsightGroupingService,
    InsightFormatterService,
    DashboardInsightsRepository,
    DashboardInsightsAnalyticsService,
    EvaluationsAnalyticsFilterService,
    EvaluationsAnalyticsSummaryRepository,
    EvaluationsAnalyticsSummaryService,
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
    DrivingAssessmentDeviceQualityDetector,
  ],
  exports: [
    BusinessInsightsService,
    BusinessInsightsTriggerService,
    InsightTaskBridgeService,
    DashboardInsightsAnalyticsService,
    EvaluationsAnalyticsSummaryService,
  ],
})
export class BusinessInsightsModule {}

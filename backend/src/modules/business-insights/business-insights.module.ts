import { Module, forwardRef } from '@nestjs/common';
import { NotificationsModule } from '@modules/notifications/notifications.module';
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
import { DrivingAssessmentDeviceQualityDetector } from './detectors/driving-assessment-device-quality.detector';

import { DashboardInsightsController } from './dashboard-insights.controller';
import { InternalBusinessInsightsController } from './internal-business-insights.controller';
import { PredictiveFeatureController } from './predictive/predictive-feature.controller';
import { PredictiveFeatureLoader } from './predictive/predictive-feature.loader';
import { PredictiveFeatureRepository } from './predictive/predictive-feature.repository';
import { PredictiveFeatureService } from './predictive/predictive-feature.service';
import { PredictiveForecastController } from './predictive/predictive-forecast.controller';
import { PredictiveForecastLoader } from './predictive/predictive-forecast.loader';
import { PredictiveForecastRepository } from './predictive/predictive-forecast.repository';
import { PredictiveForecastScheduler } from './predictive/predictive-forecast.scheduler';
import { PredictiveForecastService } from './predictive/predictive-forecast.service';
import { PredictiveRiskController } from './predictive/predictive-risk.controller';
import { PredictiveRiskLoader } from './predictive/predictive-risk.loader';
import { PredictiveRiskRepository } from './predictive/predictive-risk.repository';
import { PredictiveRiskService } from './predictive/predictive-risk.service';
import { PredictiveBacktestController, PredictiveBacktestAdminController } from './predictive/predictive-backtest.controller';
import { PredictiveBacktestLoader } from './predictive/predictive-backtest.loader';
import { PredictiveBacktestRepository } from './predictive/predictive-backtest.repository';
import { PredictiveBacktestScheduler } from './predictive/predictive-backtest.scheduler';
import { PredictiveBacktestService } from './predictive/predictive-backtest.service';
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
    InternalBusinessInsightsController,
    PredictiveFeatureController,
    PredictiveForecastController,
    PredictiveRiskController,
    PredictiveBacktestController,
    PredictiveBacktestAdminController,
  ],
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
    PredictiveFeatureService,
    PredictiveFeatureRepository,
    PredictiveFeatureLoader,
    PredictiveForecastService,
    PredictiveForecastRepository,
    PredictiveForecastLoader,
    PredictiveForecastScheduler,
    PredictiveRiskService,
    PredictiveRiskRepository,
    PredictiveRiskLoader,
    PredictiveBacktestService,
    PredictiveBacktestRepository,
    PredictiveBacktestLoader,
    PredictiveBacktestScheduler,
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
    PredictiveFeatureService,
    PredictiveForecastService,
    PredictiveRiskService,
  ],
})
export class BusinessInsightsModule {}

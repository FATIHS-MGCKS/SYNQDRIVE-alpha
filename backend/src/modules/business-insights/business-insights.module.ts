import { Module } from '@nestjs/common';
import { BusinessInsightsService } from './business-insights.service';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';
import { InsightRankingService } from './insight-ranking.service';
import { InsightGroupingService } from './insight-grouping.service';
import { InsightFormatterService } from './insight-formatter.service';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { BusinessInsightsScheduler } from './business-insights-scheduler.service';
import { BusinessInsightsTriggerService } from './business-insights-trigger.service';

import { TightHandoverDetector } from './detectors/tight-handover.detector';
import { ReturnNeedsInspectionDetector } from './detectors/return-needs-inspection.detector';
import { StationShortageDetector } from './detectors/station-shortage.detector';
import { LowUtilizationDetector } from './detectors/low-utilization.detector';
import { ServiceWindowDetector } from './detectors/service-window.detector';
import { ServiceBeforeBookingDetector } from './detectors/service-before-booking.detector';

import { DashboardInsightsController } from './dashboard-insights.controller';
import { InternalBusinessInsightsController } from './internal-business-insights.controller';

@Module({
  controllers: [DashboardInsightsController, InternalBusinessInsightsController],
  providers: [
    BusinessInsightsService,
    TenantInsightPolicyService,
    InsightRankingService,
    InsightGroupingService,
    InsightFormatterService,
    DashboardInsightsRepository,
    BusinessInsightsScheduler,
    BusinessInsightsTriggerService,
    TightHandoverDetector,
    ReturnNeedsInspectionDetector,
    StationShortageDetector,
    LowUtilizationDetector,
    ServiceWindowDetector,
    ServiceBeforeBookingDetector,
  ],
  exports: [BusinessInsightsService, BusinessInsightsTriggerService],
})
export class BusinessInsightsModule {}

import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VehicleIntelligenceController } from './vehicle-intelligence.controller';
import { DamagesOrgController } from './damages/damages-org.controller';
import { BatteryService } from './battery/battery.service';
import { TiresService } from './tires/tires.service';
import { TireWearModelService } from './tires/tire-wear-model.service';
import { TireHealthService } from './tires/tire-health.service';
import { TireHealthAlertService } from './tires/tire-health-alert.service';
import { TireLifecycleService } from './tires/tire-lifecycle.service';
import { TireIdentityService } from './tires/tire-identity.service';
import { BrakesService } from './brakes/brakes.service';
import { BrakeHealthService } from './brakes/brake-health.service';
import { BrakeEvidenceService } from './brakes/brake-evidence.service';
import { BrakeLifecycleService } from './brakes/brake-lifecycle.service';
import { BrakeInitializationWorkflowService } from './brakes/brake-initialization-workflow.service';
import { BrakeEnrichmentJobDiagnosticsService } from './brakes/brake-enrichment-job-diagnostics.service';
import { BrakeRegistrationService } from './brakes/brake-registration.service';
import { BrakeRegistrationBackfillService } from './brakes/brake-registration-backfill.service';
import { BrakeBaselineCandidateAuditService } from './brakes/brake-baseline-candidate-audit.service';
import { BrakeComponentInstallationService } from './brakes/brake-component-installation.service';
import { TireOdometerAnchorBackfillService } from './tires/tire-odometer-anchor-backfill.service';
import { TireTripUsageBackfillService } from './tires/tire-trip-usage-backfill.service';
import { TireTripUsageLedgerReconciliationService } from './tires/tire-trip-usage-ledger-reconciliation.service';
import { TireTripUsageService } from './tires/tire-trip-usage.service';
import { TireMetricsService } from './tires/tire-metrics.service';
import { TireHealthObservabilityService } from './tires/tire-health-observability.service';
import { TirePredictionValidationService } from './tires/tire-prediction-validation.service';
import { TireHealthReplayService } from './tires/tire-health-replay.service';
import { ServiceEventsService } from './service-events/service-events.service';
import { EnrichmentJobsService } from './enrichment-jobs/enrichment-jobs.service';
import { DtcService } from './dtc/dtc.service';
import { DtcKnowledgeService } from './dtc-knowledge/dtc-knowledge.service';
import { DtcKnowledgeEnrichmentService } from './dtc-knowledge/dtc-knowledge-enrichment.service';
import { DtcAiResearchService } from './dtc-knowledge/dtc-ai-research.service';
import { DTC_RESEARCH_PORT } from './dtc-knowledge/dtc-research.port';
import { DrivingEventsService } from './driving-events/driving-events.service';
import { TripsService } from './trips/trips.service';
import { TripDetectionOrchestrationService } from './trips/trip-detection-orchestration.service';
import { TripBehaviorEnrichmentService } from './trips/trip-behavior-enrichment.service';
import { TripEnrichmentOrchestratorService } from './trips/trip-enrichment-orchestrator.service';
import { TripAnalysisCoordinatorService } from './trips/trip-analysis-coordinator.service';
import { LteR1BehaviorEnrichmentService } from './trips/lte-r1-behavior-enrichment.service';
import { EventContextEnrichmentService } from './event-context/event-context-enrichment.service';
import { HfMirrorService } from './trips/hf-mirror.service';
import { WaypointMirrorService } from './trips/waypoint-mirror.service';
import { ActivityWindowProducerService } from './trips/activity-window-producer.service';
import { TripChEvidenceMirrorCoordinator } from './trips/trip-ch-evidence-mirror.coordinator';
import { MapboxService } from './trips/mapbox.service';
import { MapboxRouteMatcherService } from './trips/mapbox-route-matcher.service';
import { FmmRouteMatcherService } from './trips/fmm-route-matcher.service';
import { ROUTE_MAP_MATCHER } from './trips/route-map-matcher.port';
import { TripAssignmentService } from './trips/trip-assignment.service';
import { TripAttributionService } from './trips/trip-attribution.service';
import { DriverScoreService } from './trips/driver-score.service';
import { TripAnalyticsCanonicalService } from './trips/trip-analytics-canonical.service';
import { DamagesService } from './damages/damages.service';
import { BatteryHealthService } from './battery-health/battery-health.service';
import { HvBatteryHealthService } from './battery-health/hv-battery-health.service';
import { BatteryV2Service } from './battery-health/battery-v2.service';
import { BatteryEvidenceService } from './battery-health/battery-evidence.service';
import { CanonicalBatteryHealthService } from './battery-health/canonical-battery-health.service';
import { HealthSummaryService } from './health-summary/health-summary.service';
import { AiHealthCareAggregationService } from './health-summary/ai-health-care-aggregation.service';
import { VehicleHealthTabSummaryService } from './health-summary/vehicle-health-tab-summary.service';
import { RentalHealthModule } from '../rental-health/rental-health.module';
import { DashboardWarningLightsService } from './dashboard-warning-lights/dashboard-warning-lights.service';
import { ServiceComplianceService } from './service-compliance/service-compliance.service';
import { ComplianceTaskMaterializeService } from './service-compliance/compliance-task-materialize.service';
import { ServiceOverdueTaskService } from './service-compliance/service-overdue-task.service';
import { VehicleFileSummaryService } from './vehicle-file/vehicle-file-summary.service';
import { TasksModule } from '../tasks/tasks.module';
import { DrivingImpactService } from './driving-impact/driving-impact.service';
import { EnergyEventsService } from './energy-events/energy-events.service';
import { DimoModule } from '../dimo/dimo.module';
import { AiModule } from '../ai/ai.module';
import { MisuseCasesModule } from './misuse-cases/misuse-cases.module';
import { InvoicesModule } from '@modules/invoices/invoices.module';
import { HighMobilityModule } from '../high-mobility/high-mobility.module';
import { QUEUE_NAMES } from '../../workers/queues/queue-names';
// ── New refactored providers ──
import { TripDecisionEngine } from './trips/decision/trip-decision.engine';
import { TripDetectionPolicyResolver } from './trips/policy/trip-detection-policy.resolver';
import { TripReconciliationService } from './trips/reconciliation/trip-reconciliation.service';
import { DetectorRegistry } from './trips/detectors/detector.registry';
import { SnapshotEvidenceEvaluator } from './trips/detectors/snapshot-evidence.evaluator';
import { StartConfirmationDetector } from './trips/detectors/start-confirmation.detector';
import { ContinuityAssessmentDetector } from './trips/detectors/continuity-assessment.detector';
import { EndContinuityDetector } from './trips/detectors/end-continuity.detector';
import { ChangePointEndDetector } from './trips/detectors/change-point-end.detector';
import { TripQualityDetector } from './trips/detectors/trip-quality.detector';
import { TripOverlapDetector } from './trips/detectors/trip-overlap.detector';
import { IgnitionSegmentDetector } from './trips/detectors/ignition-segment.detector';
import { MotionSegmentDetector } from './trips/detectors/motion-segment.detector';
import { ActivityWindowDetector } from './trips/detectors/activity-window.detector';
import { DrivingAssessmentDeviceQualityService } from './trips/driving-assessment-device-quality.service';
import { TechnicalObservationsModule } from '../technical-observations/technical-observations.module';
import { BusinessInsightsModule } from '../business-insights/business-insights.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';

@Module({
  imports: [
    forwardRef(() => DimoModule),
    AiModule,
    forwardRef(() => MisuseCasesModule),
    forwardRef(() => InvoicesModule),
    forwardRef(() => HighMobilityModule),
    forwardRef(() => RentalHealthModule),
    forwardRef(() => TechnicalObservationsModule),
    forwardRef(() => BusinessInsightsModule),
    NotificationsModule,
    TasksModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.TRIP_TRACKING },
      { name: QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT },
      { name: QUEUE_NAMES.DRIVING_IMPACT_COMPUTE },
      { name: QUEUE_NAMES.DTC_KNOWLEDGE_ENRICHMENT },
    ),
  ],
  controllers: [VehicleIntelligenceController, DamagesOrgController],
  providers: [
    BatteryService,
    TiresService,
    TireWearModelService,
    TireHealthService,
    TireHealthAlertService,
    TirePredictionValidationService,
    TireHealthReplayService,
    TireLifecycleService,
    TireIdentityService,
    BrakesService,
    BrakeHealthService,
    BrakeEvidenceService,
    BrakeLifecycleService,
    BrakeInitializationWorkflowService,
    BrakeEnrichmentJobDiagnosticsService,
    BrakeRegistrationService,
    BrakeRegistrationBackfillService,
    BrakeBaselineCandidateAuditService,
    BrakeComponentInstallationService,
    TireOdometerAnchorBackfillService,
    TireTripUsageBackfillService,
    TireTripUsageLedgerReconciliationService,
    TireTripUsageService,
    TireMetricsService,
    TireHealthObservabilityService,
    ServiceEventsService,
    EnrichmentJobsService,
    DtcService,
    DtcKnowledgeService,
    DtcKnowledgeEnrichmentService,
    DtcAiResearchService,
    { provide: DTC_RESEARCH_PORT, useExisting: DtcAiResearchService },
    DrivingEventsService,
    TripsService,
    TripDetectionOrchestrationService,
    TripBehaviorEnrichmentService,
    TripEnrichmentOrchestratorService,
    TripAnalysisCoordinatorService,
    EventContextEnrichmentService,
    LteR1BehaviorEnrichmentService,
    DrivingAssessmentDeviceQualityService,
    HfMirrorService,
    WaypointMirrorService,
    ActivityWindowProducerService,
    TripChEvidenceMirrorCoordinator,
    MapboxService,
    MapboxRouteMatcherService,
    FmmRouteMatcherService,
    {
      provide: ROUTE_MAP_MATCHER,
      useExisting: MapboxRouteMatcherService,
    },
    TripAssignmentService,
    TripAttributionService,
    DriverScoreService,
    TripAnalyticsCanonicalService,
    DamagesService,
    BatteryHealthService,
    HvBatteryHealthService,
    BatteryV2Service,
    BatteryEvidenceService,
    CanonicalBatteryHealthService,
    HealthSummaryService,
    AiHealthCareAggregationService,
    VehicleHealthTabSummaryService,
    DashboardWarningLightsService,
    ServiceComplianceService,
    ComplianceTaskMaterializeService,
    ServiceOverdueTaskService,
    VehicleFileSummaryService,
    DrivingImpactService,
    EnergyEventsService,
    // ── New refactored providers ──
    TripDecisionEngine,
    TripDetectionPolicyResolver,
    TripReconciliationService,
    // Detector instances (all implement TripDetector interface)
    SnapshotEvidenceEvaluator,
    StartConfirmationDetector,
    ContinuityAssessmentDetector,
    EndContinuityDetector,
    ChangePointEndDetector,
    TripQualityDetector,
    TripOverlapDetector,
    IgnitionSegmentDetector,
    MotionSegmentDetector,
    ActivityWindowDetector,
    // Registry dispatches to detector instances by name (from PolicyResolver output)
    DetectorRegistry,
  ],
  exports: [
    BatteryService,
    TiresService,
    TireWearModelService,
    TireHealthService,
    TireHealthAlertService,
    TirePredictionValidationService,
    TireHealthReplayService,
    TireLifecycleService,
    TireIdentityService,
    BrakesService,
    BrakeHealthService,
    BrakeEvidenceService,
    BrakeLifecycleService,
    BrakeInitializationWorkflowService,
    BrakeEnrichmentJobDiagnosticsService,
    BrakeRegistrationService,
    BrakeRegistrationBackfillService,
    BrakeBaselineCandidateAuditService,
    BrakeComponentInstallationService,
    TireOdometerAnchorBackfillService,
    TireTripUsageBackfillService,
    TireTripUsageLedgerReconciliationService,
    TireTripUsageService,
    TireMetricsService,
    TireHealthObservabilityService,
    ServiceEventsService,
    EnrichmentJobsService,
    DtcService,
    DtcKnowledgeService,
    DtcKnowledgeEnrichmentService,
    DrivingEventsService,
    TripsService,
    TripDetectionOrchestrationService,
    TripBehaviorEnrichmentService,
    TripEnrichmentOrchestratorService,
    TripAnalysisCoordinatorService,
    LteR1BehaviorEnrichmentService,
    DrivingAssessmentDeviceQualityService,
    EventContextEnrichmentService,
    TripAssignmentService,
    TripAttributionService,
    DriverScoreService,
    TripAnalyticsCanonicalService,
    DamagesService,
    BatteryHealthService,
    HvBatteryHealthService,
    BatteryV2Service,
    BatteryEvidenceService,
    CanonicalBatteryHealthService,
    ServiceComplianceService,
    ComplianceTaskMaterializeService,
    ServiceOverdueTaskService,
    DrivingImpactService,
    EnergyEventsService,
    TripDecisionEngine,
    TripDetectionPolicyResolver,
    TripReconciliationService,
    DetectorRegistry,
  ],
})
export class VehicleIntelligenceModule {}

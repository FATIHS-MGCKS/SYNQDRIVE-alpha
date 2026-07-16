import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VehicleIntelligenceController } from './vehicle-intelligence.controller';
import { DamagesOrgController } from './damages/damages-org.controller';
import { BatteryService } from './battery/battery.service';
import { TiresService } from './tires/tires.service';
import { TireWearModelService } from './tires/tire-wear-model.service';
import { TireHealthService } from './tires/tire-health.service';
import { TireLifecycleService } from './tires/tire-lifecycle.service';
import { TireIdentityService } from './tires/tire-identity.service';
import { BrakesService } from './brakes/brakes.service';
import { BrakeHealthService } from './brakes/brake-health.service';
import { BrakeEvidenceService } from './brakes/brake-evidence.service';
import { BrakeLifecycleService } from './brakes/brake-lifecycle.service';
import { BrakeRegistrationBackfillService } from './brakes/brake-registration-backfill.service';
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
import { BatteryMeasurementSessionRepository } from './battery-health/battery-measurement-session.repository';
import { BatteryMeasurementSessionService } from './battery-health/battery-measurement-session.service';
import { BatteryMeasurementRepository } from './battery-health/battery-measurement.repository';
import { BatteryMeasurementService } from './battery-health/battery-measurement.service';
import { BatteryAssessmentRepository } from './battery-health/battery-assessment.repository';
import { BatteryAssessmentService } from './battery-health/battery-assessment.service';
import { BatteryPublicationRepository } from './battery-health/battery-publication.repository';
import { BatteryPublicationService } from './battery-health/battery-publication.service';
import { LvCanonicalBatteryResolverService } from './battery-health/lv-canonical/lv-canonical-battery-resolver.service';
import { HvMethodProfileService } from './battery-health/hv-method-profile/hv-method-profile.service';
import {
  HvChargeSessionIngestService,
  HvChargeSessionPersistService,
  HvChargeSessionRepository,
  HvFallbackChargeSessionDetectorService,
  HvRechargeSessionReconcileProducerService,
  HvRechargeSessionReconcileService,
} from './battery-health/hv-charge-session';
import {
  HvCapacityM2SampleProviderService,
  HvCapacityObservationRepository,
  HvCapacityShadowProducerService,
  HvCapacityShadowService,
  HvCapacitySessionSummaryService,
} from './battery-health/hv-capacity-shadow';
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
import { BatteryV2JobsProducerModule } from './battery-health/jobs/battery-v2-jobs-producer.module';
import { DriveProfileResolverService } from './drive-profile/drive-profile-resolver.service';
import { LvBatteryChemistryResolverService } from './lv-battery-chemistry/lv-battery-chemistry-resolver.service';
import { BatteryPolicyProfileService } from './battery-policy-profile/battery-policy-profile.service';
import { BatteryCapabilityPreflightRepository } from './battery-health/capability-preflight/battery-capability-preflight.repository';
import { BatteryCapabilityPreflightService } from './battery-health/capability-preflight/battery-capability-preflight.service';
import { BatteryCapabilityRefreshService } from './battery-health/capability-preflight/battery-capability-refresh.service';
import { BatteryCapabilityMeasurementGateService } from './battery-health/capability-preflight/battery-capability-measurement-gate.service';
import { LvRestWindowStateMachineService } from './battery-health/lv-rest-window/lv-rest-window.service';
import { BatteryRestTargetEvaluationService } from './battery-health/lv-rest-window/battery-rest-target-evaluation.service';
import { LvRestShadowSummaryService } from './battery-health/lv-rest-window/lv-rest-shadow-summary.service';
import { LvStartProxyDiagnosticService } from './battery-health/lv-start-proxy/lv-start-proxy-diagnostic.service';
import { BatteryStartProxyExtractService } from './battery-health/lv-start-proxy/battery-start-proxy-extract.service';

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
    BatteryV2JobsProducerModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.TRIP_TRACKING },
      { name: QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT },
      { name: QUEUE_NAMES.DRIVING_IMPACT_COMPUTE },
      { name: QUEUE_NAMES.DTC_KNOWLEDGE_ENRICHMENT },
      { name: QUEUE_NAMES.BATTERY_V2 },
    ),
  ],
  controllers: [VehicleIntelligenceController, DamagesOrgController],
  providers: [
    BatteryService,
    TiresService,
    TireWearModelService,
    TireHealthService,
    TireLifecycleService,
    TireIdentityService,
    BrakesService,
    BrakeHealthService,
    BrakeEvidenceService,
    BrakeLifecycleService,
    BrakeRegistrationBackfillService,
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
    BatteryMeasurementSessionRepository,
    BatteryMeasurementSessionService,
    BatteryMeasurementRepository,
    BatteryMeasurementService,
    BatteryAssessmentRepository,
    BatteryAssessmentService,
    BatteryPublicationRepository,
    BatteryPublicationService,
    LvCanonicalBatteryResolverService,
    HvMethodProfileService,
    HvChargeSessionRepository,
    HvChargeSessionPersistService,
    HvChargeSessionIngestService,
    HvFallbackChargeSessionDetectorService,
    HvRechargeSessionReconcileProducerService,
    HvRechargeSessionReconcileService,
    HvCapacityObservationRepository,
    HvCapacityM2SampleProviderService,
    HvCapacityShadowService,
    HvCapacityShadowProducerService,
    HvCapacitySessionSummaryService,
    DriveProfileResolverService,
    LvBatteryChemistryResolverService,
    BatteryPolicyProfileService,
    BatteryCapabilityPreflightRepository,
    BatteryCapabilityPreflightService,
    BatteryCapabilityRefreshService,
    BatteryCapabilityMeasurementGateService,
    LvRestWindowStateMachineService,
    BatteryRestTargetEvaluationService,
    LvRestShadowSummaryService,
    LvStartProxyDiagnosticService,
    BatteryStartProxyExtractService,
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
    TireLifecycleService,
    TireIdentityService,
    BrakesService,
    BrakeHealthService,
    BrakeEvidenceService,
    BrakeLifecycleService,
    BrakeRegistrationBackfillService,
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
    BatteryMeasurementSessionRepository,
    BatteryMeasurementSessionService,
    BatteryMeasurementRepository,
    BatteryMeasurementService,
    BatteryAssessmentRepository,
    BatteryAssessmentService,
    BatteryPublicationRepository,
    BatteryPublicationService,
    LvCanonicalBatteryResolverService,
    HvMethodProfileService,
    HvChargeSessionRepository,
    HvChargeSessionPersistService,
    HvChargeSessionIngestService,
    HvFallbackChargeSessionDetectorService,
    HvRechargeSessionReconcileProducerService,
    HvRechargeSessionReconcileService,
    HvCapacityObservationRepository,
    HvCapacityM2SampleProviderService,
    HvCapacityShadowService,
    HvCapacityShadowProducerService,
    HvCapacitySessionSummaryService,
    DriveProfileResolverService,
    LvBatteryChemistryResolverService,
    BatteryPolicyProfileService,
    BatteryCapabilityPreflightRepository,
    BatteryCapabilityPreflightService,
    BatteryCapabilityRefreshService,
    BatteryCapabilityMeasurementGateService,
    LvRestWindowStateMachineService,
    BatteryRestTargetEvaluationService,
    LvRestShadowSummaryService,
    LvStartProxyDiagnosticService,
    BatteryStartProxyExtractService,
    ServiceComplianceService,
    ComplianceTaskMaterializeService,
    ServiceOverdueTaskService,
    DrivingImpactService,
    EnergyEventsService,
    TripDecisionEngine,
    TripDetectionPolicyResolver,
    TripReconciliationService,
    DetectorRegistry,
    BatteryV2JobsProducerModule,
  ],
})
export class VehicleIntelligenceModule {}

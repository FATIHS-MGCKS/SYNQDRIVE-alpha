import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RedisModule } from '@shared/redis/redis.module';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { DataAuthorizationsController } from './data-authorizations.controller';
import { DataAuthorizationsService } from './data-authorizations.service';
import { DataAuthorizationEnforcementService } from './data-authorization-enforcement.service';
import { EnforcementPolicyScopeController } from './privacy-domain/enforcement-policy-scope/enforcement-policy-scope.controller';
import { EnforcementPolicyScopeService } from './privacy-domain/enforcement-policy-scope/enforcement-policy-scope.service';
import { EnforcementPolicyScopeValidationService } from './privacy-domain/enforcement-policy-scope/enforcement-policy-scope-validation.service';
import { DataAuthorizationLegacyMigrationService } from './privacy-domain/legacy-migration/data-authorization-legacy-migration.service';
import { DataSharingAuthorizationController } from './privacy-domain/data-sharing-authorization/data-sharing-authorization.controller';
import { DataSharingAuthorizationService } from './privacy-domain/data-sharing-authorization/data-sharing-authorization.service';
import { DataSubjectConsentController } from './privacy-domain/data-subject-consent/data-subject-consent.controller';
import { DataSubjectConsentService } from './privacy-domain/data-subject-consent/data-subject-consent.service';
import { LegalBasisAssessmentController } from './privacy-domain/legal-basis-assessment/legal-basis-assessment.controller';
import { LegalBasisAssessmentService } from './privacy-domain/legal-basis-assessment/legal-basis-assessment.service';
import { ProviderAccessGrantController } from './privacy-domain/provider-access-grant/provider-access-grant.controller';
import { ProviderAccessGrantService } from './privacy-domain/provider-access-grant/provider-access-grant.service';
import { EnforcementPolicyLifecycleService } from './privacy-domain/policy-lifecycle/enforcement-policy-lifecycle.service';
import { PolicyLifecycleEventsService } from './privacy-domain/policy-lifecycle/policy-lifecycle-events.service';
import { PolicyLifecycleService, PolicyLifecycleTransitionValidator } from './privacy-domain/policy-lifecycle/policy-lifecycle.service';
import { ProcessingActivityLifecycleService } from './privacy-domain/policy-lifecycle/processing-activity-lifecycle.service';
import { PolicyLifecycleController } from './privacy-domain/policy-lifecycle/policy-lifecycle.controller';
import { PolicyLifecycleActivationGuardService } from './privacy-domain/policy-lifecycle/policy-lifecycle-activation-guard.service';
import { PolicyLifecycleExpiryService } from './privacy-domain/policy-lifecycle/policy-lifecycle-expiry.service';
import { PolicyLifecycleExpirySchedulerService } from './privacy-domain/policy-lifecycle/policy-lifecycle-expiry.scheduler.service';
import { ProcessingActivityRegisterController } from './processing-activity-register/processing-activity-register.controller';
import { ProcessingActivityRegisterService } from './processing-activity-register/processing-activity-register.service';
import { ProcessingActivityRegisterCompletenessService } from './processing-activity-register/processing-activity-register-completeness.service';
import { ProcessingActivityRegisterExportService } from './processing-activity-register/processing-activity-register-export.service';
import { ProcessingActivityRegisterAuditService } from './processing-activity-register/processing-activity-register-audit.service';
import { ProcessingActivityRegisterExportPurgeSchedulerService } from './processing-activity-register/processing-activity-register-export-purge.scheduler.service';
import { DpiaWorkflowController } from './dpia-workflow/dpia-workflow.controller';
import { PrivacyRiskAssessmentService } from './dpia-workflow/privacy-risk-assessment.service';
import { DpiaWorkflowService } from './dpia-workflow/dpia-workflow.service';
import { DpiaDecisionRecorderService } from './dpia-workflow/dpia-decision-recorder.service';
import { DpiaActivationGateService } from './dpia-workflow/dpia-activation-gate.service';
import { DpiaReviewDueSchedulerService } from './dpia-workflow/dpia-review-due.scheduler.service';
import { ProcessorDpaController } from './processor-dpa/processor-dpa.controller';
import { DataProcessingAgreementService } from './processor-dpa/data-processing-agreement.service';
import { DpaSubprocessorService } from './processor-dpa/dpa-subprocessor.service';
import { DpaTransferAssessmentService } from './processor-dpa/dpa-transfer-assessment.service';
import { DpaAuditService } from './processor-dpa/dpa-audit.service';
import { DpaContractGateService } from './processor-dpa/dpa-contract-gate.service';
import { DpaExpirySchedulerService } from './processor-dpa/dpa-expiry.scheduler.service';
import { RetentionDeletionController } from './retention-deletion/retention-deletion.controller';
import { RetentionPolicyService, RetentionRevocationAssessmentService } from './retention-deletion/retention-policy.service';
import { RetentionDeletionAuditService } from './retention-deletion/retention-deletion-audit.service';
import { RetentionActivationGateService } from './retention-deletion/retention-activation-gate.service';
import { RetentionDeletionExecutorService } from './retention-deletion/retention-deletion-executor.service';
import { RetentionDeletionSchedulerService } from './retention-deletion/retention-deletion.scheduler.service';
import {
  DeletionClickHouseAdapter,
  DeletionDerivedDataAdapter,
  DeletionObjectStorageAdapter,
  DeletionPostgresAdapter,
  DeletionRedisAdapter,
  DeletionStoreRegistry,
} from './retention-deletion/deletion-store.adapters';
import { ComplianceEvidenceController } from './compliance-evidence/compliance-evidence.controller';
import { ComplianceEvidenceService } from './compliance-evidence/compliance-evidence.service';
import { ComplianceEvidenceAssemblerService } from './compliance-evidence/compliance-evidence-assembler.service';
import { ComplianceEvidenceExportService } from './compliance-evidence/compliance-evidence-export.service';
import { ComplianceEvidenceAuditService } from './compliance-evidence/compliance-evidence-audit.service';
import { ComplianceEvidenceSchedulerService } from './compliance-evidence/compliance-evidence.scheduler.service';
import { PolicyResolverService } from './policy-resolver/policy-resolver.service';
import { AuthorizationDecisionService } from './authorization-decision-engine/authorization-decision.service';
import { AuthorizationDecisionStartupService } from './authorization-decision-engine/authorization-decision-startup.service';
import { DataAuthorizationAuditController } from './privacy-domain/audit-log/data-authorization-audit.controller';
import { DataAuthorizationAuditOutboxMetricsService } from './privacy-domain/audit-log/data-authorization-audit-outbox.metrics';
import { DataAuthorizationAuditOutboxProcessorService } from './privacy-domain/audit-log/data-authorization-audit-outbox.processor';
import { DataAuthorizationAuditOutboxRepository } from './privacy-domain/audit-log/data-authorization-audit-outbox.repository';
import { DataAuthorizationAuditOutboxSchedulerService } from './privacy-domain/audit-log/data-authorization-audit-outbox.scheduler.service';
import { DataAuthorizationAuditService } from './privacy-domain/audit-log/data-authorization-audit.service';
import { DataProcessingReviewWorkflowService } from './privacy-domain/review-workflow/review-workflow.service';
import { DataProcessingPermissionService } from './privacy-domain/review-workflow/data-processing-permission.service';
import { DataProcessingReviewWorkflowController } from './privacy-domain/review-workflow/review-workflow.controller';
import { LiveGpsEnforcementService } from './live-gps-enforcement/live-gps-enforcement.service';
import { TelemetryIngestionEnforcementService } from './telemetry-ingestion-enforcement/telemetry-ingestion-enforcement.service';
import { TelemetryIngestionEnforcementMetricsService } from './telemetry-ingestion-enforcement/telemetry-ingestion-enforcement.metrics';
import { TripLocationEnforcementService } from './trip-location-enforcement/trip-location-enforcement.service';
import { TripLocationEnforcementMetricsService } from './trip-location-enforcement/trip-location-enforcement.metrics';
import { VehicleHealthEnforcementService } from './vehicle-health-enforcement/vehicle-health-enforcement.service';
import { VehicleHealthEnforcementMetricsService } from './vehicle-health-enforcement/vehicle-health-enforcement.metrics';
import { DrivingBehaviorEnforcementService } from './driving-behavior-enforcement/driving-behavior-enforcement.service';
import { DrivingBehaviorEnforcementMetricsService } from './driving-behavior-enforcement/driving-behavior-enforcement.metrics';
import { NotificationEnforcementService } from './notification-enforcement/notification-enforcement.service';
import { NotificationEnforcementMetricsService } from './notification-enforcement/notification-enforcement.metrics';
import { ExternalAccessEnforcementService } from './external-access-enforcement/external-access-enforcement.service';
import { ExternalAccessEnforcementMetricsService } from './external-access-enforcement/external-access-enforcement.metrics';
import { EnforcementCoverageRegistryController } from './enforcement-coverage-registry/enforcement-coverage-registry.controller';
import { EnforcementCoverageRegistryService } from './enforcement-coverage-registry/enforcement-coverage-registry.service';
import { EnforcementCoverageHealthService } from './enforcement-coverage-registry/enforcement-coverage-health.service';
import { EnforcementCoverageRegistryMetricsService } from './enforcement-coverage-registry/enforcement-coverage-registry.metrics';
import { RevocationOrchestratorController } from './revocation-orchestrator/revocation-orchestrator.controller';
import { DenySwitchController } from './deny-switch/deny-switch.controller';
import { DenySwitchLocalStore } from './deny-switch/deny-switch.local-store';
import { DenySwitchMetricsService } from './deny-switch/deny-switch.metrics';
import { DenySwitchPropagationService } from './deny-switch/deny-switch.propagation.service';
import { DenySwitchRepository } from './deny-switch/deny-switch.repository';
import { DenySwitchService } from './deny-switch/deny-switch.service';
import { DenySwitchStartupService } from './deny-switch/deny-switch.startup.service';
import { RevocationOrchestratorRepository } from './revocation-orchestrator/revocation-orchestrator.repository';
import { RevocationOrchestratorService } from './revocation-orchestrator/revocation-orchestrator.service';
import { RevocationOrchestratorSchedulerService } from './revocation-orchestrator/revocation-orchestrator.scheduler.service';
import {
  DefaultRevocationProviderRevoker,
  RevocationOrchestratorSteps,
} from './revocation-orchestrator/revocation-orchestrator.steps';
import { RevocationOrchestratorEnqueueService } from './revocation-orchestrator/revocation-orchestrator.enqueue.service';
import { ProviderGrantConsolidationService } from './provider-grant-consolidation/provider-grant-consolidation.service';
import { ProviderGrantProvisioningService } from './provider-grant-consolidation/provider-grant-provisioning.service';
import { ProviderGrantVerificationService } from './provider-grant-consolidation/provider-grant-verification.service';
import { RevocationQueueControlService } from './revocation-queue-control/revocation-queue-control.service';
import { ScheduledJobRevocationService } from './revocation-queue-control/scheduled-job-revocation.service';
import { DownstreamRevocationNotifyService } from './revocation-queue-control/downstream-revocation-notify.service';
import { WorkerRevocationCheckpointService } from './revocation-queue-control/worker-revocation-checkpoint.service';
import { WorkerRuntimeHealthService } from './revocation-queue-control/worker-runtime-health.service';
import { QueueEnqueueGuardService } from './revocation-queue-control/queue-enqueue-guard.service';
import { REVOCATION_QUEUE_CATALOG } from './revocation-queue-control/revocation-queue-catalog';

@Module({
  imports: [
    RedisModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.DIMO_SNAPSHOT },
      { name: QUEUE_NAMES.DTC_POLL },
      { name: QUEUE_NAMES.TRIP_TRACKING },
      ...REVOCATION_QUEUE_CATALOG.filter(
        (e) =>
          e.queueName !== QUEUE_NAMES.DIMO_SNAPSHOT &&
          e.queueName !== QUEUE_NAMES.DTC_POLL &&
          e.queueName !== QUEUE_NAMES.TRIP_TRACKING,
      ).map((e) => ({ name: e.queueName })),
    ),
  ],
  controllers: [
    DataAuthorizationsController,
    LegalBasisAssessmentController,
    DataSubjectConsentController,
    ProviderAccessGrantController,
    DataSharingAuthorizationController,
    EnforcementPolicyScopeController,
    PolicyLifecycleController,
    DataProcessingReviewWorkflowController,
    DataAuthorizationAuditController,
    EnforcementCoverageRegistryController,
    RevocationOrchestratorController,
    DenySwitchController,
    ProcessingActivityRegisterController,
    DpiaWorkflowController,
    ProcessorDpaController,
    RetentionDeletionController,
    ComplianceEvidenceController,
  ],
  providers: [
    DataAuthorizationsService,
    DataAuthorizationEnforcementService,
    LegalBasisAssessmentService,
    DataSubjectConsentService,
    ProviderAccessGrantService,
    DataSharingAuthorizationService,
    EnforcementPolicyScopeService,
    EnforcementPolicyScopeValidationService,
    DataAuthorizationLegacyMigrationService,
    PolicyLifecycleTransitionValidator,
    PolicyLifecycleService,
    PolicyLifecycleEventsService,
    PolicyLifecycleActivationGuardService,
    PolicyLifecycleExpiryService,
    PolicyLifecycleExpirySchedulerService,
    ProcessingActivityRegisterService,
    ProcessingActivityRegisterCompletenessService,
    ProcessingActivityRegisterExportService,
    ProcessingActivityRegisterAuditService,
    ProcessingActivityRegisterExportPurgeSchedulerService,
    PrivacyRiskAssessmentService,
    DpiaWorkflowService,
    DpiaDecisionRecorderService,
    DpiaActivationGateService,
    DpiaReviewDueSchedulerService,
    DataProcessingAgreementService,
    DpaSubprocessorService,
    DpaTransferAssessmentService,
    DpaAuditService,
    DpaContractGateService,
    DpaExpirySchedulerService,
    RetentionDeletionAuditService,
    RetentionPolicyService,
    RetentionRevocationAssessmentService,
    RetentionActivationGateService,
    DeletionPostgresAdapter,
    DeletionClickHouseAdapter,
    DeletionObjectStorageAdapter,
    DeletionRedisAdapter,
    DeletionDerivedDataAdapter,
    DeletionStoreRegistry,
    RetentionDeletionExecutorService,
    RetentionDeletionSchedulerService,
    ComplianceEvidenceAuditService,
    ComplianceEvidenceAssemblerService,
    ComplianceEvidenceExportService,
    ComplianceEvidenceService,
    ComplianceEvidenceSchedulerService,
    ProcessingActivityLifecycleService,
    EnforcementPolicyLifecycleService,
    PolicyResolverService,
    AuthorizationDecisionService,
    AuthorizationDecisionStartupService,
    DataAuthorizationAuditService,
    DataAuthorizationAuditOutboxRepository,
    DataAuthorizationAuditOutboxProcessorService,
    DataAuthorizationAuditOutboxMetricsService,
    DataAuthorizationAuditOutboxSchedulerService,
    DataProcessingReviewWorkflowService,
    DataProcessingPermissionService,
    LiveGpsEnforcementService,
    TelemetryIngestionEnforcementService,
    TelemetryIngestionEnforcementMetricsService,
    TripLocationEnforcementService,
    TripLocationEnforcementMetricsService,
    VehicleHealthEnforcementService,
    VehicleHealthEnforcementMetricsService,
    DrivingBehaviorEnforcementService,
    DrivingBehaviorEnforcementMetricsService,
    NotificationEnforcementService,
    NotificationEnforcementMetricsService,
    ExternalAccessEnforcementService,
    ExternalAccessEnforcementMetricsService,
    EnforcementCoverageRegistryService,
    EnforcementCoverageHealthService,
    EnforcementCoverageRegistryMetricsService,
    RevocationOrchestratorRepository,
    RevocationOrchestratorSteps,
    DefaultRevocationProviderRevoker,
    RevocationOrchestratorService,
    RevocationOrchestratorSchedulerService,
    RevocationOrchestratorEnqueueService,
    DenySwitchLocalStore,
    DenySwitchRepository,
    DenySwitchMetricsService,
    DenySwitchPropagationService,
    DenySwitchService,
    DenySwitchStartupService,
    ProviderGrantConsolidationService,
    ProviderGrantProvisioningService,
    ProviderGrantVerificationService,
    RevocationQueueControlService,
    ScheduledJobRevocationService,
    DownstreamRevocationNotifyService,
    WorkerRevocationCheckpointService,
    WorkerRuntimeHealthService,
    QueueEnqueueGuardService,
  ],
  exports: [
    DataAuthorizationsService,
    DataAuthorizationEnforcementService,
    LegalBasisAssessmentService,
    DataSubjectConsentService,
    ProviderAccessGrantService,
    DataSharingAuthorizationService,
    EnforcementPolicyScopeService,
    EnforcementPolicyScopeValidationService,
    DataAuthorizationLegacyMigrationService,
    PolicyLifecycleService,
    ProcessingActivityLifecycleService,
    PolicyLifecycleExpiryService,
    ProcessingActivityRegisterService,
    ProcessingActivityRegisterExportService,
    DpiaActivationGateService,
    DpiaWorkflowService,
    DataProcessingAgreementService,
    DpaContractGateService,
    RetentionActivationGateService,
    RetentionDeletionExecutorService,
    ComplianceEvidenceExportService,
    EnforcementPolicyLifecycleService,
    PolicyResolverService,
    AuthorizationDecisionService,
    DataAuthorizationAuditService,
    DataProcessingReviewWorkflowService,
    LiveGpsEnforcementService,
    TelemetryIngestionEnforcementService,
    TelemetryIngestionEnforcementMetricsService,
    TripLocationEnforcementService,
    TripLocationEnforcementMetricsService,
    VehicleHealthEnforcementService,
    VehicleHealthEnforcementMetricsService,
    DrivingBehaviorEnforcementService,
    DrivingBehaviorEnforcementMetricsService,
    NotificationEnforcementService,
    NotificationEnforcementMetricsService,
    ExternalAccessEnforcementService,
    ExternalAccessEnforcementMetricsService,
    EnforcementCoverageRegistryService,
    EnforcementCoverageHealthService,
    EnforcementCoverageRegistryMetricsService,
    RevocationOrchestratorService,
    RevocationOrchestratorEnqueueService,
    DenySwitchService,
    ProviderGrantProvisioningService,
    ProviderGrantConsolidationService,
    RevocationQueueControlService,
    WorkerRevocationCheckpointService,
    WorkerRuntimeHealthService,
    QueueEnqueueGuardService,
  ],
})
export class DataAuthorizationsModule {}

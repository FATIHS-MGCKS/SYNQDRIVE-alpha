import { Module } from '@nestjs/common';
import { RedisModule } from '@shared/redis/redis.module';
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

@Module({
  imports: [RedisModule],
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
  ],
})
export class DataAuthorizationsModule {}

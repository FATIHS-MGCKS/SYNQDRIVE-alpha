import { Module } from '@nestjs/common';
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

@Module({
  controllers: [
    DataAuthorizationsController,
    LegalBasisAssessmentController,
    DataSubjectConsentController,
    ProviderAccessGrantController,
    DataSharingAuthorizationController,
    EnforcementPolicyScopeController,
    PolicyLifecycleController,
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
  ],
})
export class DataAuthorizationsModule {}

import { Module } from '@nestjs/common';
import { DataAuthorizationsController } from './data-authorizations.controller';
import { DataAuthorizationsService } from './data-authorizations.service';
import { DataAuthorizationEnforcementService } from './data-authorization-enforcement.service';
import { EnforcementPolicyScopeController } from './privacy-domain/enforcement-policy-scope/enforcement-policy-scope.controller';
import { EnforcementPolicyScopeService } from './privacy-domain/enforcement-policy-scope/enforcement-policy-scope.service';
import { EnforcementPolicyScopeValidationService } from './privacy-domain/enforcement-policy-scope/enforcement-policy-scope-validation.service';
import { DataSharingAuthorizationController } from './privacy-domain/data-sharing-authorization/data-sharing-authorization.controller';
import { DataSharingAuthorizationService } from './privacy-domain/data-sharing-authorization/data-sharing-authorization.service';
import { DataSubjectConsentController } from './privacy-domain/data-subject-consent/data-subject-consent.controller';
import { DataSubjectConsentService } from './privacy-domain/data-subject-consent/data-subject-consent.service';
import { LegalBasisAssessmentController } from './privacy-domain/legal-basis-assessment/legal-basis-assessment.controller';
import { LegalBasisAssessmentService } from './privacy-domain/legal-basis-assessment/legal-basis-assessment.service';
import { ProviderAccessGrantController } from './privacy-domain/provider-access-grant/provider-access-grant.controller';
import { ProviderAccessGrantService } from './privacy-domain/provider-access-grant/provider-access-grant.service';

@Module({
  controllers: [
    DataAuthorizationsController,
    LegalBasisAssessmentController,
    DataSubjectConsentController,
    ProviderAccessGrantController,
    DataSharingAuthorizationController,
    EnforcementPolicyScopeController,
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
  ],
})
export class DataAuthorizationsModule {}

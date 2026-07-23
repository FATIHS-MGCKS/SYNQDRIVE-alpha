import { Module } from '@nestjs/common';
import { DataAuthorizationsController } from './data-authorizations.controller';
import { DataAuthorizationsService } from './data-authorizations.service';
import { DataAuthorizationEnforcementService } from './data-authorization-enforcement.service';
import { LegalBasisAssessmentController } from './privacy-domain/legal-basis-assessment/legal-basis-assessment.controller';
import { LegalBasisAssessmentService } from './privacy-domain/legal-basis-assessment/legal-basis-assessment.service';

@Module({
  controllers: [DataAuthorizationsController, LegalBasisAssessmentController],
  providers: [
    DataAuthorizationsService,
    DataAuthorizationEnforcementService,
    LegalBasisAssessmentService,
  ],
  exports: [
    DataAuthorizationsService,
    DataAuthorizationEnforcementService,
    LegalBasisAssessmentService,
  ],
})
export class DataAuthorizationsModule {}

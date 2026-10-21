import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { runVehicleOnboardingHttp } from '../http/vehicle-onboarding-http.util';
import { parseCandidateListQuery } from '../policy/candidate-list-query.validation';
import { VehicleOnboardingProviderCandidateService } from '../services/vehicle-onboarding-provider-candidate.service';

@Controller('admin/vehicle-onboarding')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)
@Roles('MASTER_ADMIN')
export class VehicleOnboardingProviderCandidateController {
  constructor(private readonly candidateService: VehicleOnboardingProviderCandidateService) {}

  @Get('organizations/:orgId/candidates')
  async listCandidates(
    @Param('orgId') orgId: string,
    @Query('provider') provider?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return runVehicleOnboardingHttp(async () => {
      const query = parseCandidateListQuery({ provider, limit, cursor });
      return this.candidateService.listProviderCandidates(orgId, query);
    });
  }
}

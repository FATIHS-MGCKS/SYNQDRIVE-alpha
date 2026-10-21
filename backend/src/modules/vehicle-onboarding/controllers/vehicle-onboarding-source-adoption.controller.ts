import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { Roles } from '@shared/decorators/roles.decorator';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { runVehicleOnboardingHttp } from '../http/vehicle-onboarding-http.util';
import {
  parseSourceAdoptRequestBody,
  parseSourceAttachRequestBody,
} from '../policy/source-adoption-request.validation';
import { VehicleOnboardingSourceAdoptionService } from '../services/vehicle-onboarding-source-adoption.service';

@Controller('admin/vehicle-onboarding')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_INTEGRATIONS)
@Roles('MASTER_ADMIN')
export class VehicleOnboardingSourceAdoptionController {
  constructor(private readonly sourceAdoptionService: VehicleOnboardingSourceAdoptionService) {}

  private actorUserId(req: Request & { user?: { id?: string; sub?: string } }): string | null {
    const id = req.user?.id ?? req.user?.sub;
    return id ?? null;
  }

  @Post('organizations/:orgId/sources/adopt')
  async adoptSource(
    @Param('orgId') orgId: string,
    @Body() body: unknown,
    @Req() req: Request & { user?: { id?: string; sub?: string } },
  ) {
    return runVehicleOnboardingHttp(async () => {
      const parsed = parseSourceAdoptRequestBody(body);
      return this.sourceAdoptionService.adoptProviderSource({
        organizationId: orgId,
        actorUserId: this.actorUserId(req),
        provider: parsed.provider,
        sourceMirrorId: parsed.sourceMirrorId,
        idempotencyKey: parsed.idempotencyKey,
      });
    });
  }

  @Post('organizations/:orgId/cases/:caseId/sources/attach')
  async attachSource(
    @Param('orgId') orgId: string,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() req: Request & { user?: { id?: string; sub?: string } },
  ) {
    return runVehicleOnboardingHttp(async () => {
      const parsed = parseSourceAttachRequestBody(body);
      return this.sourceAdoptionService.attachProviderSource({
        organizationId: orgId,
        caseId,
        actorUserId: this.actorUserId(req),
        provider: parsed.provider,
        sourceMirrorId: parsed.sourceMirrorId,
        expectedConcurrencyToken: parsed.expectedConcurrencyToken,
      });
    });
  }
}

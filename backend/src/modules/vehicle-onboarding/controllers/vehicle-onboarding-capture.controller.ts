import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { runVehicleOnboardingHttp } from '../http/vehicle-onboarding-http.util';
import {
  parseCaptureRequestBody,
  parseCaseListQuery,
  parseReadinessEvaluateRequestBody,
  parseReadinessSealRequestBody,
  parseRequiredConcurrencyToken,
} from '../policy/capture-request.validation';
import { VehicleOnboardingCaptureService } from '../services/vehicle-onboarding-capture.service';

@Controller('organizations/:orgId/vehicle-onboarding')
@UseGuards(OrgScopingGuard, PermissionsGuard)
export class VehicleOnboardingCaptureController {
  constructor(private readonly captureService: VehicleOnboardingCaptureService) {}

  private actorUserId(req: Request & { user?: { id?: string; sub?: string } }): string {
    const id = req.user?.id ?? req.user?.sub;
    if (!id) {
      throw new UnauthorizedException('Authenticated user required');
    }
    return id;
  }

  @Get('cases')
  @RequirePermission('fleet', 'read')
  async listCases(
    @Param('orgId') orgId: string,
    @Query('status') status?: string,
    @Query('sourceMode') sourceMode?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return runVehicleOnboardingHttp(async () => {
      const query = parseCaseListQuery({ status, sourceMode, limit, cursor });
      return this.captureService.listCases(orgId, query);
    });
  }

  @Get('cases/:caseId')
  @RequirePermission('fleet', 'read')
  async getCase(@Param('orgId') orgId: string, @Param('caseId') caseId: string) {
    return runVehicleOnboardingHttp(() => this.captureService.getCase(orgId, caseId));
  }

  @Put('cases/:caseId/admin-baseline')
  @RequirePermission('fleet', 'write')
  async updateAdminBaseline(
    @Param('orgId') orgId: string,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() req: Request & { user?: { id?: string; sub?: string } },
  ) {
    return runVehicleOnboardingHttp(async () => {
      const record = parseCaptureRequestBody(body);
      const expectedConcurrencyToken = parseRequiredConcurrencyToken(record);
      const { expectedConcurrencyToken: _drop, ...adminBody } = record;
      return this.captureService.updateAdminBaseline({
        organizationId: orgId,
        caseId,
        actorUserId: this.actorUserId(req),
        body: adminBody,
        expectedConcurrencyToken,
      });
    });
  }

  @Put('cases/:caseId/technical-baseline')
  @RequirePermission('fleet', 'write')
  async updateTechnicalBaseline(
    @Param('orgId') orgId: string,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() req: Request & { user?: { id?: string; sub?: string } },
  ) {
    return runVehicleOnboardingHttp(async () => {
      const record = parseCaptureRequestBody(body);
      const expectedConcurrencyToken = parseRequiredConcurrencyToken(record);
      const { expectedConcurrencyToken: _drop, ...technicalBody } = record;
      return this.captureService.updateTechnicalBaseline({
        organizationId: orgId,
        caseId,
        actorUserId: this.actorUserId(req),
        body: technicalBody,
        expectedConcurrencyToken,
      });
    });
  }

  @Post('cases/:caseId/readiness/evaluate')
  @RequirePermission('fleet', 'read')
  async evaluateReadiness(
    @Param('orgId') orgId: string,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() req: Request & { user?: { id?: string; sub?: string } },
  ) {
    return runVehicleOnboardingHttp(async () => {
      const selectedProduct = parseReadinessEvaluateRequestBody(body);
      return this.captureService.evaluateReadinessPreview({
        organizationId: orgId,
        caseId,
        selectedProduct,
        actorUserId: this.actorUserId(req),
      });
    });
  }

  @Post('cases/:caseId/readiness/seal')
  @RequirePermission('fleet', 'write')
  async sealReadiness(
    @Param('orgId') orgId: string,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Req() req: Request & { user?: { id?: string; sub?: string } },
  ) {
    return runVehicleOnboardingHttp(async () => {
      const { selectedProduct, expectedConcurrencyToken } = parseReadinessSealRequestBody(body);
      return this.captureService.sealReadiness({
        organizationId: orgId,
        caseId,
        selectedProduct,
        actorUserId: this.actorUserId(req),
        expectedConcurrencyToken,
      });
    });
  }
}

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
import { ProductSlug } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RequirePermission } from '@shared/decorators/require-permission.decorator';
import { runVehicleOnboardingHttp } from '../http/vehicle-onboarding-http.util';
import { VehicleOnboardingCaptureService } from '../services/vehicle-onboarding-capture.service';

class ExpectedConcurrencyBody {
  expectedConcurrencyToken!: string | null;
}

class ReadinessEvaluateBody {
  selectedProduct!: ProductSlug;
}

class ReadinessSealBody extends ExpectedConcurrencyBody {
  selectedProduct!: ProductSlug;
}

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
    return runVehicleOnboardingHttp(() =>
      this.captureService.listCases(orgId, {
        status,
        sourceMode,
        limit: limit ? parseInt(limit, 10) : undefined,
        cursor,
      }),
    );
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
    @Body() body: Record<string, unknown> & ExpectedConcurrencyBody,
    @Req() req: Request & { user?: { id?: string; sub?: string } },
  ) {
    const { expectedConcurrencyToken, ...adminBody } = body;
    return runVehicleOnboardingHttp(() =>
      this.captureService.updateAdminBaseline({
        organizationId: orgId,
        caseId,
        actorUserId: this.actorUserId(req),
        body: adminBody,
        expectedConcurrencyToken: expectedConcurrencyToken ?? null,
      }),
    );
  }

  @Put('cases/:caseId/technical-baseline')
  @RequirePermission('fleet', 'write')
  async updateTechnicalBaseline(
    @Param('orgId') orgId: string,
    @Param('caseId') caseId: string,
    @Body() body: Record<string, unknown> & ExpectedConcurrencyBody,
    @Req() req: Request & { user?: { id?: string; sub?: string } },
  ) {
    const { expectedConcurrencyToken, ...technicalBody } = body;
    return runVehicleOnboardingHttp(() =>
      this.captureService.updateTechnicalBaseline({
        organizationId: orgId,
        caseId,
        actorUserId: this.actorUserId(req),
        body: technicalBody,
        expectedConcurrencyToken: expectedConcurrencyToken ?? null,
      }),
    );
  }

  @Post('cases/:caseId/readiness/evaluate')
  @RequirePermission('fleet', 'read')
  async evaluateReadiness(
    @Param('orgId') orgId: string,
    @Param('caseId') caseId: string,
    @Body() body: ReadinessEvaluateBody,
    @Req() req: Request & { user?: { id?: string; sub?: string } },
  ) {
    return runVehicleOnboardingHttp(() =>
      this.captureService.evaluateReadinessPreview({
        organizationId: orgId,
        caseId,
        selectedProduct: body.selectedProduct,
        actorUserId: this.actorUserId(req),
      }),
    );
  }

  @Post('cases/:caseId/readiness/seal')
  @RequirePermission('fleet', 'write')
  async sealReadiness(
    @Param('orgId') orgId: string,
    @Param('caseId') caseId: string,
    @Body() body: ReadinessSealBody,
    @Req() req: Request & { user?: { id?: string; sub?: string } },
  ) {
    return runVehicleOnboardingHttp(() =>
      this.captureService.sealReadiness({
        organizationId: orgId,
        caseId,
        selectedProduct: body.selectedProduct,
        actorUserId: this.actorUserId(req),
        expectedConcurrencyToken: body.expectedConcurrencyToken ?? null,
      }),
    );
  }
}

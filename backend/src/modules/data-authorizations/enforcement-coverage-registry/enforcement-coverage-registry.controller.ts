import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { randomUUID } from 'crypto';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { RolesGuard } from '@shared/auth/roles.guard';
import { DataProcessingPermissionService } from '../privacy-domain/review-workflow/data-processing-permission.service';
import { EnforcementCoverageRegistryService } from './enforcement-coverage-registry.service';

@ApiTags('data-authorizations/coverage')
@Controller('organizations/:orgId/data-authorizations/coverage')
@UseGuards(OrgScopingGuard, RolesGuard, PermissionsGuard)
export class EnforcementCoverageRegistryController {
  constructor(
    private readonly coverageRegistry: EnforcementCoverageRegistryService,
    private readonly permissions: DataProcessingPermissionService,
  ) {}

  private actor(req: Request) {
    const user = (req as Request & { user?: { id?: string; platformRole?: string } }).user;
    return { id: user?.id ?? 'system', platformRole: user?.platformRole };
  }

  /** Coverage readiness — no secrets, aggregate status only. */
  @Get()
  async getCoverage(
    @Param('orgId') orgId: string,
    @Req() req: Request,
    @Query('correlationId') correlationId?: string,
  ) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.coverage_view');
    return this.coverageRegistry.evaluate(orgId, correlationId ?? randomUUID());
  }

  /** Runtime enforcement metrics snapshot (aggregate counters, no PII). */
  @Get('metrics')
  async getMetrics(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.coverage_view');
    return {
      organizationId: orgId,
      evaluatedAt: new Date().toISOString(),
      metrics: this.coverageRegistry.getRuntimeMetricsSnapshot(),
    };
  }

  /** Registry integrity check for post-deploy verification. */
  @Get('integrity')
  async getIntegrity(@Param('orgId') orgId: string, @Req() req: Request) {
    await this.permissions.assert(this.actor(req), orgId, 'data_processing.coverage_view');
    const result = this.coverageRegistry.validateRegistryIntegrity();
    return {
      organizationId: orgId,
      evaluatedAt: new Date().toISOString(),
      ...result,
    };
  }
}

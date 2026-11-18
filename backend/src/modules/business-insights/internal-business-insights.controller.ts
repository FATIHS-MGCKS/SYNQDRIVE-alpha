import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { RequireMasterAdminMfa } from '@shared/decorators/require-master-admin-mfa.decorator';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { BusinessInsightsService } from './business-insights.service';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';
import { BusinessInsightsTriggerService } from './business-insights-trigger.service';
import { PolicyUpdatePayload } from './insight.types';
import {
  InternalBusinessInsightsAdminAuditService,
  type BusinessInsightsAuditRequest,
  policyUpdateFieldNames,
} from './internal-business-insights-admin-audit.service';

type AuthedRequest = BusinessInsightsAuditRequest;

@Controller('admin/business-insights')
@UseGuards(RolesGuard, MasterAdminMfaGuard)
@Roles('MASTER_ADMIN')
export class InternalBusinessInsightsController {
  constructor(
    private readonly insightsService: BusinessInsightsService,
    private readonly repo: DashboardInsightsRepository,
    private readonly policyService: TenantInsightPolicyService,
    private readonly triggerService: BusinessInsightsTriggerService,
    private readonly insightsAdminAudit: InternalBusinessInsightsAdminAuditService,
  ) {}

  // ─── Run triggers ──────────────────────────────────────────────────

  @Post('run-all')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_PLATFORM_SETTINGS)
  async runAll(@Req() req: AuthedRequest) {
    const results = await this.insightsService.runForAllActiveOrganizations('manual_admin');
    const totalPublished = results.reduce((s, r) => s + r.published, 0);
    const orgsWithZeroPublished = results.filter((r) => r.published === 0).length;
    this.insightsAdminAudit.recordManualRunAll({
      req,
      organizationCount: results.length,
      totalPublished,
      orgsWithZeroPublished,
    });
    return {
      trigger: 'manual_admin',
      organizationCount: results.length,
      totalPublished,
      results,
    };
  }

  @Post('run/:orgId')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ORGANIZATION)
  async runForOrg(
    @Param('orgId') orgId: string,
    @Req() req: AuthedRequest,
    @Query('force') force?: string,
  ) {
    const trigger = force === 'true' ? 'manual_force' : 'manual_admin_single';
    const result = await this.insightsService.runForOrganization(orgId, trigger);
    this.insightsAdminAudit.recordManualRunOrg({
      req,
      targetOrganizationId: orgId,
      trigger,
      runId: result.runId,
      published: result.published,
    });
    return { trigger, ...result };
  }

  @Post('trigger/:orgId')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ORGANIZATION)
  async triggerDebouncedRerun(@Param('orgId') orgId: string, @Req() req: AuthedRequest) {
    await this.triggerService.requestDebouncedRerun(orgId, 'manual_debounced_trigger');
    this.insightsAdminAudit.recordDebouncedTriggerQueued({
      req,
      targetOrganizationId: orgId,
      triggerSource: 'manual_debounced_trigger',
    });
    return { status: 'queued', message: 'Debounced rerun requested, will execute after debounce window' };
  }

  // ─── Active insights ──────────────────────────────────────────────

  @Get('active/:orgId')
  async getActiveInsights(@Param('orgId') orgId: string) {
    return this.repo.getActiveInsights(orgId, 10);
  }

  // ─── Run history & diagnostics ─────────────────────────────────────

  @Get('runs/:orgId')
  async getRunHistory(
    @Param('orgId') orgId: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Math.max(parseInt(limit || '20', 10) || 20, 1), 100);
    return this.repo.getRunHistory(orgId, take);
  }

  @Get('run-detail/:runId')
  async getRunDetail(@Param('runId') runId: string) {
    const detail = await this.repo.getRunDetail(runId);
    if (!detail) throw new NotFoundException(`Run ${runId} not found`);
    return detail;
  }

  // ─── Policy management ─────────────────────────────────────────────

  @Get('policy/:orgId')
  async getPolicy(@Param('orgId') orgId: string) {
    return this.policyService.getPolicy(orgId);
  }

  @Patch('policy/:orgId')
  @RequireMasterAdminMfa(STEP_UP_ACTION.MASTER_ORGANIZATION)
  async updatePolicy(
    @Param('orgId') orgId: string,
    @Body() payload: PolicyUpdatePayload,
    @Req() req: AuthedRequest,
  ) {
    const policy = await this.policyService.updatePolicy(orgId, payload);
    this.insightsAdminAudit.recordPolicyUpdate({
      req,
      targetOrganizationId: orgId,
      updatedFieldNames: policyUpdateFieldNames(payload),
      enabledAfter: policy.enabled,
    });
    return policy;
  }
}

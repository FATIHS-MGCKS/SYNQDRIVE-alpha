import { Controller, Post, Get, Patch, Param, Body, Query, UseGuards, NotFoundException } from '@nestjs/common';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';
import { BusinessInsightsService } from './business-insights.service';
import { DashboardInsightsRepository } from './dashboard-insights.repository';
import { TenantInsightPolicyService } from './tenant-insight-policy.service';
import { BusinessInsightsTriggerService } from './business-insights-trigger.service';
import { PolicyUpdatePayload } from './insight.types';

@Controller('admin/business-insights')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class InternalBusinessInsightsController {
  constructor(
    private readonly insightsService: BusinessInsightsService,
    private readonly repo: DashboardInsightsRepository,
    private readonly policyService: TenantInsightPolicyService,
    private readonly triggerService: BusinessInsightsTriggerService,
  ) {}

  // ─── Run triggers ──────────────────────────────────────────────────

  @Post('run-all')
  async runAll() {
    const results = await this.insightsService.runForAllActiveOrganizations('manual_admin');
    return {
      trigger: 'manual_admin',
      organizationCount: results.length,
      totalPublished: results.reduce((s, r) => s + r.published, 0),
      results,
    };
  }

  @Post('run/:orgId')
  async runForOrg(
    @Param('orgId') orgId: string,
    @Query('force') force?: string,
  ) {
    const trigger = force === 'true' ? 'manual_force' : 'manual_admin_single';
    const result = await this.insightsService.runForOrganization(orgId, trigger);
    return { trigger, ...result };
  }

  @Post('trigger/:orgId')
  async triggerDebouncedRerun(@Param('orgId') orgId: string) {
    await this.triggerService.requestDebouncedRerun(orgId, 'manual_debounced_trigger');
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
  async updatePolicy(
    @Param('orgId') orgId: string,
    @Body() payload: PolicyUpdatePayload,
  ) {
    return this.policyService.updatePolicy(orgId, payload);
  }
}

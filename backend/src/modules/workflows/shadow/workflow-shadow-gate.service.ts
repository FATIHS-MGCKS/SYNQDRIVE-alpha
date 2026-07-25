import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrgWorkflow } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { resolveTaskAutomationWorkflowRuntimeMode } from '@config/task-automation-workflow-runtime.config';
import { WorkflowRuntimeRolloutService } from '../rollout/workflow-runtime-rollout.service';
import type { WorkflowShadowGateResult } from './workflow-shadow.types';
import { shouldRunWorkflowLive, shouldRunWorkflowShadow } from './workflow-shadow-comparison.util';

@Injectable()
export class WorkflowShadowGateService {
  private readonly settingsCache = new Map<string, { at: number; enabled: boolean; legacyCompare: boolean }>();
  private static readonly CACHE_TTL_MS = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly rollout: WorkflowRuntimeRolloutService,
  ) {}

  async resolve(orgId: string, workflow: OrgWorkflow): Promise<WorkflowShadowGateResult> {
    const orgSettings = await this.getOrgSettings(orgId);
    const globalOn = this.config.get<boolean>('workflowShadow.globallyEnabled') === true;
    const rolloutFlags = await this.rollout.resolveEffectiveFlags(orgId, workflow.id);
    const runtimeShadow =
      rolloutFlags.effectiveStage === 'SHADOW'
      || resolveTaskAutomationWorkflowRuntimeMode() === 'shadow';
    const orgShadowEnabled = globalOn || orgSettings.enabled || rolloutFlags.runShadow || runtimeShadow;

    const runShadow =
      rolloutFlags.runShadow && shouldRunWorkflowShadow(workflow, orgShadowEnabled);
    const runLive =
      rolloutFlags.runLiveEngine
      && shouldRunWorkflowLive(workflow)
      && rolloutFlags.executionPath !== 'shadow_compare';

    return {
      orgShadowEnabled,
      runShadow,
      runLive,
      legacyCompare: orgSettings.legacyCompare,
    };
  }

  async isOrgShadowEnabled(orgId: string): Promise<boolean> {
    const orgSettings = await this.getOrgSettings(orgId);
    const globalOn = this.config.get<boolean>('workflowShadow.globallyEnabled') === true;
    const rolloutFlags = await this.rollout.resolveEffectiveFlags(orgId);
    return (
      globalOn
      || orgSettings.enabled
      || rolloutFlags.runShadow
      || resolveTaskAutomationWorkflowRuntimeMode() === 'shadow'
    );
  }

  async isLegacyCompareEnabled(orgId: string): Promise<boolean> {
    const orgSettings = await this.getOrgSettings(orgId);
    return orgSettings.legacyCompare;
  }

  async getRetentionDays(orgId: string): Promise<number> {
    const row = await this.prisma.orgWorkflowShadowSettings.findUnique({
      where: { organizationId: orgId },
    });
    return (
      row?.retentionDays
      ?? this.config.get<number>('workflowShadow.defaultRetentionDays')
      ?? 30
    );
  }

  private async getOrgSettings(orgId: string): Promise<{ enabled: boolean; legacyCompare: boolean }> {
    const cached = this.settingsCache.get(orgId);
    const now = Date.now();
    if (cached && now - cached.at < WorkflowShadowGateService.CACHE_TTL_MS) {
      return { enabled: cached.enabled, legacyCompare: cached.legacyCompare };
    }

    const row = await this.prisma.orgWorkflowShadowSettings.findUnique({
      where: { organizationId: orgId },
    });
    const enabled = row?.enabled ?? false;
    const legacyCompare = row?.legacyCompareEnabled ?? true;
    this.settingsCache.set(orgId, { at: now, enabled, legacyCompare });
    return { enabled, legacyCompare };
  }

  invalidateOrgCache(orgId: string): void {
    this.settingsCache.delete(orgId);
  }
}

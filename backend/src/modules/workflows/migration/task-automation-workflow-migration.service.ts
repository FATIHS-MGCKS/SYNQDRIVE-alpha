import { Injectable, Logger } from '@nestjs/common';
import {
  Prisma,
  TaskAutomationWorkflowMigrationMode,
  TaskAutomationWorkflowMigrationStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { resolveTaskAutomationWorkflowRuntimeMode } from '@config/task-automation-workflow-runtime.config';
import { listMaterializationAutomationRules } from '@modules/tasks/automation/task-automation-rule.util';
import { TaskAutomationRuleResolverService } from '@modules/tasks/automation/task-automation-rule-resolver.service';
import {
  MAX_TASK_AUTOMATION_OFFSET_MINUTES,
  MIN_TASK_AUTOMATION_OFFSET_MINUTES,
} from '@modules/tasks/automation/task-automation-rule-override.service';
import {
  LEGACY_ACTION_TO_CANONICAL,
  LEGACY_TRIGGER_TO_EVENT,
} from '../workflow.constants';
import { TaskAutomationWorkflowTemplateService } from '../task-automation-bridge/task-automation-workflow-template.service';
import type {
  TaskAutomationWorkflowMigrationReport,
  TaskAutomationWorkflowMigrationRuleResult,
  TaskAutomationWorkflowMigrationRunOptions,
  TaskAutomationWorkflowMigrationStats,
} from './task-automation-workflow-migration.types';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class TaskAutomationWorkflowMigrationService {
  private readonly logger = new Logger(TaskAutomationWorkflowMigrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: TaskAutomationRuleResolverService,
    private readonly templateService: TaskAutomationWorkflowTemplateService,
  ) {}

  async run(options: TaskAutomationWorkflowMigrationRunOptions): Promise<TaskAutomationWorkflowMigrationReport> {
    const startedAt = new Date();
    const migrationRunId = randomUUID();
    const stats: TaskAutomationWorkflowMigrationStats = {
      analyzed: 0,
      migrated: 0,
      alreadyMigrated: 0,
      skippedCustomized: 0,
      requiresRemediation: 0,
      failed: 0,
      legacyWorkflowsNormalized: 0,
    };
    const rules: TaskAutomationWorkflowMigrationRuleResult[] = [];
    const failures: Array<{ legacyRuleId: string; error: string }> = [];

    const prismaMode: TaskAutomationWorkflowMigrationMode =
      options.mode === 'execute' ? 'EXECUTE' : 'DRY_RUN';

    await this.prisma.taskAutomationWorkflowMigrationRun.create({
      data: {
        id: migrationRunId,
        organizationId: options.organizationId,
        mode: prismaMode,
        stats: stats as unknown as Prisma.InputJsonValue,
        details: [] as unknown as Prisma.InputJsonValue,
        startedAt,
      },
    });

    for (const rule of listMaterializationAutomationRules()) {
      stats.analyzed += 1;
      try {
        const result = await this.migrateCatalogRule(
          options.organizationId,
          rule.ruleId,
          migrationRunId,
          options,
        );
        rules.push(result);
        this.incrementStat(stats, result.status);
      } catch (err) {
        stats.failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ legacyRuleId: rule.ruleId, error: message });
        rules.push({
          legacyRuleId: rule.ruleId,
          catalogKey: rule.catalogKey ?? null,
          workflowId: null,
          status: 'failed',
          overrideApplied: false,
          remediationReason: message,
        });
      }
    }

    const legacyResults = await this.migrateLegacyWorkflows(
      options.organizationId,
      migrationRunId,
      options,
    );
    for (const result of legacyResults) {
      stats.analyzed += 1;
      rules.push(result);
      this.incrementStat(stats, result.status);
      if (result.status === 'migrated' && result.legacyRuleId.startsWith('legacy-workflow:')) {
        stats.legacyWorkflowsNormalized += 1;
      }
    }

    const finishedAt = new Date();
    const report: TaskAutomationWorkflowMigrationReport = {
      mode: options.mode,
      organizationId: options.organizationId,
      migrationRunId,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      runtimeMode: resolveTaskAutomationWorkflowRuntimeMode(),
      stats,
      rules,
      failures,
    };

    await this.prisma.taskAutomationWorkflowMigrationRun.update({
      where: { id: migrationRunId },
      data: {
        finishedAt,
        stats: stats as unknown as Prisma.InputJsonValue,
        details: rules as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log({
      msg: 'task_automation.workflow_migration.completed',
      organizationId: options.organizationId,
      mode: options.mode,
      migrationRunId,
      stats,
      failures: failures.length,
    });

    return report;
  }

  async getLatestRun(orgId: string) {
    return this.prisma.taskAutomationWorkflowMigrationRun.findFirst({
      where: { organizationId: orgId },
      orderBy: { startedAt: 'desc' },
    });
  }

  async listRecords(orgId: string) {
    return this.prisma.taskAutomationWorkflowMigrationRecord.findMany({
      where: { organizationId: orgId },
      orderBy: { legacyRuleId: 'asc' },
    });
  }

  private incrementStat(
    stats: TaskAutomationWorkflowMigrationStats,
    status: TaskAutomationWorkflowMigrationRuleResult['status'],
  ) {
    switch (status) {
      case 'migrated':
        stats.migrated += 1;
        break;
      case 'already_migrated':
        stats.alreadyMigrated += 1;
        break;
      case 'skipped_customized':
        stats.skippedCustomized += 1;
        break;
      case 'requires_remediation':
        stats.requiresRemediation += 1;
        break;
      case 'failed':
        stats.failed += 1;
        break;
      default:
        break;
    }
  }

  private async migrateCatalogRule(
    orgId: string,
    ruleId: string,
    migrationRunId: string,
    options: TaskAutomationWorkflowMigrationRunOptions,
  ): Promise<TaskAutomationWorkflowMigrationRuleResult> {
    const rule = listMaterializationAutomationRules().find((entry) => entry.ruleId === ruleId);
    if (!rule?.catalogKey) {
      return this.persistRecord(orgId, {
        legacyRuleId: ruleId,
        catalogKey: null,
        workflowId: null,
        status: 'requires_remediation',
        overrideApplied: false,
        remediationReason: 'Rule is not a materialization catalog entry',
        migrationRunId,
        mode: options.mode,
      });
    }

    const existingRecord = await this.prisma.taskAutomationWorkflowMigrationRecord.findUnique({
      where: { organizationId_legacyRuleId: { organizationId: orgId, legacyRuleId: ruleId } },
    });

    if (
      existingRecord
      && (existingRecord.status === 'MIGRATED' || existingRecord.status === 'ALREADY_MIGRATED')
      && existingRecord.workflowId
    ) {
      const workflowStillExists = await this.prisma.orgWorkflow.findFirst({
        where: { id: existingRecord.workflowId, organizationId: orgId },
        select: { id: true, version: true },
      });
      if (workflowStillExists) {
        return {
          legacyRuleId: ruleId,
          catalogKey: rule.catalogKey,
          workflowId: existingRecord.workflowId,
          status: 'already_migrated',
          overrideApplied: existingRecord.overrideSnapshot != null,
          rollbackWorkflowVersion: existingRecord.rollbackWorkflowVersion,
        };
      }
    }

    const resolved = await this.resolver.resolveTaskAutomationRule(orgId, ruleId);
    const remediation = await this.validateOverride(orgId, resolved);
    if (remediation) {
      return this.persistRecord(orgId, {
        legacyRuleId: ruleId,
        catalogKey: rule.catalogKey,
        workflowId: existingRecord?.workflowId ?? null,
        status: 'requires_remediation',
        overrideApplied: false,
        remediationReason: remediation,
        migrationRunId,
        mode: options.mode,
        overrideSnapshot: resolved.override,
      });
    }

    if (options.mode === 'dry-run') {
      const existingTemplate = await this.templateService.findTemplateByCatalogKey(
        orgId,
        rule.catalogKey,
      );
      if (existingTemplate?.userCustomized && !options.forceBaselineSync) {
        return {
          legacyRuleId: ruleId,
          catalogKey: rule.catalogKey,
          workflowId: existingTemplate.workflowId,
          status: 'skipped_customized',
          overrideApplied: resolved.override != null,
        };
      }
      return {
        legacyRuleId: ruleId,
        catalogKey: rule.catalogKey,
        workflowId: existingTemplate?.workflowId ?? null,
        status: existingRecord?.workflowId ? 'already_migrated' : 'migrated',
        overrideApplied: resolved.override != null,
      };
    }

    const before = await this.templateService.findTemplateByCatalogKey(orgId, rule.catalogKey);
    if (before?.userCustomized && !options.forceBaselineSync) {
      return this.persistRecord(orgId, {
        legacyRuleId: ruleId,
        catalogKey: rule.catalogKey,
        workflowId: before.workflowId,
        status: 'skipped_customized',
        overrideApplied: resolved.override != null,
        migrationRunId,
        mode: options.mode,
        overrideSnapshot: resolved.override,
        rollbackWorkflowVersion: null,
      });
    }

    const link = await this.templateService.ensureTemplateForRule(orgId, rule, {
      resolvedRule: resolved,
      migrationRunId,
      forceBaselineSync: options.forceBaselineSync,
    });

    const workflow = await this.prisma.orgWorkflow.findUnique({
      where: { id: link.workflowId },
      select: { version: true },
    });

    return this.persistRecord(orgId, {
      legacyRuleId: ruleId,
      catalogKey: rule.catalogKey,
      workflowId: link.workflowId,
      status: existingRecord ? 'already_migrated' : 'migrated',
      overrideApplied: resolved.override != null,
      migrationRunId,
      mode: options.mode,
      overrideSnapshot: resolved.override,
      rollbackWorkflowVersion: workflow?.version ?? null,
    });
  }

  private async migrateLegacyWorkflows(
    orgId: string,
    migrationRunId: string,
    options: TaskAutomationWorkflowMigrationRunOptions,
  ): Promise<TaskAutomationWorkflowMigrationRuleResult[]> {
    const legacyWorkflows = await this.prisma.orgWorkflow.findMany({
      where: {
        organizationId: orgId,
        isTemplate: false,
        category: { not: 'task_automation_system' },
      },
    });

    const results: TaskAutomationWorkflowMigrationRuleResult[] = [];
    for (const workflow of legacyWorkflows) {
      const legacyRuleId = `legacy-workflow:${workflow.id}`;
      const trigger = workflow.trigger as { type?: string } | null;
      const triggerType = trigger?.type ?? '';
      const actions = Array.isArray(workflow.actions)
        ? (workflow.actions as Array<{ type?: string; config?: Record<string, unknown> }>)
        : [];

      const hasLegacyTrigger = triggerType in LEGACY_TRIGGER_TO_EVENT;
      const hasLegacyAction = actions.some(
        (action) => (action.type ?? '') in LEGACY_ACTION_TO_CANONICAL,
      );
      if (!hasLegacyTrigger && !hasLegacyAction) continue;

      const unmappable = actions.filter((action) => {
        const type = action.type ?? '';
        return type && !(type in LEGACY_ACTION_TO_CANONICAL) && type !== 'task.create';
      });
      if (unmappable.length > 0) {
        results.push(
          await this.persistRecord(orgId, {
            legacyRuleId,
            catalogKey: null,
            workflowId: workflow.id,
            status: 'requires_remediation',
            overrideApplied: false,
            remediationReason: `Unsupported legacy action types: ${unmappable.map((a) => a.type).join(', ')}`,
            migrationRunId,
            mode: options.mode,
          }),
        );
        continue;
      }

      const normalizedTrigger = hasLegacyTrigger
        ? { type: LEGACY_TRIGGER_TO_EVENT[triggerType] }
        : trigger;
      const normalizedActions = actions.map((action) => {
        const type = action.type ?? '';
        const canonical = LEGACY_ACTION_TO_CANONICAL[type];
        return canonical ? { ...action, type: canonical } : action;
      });

      const existing = await this.prisma.taskAutomationWorkflowMigrationRecord.findUnique({
        where: { organizationId_legacyRuleId: { organizationId: orgId, legacyRuleId } },
      });
      if (existing?.status === 'MIGRATED' || existing?.status === 'ALREADY_MIGRATED') {
        results.push({
          legacyRuleId,
          catalogKey: null,
          workflowId: workflow.id,
          status: 'already_migrated',
          overrideApplied: false,
          rollbackWorkflowVersion: existing.rollbackWorkflowVersion,
        });
        continue;
      }

      if (options.mode === 'dry-run') {
        results.push({
          legacyRuleId,
          catalogKey: null,
          workflowId: workflow.id,
          status: 'migrated',
          overrideApplied: false,
        });
        continue;
      }

      await this.prisma.orgWorkflow.update({
        where: { id: workflow.id },
        data: {
          trigger: normalizedTrigger as Prisma.InputJsonValue,
          actions: normalizedActions as Prisma.InputJsonValue,
          version: { increment: 1 },
          systemMetadata: {
            migratedLegacyWorkflow: true,
            legacyTriggerType: triggerType,
            migrationRunId,
            migratedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      results.push(
        await this.persistRecord(orgId, {
          legacyRuleId,
          catalogKey: null,
          workflowId: workflow.id,
          status: 'migrated',
          overrideApplied: false,
          migrationRunId,
          mode: options.mode,
          rollbackWorkflowVersion: workflow.version,
        }),
      );
    }

    return results;
  }

  private async validateOverride(orgId: string, resolved: Awaited<ReturnType<TaskAutomationRuleResolverService['resolveTaskAutomationRule']>>): Promise<string | null> {
    const override = resolved.override;
    if (!override) return null;

    if (
      override.activationOffsetMinutes != null
      && (override.activationOffsetMinutes < MIN_TASK_AUTOMATION_OFFSET_MINUTES
        || override.activationOffsetMinutes > MAX_TASK_AUTOMATION_OFFSET_MINUTES)
    ) {
      return `activationOffsetMinutes out of range (${MIN_TASK_AUTOMATION_OFFSET_MINUTES}..${MAX_TASK_AUTOMATION_OFFSET_MINUTES})`;
    }
    if (
      override.dueOffsetMinutes != null
      && (override.dueOffsetMinutes < MIN_TASK_AUTOMATION_OFFSET_MINUTES
        || override.dueOffsetMinutes > MAX_TASK_AUTOMATION_OFFSET_MINUTES)
    ) {
      return `dueOffsetMinutes out of range (${MIN_TASK_AUTOMATION_OFFSET_MINUTES}..${MAX_TASK_AUTOMATION_OFFSET_MINUTES})`;
    }

    if (override.assignedUserId) {
      if (!UUID_RE.test(override.assignedUserId)) {
        return 'assignedUserId is not a valid UUID';
      }
      const membership = await this.prisma.organizationMembership.findFirst({
        where: { organizationId: orgId, userId: override.assignedUserId },
        select: { id: true },
      });
      if (!membership) {
        return 'assignedUserId does not belong to organization';
      }
    }

    return null;
  }

  private mapStatus(
    status: TaskAutomationWorkflowMigrationRuleResult['status'],
  ): TaskAutomationWorkflowMigrationStatus {
    switch (status) {
      case 'migrated':
        return 'MIGRATED';
      case 'already_migrated':
        return 'ALREADY_MIGRATED';
      case 'skipped_customized':
        return 'SKIPPED_CUSTOMIZED';
      case 'requires_remediation':
        return 'REQUIRES_REMEDIATION';
      case 'failed':
      default:
        return 'FAILED';
    }
  }

  private async persistRecord(
    orgId: string,
    input: {
      legacyRuleId: string;
      catalogKey: string | null;
      workflowId: string | null;
      status: TaskAutomationWorkflowMigrationRuleResult['status'];
      overrideApplied: boolean;
      remediationReason?: string;
      migrationRunId: string;
      mode: TaskAutomationWorkflowMigrationRunOptions['mode'];
      overrideSnapshot?: unknown;
      rollbackWorkflowVersion?: number | null;
    },
  ): Promise<TaskAutomationWorkflowMigrationRuleResult> {
    if (input.mode === 'dry-run') {
      return {
        legacyRuleId: input.legacyRuleId,
        catalogKey: input.catalogKey,
        workflowId: input.workflowId,
        status: input.status,
        overrideApplied: input.overrideApplied,
        remediationReason: input.remediationReason,
        rollbackWorkflowVersion: input.rollbackWorkflowVersion ?? null,
      };
    }

    await this.prisma.taskAutomationWorkflowMigrationRecord.upsert({
      where: {
        organizationId_legacyRuleId: {
          organizationId: orgId,
          legacyRuleId: input.legacyRuleId,
        },
      },
      create: {
        organizationId: orgId,
        legacyRuleId: input.legacyRuleId,
        catalogKey: input.catalogKey,
        workflowId: input.workflowId,
        status: this.mapStatus(input.status),
        overrideSnapshot: input.overrideSnapshot as Prisma.InputJsonValue | undefined,
        remediationReason: input.remediationReason ?? null,
        rollbackWorkflowVersion: input.rollbackWorkflowVersion ?? null,
        migrationRunId: input.migrationRunId,
      },
      update: {
        catalogKey: input.catalogKey,
        workflowId: input.workflowId,
        status: this.mapStatus(input.status),
        overrideSnapshot: input.overrideSnapshot as Prisma.InputJsonValue | undefined,
        remediationReason: input.remediationReason ?? null,
        rollbackWorkflowVersion: input.rollbackWorkflowVersion ?? null,
        migrationRunId: input.migrationRunId,
      },
    });

    return {
      legacyRuleId: input.legacyRuleId,
      catalogKey: input.catalogKey,
      workflowId: input.workflowId,
      status: input.status,
      overrideApplied: input.overrideApplied,
      remediationReason: input.remediationReason,
      rollbackWorkflowVersion: input.rollbackWorkflowVersion ?? null,
    };
  }
}

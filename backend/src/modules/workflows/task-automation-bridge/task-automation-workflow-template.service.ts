import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { listMaterializationAutomationRules } from '@modules/tasks/automation/task-automation-rule.util';
import type { TaskAutomationRuleDefinition } from '@modules/tasks/automation/task-automation-rule.types';
import type { ResolvedTaskAutomationRule } from '@modules/tasks/automation/task-automation-rule.types';
import {
  TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
  TASK_AUTOMATION_WORKFLOW_TEMPLATE_CATALOG,
} from './task-automation-workflow-template.catalog';
import {
  buildSystemMetadataFromRule,
  buildWorkflowActionConfigFromResolvedRule,
} from './task-automation-workflow-override.mapper';
import type { TaskAutomationWorkflowSystemMetadata } from './task-automation-workflow-bridge.types';

export interface TaskAutomationSystemTemplateLink {
  catalogKey: string;
  ruleId: string;
  workflowId: string;
  workflowName: string;
  systemMetadata: TaskAutomationWorkflowSystemMetadata;
  userCustomized: boolean;
}

export interface EnsureTemplateOptions {
  resolvedRule?: ResolvedTaskAutomationRule;
  migrationRunId?: string;
  /** When true, refresh canonical fields even if template exists (migration only). */
  forceBaselineSync?: boolean;
}

@Injectable()
export class TaskAutomationWorkflowTemplateService {
  private readonly logger = new Logger(TaskAutomationWorkflowTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureSystemTemplates(
    orgId: string,
    options?: EnsureTemplateOptions,
  ): Promise<TaskAutomationSystemTemplateLink[]> {
    const links: TaskAutomationSystemTemplateLink[] = [];
    for (const rule of listMaterializationAutomationRules()) {
      links.push(await this.ensureTemplateForRule(orgId, rule, options));
    }
    return links;
  }

  async findTemplateByCatalogKey(
    orgId: string,
    catalogKey: string,
  ): Promise<TaskAutomationSystemTemplateLink | null> {
    const row = await this.prisma.orgWorkflow.findFirst({
      where: {
        organizationId: orgId,
        isTemplate: true,
        category: TASK_AUTOMATION_SYSTEM_WORKFLOW_CATEGORY,
        systemMetadata: {
          path: ['catalogKey'],
          equals: catalogKey,
        },
      },
    });
    if (!row || !row.systemMetadata) return null;
    const meta = row.systemMetadata as unknown as TaskAutomationWorkflowSystemMetadata;
    return {
      catalogKey,
      ruleId: meta.catalogRuleId,
      workflowId: row.id,
      workflowName: row.name,
      systemMetadata: meta,
      userCustomized: meta.userCustomized === true,
    };
  }

  async ensureTemplateForCatalogKey(
    orgId: string,
    catalogKey: import('@modules/tasks/automation/task-automation-rule.types').TaskAutomationCatalogKey,
    options?: EnsureTemplateOptions,
  ): Promise<TaskAutomationSystemTemplateLink> {
    const { getAutomationRuleByCatalogKey } = await import(
      '@modules/tasks/automation/task-automation-rule.util'
    );
    return this.ensureTemplateForRule(orgId, getAutomationRuleByCatalogKey(catalogKey), options);
  }

  private buildCanonicalDefinition(
    rule: TaskAutomationRuleDefinition,
    resolved?: ResolvedTaskAutomationRule,
    migrationRunId?: string,
  ) {
    if (!rule.catalogKey) {
      throw new Error(`Materialization rule ${rule.ruleId} has no catalogKey`);
    }
    const catalogKey = rule.catalogKey;
    const templateDef = TASK_AUTOMATION_WORKFLOW_TEMPLATE_CATALOG[catalogKey];
    const actionConfig = resolved
      ? buildWorkflowActionConfigFromResolvedRule(resolved)
      : {
          __payloadMerge: true as const,
          automationCatalogKey: catalogKey,
          automationRuleId: rule.ruleId,
        };

    return {
      catalogKey,
      templateDef,
      trigger: { type: templateDef.workflowEventType },
      conditions: [{ field: 'payload.catalogKey', operator: 'equals', value: catalogKey }],
      actions: [{ type: 'task.create', config: actionConfig }],
      scope: { type: 'organization' },
      enabled: resolved?.effectivelyEnabled ?? rule.defaultEnabled,
      systemMetadata: buildSystemMetadataFromRule({
        ruleId: rule.ruleId,
        catalogKey,
        catalogRuleVersion: rule.version,
        orgOverrideVersion: resolved?.override?.version ?? null,
        migrationRunId,
      }),
    };
  }

  private isUserCustomized(
    existing: { actions: unknown; trigger: unknown; conditions: unknown },
    canonical: ReturnType<typeof this.buildCanonicalDefinition>,
  ): boolean {
    const existingActions = JSON.stringify(existing.actions);
    const canonicalActions = JSON.stringify(canonical.actions);
    const existingTrigger = JSON.stringify(existing.trigger);
    const canonicalTrigger = JSON.stringify(canonical.trigger);
    const existingConditions = JSON.stringify(existing.conditions);
    const canonicalConditions = JSON.stringify(canonical.conditions);
    return (
      existingActions !== canonicalActions
      || existingTrigger !== canonicalTrigger
      || existingConditions !== canonicalConditions
    );
  }

  async ensureTemplateForRule(
    orgId: string,
    rule: TaskAutomationRuleDefinition,
    options?: EnsureTemplateOptions,
  ): Promise<TaskAutomationSystemTemplateLink> {
    const canonical = this.buildCanonicalDefinition(
      rule,
      options?.resolvedRule,
      options?.migrationRunId,
    );
    const existing = await this.findTemplateByCatalogKey(orgId, canonical.catalogKey);

    if (existing) {
      const row = await this.prisma.orgWorkflow.findUnique({
        where: { id: existing.workflowId },
        select: { actions: true, trigger: true, conditions: true, systemMetadata: true, version: true },
      });
      const meta = (row?.systemMetadata ?? {}) as unknown as TaskAutomationWorkflowSystemMetadata;
      const userCustomized = meta.userCustomized === true
        || (row ? this.isUserCustomized(row, canonical) && !options?.forceBaselineSync : false);

      if (userCustomized && !options?.forceBaselineSync) {
        return { ...existing, userCustomized: true };
      }

      const nextMeta: TaskAutomationWorkflowSystemMetadata = {
        ...canonical.systemMetadata,
        userCustomized: meta.userCustomized === true,
      };

      await this.prisma.orgWorkflow.update({
        where: { id: existing.workflowId },
        data: {
          name: canonical.templateDef.workflowName,
          description: rule.descriptionDe,
          trigger: canonical.trigger as unknown as Prisma.InputJsonValue,
          conditions: canonical.conditions as unknown as Prisma.InputJsonValue,
          actions: canonical.actions as unknown as Prisma.InputJsonValue,
          enabled: canonical.enabled,
          systemMetadata: nextMeta as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });

      return {
        ...existing,
        systemMetadata: nextMeta,
        userCustomized: nextMeta.userCustomized === true,
      };
    }

    const created = await this.prisma.orgWorkflow.create({
      data: {
        organizationId: orgId,
        name: canonical.templateDef.workflowName,
        description: rule.descriptionDe,
        category: canonical.templateDef.workflowCategory,
        trigger: canonical.trigger as unknown as Prisma.InputJsonValue,
        conditions: canonical.conditions as unknown as Prisma.InputJsonValue,
        actions: canonical.actions as unknown as Prisma.InputJsonValue,
        scope: canonical.scope as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        enabled: canonical.enabled,
        isTemplate: true,
        systemMetadata: canonical.systemMetadata as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Created system workflow template ${created.id} for ${rule.catalogKey} org=${orgId}`,
    );

    return {
      catalogKey: canonical.catalogKey,
      ruleId: rule.ruleId,
      workflowId: created.id,
      workflowName: created.name,
      systemMetadata: canonical.systemMetadata,
      userCustomized: false,
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { listMaterializationAutomationRules } from '@modules/tasks/automation/task-automation-rule.util';
import type { TaskAutomationRuleDefinition } from '@modules/tasks/automation/task-automation-rule.types';
import {
  TASK_AUTOMATION_WORKFLOW_TEMPLATE_CATALOG,
} from './task-automation-workflow-template.catalog';
import type { TaskAutomationWorkflowSystemMetadata } from './task-automation-workflow-bridge.types';

export interface TaskAutomationSystemTemplateLink {
  catalogKey: string;
  ruleId: string;
  workflowId: string;
  workflowName: string;
  systemMetadata: TaskAutomationWorkflowSystemMetadata;
}

@Injectable()
export class TaskAutomationWorkflowTemplateService {
  private readonly logger = new Logger(TaskAutomationWorkflowTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureSystemTemplates(orgId: string): Promise<TaskAutomationSystemTemplateLink[]> {
    const links: TaskAutomationSystemTemplateLink[] = [];
    for (const rule of listMaterializationAutomationRules()) {
      links.push(await this.ensureTemplateForRule(orgId, rule));
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
        category: 'task_automation_system',
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
    };
  }

  async ensureTemplateForCatalogKey(
    orgId: string,
    catalogKey: import('@modules/tasks/automation/task-automation-rule.types').TaskAutomationCatalogKey,
  ): Promise<TaskAutomationSystemTemplateLink> {
    const { getAutomationRuleByCatalogKey } = await import(
      '@modules/tasks/automation/task-automation-rule.util'
    );
    return this.ensureTemplateForRule(orgId, getAutomationRuleByCatalogKey(catalogKey));
  }

  private async ensureTemplateForRule(
    orgId: string,
    rule: TaskAutomationRuleDefinition,
  ): Promise<TaskAutomationSystemTemplateLink> {
    if (!rule.catalogKey) {
      throw new Error(`Materialization rule ${rule.ruleId} has no catalogKey`);
    }
    const catalogKey = rule.catalogKey;
    const templateDef = TASK_AUTOMATION_WORKFLOW_TEMPLATE_CATALOG[catalogKey];
    const systemMetadata: TaskAutomationWorkflowSystemMetadata = {
      systemTemplate: true,
      catalogRuleId: rule.ruleId,
      catalogKey,
      templateVersion: 1,
      catalogRuleVersion: rule.version,
    };

    const existing = await this.findTemplateByCatalogKey(orgId, catalogKey);
    const trigger = { type: templateDef.workflowEventType };
    const conditions = [
      { field: 'payload.catalogKey', operator: 'equals', value: catalogKey },
    ];
    const actions = [
      {
        type: 'task.create',
        config: {
          __payloadMerge: true,
          automationCatalogKey: rule.catalogKey,
          automationRuleId: rule.ruleId,
        },
      },
    ];
    const scope = { type: 'organization' };

    if (existing) {
      await this.prisma.orgWorkflow.update({
        where: { id: existing.workflowId },
        data: {
          name: templateDef.workflowName,
          description: rule.descriptionDe,
          trigger: trigger as unknown as Prisma.InputJsonValue,
          conditions: conditions as unknown as Prisma.InputJsonValue,
          actions: actions as unknown as Prisma.InputJsonValue,
          systemMetadata: systemMetadata as unknown as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      return existing;
    }

    const created = await this.prisma.orgWorkflow.create({
      data: {
        organizationId: orgId,
        name: templateDef.workflowName,
        description: rule.descriptionDe,
        category: templateDef.workflowCategory,
        trigger: trigger as unknown as Prisma.InputJsonValue,
        conditions: conditions as unknown as Prisma.InputJsonValue,
        actions: actions as unknown as Prisma.InputJsonValue,
        scope: scope as unknown as Prisma.InputJsonValue,
        status: 'ACTIVE',
        enabled: true,
        isTemplate: true,
        systemMetadata: systemMetadata as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Created system workflow template ${created.id} for ${rule.catalogKey} org=${orgId}`,
    );

    return {
      catalogKey,
      ruleId: rule.ruleId,
      workflowId: created.id,
      workflowName: created.name,
      systemMetadata,
    };
  }
}

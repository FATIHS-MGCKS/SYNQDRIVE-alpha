import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { TaskAutomationOutboxRepository } from '../outbox/task-automation-outbox.repository';
import { TaskAutomationOutboxSchedulerService } from '../outbox/task-automation-outbox-scheduler.service';
import {
  buildEffectiveChecklistItems,
  validateChecklistOverridePayload,
} from './task-automation-checklist-override.util';
import {
  describeActivationTimingDe,
  describeAutoResolveDe,
  describeChecklistTemplateDe,
  describeDueTimingDe,
  describeEscalationDe,
  isCriticalTaskAutomationRule,
  labelActivationStrategyDe,
  labelAssignmentStrategyDe,
  labelCategoryDe,
  labelDueStrategyDe,
  labelPriorityDe,
} from './task-automation-display.util';
import { getOrgOverridableFieldKeys } from './task-automation-effective-rule.util';
import { TaskAutomationRuleOverrideService } from './task-automation-rule-override.service';
import { TaskAutomationSimulationService } from './task-automation-simulation.service';
import { TaskAutomationRuleResolverService } from './task-automation-rule-resolver.service';
import { listMaterializationAutomationRules } from './task-automation-rule.util';
import type {
  EffectiveTaskAutomationField,
  ResolvedTaskAutomationRule,
  TaskAutomationCatalogKey,
  TaskAutomationConfigurableField,
  TaskAutomationPlatformDefaults,
  TaskAutomationRuleDefinition,
} from './task-automation-rule.types';

export interface TaskAutomationChecklistAdminView {
  platformItems: Array<{
    title: string;
    description?: string;
    sortOrder: number;
    isRequired: boolean;
    source: 'PLATFORM_DEFAULT' | 'ORG_OVERRIDE';
    hidden?: boolean;
  }>;
  effectiveItems: Array<{
    title: string;
    description?: string;
    sortOrder: number;
    isRequired: boolean;
    source: 'PLATFORM_DEFAULT' | 'ORG_OVERRIDE';
    hidden?: boolean;
  }>;
  allowsOverride: boolean;
  hasOverride: boolean;
  usesSynqDriveStandard: boolean;
}

export interface TaskAutomationRuleAdminDto {
  ruleId: string;
  catalogKey: TaskAutomationCatalogKey;
  nameDe: string;
  descriptionDe: string;
  categoryDe: string;
  isCritical: boolean;
  triggerLabelDe: string;
  activationLabelDe: string;
  dueLabelDe: string;
  autoResolveLabelDe: string;
  escalationLabelDe: string;
  assignmentLabelDe: string;
  priorityLabelDe: string;
  checklistTemplateLabelDe: string;
  effectivelyEnabled: boolean;
  hasOrgOverride: boolean;
  configurableFields: TaskAutomationConfigurableField[];
  allowedOverrideFields: string[];
  default: TaskAutomationPlatformDefaults;
  effective: TaskAutomationPlatformDefaults;
  fieldProvenance: Record<string, EffectiveTaskAutomationField<unknown>>;
  checklist: TaskAutomationChecklistAdminView;
  audit: {
    version: number | null;
    updatedAt: string | null;
    updatedByUserId: string | null;
    updatedByName: string | null;
  };
}

export interface TaskAutomationRulesOverviewDto {
  rules: TaskAutomationRuleAdminDto[];
  summary: {
    total: number;
    active: number;
    customized: number;
    disabled: number;
  };
}

@Injectable()
export class TaskAutomationAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: TaskAutomationRuleResolverService,
    private readonly overrideService: TaskAutomationRuleOverrideService,
    private readonly simulation: TaskAutomationSimulationService,
    private readonly outboxRepo: TaskAutomationOutboxRepository,
    private readonly outboxScheduler: TaskAutomationOutboxSchedulerService,
  ) {}

  async listRules(orgId: string): Promise<TaskAutomationRulesOverviewDto> {
    const rules = listMaterializationAutomationRules();
    const overrideRows = await this.prisma.orgTaskAutomationRuleOverride.findMany({
      where: { organizationId: orgId },
      include: {
        updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    const overrideByRuleId = new Map(overrideRows.map((row) => [row.ruleId, row]));

    const resolvedRules = await Promise.all(
      rules.map(async (rule) => {
        const resolved = await this.resolver.resolveTaskAutomationRule(orgId, rule.ruleId);
        const overrideRow = overrideByRuleId.get(rule.ruleId) ?? null;
        return this.toAdminDto(rule, resolved, overrideRow);
      }),
    );

    return {
      rules: resolvedRules,
      summary: {
        total: resolvedRules.length,
        active: resolvedRules.filter((rule) => rule.effectivelyEnabled).length,
        customized: resolvedRules.filter((rule) => rule.hasOrgOverride).length,
        disabled: resolvedRules.filter((rule) => !rule.effectivelyEnabled).length,
      },
    };
  }

  async getRule(orgId: string, ruleId: string): Promise<TaskAutomationRuleAdminDto> {
    const resolved = await this.resolver.resolveTaskAutomationRule(orgId, ruleId);
    const rule = listMaterializationAutomationRules().find((entry) => entry.ruleId === ruleId);
    if (!rule) {
      throw new NotFoundException(`Task automation rule ${ruleId} not found`);
    }

    const overrideRow = await this.prisma.orgTaskAutomationRuleOverride.findUnique({
      where: { organizationId_ruleId: { organizationId: orgId, ruleId } },
      include: {
        updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return this.toAdminDto(rule, resolved, overrideRow);
  }

  async upsertOverride(
    orgId: string,
    ruleId: string,
    input: Parameters<TaskAutomationRuleOverrideService['upsertOverride']>[2],
    actorUserId?: string,
  ) {
    const rule = listMaterializationAutomationRules().find((entry) => entry.ruleId === ruleId);
    if (!rule) {
      throw new NotFoundException(`Task automation rule ${ruleId} not found`);
    }

    if (input.checklistOverrides !== undefined) {
      validateChecklistOverridePayload(
        rule.checklistTemplateId,
        input.checklistOverrides as Record<string, unknown> | null,
      );
    }

    await this.overrideService.upsertOverride(orgId, ruleId, input, actorUserId);
    return this.getRule(orgId, ruleId);
  }

  async resetOverride(
    orgId: string,
    ruleId: string,
    actorUserId?: string,
    expectedVersion?: number,
    reason?: string | null,
  ) {
    await this.overrideService.resetOverride(orgId, ruleId, actorUserId, expectedVersion, reason);
    return this.getRule(orgId, ruleId);
  }

  simulateRule(
    orgId: string,
    ruleId: string,
    input: {
      proposedConfig?: Parameters<TaskAutomationRuleOverrideService['upsertOverride']>[2] | null;
      periodDays?: number;
    },
  ) {
    return this.simulation.simulate(orgId, ruleId, input);
  }

  async listRuleRevisions(orgId: string, ruleId: string, limit = 20) {
    const override = await this.prisma.orgTaskAutomationRuleOverride.findUnique({
      where: { organizationId_ruleId: { organizationId: orgId, ruleId } },
      select: { id: true },
    });
    if (!override) return [];

    const rows = await this.prisma.orgTaskAutomationRuleOverrideRevision.findMany({
      where: { overrideId: override.id },
      orderBy: { overrideVersion: 'desc' },
      take: limit,
      include: {
        changedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      version: row.overrideVersion,
      changeType: row.changeType,
      reason: null,
      snapshot: row.snapshot as Record<string, unknown>,
      changedAt: row.createdAt.toISOString(),
      changedByUserId: row.changedByUserId,
      changedByName: row.changedBy
        ? [row.changedBy.firstName, row.changedBy.lastName].filter(Boolean).join(' ').trim() ||
          row.changedBy.email
        : null,
    }));
  }

  async replayDeadLetterOutbox(orgId: string, outboxId: string) {
    const requeued = await this.outboxRepo.requeueDeadLetter(outboxId, orgId);
    if (!requeued) {
      throw new NotFoundException(`Dead-letter outbox row ${outboxId} not found for organization`);
    }
    await this.outboxScheduler.scheduleOutboxIds([outboxId]);
    return { outboxId, status: 'PENDING' as const };
  }

  private toAdminDto(
    rule: TaskAutomationRuleDefinition,
    resolved: ResolvedTaskAutomationRule,
    overrideRow: {
      version: number;
      updatedAt: Date;
      updatedByUserId: string | null;
      updatedBy?: {
        id: string;
        firstName: string | null;
        lastName: string | null;
        email: string | null;
      } | null;
    } | null,
  ): TaskAutomationRuleAdminDto {
    const allowedOverrideFields = [...getOrgOverridableFieldKeys(rule)];
    const checklist = buildEffectiveChecklistItems({
      taskType: rule.checklistTemplateId,
      checklistOverrides: resolved.effective.checklistOverrides,
    });

    const updatedByName = overrideRow?.updatedBy
      ? [overrideRow.updatedBy.firstName, overrideRow.updatedBy.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() || overrideRow.updatedBy.email
      : null;

    return {
      ruleId: rule.ruleId,
      catalogKey: rule.catalogKey!,
      nameDe: rule.nameDe,
      descriptionDe: rule.descriptionDe,
      categoryDe: labelCategoryDe(rule.category),
      isCritical: isCriticalTaskAutomationRule(rule),
      triggerLabelDe: labelActivationStrategyDe(rule.activationStrategy),
      activationLabelDe: describeActivationTimingDe(
        rule.activationStrategy,
        resolved.effective.activationOffsetMinutes,
      ),
      dueLabelDe: describeDueTimingDe(rule.dueStrategy, resolved.effective.dueOffsetMinutes),
      autoResolveLabelDe: describeAutoResolveDe(rule.autoResolveCondition),
      escalationLabelDe: describeEscalationDe(rule, resolved.effective.escalationConfig),
      assignmentLabelDe: labelAssignmentStrategyDe(resolved.effective.assignmentStrategy),
      priorityLabelDe: labelPriorityDe(resolved.effective.priority),
      checklistTemplateLabelDe: describeChecklistTemplateDe(rule.checklistTemplateId),
      effectivelyEnabled: resolved.effectivelyEnabled,
      hasOrgOverride: resolved.override != null,
      configurableFields: rule.configurableFields,
      allowedOverrideFields,
      default: resolved.default,
      effective: resolved.effective,
      fieldProvenance: resolved.fieldProvenance,
      checklist: {
        platformItems: checklist.platformItems,
        effectiveItems: checklist.effectiveItems,
        allowsOverride: allowedOverrideFields.includes('checklistOverrides'),
        hasOverride: checklist.hasOverride,
        usesSynqDriveStandard: !checklist.hasOverride,
      },
      audit: {
        version: overrideRow?.version ?? null,
        updatedAt: overrideRow?.updatedAt.toISOString() ?? null,
        updatedByUserId: overrideRow?.updatedByUserId ?? null,
        updatedByName: updatedByName ?? null,
      },
    };
  }
}

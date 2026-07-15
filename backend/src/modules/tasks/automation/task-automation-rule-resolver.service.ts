import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildResolvedTaskAutomationRule,
  getOrgOverridableFieldKeys,
  mapOverrideRow,
} from './task-automation-effective-rule.util';
import {
  getAutomationRuleByCatalogKey,
  requireAutomationRuleById,
} from './task-automation-rule.util';
import type { ResolvedTaskAutomationRule, TaskAutomationCatalogKey } from './task-automation-rule.types';

@Injectable()
export class TaskAutomationRuleResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the effective automation configuration for an organization rule.
   * Existing active tasks are never mutated — callers apply this only on future materializations.
   */
  async resolveTaskAutomationRule(
    orgId: string,
    ruleId: string,
  ): Promise<ResolvedTaskAutomationRule> {
    const rule = requireAutomationRuleById(ruleId);
    const overrideRow = await this.prisma.orgTaskAutomationRuleOverride.findUnique({
      where: { organizationId_ruleId: { organizationId: orgId, ruleId } },
    });

    if (overrideRow && overrideRow.organizationId !== orgId) {
      throw new NotFoundException(`Override tenant mismatch for rule ${ruleId}`);
    }

    return buildResolvedTaskAutomationRule({
      rule,
      override: overrideRow ? mapOverrideRow(overrideRow) : null,
      allowedOverrideFields: getOrgOverridableFieldKeys(rule),
    });
  }

  async resolveByCatalogKey(
    orgId: string,
    catalogKey: TaskAutomationCatalogKey,
  ): Promise<ResolvedTaskAutomationRule> {
    const rule = getAutomationRuleByCatalogKey(catalogKey);
    return this.resolveTaskAutomationRule(orgId, rule.ruleId);
  }
}

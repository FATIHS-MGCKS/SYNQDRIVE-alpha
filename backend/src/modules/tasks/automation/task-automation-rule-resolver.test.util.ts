import {
  buildResolvedTaskAutomationRule,
  getOrgOverridableFieldKeys,
} from '@modules/tasks/automation/task-automation-effective-rule.util';
import { getAutomationRuleByCatalogKey, requireAutomationRuleById } from '@modules/tasks/automation/task-automation-rule.util';
import type { TaskAutomationRuleResolverService } from '@modules/tasks/automation/task-automation-rule-resolver.service';

export function createDefaultTaskAutomationRuleResolverMock(): TaskAutomationRuleResolverService {
  return {
    resolveTaskAutomationRule: jest.fn(async (_orgId: string, ruleId: string) => {
      const rule = requireAutomationRuleById(ruleId);
      return buildResolvedTaskAutomationRule({
        rule,
        override: null,
        allowedOverrideFields: getOrgOverridableFieldKeys(rule),
      });
    }),
    resolveByCatalogKey: jest.fn(async (_orgId: string, catalogKey: string) => {
      const rule = getAutomationRuleByCatalogKey(catalogKey as any);
      return buildResolvedTaskAutomationRule({
        rule,
        override: null,
        allowedOverrideFields: getOrgOverridableFieldKeys(rule),
      });
    }),
  } as unknown as TaskAutomationRuleResolverService;
}

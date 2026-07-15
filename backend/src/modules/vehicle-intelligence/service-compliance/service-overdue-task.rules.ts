import {
  getAutomationRuleByCatalogKey,
  SERVICE_OVERDUE_TASK_DEDUP_PREFIX,
} from '@modules/tasks/automation/task-automation-rule.util';

const serviceOverdueRule = getAutomationRuleByCatalogKey('VEHICLE_SERVICE_OVERDUE');

/** Stable automation rule id for HM/OEM service-overdue tasks. */
export const SERVICE_OVERDUE_TASK_RULE_ID = serviceOverdueRule.ruleId;

export const SERVICE_OVERDUE_TASK_RULE_VERSION = serviceOverdueRule.version;

export { SERVICE_OVERDUE_TASK_DEDUP_PREFIX };

export const SERVICE_OVERDUE_RESOLUTION_CODES = [
  'SERVICE_SCHEDULED',
  'SERVICE_ALREADY_COMPLETED',
  'SERVICE_DUE_DATE_CORRECTED',
  'FALSE_POSITIVE',
  'SERVICE_CASE_COMPLETED',
] as const;

export type ServiceOverdueResolutionCode = (typeof SERVICE_OVERDUE_RESOLUTION_CODES)[number];

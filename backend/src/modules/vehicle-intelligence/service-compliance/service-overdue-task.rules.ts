/** Stable automation rule id for HM/OEM service-overdue tasks. */
export const SERVICE_OVERDUE_TASK_RULE_ID = 'insight.service_overdue' as const;

export const SERVICE_OVERDUE_TASK_RULE_VERSION = 1;

export const SERVICE_OVERDUE_TASK_DEDUP_PREFIX = 'service_overdue:' as const;

export const SERVICE_OVERDUE_RESOLUTION_CODES = [
  'SERVICE_SCHEDULED',
  'SERVICE_ALREADY_COMPLETED',
  'SERVICE_DUE_DATE_CORRECTED',
  'FALSE_POSITIVE',
  'SERVICE_CASE_COMPLETED',
] as const;

export type ServiceOverdueResolutionCode = (typeof SERVICE_OVERDUE_RESOLUTION_CODES)[number];

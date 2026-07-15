import type { TaskAutomationPlatformDefaults } from './task-automation-rule.types';

const AUDIT_CONFIG_KEYS: Array<keyof TaskAutomationPlatformDefaults> = [
  'enabled',
  'activationOffsetMinutes',
  'dueOffsetMinutes',
  'priority',
  'assignmentStrategy',
  'assignedUserId',
  'assignedRoleKey',
  'stationScope',
  'checklistOverrides',
];

/** Redacts large/opaque JSON blobs for activity-log storage. */
export function sanitizeEffectiveConfigForAudit(
  config: TaskAutomationPlatformDefaults,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const key of AUDIT_CONFIG_KEYS) {
    sanitized[key] = config[key];
  }

  if (config.escalationConfig && Object.keys(config.escalationConfig).length > 0) {
    sanitized.escalationConfig = { configured: true, keys: Object.keys(config.escalationConfig) };
  } else {
    sanitized.escalationConfig = null;
  }

  if (config.notificationConfig && Object.keys(config.notificationConfig).length > 0) {
    sanitized.notificationConfig = { configured: true, keys: Object.keys(config.notificationConfig) };
  } else {
    sanitized.notificationConfig = null;
  }

  if (config.ruleConfig && Object.keys(config.ruleConfig).length > 0) {
    sanitized.ruleConfig = { ...config.ruleConfig };
  }

  if (config.checklistOverrides) {
    const hidden = Array.isArray((config.checklistOverrides as Record<string, unknown>).hiddenOptionalTitles)
      ? ((config.checklistOverrides as Record<string, unknown>).hiddenOptionalTitles as string[]).length
      : 0;
    const additional = Array.isArray((config.checklistOverrides as Record<string, unknown>).additionalItems)
      ? ((config.checklistOverrides as Record<string, unknown>).additionalItems as unknown[]).length
      : 0;
    sanitized.checklistOverrides = { hiddenOptionalCount: hidden, additionalItemCount: additional };
  }

  return sanitized;
}

export function buildRuleChangeAuditMeta(input: {
  ruleId: string;
  version: number;
  previousEffective: TaskAutomationPlatformDefaults;
  newEffective: TaskAutomationPlatformDefaults;
  reason?: string | null;
  changeType: 'CREATE' | 'UPDATE' | 'RESET';
}): Record<string, unknown> {
  return {
    ruleId: input.ruleId,
    version: input.version,
    changeType: input.changeType,
    previousEffective: sanitizeEffectiveConfigForAudit(input.previousEffective),
    newEffective: sanitizeEffectiveConfigForAudit(input.newEffective),
    ...(input.reason?.trim() ? { reason: input.reason.trim().slice(0, 500) } : {}),
  };
}

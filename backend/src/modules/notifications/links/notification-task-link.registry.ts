/**
 * Registry governing optional links between canonical notifications and OrgTasks.
 *
 * - Task creation from a notification is allowed when `allowTaskCreation` is true.
 * - Completing a task may resolve the linked notification only when
 *   `resolveNotificationOnTaskComplete` is true for that event type.
 * - Personal acknowledge must never complete tasks (enforced in receipt layer).
 */
export interface NotificationTaskLinkRule {
  eventTypes: readonly string[];
  allowTaskCreation: boolean;
  resolveNotificationOnTaskComplete: boolean;
}

const DEFAULT_RULE: NotificationTaskLinkRule = {
  eventTypes: [],
  allowTaskCreation: false,
  resolveNotificationOnTaskComplete: false,
};

export const NOTIFICATION_TASK_LINK_RULES: readonly NotificationTaskLinkRule[] = [
  {
    eventTypes: [
      'BATTERY_CRITICAL',
      'TIRE_CRITICAL',
      'BRAKE_CRITICAL',
      'SERVICE_OVERDUE',
      'ACTIVE_DTC',
      'TECHNICAL_OBSERVATION_ACTIVE',
      'DRIVING_ASSESSMENT_DEVICE_QUALITY',
    ],
    allowTaskCreation: true,
    resolveNotificationOnTaskComplete: false,
  },
  {
    eventTypes: ['DOCUMENT_INTAKE_REVIEW', 'LEGAL_DOCUMENT_GAP'],
    allowTaskCreation: true,
    resolveNotificationOnTaskComplete: true,
  },
] as const;

function ruleForEventType(eventType: string): NotificationTaskLinkRule {
  const normalized = eventType.trim().toUpperCase();
  for (const rule of NOTIFICATION_TASK_LINK_RULES) {
    if (rule.eventTypes.some((t) => t.toUpperCase() === normalized)) {
      return rule;
    }
  }
  return DEFAULT_RULE;
}

export function canCreateTaskFromNotificationEvent(eventType: string): boolean {
  return ruleForEventType(eventType).allowTaskCreation;
}

export function canResolveNotificationOnTaskComplete(eventType: string): boolean {
  return ruleForEventType(eventType).resolveNotificationOnTaskComplete;
}

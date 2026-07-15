import { buildRuleChangeAuditMeta, sanitizeEffectiveConfigForAudit } from './task-automation-audit.util';

describe('task-automation-audit.util', () => {
  const effective = {
    enabled: true,
    activationOffsetMinutes: 0,
    dueOffsetMinutes: 60,
    priority: 'HIGH' as const,
    assignmentStrategy: 'STATION_FROM_BOOKING' as const,
    assignedUserId: null,
    assignedRoleKey: null,
    stationScope: null,
    escalationConfig: { notifyAfterHours: 24, webhookUrl: 'https://secret.example/hook' },
    notificationConfig: { emailTemplate: 'long-template-body' },
    checklistOverrides: {
      hiddenOptionalTitles: ['Zahlungsstatus geprüft'],
      additionalItems: [{ title: 'Extra' }],
    },
    ruleConfig: { defaultDueDays: 14 },
  };

  it('sanitizes effective config without raw sensitive payloads', () => {
    const sanitized = sanitizeEffectiveConfigForAudit(effective);

    expect(sanitized.priority).toBe('HIGH');
    expect(sanitized.escalationConfig).toEqual({
      configured: true,
      keys: ['notifyAfterHours', 'webhookUrl'],
    });
    expect(sanitized.notificationConfig).toEqual({
      configured: true,
      keys: ['emailTemplate'],
    });
    expect(sanitized.checklistOverrides).toEqual({
      hiddenOptionalCount: 1,
      additionalItemCount: 1,
    });
    expect(sanitized).not.toHaveProperty('webhookUrl');
  });

  it('builds audit metadata with previous and new effective config', () => {
    const meta = buildRuleChangeAuditMeta({
      ruleId: 'booking.lifecycle.confirmed.prep',
      version: 3,
      previousEffective: effective,
      newEffective: { ...effective, enabled: false },
      reason: 'Testgrund',
      changeType: 'UPDATE',
    });

    expect(meta.ruleId).toBe('booking.lifecycle.confirmed.prep');
    expect(meta.version).toBe(3);
    expect(meta.reason).toBe('Testgrund');
    expect(meta.previousEffective).toMatchObject({ priority: 'HIGH' });
    expect(meta.newEffective).toMatchObject({ enabled: false });
  });
});

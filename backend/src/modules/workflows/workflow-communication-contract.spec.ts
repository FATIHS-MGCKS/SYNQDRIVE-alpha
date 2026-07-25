import { WorkflowActionPreviewService } from './workflow-action-preview.service';
import { classifyActionRisk } from './workflow-action-risk';
import { assessWorkflowSensitivity } from './maker-checker/workflow-maker-checker.constants';

/**
 * Contract mocks for communication channel actions — no external providers in CI.
 */

export interface CommunicationContractRecipient {
  channel: 'in_app' | 'email' | 'sms' | 'whatsapp' | 'voice';
  address: string;
  optedOut?: boolean;
  quietHoursActive?: boolean;
}

export function resolveCommunicationRecipients(input: {
  target: string;
  email?: string;
  phone?: string;
  optedOut?: boolean;
  quietHoursActive?: boolean;
}): CommunicationContractRecipient[] {
  const recipients: CommunicationContractRecipient[] = [
    { channel: 'in_app', address: `org:${input.target}`, optedOut: false },
  ];
  if (input.email) {
    recipients.push({
      channel: 'email',
      address: input.email,
      optedOut: input.optedOut,
      quietHoursActive: input.quietHoursActive,
    });
  }
  if (input.phone) {
    recipients.push({
      channel: 'sms',
      address: input.phone,
      optedOut: input.optedOut,
      quietHoursActive: input.quietHoursActive,
    });
    recipients.push({
      channel: 'whatsapp',
      address: input.phone,
      optedOut: input.optedOut,
      quietHoursActive: input.quietHoursActive,
    });
  }
  return recipients;
}

export function filterDeliverableRecipients(
  recipients: CommunicationContractRecipient[],
): CommunicationContractRecipient[] {
  return recipients.filter((recipient) => {
    if (recipient.optedOut) return false;
    if (recipient.quietHoursActive && recipient.channel !== 'in_app') return false;
    return true;
  });
}

describe('workflow communication contracts (no external providers)', () => {
  const prisma = { vehicle: { findFirst: jest.fn() } } as any;
  const preview = new WorkflowActionPreviewService(prisma);

  it('notification.prepare is in-app draft only (scenario 23)', async () => {
    const planned = await preview.previewAction({
      action: {
        type: 'notification.prepare',
        config: { message: 'Follow up', target: 'admin', email: 'ops@tenant.example' },
      },
      index: 0,
      ctx: { organizationId: 'org-a', payload: {}, eventType: 'manual.test' },
    });
    expect(planned.preview?.preparedOnly).toBe(true);
    expect(planned.resolvedRecipients?.[0]?.masked).toMatch(/@/);
  });

  it('email channel is EXTERNAL risk in catalog (scenario 24)', () => {
    expect(classifyActionRisk('channel.email.send')).toBe('EXTERNAL');
    expect(assessWorkflowSensitivity([{ type: 'email.send' }])).toBe('HIGH');
  });

  it('sms and whatsapp channels classified EXTERNAL (scenarios 25-26)', () => {
    expect(classifyActionRisk('channel.sms.send')).toBe('EXTERNAL');
    expect(classifyActionRisk('channel.whatsapp.send')).toBe('EXTERNAL');
  });

  it('voice.call.start requires maker-checker sensitivity (scenario 27)', () => {
    expect(classifyActionRisk('voice.call.start')).toBe('EXTERNAL');
    expect(assessWorkflowSensitivity([{ type: 'voice.call.start' }])).toBe('CRITICAL');
  });

  it('quiet hours suppresses external channels but keeps in-app (scenario 31)', () => {
    const recipients = resolveCommunicationRecipients({
      target: 'admin',
      email: 'a@b.com',
      phone: '+491701234567',
      quietHoursActive: true,
    });
    const deliverable = filterDeliverableRecipients(recipients);
    expect(deliverable.map((r) => r.channel)).toEqual(['in_app']);
  });

  it('opt-out removes email/sms/whatsapp (scenario 32)', () => {
    const recipients = resolveCommunicationRecipients({
      target: 'customer',
      email: 'c@b.com',
      phone: '+491701234567',
      optedOut: true,
    });
    const deliverable = filterDeliverableRecipients(recipients);
    expect(deliverable.map((r) => r.channel)).toEqual(['in_app']);
  });

  it('unknown LIVE channel actions are blocked in dry-run (scenario 30)', async () => {
    const planned = await preview.previewAction({
      action: { type: 'channel.email.send', config: { to: 'x@y.com', subject: 'Hi' } },
      index: 0,
      ctx: { organizationId: 'org-a', payload: {}, eventType: 'manual.test' },
    });
    expect(planned.status).toBe('ERROR');
    expect(planned.validationErrors[0]).toMatch(/Unknown or unsupported/);
  });
});

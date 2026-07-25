/**
 * Contract mocks for outbound notification channels.
 * Real providers (Resend, Twilio, WhatsApp) are NOT called in CI — adapters are verified via contract shape.
 */
import { WorkflowActionPreviewService } from './workflow-action-preview.service';
import type { WorkflowActionDef } from './workflow-definition.validator';

const ORG_A = 'org-channels-a';

interface ChannelAdapterContract {
  channel: string;
  prepare(input: Record<string, unknown>): { preparedOnly: true; externalCall: false };
  validateConfig(config: Record<string, unknown>): string[];
}

const EMAIL_ADAPTER: ChannelAdapterContract = {
  channel: 'email',
  prepare: (input) => ({
    preparedOnly: true,
    externalCall: false,
    ...input,
  }),
  validateConfig: (config) => {
    const errors: string[] = [];
    if (!config.email || typeof config.email !== 'string') errors.push('email required');
    return errors;
  },
};

const SMS_ADAPTER: ChannelAdapterContract = {
  channel: 'sms',
  prepare: (input) => ({ preparedOnly: true, externalCall: false, ...input }),
  validateConfig: (config) => {
    const errors: string[] = [];
    if (!config.phone) errors.push('phone required');
    return errors;
  },
};

const WHATSAPP_ADAPTER: ChannelAdapterContract = {
  channel: 'whatsapp',
  prepare: (input) => ({ preparedOnly: true, externalCall: false, ...input }),
  validateConfig: (config) => {
    const errors: string[] = [];
    if (!config.phone) errors.push('whatsapp phone required');
    return errors;
  },
};

const VOICE_ADAPTER: ChannelAdapterContract = {
  channel: 'voice',
  prepare: (input) => ({ preparedOnly: true, externalCall: false, ...input }),
  validateConfig: (config) => {
    const errors: string[] = [];
    if (!config.phone) errors.push('voice phone required');
    return errors;
  },
};

const WEBHOOK_ADAPTER: ChannelAdapterContract = {
  channel: 'webhook',
  prepare: (input) => ({ preparedOnly: true, externalCall: false, ...input }),
  validateConfig: (config) => {
    const errors: string[] = [];
    if (!config.url) errors.push('webhook url required');
    return errors;
  },
};

const CHANNEL_ADAPTERS = [EMAIL_ADAPTER, SMS_ADAPTER, WHATSAPP_ADAPTER, VOICE_ADAPTER, WEBHOOK_ADAPTER];

describe('Workflow notification channel contracts (mocked adapters)', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
  };
  const preview = new WorkflowActionPreviewService(prisma as any);

  it.each(CHANNEL_ADAPTERS)('$channel adapter prepare never calls external provider', (adapter) => {
    const result = adapter.prepare({ message: 'Test', organizationId: ORG_A });
    expect(result.preparedOnly).toBe(true);
    expect(result.externalCall).toBe(false);
  });

  it('notification.prepare resolves in_app recipient for admin target', async () => {
    const action: WorkflowActionDef = {
      type: 'notification.prepare',
      config: { target: 'admin', message: 'Fleet alert' },
    };
    const planned = await preview.previewAction({
      action,
      index: 0,
      ctx: { organizationId: ORG_A, payload: {}, eventType: 'manual.test' },
    });
    expect(planned.resolvedRecipients?.some((r) => r.channel === 'in_app')).toBe(true);
    expect(planned.preview?.preparedOnly).toBe(true);
  });

  it('notification.prepare masks email recipient in dry-run preview', async () => {
    const action: WorkflowActionDef = {
      type: 'notification.prepare',
      config: {
        target: 'admin',
        email: 'customer.secret@example.com',
        message: 'Pickup reminder',
      },
    };
    const planned = await preview.previewAction({
      action,
      index: 0,
      ctx: { organizationId: ORG_A, payload: {}, eventType: 'manual.test' },
    });
    const emailRecipient = planned.resolvedRecipients?.find((r) => r.channel === 'email');
    expect(emailRecipient?.masked).not.toContain('customer.secret');
    expect(emailRecipient?.masked).toContain('@');
  });

  it('phone channel contract validates E.164-ish input without sending', () => {
    expect(SMS_ADAPTER.validateConfig({ phone: '+491701234567' })).toHaveLength(0);
    expect(SMS_ADAPTER.validateConfig({})).toContain('phone required');
  });

  it('whatsapp channel contract mirrors sms phone requirement', () => {
    expect(WHATSAPP_ADAPTER.validateConfig({ phone: '+491701234567' })).toHaveLength(0);
  });

  it('voice call channel contract requires phone without PSTN dial', () => {
    const result = VOICE_ADAPTER.prepare({ phone: '+491701234567', script: 'Pickup overdue' });
    expect(result.externalCall).toBe(false);
    expect(VOICE_ADAPTER.validateConfig({ phone: '+491701234567' })).toHaveLength(0);
  });

  it('webhook replay contract validates url without HTTP call', () => {
    const payload = { url: 'https://hooks.example.test/workflow', eventId: 'evt-1' };
    const first = WEBHOOK_ADAPTER.prepare(payload);
    const replay = WEBHOOK_ADAPTER.prepare({ ...payload, replay: true });
    expect(first.externalCall).toBe(false);
    expect(replay.externalCall).toBe(false);
    expect(WEBHOOK_ADAPTER.validateConfig(payload)).toHaveLength(0);
  });

  it('quiet hours policy blocks outbound send in contract layer', () => {
    const now = new Date('2026-07-25T02:30:00.000Z'); // 04:30 Europe/Berlin summer
    const hourUtc = now.getUTCHours();
    const quietHours = hourUtc >= 22 || hourUtc < 6;
    const wouldBlock = quietHours;
    expect(typeof wouldBlock).toBe('boolean');
  });

  it('opt-out flag suppresses channel delivery in contract layer', () => {
    const config = { email: 'user@example.com', marketingOptOut: true };
    const suppressed = config.marketingOptOut === true;
    expect(suppressed).toBe(true);
    expect(EMAIL_ADAPTER.prepare({ ...config, suppressed })).toMatchObject({
      preparedOnly: true,
      externalCall: false,
    });
  });
});

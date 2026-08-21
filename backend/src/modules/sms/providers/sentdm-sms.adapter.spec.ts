import { ConfigService } from '@nestjs/config';
import { SentDmSmsAdapter } from './sentdm-sms.adapter';

describe('SentDmSmsAdapter', () => {
  const config = {
    get: (key: string, fallback?: unknown) => {
      if (key === 'sms.apiBaseUrl') return 'https://api.sent.dm';
      if (key === 'sms.requestTimeoutMs') return 5_000;
      if (key === 'sms.sandboxMode') return false;
      return fallback;
    },
  } as ConfigService;

  it('classifies 400 as terminal rejection', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'VALIDATION_001' } }),
    });
    const adapter = new SentDmSmsAdapter(config, fetchImpl as any);
    const result = await adapter.executeSend(
      {
        organizationId: 'org-1',
        recipientE164: '+491701234567',
        body: 'hello',
        idempotencyKey: 'sdm_test',
        senderProfileId: 'profile-1',
      },
      'api-key',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe('TERMINAL_REJECTION');
    expect(result.retryable).toBe(false);
  });

  it('accepts 202 with provider message id', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({
        data: {
          status: 'QUEUED',
          recipients: [{ message_id: 'msg-123', channel: 'sms', to: '+491701234567' }],
        },
      }),
    });
    const adapter = new SentDmSmsAdapter(config, fetchImpl as any);
    const result = await adapter.executeSend(
      {
        organizationId: 'org-1',
        recipientE164: '+491701234567',
        body: 'hello',
        idempotencyKey: 'sdm_test',
        senderProfileId: 'profile-1',
      },
      'api-key',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.providerMessageId).toBe('msg-123');
  });
});

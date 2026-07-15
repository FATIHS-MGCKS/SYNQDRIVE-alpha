import { ConfigService } from '@nestjs/config';
import { EmailProviderRegistry } from './providers/email-provider.registry';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { DevEmailProvider } from './providers/dev-email.provider';

describe('Outbound email / Resend infrastructure characterization', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('ResendEmailProvider', () => {
    it('does not call Resend API when API key is missing', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;

      const provider = new ResendEmailProvider({
        get: jest.fn().mockReturnValue(''),
      } as unknown as ConfigService);

      expect(provider.isConfigured()).toBe(false);

      const result = await provider.sendEmail({
        fromEmail: 'noreply@test.com',
        toEmail: 'customer@test.com',
        subject: 'Test',
        bodyText: 'Hello',
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.status).toBe('FAILED');
      expect(result.errorCode).toBe('NOT_CONFIGURED');
    });

    it('calls Resend API with mocked fetch when configured', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 'email_123' }),
      });
      global.fetch = fetchMock as unknown as typeof fetch;

      const provider = new ResendEmailProvider({
        get: jest.fn().mockReturnValue('re_test_key'),
      } as unknown as ConfigService);

      const result = await provider.sendEmail({
        fromEmail: 'billing@synqdrive.test',
        fromName: 'SynqDrive',
        toEmail: 'tenant@test.com',
        subject: 'Invoice',
        bodyHtml: '<p>Invoice</p>',
        idempotencyKey: 'idem-1',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer re_test_key',
            'Idempotency-Key': 'idem-1',
          }),
        }),
      );
      expect(result.providerMessageId).toBe('email_123');
      expect(result.status).toBe('SENT');
    });
  });

  describe('EmailProviderRegistry', () => {
    it('selects dev provider when simulateEnabled is true — no Resend calls', () => {
      const devProvider = { providerName: 'dev', isSimulated: true } as DevEmailProvider;
      const resendProvider = {
        providerName: 'resend',
        isConfigured: jest.fn().mockReturnValue(true),
      } as unknown as ResendEmailProvider;

      const registry = new EmailProviderRegistry(
        { get: jest.fn((key: string, fallback?: unknown) => {
          if (key === 'email.simulateEnabled') return true;
          if (key === 'email.provider') return 'auto';
          return fallback;
        }) } as unknown as ConfigService,
        devProvider,
        resendProvider,
      );

      expect(registry.resolve()).toBe(devProvider);
      expect(resendProvider.isConfigured).not.toHaveBeenCalled();
    });
  });

  describe('billing integration boundary', () => {
    it('core billing services do not import Resend directly — email is outbox consumer only', () => {
      const { readFileSync } = require('fs') as typeof import('fs');
      const { resolve } = require('path') as typeof import('path');
      const billingDir = resolve(__dirname, '../billing');
      const sources = [
        'stripe-webhook.service.ts',
        'stripe-invoice-mirror.service.ts',
        'billing-summary.service.ts',
        'subscription-lifecycle.service.ts',
        'billing-payment-ledger.service.ts',
      ];
      for (const file of sources) {
        const content = readFileSync(resolve(billingDir, file), 'utf8');
        expect(content).not.toMatch(/ResendEmailProvider|resend-email\.provider/);
      }
      const emailConsumer = readFileSync(
        resolve(billingDir, 'email/billing-email-sender.service.ts'),
        'utf8',
      );
      expect(emailConsumer).toContain('EmailProviderRegistry');
    });
  });
});

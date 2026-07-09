import { ConfigService } from '@nestjs/config';
import type { EmailSendPayload } from '../email-provider.port';
import { ResendApiClient, ResendApiError } from './resend-api.client';
import { ResendEmailProvider } from './resend-email.provider';

describe('ResendEmailProvider', () => {
  const payload: EmailSendPayload = {
    fromEmail: 'noreply@acme.test',
    fromName: 'Acme',
    replyToEmail: 'support@acme.test',
    to: 'customer@example.test',
    subject: 'Test',
    bodyText: 'Hello',
    bodyHtml: '<p>Hello</p>',
    attachments: [
      {
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('%PDF-1.4'),
        sizeBytes: 8,
      },
    ],
  };

  it('sends successfully and returns provider message id', async () => {
    const client = {
      isConfigured: () => true,
      sendEmail: jest.fn().mockResolvedValue({ id: 're_123' }),
    } as unknown as ResendApiClient;

    const provider = new ResendEmailProvider(client);
    const result = await provider.send(payload);

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe('re_123');
    expect(result.simulated).toBe(false);
    expect(client.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Acme <noreply@acme.test>',
        to: ['customer@example.test'],
        subject: 'Test',
        attachments: [
          expect.objectContaining({
            filename: 'invoice.pdf',
          }),
        ],
      }),
    );
  });

  it('maps provider failures to user-safe errors', async () => {
    const client = {
      isConfigured: () => true,
      sendEmail: jest.fn().mockRejectedValue(new ResendApiError('Invalid from', 422)),
    } as unknown as ResendApiClient;

    const provider = new ResendEmailProvider(client);
    const result = await provider.send(payload);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('Invalid from');
  });

  it('fails when API key is missing', async () => {
    const client = {
      isConfigured: () => false,
      sendEmail: jest.fn(),
    } as unknown as ResendApiClient;

    const provider = new ResendEmailProvider(client);
    const result = await provider.send(payload);

    expect(result.success).toBe(false);
    expect(client.sendEmail).not.toHaveBeenCalled();
  });
});

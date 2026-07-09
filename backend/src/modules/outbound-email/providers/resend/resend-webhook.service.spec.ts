import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboundEmailEventType, OutboundEmailStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { createHmac } from 'crypto';
import { ResendWebhookService } from './resend-webhook.service';

function signPayload(payload: string, secret: string, id: string, timestamp: string): string {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${id}.${timestamp}.${payload}`;
  const signature = createHmac('sha256', secretBytes).update(signedContent).digest('base64');
  return `v1,${signature}`;
}

describe('ResendWebhookService', () => {
  const secret = 'whsec_' + Buffer.from('test-secret-key-32bytes-long!!!').toString('base64');
  let prisma: {
    outboundEmail: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    outboundEmailEvent: {
      create: jest.Mock;
    };
  };
  let service: ResendWebhookService;

  beforeEach(() => {
    prisma = {
      outboundEmail: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'mail-1',
          providerMessageId: 're_abc',
          errorMessage: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      outboundEmailEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
      },
    };

    const config = {
      get: (key: string, fallback?: string) => {
        if (key === 'email.resendWebhookSecret') return secret;
        return fallback;
      },
    } as unknown as ConfigService;

    service = new ResendWebhookService(
      prisma as unknown as PrismaService,
      config,
    );
  });

  it('updates outbound email on bounce webhook', async () => {
    const body = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 're_abc' },
    });
    const id = 'msg_1';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signPayload(body, secret, id, timestamp);

    const result = await service.ingest(Buffer.from(body), {
      id,
      timestamp,
      signature,
    });

    expect(result.received).toBe(true);
    expect(prisma.outboundEmail.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: OutboundEmailStatus.BOUNCED,
        }),
      }),
    );
    expect(prisma.outboundEmailEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: OutboundEmailEventType.BOUNCED,
        }),
      }),
    );
  });

  it('rejects invalid signatures', async () => {
    const body = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: 're_abc' },
    });

    await expect(
      service.ingest(Buffer.from(body), {
        id: 'msg_1',
        timestamp: '123',
        signature: 'v1,invalid',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

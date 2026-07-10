import { createHmac } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ResendWebhookService } from './resend-webhook.service';
import { OutboundEmailService } from './outbound-email.service';

describe('ResendWebhookService', () => {
  let service: ResendWebhookService;
  const outboundEmail = { applyWebhookEvent: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResendWebhookService,
        { provide: OutboundEmailService, useValue: outboundEmail },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => 'whsec_' + Buffer.from('test-secret').toString('base64')) },
        },
      ],
    }).compile();
    service = module.get(ResendWebhookService);
  });

  it('verifies valid Svix signature and records event', async () => {
    const rawBody = Buffer.from(JSON.stringify({ type: 'email.delivered', data: { email_id: 'em_1' } }));
    const svixId = 'msg_123';
    const svixTimestamp = String(Math.floor(Date.now() / 1000));
    const signedContent = `${svixId}.${svixTimestamp}.${rawBody.toString('utf8')}`;
    const secret = Buffer.from('test-secret');
    const sig = createHmac('sha256', secret).update(signedContent).digest('base64');

    await service.handle(
      rawBody,
      { type: 'email.delivered', data: { email_id: 'em_1' } },
      {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': `v1,${sig}`,
      },
    );

    expect(outboundEmail.applyWebhookEvent).toHaveBeenCalled();
  });

  it('rejects invalid Svix signature', async () => {
    const rawBody = Buffer.from('{}');
    await expect(
      service.handle(rawBody, {}, {
        'svix-id': 'id',
        'svix-timestamp': String(Math.floor(Date.now() / 1000)),
        'svix-signature': 'v1,invalid',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects webhooks in production when RESEND_WEBHOOK_SECRET is unset', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const moduleRef = await Test.createTestingModule({
        providers: [
          ResendWebhookService,
          { provide: OutboundEmailService, useValue: outboundEmail },
          { provide: ConfigService, useValue: { get: jest.fn(() => '') } },
        ],
      }).compile();
      const prodService = moduleRef.get(ResendWebhookService);
      await expect(prodService.handle(Buffer.from('{}'), {}, {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

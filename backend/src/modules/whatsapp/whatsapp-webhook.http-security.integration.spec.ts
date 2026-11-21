import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import * as request from 'supertest';
import { AuthGuard } from '@shared/auth/auth.guard';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { CommunicationConversationRepository } from '@modules/communication/communication-conversation.repository';
import { CommunicationAttachmentService } from '@modules/communication/media/communication-attachment.service';
import { WhatsAppCommunicationProjectionIntegration } from '@modules/communication/adapters/whatsapp/whatsapp-communication-projection.integration';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';
import { WhatsAppProviderService } from './providers/whatsapp-provider.service';
import { MetaWhatsAppCloudProvider } from './providers/meta-whatsapp-cloud.provider';
import { WhatsAppConversationMatcherService } from './whatsapp-conversation-matcher.service';
import { WhatsAppConsentService } from './whatsapp-consent.service';
import { WhatsAppService } from './whatsapp.service';

const PHONE_NUMBER_ID = 'phone-1';
const APP_SECRET = 'whatsapp-test-app-secret';
const VERIFY_TOKEN = 'verify-token-xyz';
const ORG_ID = 'org-wa';

describe('WhatsAppWebhookController HTTP security', () => {
  let app: INestApplication;
  let eventCreates = 0;

  const orgConfig = {
    id: 'cfg-1',
    organizationId: ORG_ID,
    phoneNumberId: PHONE_NUMBER_ID,
    isActive: true,
    accessTokenConfigured: true,
    appSecretConfigured: true,
    webhookVerifyToken: VERIFY_TOKEN,
    metaApiVersion: 'v21.0',
    wabaId: 'waba',
  };

  const prisma = {
    orgWhatsAppConfig: {
      findFirst: jest.fn(async () => orgConfig),
      update: jest.fn(async () => orgConfig),
    },
    whatsAppWebhookEvent: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async () => {
        eventCreates += 1;
        return { id: 'evt-1', processedAt: null };
      }),
      update: jest.fn(async () => ({ id: 'evt-1' })),
    },
    whatsAppMessage: {
      findUnique: jest.fn(async () => null),
      findFirst: jest.fn(async () => null),
      create: jest.fn(),
      update: jest.fn(),
    },
    whatsAppConversation: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'whatsapp-webhook-test-secret';
    process.env[`WHATSAPP_APP_SECRET_${ORG_ID}`] = APP_SECRET;

    const moduleRef = await Test.createTestingModule({
      controllers: [WhatsAppWebhookController],
      providers: [
        WhatsAppWebhookService,
        WhatsAppProviderService,
        MetaWhatsAppCloudProvider,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'whatsapp.cloudAppSecret' ? '' : ''),
          },
        },
        { provide: WhatsAppConversationMatcherService, useValue: { matchContext: jest.fn() } },
        { provide: WhatsAppConsentService, useValue: { processInboundConsentKeywords: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: WhatsAppService, useValue: { processInboundAutoReply: jest.fn() } },
        { provide: CommunicationConversationRepository, useValue: { ensureConversationEnvelope: jest.fn() } },
        { provide: CommunicationAttachmentService, useValue: { ingestInboundProviderMedia: jest.fn() } },
        {
          provide: WhatsAppCommunicationProjectionIntegration,
          useValue: { projectInbound: jest.fn(), projectStatusUpdate: jest.fn(), projectOutboundAccepted: jest.fn() },
        },
        { provide: APP_GUARD, useClass: AuthGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    eventCreates = 0;
    jest.clearAllMocks();
  });

  it('accepts GET Meta challenge without user JWT', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'challenge-123',
        phone_number_id: PHONE_NUMBER_ID,
      })
      .expect(200)
      .expect('challenge-123');
  });

  it('rejects invalid verification token', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/webhooks/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong',
        'hub.challenge': 'challenge-123',
        phone_number_id: PHONE_NUMBER_ID,
      })
      .expect(403);
  });

  it('rejects POST with missing signature', async () => {
    const body = { object: 'whatsapp_business_account', entry: [] };
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/whatsapp')
      .send(body)
      .expect(401);
    expect(eventCreates).toBe(0);
  });

  it('rejects POST with invalid signature', async () => {
    const raw = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account', entry: [] }));
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/whatsapp')
      .set('x-hub-signature-256', 'sha256=deadbeef')
      .send(raw)
      .expect(401);
    expect(eventCreates).toBe(0);
  });

  it('accepts valid signed POST without user JWT', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: '1',
          changes: [
            {
              field: 'messages',
              value: { metadata: { phone_number_id: PHONE_NUMBER_ID }, messages: [] },
            },
          ],
        },
      ],
    };
    const bodyStr = JSON.stringify(payload);
    const raw = Buffer.from(bodyStr);
    const sig =
      'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex');

    await request(app.getHttpServer())
      .post('/api/v1/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('x-hub-signature-256', sig)
      .send(bodyStr)
      .expect(200);
  });
});
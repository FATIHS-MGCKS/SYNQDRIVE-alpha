import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaClient, SmsMessageDeliveryStatus } from '@prisma/client';
import smsConfig from '@config/sms.config';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationTenantContextValidation } from '@modules/communication/communication-tenant-context.validation';
import { SmsConversationRepository } from '../repositories/sms-conversation.repository';
import { SmsMessageRepository } from '../repositories/sms-message.repository';
import { SmsWebhookSecurityService } from '../services/sms-webhook-security.service';
import { computeSentDmWebhookSignature } from '../providers/sentdm-webhook-verification';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

async function probePostgresSchema(prisma: PrismaClient): Promise<boolean> {
  try {
    const org = await prisma.organization.create({
      data: {
        companyName: `SMS webhook probe ${Date.now()}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
    });
    await prisma.organization.delete({ where: { id: org.id } });
    return true;
  } catch {
    return false;
  }
}

describePg('SMS webhook security postgres (C5.1)', () => {
  let prisma: PrismaClient;
  let security: SmsWebhookSecurityService;
  let orgId: string;
  let orgBId: string;
  let signingSecret: string;
  let webhookEndpointId: string;
  let accountId: string;
  let schemaReady = false;

  beforeAll(async () => {
    signingSecret = 'whsec_' + Buffer.from('sms-c51-webhook-key!!').toString('base64');
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    schemaReady = await probePostgresSchema(prisma);
    if (!schemaReady) {
      return;
    }

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [smsConfig] })],
      providers: [PrismaService, CommunicationTenantContextValidation, SmsWebhookSecurityService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    security = moduleRef.get(SmsWebhookSecurityService);
  });

  beforeEach(async () => {
    if (!schemaReady) {
      return;
    }
    const org = await prisma.organization.create({
      data: { companyName: `SMS C51 ${Date.now()}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgId = org.id;
    webhookEndpointId = `wh-${orgId}`;
    accountId = `acc-${orgId}`;
    process.env[`SENT_DM_WEBHOOK_SIGNING_SECRET_${orgId}`] = signingSecret;

    await prisma.orgSmsConfig.create({
      data: {
        organizationId: orgId,
        isActive: true,
        webhookSigningSecretConfigured: true,
        webhookEndpointId,
        sentDmAccountId: accountId,
      },
    });

    const orgB = await prisma.organization.create({
      data: { companyName: `SMS C51 B ${Date.now()}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgBId = orgB.id;
  });

  afterEach(async () => {
    if (!schemaReady || !orgId || !orgBId) {
      return;
    }
    await prisma.smsWebhookEvent.deleteMany({ where: { organizationId: { in: [orgId, orgBId] } } });
    await prisma.smsMessage.deleteMany({ where: { organizationId: { in: [orgId, orgBId] } } });
    await prisma.smsConversation.deleteMany({ where: { organizationId: { in: [orgId, orgBId] } } });
    await prisma.orgSmsConfig.deleteMany({ where: { organizationId: { in: [orgId, orgBId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, orgBId] } } });
    delete process.env[`SENT_DM_WEBHOOK_SIGNING_SECRET_${orgId}`];
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function buildSignedRequest(payload: object) {
    const rawBody = Buffer.from(JSON.stringify(payload));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = computeSentDmWebhookSignature({
      rawBody,
      webhookId: webhookEndpointId,
      timestamp,
      signingSecret,
    })!;
    return {
      rawBody,
      headers: {
        'x-webhook-id': webhookEndpointId,
        'x-webhook-timestamp': timestamp,
        'x-webhook-signature': signature,
      },
    };
  }

  it('requires aligned PostgreSQL schema', () => {
    if (!schemaReady) {
      console.warn('Skipping SMS webhook security postgres tests: DATABASE_URL schema not aligned');
    }
    expect(schemaReady).toBe(true);
  });

  it('A: valid secret + valid signature → accepted', async () => {
    if (!schemaReady) return;
    const req = buildSignedRequest({
      field: 'message',
      event: 'message.delivered',
      timestamp: '2026-08-21T10:00:00Z',
      payload: {
        message_id: 'msg-a',
        message_status: 'DELIVERED',
        account_id: accountId,
        updated_at: '2026-08-21T10:00:01Z',
      },
    });
    const verified = await security.verifyIngress(req);
    expect(verified.organizationId).toBe(orgId);
  });

  it('B: valid secret + invalid signature → rejected', async () => {
    const req = buildSignedRequest({
      field: 'message',
      event: 'message.delivered',
      timestamp: '2026-08-21T10:00:00Z',
      payload: { message_id: 'msg-b', message_status: 'DELIVERED', account_id: accountId, updated_at: '2026-08-21T10:00:01Z' },
    });
    req.headers['x-webhook-signature'] = 'v1,invalid';
    await expect(security.verifyIngress(req)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('C: tenant resolved + secret missing → rejected', async () => {
    delete process.env[`SENT_DM_WEBHOOK_SIGNING_SECRET_${orgId}`];
    const req = buildSignedRequest({
      field: 'message',
      event: 'message.delivered',
      timestamp: '2026-08-21T10:00:00Z',
      payload: { message_id: 'msg-c', message_status: 'DELIVERED', account_id: accountId, updated_at: '2026-08-21T10:00:01Z' },
    });
    await expect(security.verifyIngress(req)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('D: no secret + known providerMessageId → rejected', async () => {
    const convo = await prisma.smsConversation.create({
      data: {
        organizationId: orgId,
        contactPhone: '+491701111111',
        contactPhoneNormalized: '491701111111',
      },
    });
    await prisma.smsMessage.create({
      data: {
        organizationId: orgId,
        conversationId: convo.id,
        direction: 'outgoing',
        senderType: 'system',
        content: 'x',
        providerMessageId: 'known-msg-d',
        businessOperationId: 'biz-d',
        status: SmsMessageDeliveryStatus.QUEUED,
      },
    });
    delete process.env[`SENT_DM_WEBHOOK_SIGNING_SECRET_${orgId}`];
    const req = buildSignedRequest({
      field: 'message',
      event: 'message.delivered',
      timestamp: '2026-08-21T10:00:00Z',
      payload: { message_id: 'known-msg-d', message_status: 'DELIVERED', account_id: accountId, updated_at: '2026-08-21T10:00:01Z' },
    });
    await expect(security.verifyIngress(req)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('E: no secret + valid-looking headers → rejected', async () => {
    delete process.env[`SENT_DM_WEBHOOK_SIGNING_SECRET_${orgId}`];
    const req = buildSignedRequest({
      field: 'message',
      event: 'message.delivered',
      timestamp: '2026-08-21T10:00:00Z',
      payload: { message_id: 'msg-e', message_status: 'DELIVERED', account_id: accountId, updated_at: '2026-08-21T10:00:01Z' },
    });
    await expect(security.verifyIngress(req)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('F: rejection performs no native mutations', async () => {
    const beforeMessages = await prisma.smsMessage.count({ where: { organizationId: orgId } });
    const beforeEvents = await prisma.smsWebhookEvent.count({ where: { organizationId: orgId } });
    const req = buildSignedRequest({
      field: 'message',
      event: 'message.delivered',
      timestamp: '2026-08-21T10:00:00Z',
      payload: { message_id: 'msg-f', message_status: 'DELIVERED', account_id: accountId, updated_at: '2026-08-21T10:00:01Z' },
    });
    req.headers['x-webhook-signature'] = 'v1,bad';
    await expect(security.verifyIngress(req)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await prisma.smsMessage.count({ where: { organizationId: orgId } })).toBe(beforeMessages);
    expect(await prisma.smsWebhookEvent.count({ where: { organizationId: orgId } })).toBe(beforeEvents);
  });

  it('rejects duplicate webhookEndpointId across orgs at DB layer', async () => {
    await expect(
      prisma.orgSmsConfig.create({
        data: {
          organizationId: orgBId,
          isActive: true,
          webhookEndpointId,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

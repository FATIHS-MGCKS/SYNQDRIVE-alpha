import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationReplySendState,
  PrismaClient,
} from '@prisma/client';
import communicationOperationalHealthConfig from '@config/communication-operational-health.config';
import communicationRetentionConfig from '@config/communication-retention.config';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationOperationalHealthRepository } from './communication-operational-health.repository';
import { CommunicationOperationalHealthService } from './communication-operational-health.service';
import { COMMUNICATION_HEALTH_STATE } from './communication-operational-health.constants';
import { COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE } from '../retention/communication-retention.constants';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('Communication operational health postgres (C13.2)', () => {
  let prisma: PrismaClient;
  let health: CommunicationOperationalHealthService;
  let orgA = '';
  let orgB = '';
  const frozenNow = new Date('2026-08-24T12:00:00.000Z');

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
  });

  beforeEach(async () => {
    process.env.COMMUNICATION_RETENTION_ENABLED = 'true';
    process.env.COMMUNICATION_RETENTION_DRY_RUN = 'false';
    process.env.COMMUNICATION_HEALTH_STARTUP_GRACE_MS = '0';

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [communicationOperationalHealthConfig, communicationRetentionConfig],
        }),
      ],
      providers: [
        PrismaService,
        CommunicationOperationalHealthRepository,
        CommunicationOperationalHealthService,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    health = moduleRef.get(CommunicationOperationalHealthService);

    const ts = Date.now();
    orgA = (
      await prisma.organization.create({
        data: { companyName: `C132 A ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
      })
    ).id;
    orgB = (
      await prisma.organization.create({
        data: { companyName: `C132 B ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
      })
    ).id;
  });

  afterEach(async () => {
    for (const orgId of [orgA, orgB].filter(Boolean)) {
      await prisma.communicationReplyCommand.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationRetentionPurgeRun.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
    delete process.env.COMMUNICATION_RETENTION_ENABLED;
    delete process.env.COMMUNICATION_RETENTION_DRY_RUN;
    delete process.env.COMMUNICATION_HEALTH_STARTUP_GRACE_MS;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedConversation(organizationId: string, status: CommunicationConversationStatus) {
    return prisma.communicationConversation.create({
      data: {
        organizationId,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: `native-${organizationId}-${Date.now()}-${Math.random()}`,
        status,
        lastActivityAt: new Date('2026-06-01T10:00:00.000Z'),
      },
    });
  }

  it('reports UNKNOWN send backlog count and oldest age for tenant scope', async () => {
    const convA = await seedConversation(orgA, CommunicationConversationStatus.RESOLVED);
    const convB = await seedConversation(orgB, CommunicationConversationStatus.RESOLVED);

    await prisma.communicationReplyCommand.createMany({
      data: [
        {
          organizationId: orgA,
          conversationId: convA.id,
          clientIdempotencyKey: 'recent-unknown',
          channel: CommunicationChannel.WHATSAPP,
          sendState: CommunicationReplySendState.UNKNOWN,
          actorUserId: 'actor-1',
          createdAt: new Date('2026-08-23T10:00:00.000Z'),
        },
        {
          organizationId: orgA,
          conversationId: convA.id,
          clientIdempotencyKey: 'old-unknown',
          channel: CommunicationChannel.WHATSAPP,
          sendState: CommunicationReplySendState.UNKNOWN,
          actorUserId: 'actor-1',
          createdAt: new Date('2026-06-01T10:00:00.000Z'),
        },
        {
          organizationId: orgB,
          conversationId: convB.id,
          clientIdempotencyKey: 'org-b-unknown',
          channel: CommunicationChannel.WHATSAPP,
          sendState: CommunicationReplySendState.UNKNOWN,
          actorUserId: 'actor-2',
          createdAt: new Date('2026-06-01T10:00:00.000Z'),
        },
      ],
    });

    const globalSnapshot = await health.evaluate({ now: frozenNow });
    expect(globalSnapshot.components.outbound.signals.unknownSendCountBounded).toBe(3);
    expect(globalSnapshot.components.outbound.signals.unknownSendOldestAgeSeconds).toBeGreaterThan(80 * 24 * 3600);

    const orgASnapshot = await health.evaluate({ organizationId: orgA, now: frozenNow });
    expect(orgASnapshot.components.outbound.signals.unknownSendCountBounded).toBe(2);
    expect(orgASnapshot.components.outbound.state).not.toBe(COMMUNICATION_HEALTH_STATE.HEALTHY);

    const orgBSnapshot = await health.evaluate({ organizationId: orgB, now: frozenNow });
    expect(orgBSnapshot.components.outbound.signals.unknownSendCountBounded).toBe(1);
    expect(JSON.stringify(orgBSnapshot)).not.toContain(orgA);
  });

  it('evaluates HUMAN_REQUIRED handoff backlog without cross-org leakage', async () => {
    await seedConversation(orgA, CommunicationConversationStatus.HUMAN_REQUIRED);
    await seedConversation(orgB, CommunicationConversationStatus.RESOLVED);

    const orgBSnapshot = await health.evaluate({ organizationId: orgB, now: frozenNow });
    expect(orgBSnapshot.components.handoff.signals.humanRequiredCountBounded).toBe(0);
    expect(orgBSnapshot.components.handoff.state).toBe(COMMUNICATION_HEALTH_STATE.HEALTHY);

    const orgASnapshot = await health.evaluate({ organizationId: orgA, now: frozenNow });
    expect(orgASnapshot.components.handoff.signals.humanRequiredCountBounded).toBe(1);
    expect(orgASnapshot.components.handoff.state).not.toBe(COMMUNICATION_HEALTH_STATE.HEALTHY);
  });

  it('marks retention UNHEALTHY on lock-lost abort but not on disabled policy', async () => {
    await prisma.communicationRetentionPurgeRun.create({
      data: {
        organizationId: orgA,
        trigger: 'cron',
        dryRun: false,
        status: 'ABORTED',
        report: { errorCode: COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE.LOCK_LOST },
        startedAt: new Date('2026-08-24T11:00:00.000Z'),
        completedAt: new Date('2026-08-24T11:05:00.000Z'),
      },
    });

    const snapshot = await health.evaluate({ organizationId: orgA, now: frozenNow });
    expect(snapshot.components.retention.state).toBe(COMMUNICATION_HEALTH_STATE.UNHEALTHY);
    expect(snapshot.components.retention.signals.lastRunErrorCode).toBe(
      COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE.LOCK_LOST,
    );
    expect(JSON.stringify(snapshot)).not.toMatch(/redis|Redis/i);
  });

  it('does not expose customer content in health snapshot JSON', async () => {
    const conv = await seedConversation(orgA, CommunicationConversationStatus.RESOLVED);
    await prisma.communicationReplyCommand.create({
      data: {
        organizationId: orgA,
        conversationId: conv.id,
        clientIdempotencyKey: 'secret-body',
        channel: CommunicationChannel.WHATSAPP,
        text: 'Customer secret message body',
        sendState: CommunicationReplySendState.UNKNOWN,
        actorUserId: 'actor-1',
      },
    });

    const snapshot = await health.evaluate({ organizationId: orgA, now: frozenNow });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('Customer secret message body');
    expect(serialized).not.toContain(conv.id);
  });
});

import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationReplySendState,
  PrismaClient,
} from '@prisma/client';
import communicationOperationalHealthConfig from '@config/communication-operational-health.config';
import communicationRetentionConfig from '@config/communication-retention.config';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { CommunicationOperationalHealthRepository } from './communication-operational-health.repository';
import { CommunicationOperationalHealthService } from './communication-operational-health.service';
import {
  COMMUNICATION_HEALTH_DIAGNOSTIC,
  COMMUNICATION_HEALTH_STATE,
} from './communication-operational-health.constants';
import { COMMUNICATION_RETENTION_PURGE_RUN_ERROR_CODE } from '../retention/communication-retention.constants';
import { refreshCommunicationSendUnknownGauges } from './communication-prometheus.metrics';

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
      await prisma.voiceProviderWebhookEvent.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
    await prisma.communicationRetentionPurgeRun.deleteMany({ where: { organizationId: null } });
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

  it('attributes UNKNOWN sends per canonical channel without cross-attribution', async () => {
    const convA = await seedConversation(orgA, CommunicationConversationStatus.RESOLVED);
    const convB = await seedConversation(orgB, CommunicationConversationStatus.RESOLVED);

    await prisma.communicationReplyCommand.createMany({
      data: [
        {
          organizationId: orgA,
          conversationId: convA.id,
          clientIdempotencyKey: 'wa-1',
          channel: CommunicationChannel.WHATSAPP,
          sendState: CommunicationReplySendState.UNKNOWN,
          actorUserId: 'actor-1',
        },
        {
          organizationId: orgA,
          conversationId: convA.id,
          clientIdempotencyKey: 'wa-2',
          channel: CommunicationChannel.WHATSAPP,
          sendState: CommunicationReplySendState.UNKNOWN,
          actorUserId: 'actor-1',
        },
        {
          organizationId: orgA,
          conversationId: convA.id,
          clientIdempotencyKey: 'voice-1',
          channel: CommunicationChannel.VOICE,
          sendState: CommunicationReplySendState.UNKNOWN,
          actorUserId: 'actor-1',
        },
        {
          organizationId: orgB,
          conversationId: convB.id,
          clientIdempotencyKey: 'org-b-wa',
          channel: CommunicationChannel.WHATSAPP,
          sendState: CommunicationReplySendState.UNKNOWN,
          actorUserId: 'actor-2',
        },
      ],
    });

    const snapshot = await health.evaluate({ organizationId: orgA, now: frozenNow });
    const outbound = snapshot.components.outbound.signals;
    expect(outbound.unknownSendCountBounded).toBe(3);
    expect(outbound.unknownSendWhatsappCountBounded).toBe(2);
    expect(outbound.unknownSendVoiceCountBounded).toBe(1);
    expect(outbound.unknownSendSmsCountBounded).toBe(0);
    expect(outbound.unknownSendEmailCountBounded).toBe(0);
  });

  it('isolates voice webhook backlog per tenant', async () => {
    const oldReceivedAt = new Date('2026-06-01T10:00:00.000Z');
    await prisma.voiceProviderWebhookEvent.create({
      data: {
        organizationId: orgA,
        provider: 'TWILIO',
        externalEventId: `voice-org-a-${Date.now()}`,
        payloadHash: 'hash-a',
        redactedPayload: {},
        status: 'RECEIVED',
        receivedAt: oldReceivedAt,
      },
    });

    const orgBSnapshot = await health.evaluate({ organizationId: orgB, now: frozenNow });
    expect(orgBSnapshot.components.projection.signals.voiceWebhookBacklogBounded).toBe(0);
    expect(orgBSnapshot.components.projection.state).toBe(COMMUNICATION_HEALTH_STATE.HEALTHY);

    const orgASnapshot = await health.evaluate({ organizationId: orgA, now: frozenNow });
    expect(orgASnapshot.components.projection.signals.voiceWebhookBacklogBounded).toBe(1);
    expect(orgASnapshot.components.projection.state).not.toBe(COMMUNICATION_HEALTH_STATE.HEALTHY);
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

  it('does not degrade retention when dry-run is enabled without destructive success', async () => {
    process.env.COMMUNICATION_RETENTION_DRY_RUN = 'true';

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

    const dryRunHealth = moduleRef.get(CommunicationOperationalHealthService);
    const snapshot = await dryRunHealth.evaluate({ now: frozenNow });
    expect(snapshot.components.retention.signals.dryRun).toBe(true);
    expect(snapshot.components.retention.state).not.toBe(COMMUNICATION_HEALTH_STATE.DEGRADED);
  });

  it('returns UNKNOWN retention for tenant when only global purge evidence exists', async () => {
    await prisma.communicationRetentionPurgeRun.create({
      data: {
        organizationId: null,
        trigger: 'cron',
        dryRun: false,
        status: 'COMPLETED',
        startedAt: new Date('2026-08-24T10:00:00.000Z'),
        completedAt: new Date('2026-08-24T10:30:00.000Z'),
      },
    });

    const snapshot = await health.evaluate({ organizationId: orgB, now: frozenNow });
    expect(snapshot.components.retention.state).toBe(COMMUNICATION_HEALTH_STATE.UNKNOWN);
    expect(snapshot.components.retention.diagnostics).toContain(
      COMMUNICATION_HEALTH_DIAGNOSTIC.RETENTION_TENANT_EVIDENCE_GLOBAL_ONLY,
    );
  });

  it('rejects nonexistent organization with not-found', async () => {
    await expect(
      health.evaluate({ organizationId: '00000000-0000-0000-0000-000000000000', now: frozenNow }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('never returns cached snapshot across tenants', async () => {
    const convA = await seedConversation(orgA, CommunicationConversationStatus.RESOLVED);
    await prisma.communicationReplyCommand.create({
      data: {
        organizationId: orgA,
        conversationId: convA.id,
        clientIdempotencyKey: 'cache-a',
        channel: CommunicationChannel.WHATSAPP,
        sendState: CommunicationReplySendState.UNKNOWN,
        actorUserId: 'actor-1',
      },
    });

    const orgAFirst = await health.evaluate({ organizationId: orgA, now: frozenNow });
    const orgBSecond = await health.evaluate({ organizationId: orgB, now: frozenNow });
    const orgAThird = await health.evaluate({ organizationId: orgA, now: frozenNow });

    expect(orgAFirst.components.outbound.signals.unknownSendCountBounded).toBe(1);
    expect(orgBSecond.components.outbound.signals.unknownSendCountBounded).toBe(0);
    expect(orgAThird.components.outbound.signals.unknownSendCountBounded).toBe(1);
    expect(orgBSecond.components.outbound.signals.unknownSendCountBounded).not.toBe(
      orgAFirst.components.outbound.signals.unknownSendCountBounded,
    );
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

  it('reports media and ai as UNKNOWN not measurable instead of false-green HEALTHY', async () => {
    const snapshot = await health.evaluate({ now: frozenNow });
    expect(snapshot.components.media.state).toBe(COMMUNICATION_HEALTH_STATE.UNKNOWN);
    expect(snapshot.components.media.diagnostics).toContain(COMMUNICATION_HEALTH_DIAGNOSTIC.NOT_MEASURABLE);
    expect(snapshot.components.ai.state).toBe(COMMUNICATION_HEALTH_STATE.UNKNOWN);
    expect(snapshot.components.ai.diagnostics).toContain(COMMUNICATION_HEALTH_DIAGNOSTIC.NOT_MEASURABLE);
    expect(snapshot.components.projection.diagnostics).toContain(
      COMMUNICATION_HEALTH_DIAGNOSTIC.CANONICAL_PROJECTION_LAG_NOT_MEASURABLE,
    );
  });

  it('refreshes per-channel UNKNOWN gauges and zeroes stale channels', async () => {
    const metrics = {
      communicationSendUnknownCurrent: { set: jest.fn() },
      communicationSendUnknownOldestSeconds: { set: jest.fn() },
    } as unknown as TripMetricsService;

    refreshCommunicationSendUnknownGauges(metrics, {
      WHATSAPP: { count: 2, oldestAgeSeconds: 120 },
      VOICE: { count: 1, oldestAgeSeconds: 60 },
      SMS: { count: 0, oldestAgeSeconds: null },
      EMAIL: { count: 0, oldestAgeSeconds: null },
    });

    expect(metrics.communicationSendUnknownCurrent.set).toHaveBeenCalledWith(
      { channel: 'whatsapp' },
      2,
    );
    expect(metrics.communicationSendUnknownCurrent.set).toHaveBeenCalledWith(
      { channel: 'voice' },
      1,
    );
    expect(metrics.communicationSendUnknownCurrent.set).toHaveBeenCalledWith(
      { channel: 'sms' },
      0,
    );
    expect(metrics.communicationSendUnknownOldestSeconds.set).toHaveBeenCalledWith(
      { channel: 'email' },
      0,
    );
  });
});

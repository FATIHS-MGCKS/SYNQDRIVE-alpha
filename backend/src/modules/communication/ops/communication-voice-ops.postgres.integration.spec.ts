import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
  PrismaClient,
  VoiceConversationDirection,
  VoiceConversationLifecycleState,
  VoiceConversationOutcome,
  VoiceConversationStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  CommunicationReadRepository,
} from '../read/communication-read.repository';
import { CommunicationReadService } from '../read/communication-read.service';
import { CommunicationAttachmentService } from '../media/communication-attachment.service';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { CommunicationVoiceOpsService } from '../ops/communication-voice-ops.service';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import { createDocumentStoragePortMock } from '@modules/documents/storage/testing/document-storage-port.mock';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('Communication voice ops + filters postgres (C9.2)', () => {
  let prisma: PrismaClient;
  let readService: CommunicationReadService;
  let readRepository: CommunicationReadRepository;
  let voiceOps: CommunicationVoiceOpsService;
  let scope: CommunicationWriteScopeService;

  let orgA: string;
  let orgB: string;
  let stationA: string;
  let stationB: string;
  let actorUserId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        CommunicationReadRepository,
        CommunicationAttachmentService,
        {
          provide: CommunicationWriteScopeService,
          useValue: { assertConversationReadable: jest.fn() },
        },
        CommunicationVoiceOpsService,
        { provide: DOCUMENTS_STORAGE, useValue: createDocumentStoragePortMock() },
        CommunicationReadService,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    readService = moduleRef.get(CommunicationReadService);
    readRepository = moduleRef.get(CommunicationReadRepository);
    voiceOps = moduleRef.get(CommunicationVoiceOpsService);
    scope = moduleRef.get(CommunicationWriteScopeService);
  });

  beforeEach(async () => {
    const ts = Date.now();
    const orgRowA = await prisma.organization.create({
      data: { companyName: `C92 Voice A ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    const orgRowB = await prisma.organization.create({
      data: { companyName: `C92 Voice B ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgA = orgRowA.id;
    orgB = orgRowB.id;

    stationA = (
      await prisma.station.create({
        data: { organizationId: orgA, name: `Station A ${ts}`, status: 'ACTIVE' },
      })
    ).id;
    stationB = (
      await prisma.station.create({
        data: { organizationId: orgB, name: `Station B ${ts}`, status: 'ACTIVE' },
      })
    ).id;

    const user = await prisma.user.create({
      data: {
        email: `c92-voice-user-${ts}@example.com`,
        firstName: 'Voice',
        lastName: 'Operator',
      },
    });
    actorUserId = user.id;
  });

  afterEach(async () => {
    for (const orgId of [orgA, orgB]) {
      await prisma.communicationEvent.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.voiceConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.station.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
    await prisma.user.deleteMany({ where: { id: actorUserId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedVoicePair(input: {
    orgId: string;
    stationId?: string | null;
    suffix: string;
    direction?: VoiceConversationDirection;
    outcome?: VoiceConversationOutcome;
    startedAt: Date;
    transcript?: string | null;
    escalationReason?: string | null;
    errorMessage?: string | null;
    status?: VoiceConversationStatus;
  }) {
    const voice = await prisma.voiceConversation.create({
      data: {
        organizationId: input.orgId,
        direction: input.direction ?? VoiceConversationDirection.INBOUND,
        status: input.status ?? VoiceConversationStatus.COMPLETED,
        lifecycleState: VoiceConversationLifecycleState.COMPLETED,
        outcome: input.outcome ?? VoiceConversationOutcome.RESOLVED,
        startedAt: input.startedAt,
        endedAt: input.startedAt,
        durationSeconds: 120,
        summary: `Summary ${input.suffix}`,
        transcript: input.transcript ?? null,
        escalationReason: input.escalationReason ?? null,
        errorMessage: input.errorMessage ?? null,
        metadata: {},
      },
    });

    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: input.orgId,
        channel: CommunicationChannel.VOICE,
        nativeConversationId: voice.id,
        status: CommunicationConversationStatus.AI_ACTIVE,
        unreadCount: 0,
        lastActivityAt: input.startedAt,
        stationId: input.stationId ?? undefined,
      },
    });

    return { voice, canonical };
  }

  it('filters voice conversations by direction, outcome, transcript, escalated, and date', async () => {
    const inbound = await seedVoicePair({
      orgId: orgA,
      suffix: 'inbound',
      direction: VoiceConversationDirection.INBOUND,
      outcome: VoiceConversationOutcome.RESOLVED,
      startedAt: new Date('2026-08-20T10:00:00Z'),
      transcript: JSON.stringify([{ role: 'user', message: 'Hi' }]),
    });
    await seedVoicePair({
      orgId: orgA,
      suffix: 'outbound-escalated',
      direction: VoiceConversationDirection.OUTBOUND,
      outcome: VoiceConversationOutcome.ESCALATED,
      startedAt: new Date('2026-08-21T10:00:00Z'),
      escalationReason: 'CALLBACK_REQUESTED',
      transcript: null,
    });
    await seedVoicePair({
      orgId: orgA,
      suffix: 'old',
      direction: VoiceConversationDirection.INBOUND,
      outcome: VoiceConversationOutcome.ABANDONED,
      startedAt: new Date('2026-07-01T10:00:00Z'),
      transcript: null,
    });

    const directionList = await readService.listConversations(orgA, {
      channel: [CommunicationChannel.VOICE],
      callDirection: VoiceConversationDirection.INBOUND,
    });
    expect(directionList.items.map((row) => row.id)).toEqual(
      expect.arrayContaining([inbound.canonical.id]),
    );
    expect(directionList.items.every((row) => row.channel === CommunicationChannel.VOICE)).toBe(true);

    const escalatedList = await readService.listConversations(orgA, {
      channel: [CommunicationChannel.VOICE],
      callEscalatedOnly: true,
    });
    expect(escalatedList.items).toHaveLength(1);
    expect(escalatedList.items[0]!.id).not.toBe(inbound.canonical.id);

    const transcriptList = await readService.listConversations(orgA, {
      channel: [CommunicationChannel.VOICE],
      callHasTranscript: true,
    });
    expect(transcriptList.items).toHaveLength(1);
    expect(transcriptList.items[0]!.id).toBe(inbound.canonical.id);

    const dateList = await readService.listConversations(orgA, {
      channel: [CommunicationChannel.VOICE],
      dateFrom: '2026-08-01T00:00:00.000Z',
      dateTo: '2026-08-31T23:59:59.999Z',
    });
    expect(dateList.items).toHaveLength(2);
  });

  it('supports stable cursor pagination for voice-filtered inbox', async () => {
    for (let index = 0; index < 3; index += 1) {
      await seedVoicePair({
        orgId: orgA,
        suffix: `page-${index}`,
        startedAt: new Date(`2026-08-2${index}T10:00:00Z`),
        transcript: JSON.stringify([{ role: 'user', message: `Msg ${index}` }]),
      });
    }

    const first = await readService.listConversations(orgA, {
      channel: [CommunicationChannel.VOICE],
      callHasTranscript: true,
      limit: 2,
    });
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);

    const second = await readService.listConversations(orgA, {
      channel: [CommunicationChannel.VOICE],
      callHasTranscript: true,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });
    expect(second.items).toHaveLength(1);
    expect(second.hasMore).toBe(false);
  });

  it('isolates voice ops and filters by organization', async () => {
    const orgAPair = await seedVoicePair({
      orgId: orgA,
      stationId: stationA,
      suffix: 'org-a',
      startedAt: new Date('2026-08-22T10:00:00Z'),
      transcript: JSON.stringify([{ role: 'user', message: 'Org A only' }]),
    });
    const orgBPair = await seedVoicePair({
      orgId: orgB,
      stationId: stationB,
      suffix: 'org-b',
      startedAt: new Date('2026-08-22T10:00:00Z'),
      transcript: JSON.stringify([{ role: 'user', message: 'Org B only' }]),
    });

    await expect(
      voiceOps.getVoiceCallDetail(orgA, orgBPair.canonical.id, actorUserId),
    ).rejects.toBeInstanceOf(NotFoundException);

    const orgAList = await readService.listConversations(orgA, {
      channel: [CommunicationChannel.VOICE],
    });
    expect(orgAList.items.map((row) => row.id)).toEqual([orgAPair.canonical.id]);
    expect(orgAList.items.some((row) => row.id === orgBPair.canonical.id)).toBe(false);
  });

  it('enforces station scope via CommunicationWriteScopeService', async () => {
    const orgAPair = await seedVoicePair({
      orgId: orgA,
      stationId: stationA,
      suffix: 'station-scope',
      startedAt: new Date('2026-08-22T10:00:00Z'),
      transcript: JSON.stringify([{ role: 'user', message: 'Scoped' }]),
    });

    const scopeSpy = jest
      .spyOn(scope, 'assertConversationReadable')
      .mockRejectedValue(new NotFoundException());
    await expect(
      voiceOps.getVoiceCallDetail(orgA, orgAPair.canonical.id, actorUserId),
    ).rejects.toBeInstanceOf(NotFoundException);
    scopeSpy.mockRestore();
  });

  it('redacts malformed provider transcript payloads and omits invalid timestamps', async () => {
    const malformed = await seedVoicePair({
      orgId: orgA,
      suffix: 'malformed',
      startedAt: new Date('2026-08-22T10:00:00Z'),
      transcript: '{"system_prompt":"secret","tool_arguments":{"token":"x"}}',
    });

    const transcript = await voiceOps.getVoiceCallTranscript(
      orgA,
      malformed.canonical.id,
      actorUserId,
    );
    expect(transcript.availability).toBe('TRANSCRIPT_UNAVAILABLE');
    expect(JSON.stringify(transcript)).not.toContain('system_prompt');

    const invalidTs = await seedVoicePair({
      orgId: orgA,
      suffix: 'invalid-ts',
      startedAt: new Date('2026-08-22T11:00:00Z'),
      transcript: JSON.stringify([
        { role: 'user', message: 'Hello', timestamp: 'not-a-date' },
        { role: 'agent', message: 'Hi', occurredAt: '2026-08-22T11:00:05.000Z' },
      ]),
    });
    const parsed = await voiceOps.getVoiceCallTranscript(
      orgA,
      invalidTs.canonical.id,
      actorUserId,
    );
    expect(parsed.segments[0]?.occurredAt).toBeUndefined();
    expect(parsed.segments[1]?.occurredAt).toBe('2026-08-22T11:00:05.000Z');
  });

  it('returns TRANSCRIPT_UNAVAILABLE for purged transcript and safe failure state for provider errors', async () => {
    const purged = await seedVoicePair({
      orgId: orgA,
      suffix: 'purged',
      startedAt: new Date('2026-08-22T12:00:00Z'),
      transcript: null,
    });
    const purgedTranscript = await voiceOps.getVoiceCallTranscript(
      orgA,
      purged.canonical.id,
      actorUserId,
    );
    expect(purgedTranscript.availability).toBe('TRANSCRIPT_UNAVAILABLE');

    const failed = await seedVoicePair({
      orgId: orgA,
      suffix: 'failed',
      startedAt: new Date('2026-08-22T13:00:00Z'),
      status: VoiceConversationStatus.FAILED,
      outcome: VoiceConversationOutcome.FAILED,
      errorMessage: 'ElevenLabs internal stack trace',
    });
    const detail = await voiceOps.getVoiceCallDetail(orgA, failed.canonical.id, actorUserId);
    expect(detail.failureState).toBe('CALL_FAILED');
    expect(detail).not.toHaveProperty('errorMessage');
    expect(JSON.stringify(detail)).not.toContain('ElevenLabs');
  });
});

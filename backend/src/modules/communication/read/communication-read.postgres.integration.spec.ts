import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationEventType,
  CommunicationProviderIdentity,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationReadRepository } from './communication-read.repository';
import { CommunicationReadService } from './communication-read.service';
import {
  collectForbiddenPublicKeys,
  projectSafeReadMetadata,
} from './communication-read.mapper';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('Communication read API postgres', () => {
  let prisma: PrismaClient;
  let service: CommunicationReadService;
  let repository: CommunicationReadRepository;

  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService, CommunicationReadRepository, CommunicationReadService],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    service = moduleRef.get(CommunicationReadService);
    repository = moduleRef.get(CommunicationReadRepository);
  });

  beforeEach(async () => {
    const ts = Date.now();
    const orgRowA = await prisma.organization.create({
      data: { companyName: `C7 A ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    const orgRowB = await prisma.organization.create({
      data: { companyName: `C7 B ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgA = orgRowA.id;
    orgB = orgRowB.id;
  });

  afterEach(async () => {
    for (const orgId of [orgA, orgB]) {
      await prisma.communicationEvent.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.booking.deleteMany({ where: { organizationId: orgId } });
      await prisma.customer.deleteMany({ where: { organizationId: orgId } });
      await prisma.vehicle.deleteMany({ where: { organizationId: orgId } });
      await prisma.station.deleteMany({ where: { organizationId: orgId } });
      await prisma.user.deleteMany({ where: { email: { startsWith: `c7-user-${orgId}` } } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedConversation(input: {
    orgId: string;
    suffix: string;
    channel?: CommunicationChannel;
    status?: CommunicationConversationStatus;
    unreadCount?: number;
    lastActivityAt: Date;
    customerId?: string | null;
    bookingId?: string | null;
    vehicleId?: string | null;
    stationId?: string | null;
    assignedUserId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.communicationConversation.create({
      data: {
        organizationId: input.orgId,
        channel: input.channel ?? CommunicationChannel.WHATSAPP,
        nativeConversationId: `native-${input.suffix}`,
        status: input.status ?? CommunicationConversationStatus.AI_ACTIVE,
        unreadCount: input.unreadCount ?? 0,
        lastActivityAt: input.lastActivityAt,
        customerId: input.customerId ?? undefined,
        bookingId: input.bookingId ?? undefined,
        vehicleId: input.vehicleId ?? undefined,
        stationId: input.stationId ?? undefined,
        assignedUserId: input.assignedUserId ?? undefined,
        metadata: input.metadata,
      },
    });
  }

  async function seedEvent(input: {
    orgId: string;
    conversationId: string;
    channel: CommunicationChannel;
    occurredAt: Date;
    providerIdentity?: CommunicationProviderIdentity;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.communicationEvent.create({
      data: {
        organizationId: input.orgId,
        conversationId: input.conversationId,
        channel: input.channel,
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt: input.occurredAt,
        providerIdentity: input.providerIdentity,
        metadata: input.metadata,
      },
    });
  }

  it('A — org A list returns only org A conversations', async () => {
    await seedConversation({ orgId: orgA, suffix: 'a1', lastActivityAt: new Date() });
    await seedConversation({ orgId: orgB, suffix: 'b1', lastActivityAt: new Date() });

    const list = await service.listConversations(orgA, {});
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.channel).toBe(CommunicationChannel.WHATSAPP);
  });

  it('B — cross-org conversation detail is not found', async () => {
    const conv = await seedConversation({ orgId: orgB, suffix: 'secret', lastActivityAt: new Date() });
    await expect(service.getConversation(orgA, conv.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('C — channel filter', async () => {
    await seedConversation({
      orgId: orgA,
      suffix: 'wa',
      channel: CommunicationChannel.WHATSAPP,
      lastActivityAt: new Date('2026-08-21T10:00:00Z'),
    });
    await seedConversation({
      orgId: orgA,
      suffix: 'sms',
      channel: CommunicationChannel.SMS,
      lastActivityAt: new Date('2026-08-21T09:00:00Z'),
    });

    const list = await service.listConversations(orgA, { channel: [CommunicationChannel.SMS] });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.channel).toBe(CommunicationChannel.SMS);
  });

  it('D — unreadOnly filter', async () => {
    await seedConversation({
      orgId: orgA,
      suffix: 'read',
      unreadCount: 0,
      lastActivityAt: new Date('2026-08-21T10:00:00Z'),
    });
    await seedConversation({
      orgId: orgA,
      suffix: 'unread',
      unreadCount: 3,
      lastActivityAt: new Date('2026-08-21T11:00:00Z'),
    });

    const list = await service.listConversations(orgA, { unreadOnly: true });
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.unreadCount).toBe(3);
  });

  it('E–H — entity filters', async () => {
    const customer = await prisma.customer.create({
      data: {
        organizationId: orgA,
        firstName: 'Anna',
        lastName: 'Search',
        phoneNormalized: '491111',
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        organizationId: orgA,
        vin: `VIN${Date.now()}`,
        make: 'VW',
        model: 'Golf',
        year: 2024,
        fuelType: 'GASOLINE',
        licensePlate: 'C7-SEARCH',
        status: 'AVAILABLE',
      },
    });
    const station = await prisma.station.create({
      data: {
        organizationId: orgA,
        name: 'C7 Central',
        code: 'C7C',
        status: 'ACTIVE',
      },
    });
    const booking = await prisma.booking.create({
      data: {
        organizationId: orgA,
        customerId: customer.id,
        vehicleId: vehicle.id,
        startDate: new Date('2026-08-25T10:00:00Z'),
        endDate: new Date('2026-08-26T10:00:00Z'),
        status: 'CONFIRMED',
      },
    });

    const conv = await seedConversation({
      orgId: orgA,
      suffix: 'ctx',
      lastActivityAt: new Date(),
      customerId: customer.id,
      bookingId: booking.id,
      vehicleId: vehicle.id,
      stationId: station.id,
    });

    await expect(service.listConversations(orgA, { customerId: customer.id })).resolves.toMatchObject({
      items: [{ id: conv.id }],
    });
    await expect(service.listConversations(orgA, { bookingId: booking.id })).resolves.toMatchObject({
      items: [{ id: conv.id }],
    });
    await expect(service.listConversations(orgA, { vehicleId: vehicle.id })).resolves.toMatchObject({
      items: [{ id: conv.id }],
    });
    await expect(service.listConversations(orgA, { stationId: station.id })).resolves.toMatchObject({
      items: [{ id: conv.id }],
    });
  });

  it('I/J — assigned and unassigned filters', async () => {
    const user = await prisma.user.create({
      data: {
        email: `c7-user-${orgA}-assignee@example.com`,
        name: 'Assignee User',
      },
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: orgA,
        userId: user.id,
        role: 'ORG_ADMIN',
        status: 'ACTIVE',
      },
    });

    const assigned = await seedConversation({
      orgId: orgA,
      suffix: 'assigned',
      assignedUserId: user.id,
      lastActivityAt: new Date('2026-08-21T12:00:00Z'),
    });
    await seedConversation({
      orgId: orgA,
      suffix: 'open',
      lastActivityAt: new Date('2026-08-21T11:00:00Z'),
    });

    const byUser = await service.listConversations(orgA, { assignedUserId: user.id });
    expect(byUser.items.map((row) => row.id)).toEqual([assigned.id]);

    const unassigned = await service.listConversations(orgA, { unassigned: true });
    expect(unassigned.items.every((row) => row.id !== assigned.id)).toBe(true);
  });

  it('K — date range filter uses lastActivityAt', async () => {
    await seedConversation({
      orgId: orgA,
      suffix: 'old',
      lastActivityAt: new Date('2026-08-01T10:00:00Z'),
    });
    const recent = await seedConversation({
      orgId: orgA,
      suffix: 'recent',
      lastActivityAt: new Date('2026-08-20T10:00:00Z'),
    });

    const list = await service.listConversations(orgA, {
      dateFrom: '2026-08-15T00:00:00.000Z',
      dateTo: '2026-08-22T00:00:00.000Z',
    });
    expect(list.items.map((row) => row.id)).toEqual([recent.id]);
  });

  it('L/M/N — stable cursor, malformed cursor, page size max', async () => {
    const sameTs = new Date('2026-08-21T12:00:00.000Z');
    const first = await seedConversation({
      orgId: orgA,
      suffix: 'c1',
      lastActivityAt: sameTs,
    });
    const second = await seedConversation({
      orgId: orgA,
      suffix: 'c2',
      lastActivityAt: sameTs,
    });

    const page1 = await service.listConversations(orgA, { limit: 1 });
    expect(page1.items).toHaveLength(1);
    expect(page1.hasMore).toBe(true);

    const page2 = await service.listConversations(orgA, { limit: 1, cursor: page1.nextCursor! });
    expect(page2.items[0]!.id).not.toBe(page1.items[0]!.id);
    expect(new Set([page1.items[0]!.id, page2.items[0]!.id])).toEqual(
      new Set([first.id, second.id]),
    );

    await expect(
      repository.listConversations(orgA, { cursor: 'broken-cursor' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const maxPage = await service.listConversations(orgA, { limit: 500 });
    expect(maxPage.items.length).toBeLessThanOrEqual(100);
  });

  it('O/P — timeline scoped to same-org conversation with stable occurredAt cursor', async () => {
    const conv = await seedConversation({ orgId: orgA, suffix: 'tl', lastActivityAt: new Date() });
    const occurredAt = new Date('2026-08-21T12:00:00.000Z');
    const evt1 = await seedEvent({
      orgId: orgA,
      conversationId: conv.id,
      channel: CommunicationChannel.WHATSAPP,
      occurredAt,
    });
    const evt2 = await seedEvent({
      orgId: orgA,
      conversationId: conv.id,
      channel: CommunicationChannel.WHATSAPP,
      occurredAt,
    });

    const page1 = await service.listConversationEvents(orgA, conv.id, { limit: 1 });
    expect(page1.items).toHaveLength(1);
    const page2 = await service.listConversationEvents(orgA, conv.id, {
      limit: 1,
      cursor: page1.nextCursor!,
    });
    expect(new Set([page1.items[0]!.id, page2.items[0]!.id])).toEqual(new Set([evt1.id, evt2.id]));

    await expect(
      service.listConversationEvents(orgA, '00000000-0000-4000-8000-000000000000', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('Q/R — safe metadata and fallback display label', async () => {
    const conv = await seedConversation({
      orgId: orgA,
      suffix: 'pii',
      lastActivityAt: new Date(),
      metadata: {
        phone: '+49123',
        transcript: 'secret',
        intentCode: 'SUPPORT',
      },
    });
    await seedEvent({
      orgId: orgA,
      conversationId: conv.id,
      channel: CommunicationChannel.WHATSAPP,
      occurredAt: new Date(),
      metadata: {
        phone: '+49123',
        intentCode: 'SUPPORT',
        rawPayload: { secret: true },
      },
    });

    const detail = await service.getConversation(orgA, conv.id);
    expect(detail.displayLabel).toBe('Unbekannter Kontakt');

    const events = await service.listConversationEvents(orgA, conv.id, {});
    expect(events.items[0]!.metadata).toEqual({ intentCode: 'SUPPORT' });
  });

  it('S — archived customer still renders historical reference', async () => {
    const customer = await prisma.customer.create({
      data: {
        organizationId: orgA,
        firstName: 'Archived',
        lastName: 'Customer',
        archivedAt: new Date(),
      },
    });
    const conv = await seedConversation({
      orgId: orgA,
      suffix: 'arch',
      customerId: customer.id,
      lastActivityAt: new Date(),
    });

    const detail = await service.getConversation(orgA, conv.id);
    expect(detail.customer?.displayName).toBe('Archived Customer');
  });

  it('T/U/V — summary counts, org-scoped search, stable search pagination', async () => {
    const customer = await prisma.customer.create({
      data: {
        organizationId: orgA,
        firstName: 'Unique',
        lastName: 'Finder',
      },
    });
    const customerB = await prisma.customer.create({
      data: {
        organizationId: orgB,
        firstName: 'Unique',
        lastName: 'Finder',
      },
    });

    const customerA2 = await prisma.customer.create({
      data: {
        organizationId: orgA,
        firstName: 'Unique',
        lastName: 'Second',
      },
    });

    await seedConversation({
      orgId: orgA,
      suffix: 'sum1',
      customerId: customer.id,
      unreadCount: 2,
      lastActivityAt: new Date('2026-08-21T12:00:00Z'),
    });
    await seedConversation({
      orgId: orgA,
      suffix: 'sum1b',
      customerId: customerA2.id,
      unreadCount: 1,
      lastActivityAt: new Date('2026-08-21T11:30:00Z'),
    });
    await seedConversation({
      orgId: orgA,
      suffix: 'sum2',
      unreadCount: 0,
      lastActivityAt: new Date('2026-08-21T11:00:00Z'),
    });
    await seedConversation({
      orgId: orgB,
      suffix: 'other-org',
      customerId: customerB.id,
      lastActivityAt: new Date(),
    });

    const summary = await service.summarizeConversations(orgA, {});
    expect(summary.totalUnreadMessages).toBe(3);
    expect(summary.unreadConversations).toBe(2);
    expect(summary.unassigned).toBeGreaterThanOrEqual(2);

    const searchA = await service.listConversations(orgA, { search: 'Unique Finder' });
    expect(searchA.items).toHaveLength(1);

    const searchB = await service.listConversations(orgB, { search: 'Unique Finder' });
    expect(searchB.items).toHaveLength(1);
    expect(searchB.items[0]!.displayLabel).toBe('Unique Finder');

    const searchPage1 = await service.listConversations(orgA, { search: 'Unique', limit: 1 });
    const searchPage2 = await service.listConversations(orgA, {
      search: 'Unique',
      limit: 1,
      cursor: searchPage1.nextCursor ?? undefined,
    });
    expect(searchPage1.items[0]!.id).not.toBe(searchPage2.items[0]?.id ?? '');
  });

  it('Y — list issues bounded SQL queries (single join findMany)', async () => {
    const customer = await prisma.customer.create({
      data: {
        organizationId: orgA,
        firstName: 'Bulk',
        lastName: 'Customer',
      },
    });
    const base = Date.now();
    for (let i = 0; i < 25; i += 1) {
      await seedConversation({
        orgId: orgA,
        suffix: `bulk-${i}`,
        customerId: customer.id,
        lastActivityAt: new Date(base - i * 1000),
      });
    }

    const queryLog: string[] = [];
    const loggingPrisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
      log: [{ emit: 'event', level: 'query' }],
    });
    loggingPrisma.$on('query', (event) => {
      queryLog.push(event.query);
    });
    await loggingPrisma.$connect();

    const loggingRepo = new CommunicationReadRepository(loggingPrisma as unknown as PrismaService);
    const loggingService = new CommunicationReadService(loggingRepo);
    await loggingService.listConversations(orgA, { limit: 25 });

    const conversationQueries = queryLog.filter((q) => q.includes('communication_conversations'));
    expect(conversationQueries.length).toBe(1);
    expect(queryLog.length).toBeLessThanOrEqual(8);
    expect(queryLog.length).toBeLessThan(15);
    await loggingPrisma.$disconnect();
  });

  it('Z — canonical read does not require native provider tables', async () => {
    const conv = await seedConversation({ orgId: orgA, suffix: 'canonical-only', lastActivityAt: new Date() });
    await seedEvent({
      orgId: orgA,
      conversationId: conv.id,
      channel: CommunicationChannel.WHATSAPP,
      occurredAt: new Date(),
      providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
    });

    const detail = await service.getConversation(orgA, conv.id);
    const events = await service.listConversationEvents(orgA, conv.id, {});
    expect(detail.id).toBe(conv.id);
    expect(events.items).toHaveLength(1);
    expect(await prisma.whatsAppConversation.count({ where: { organizationId: orgA } })).toBe(0);
  });

  it('H1 — assigned-user search requires ACTIVE org membership', async () => {
    const outsider = await prisma.user.create({
      data: {
        email: `outsider-${orgA}-${Date.now()}@example.com`,
        name: 'Outsider Searchable',
      },
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: orgB,
        userId: outsider.id,
        role: 'WORKER',
        status: 'ACTIVE',
      },
    });

    await seedConversation({
      orgId: orgA,
      suffix: 'outsider-assigned',
      assignedUserId: outsider.id,
      lastActivityAt: new Date(),
    });

    const outsiderHits = await service.listConversations(orgA, { search: 'Outsider' });
    expect(outsiderHits.items).toHaveLength(0);

    const member = await prisma.user.create({
      data: {
        email: `member-${orgA}-${Date.now()}@example.com`,
        name: 'Member Searchable',
      },
    });
    await prisma.organizationMembership.create({
      data: {
        organizationId: orgA,
        userId: member.id,
        role: 'WORKER',
        status: 'ACTIVE',
      },
    });
    const memberConv = await seedConversation({
      orgId: orgA,
      suffix: 'member-assigned',
      assignedUserId: member.id,
      lastActivityAt: new Date(),
    });

    const memberHits = await service.listConversations(orgA, { search: 'Member Searchable' });
    expect(memberHits.items.map((row) => row.id)).toEqual([memberConv.id]);
  });

  it('H2 — summary honors search and unreadOnly filters', async () => {
    const customerA = await prisma.customer.create({
      data: { organizationId: orgA, firstName: 'Summary', lastName: 'Alpha' },
    });
    const customerB = await prisma.customer.create({
      data: { organizationId: orgA, firstName: 'Summary', lastName: 'Beta' },
    });

    await seedConversation({
      orgId: orgA,
      suffix: 'sum-alpha-unread',
      customerId: customerA.id,
      unreadCount: 4,
      lastActivityAt: new Date('2026-08-21T12:00:00Z'),
    });
    await seedConversation({
      orgId: orgA,
      suffix: 'sum-beta-read',
      customerId: customerB.id,
      unreadCount: 0,
      lastActivityAt: new Date('2026-08-21T11:00:00Z'),
    });

    const searchSummary = await service.summarizeConversations(orgA, { search: 'Alpha' });
    expect(searchSummary.totalUnreadMessages).toBe(4);
    expect(searchSummary.unreadConversations).toBe(1);
    expect(Object.values(searchSummary.byChannel).reduce((a, b) => a + b, 0)).toBe(1);

    const unreadSummary = await service.summarizeConversations(orgA, { unreadOnly: true });
    expect(unreadSummary.unreadConversations).toBe(1);
    expect(unreadSummary.totalUnreadMessages).toBe(4);
  });

  it('H3 — providerIdentity filter matches HAS ANY EVENT FROM PROVIDER', async () => {
    const withTwilio = await seedConversation({
      orgId: orgA,
      suffix: 'twilio-event',
      channel: CommunicationChannel.VOICE,
      lastActivityAt: new Date('2026-08-21T12:00:00Z'),
    });
    await seedEvent({
      orgId: orgA,
      conversationId: withTwilio.id,
      channel: CommunicationChannel.VOICE,
      occurredAt: new Date(),
      providerIdentity: CommunicationProviderIdentity.TWILIO,
    });
    await seedEvent({
      orgId: orgA,
      conversationId: withTwilio.id,
      channel: CommunicationChannel.VOICE,
      occurredAt: new Date(),
      providerIdentity: CommunicationProviderIdentity.ELEVENLABS,
    });

    const onlyTwilio = await service.listConversations(orgA, {
      providerIdentity: [CommunicationProviderIdentity.TWILIO],
    });
    expect(onlyTwilio.items.map((row) => row.id)).toEqual([withTwilio.id]);
  });

  it('H4 — rejects conflicting assignedUserId + unassigned', async () => {
    await expect(
      service.listConversations(orgA, {
        assignedUserId: '00000000-0000-4000-8000-000000000001',
        unassigned: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('H5 — rejects invalid date range', async () => {
    await expect(
      service.listConversations(orgA, {
        dateFrom: '2026-08-22T00:00:00.000Z',
        dateTo: '2026-08-21T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('AP1 — attention preview returns HUMAN_REQUIRED outside recent list window', async () => {
    const base = new Date('2026-08-22T12:00:00.000Z');
    for (let index = 0; index < 35; index += 1) {
      await seedConversation({
        orgId: orgA,
        suffix: `recent-${index}`,
        status: CommunicationConversationStatus.AI_ACTIVE,
        unreadCount: index % 3 === 0 ? 1 : 0,
        lastActivityAt: new Date(base.getTime() + index * 60_000),
        assignedUserId: index % 5 === 0 ? null : undefined,
      });
    }

    const humanRequired = await seedConversation({
      orgId: orgA,
      suffix: 'human-outside-window',
      status: CommunicationConversationStatus.HUMAN_REQUIRED,
      unreadCount: 0,
      lastActivityAt: new Date('2026-08-21T08:00:00.000Z'),
    });

    const preview = await service.listAttentionPreview(orgA, { limit: 5 });
    expect(preview.items[0]!.id).toBe(humanRequired.id);
    expect(preview.items).toHaveLength(5);
  });

  it('AP2 — attention preview fills tiers deterministically and dedupes', async () => {
    const base = new Date('2026-08-22T10:00:00.000Z');
    const humanA = await seedConversation({
      orgId: orgA,
      suffix: 'human-a',
      status: CommunicationConversationStatus.HUMAN_REQUIRED,
      lastActivityAt: new Date(base.getTime() + 4_000),
    });
    const humanB = await seedConversation({
      orgId: orgA,
      suffix: 'human-b',
      status: CommunicationConversationStatus.HUMAN_REQUIRED,
      lastActivityAt: new Date(base.getTime() + 3_000),
    });
    const unreadUnassignedA = await seedConversation({
      orgId: orgA,
      suffix: 'uu-a',
      unreadCount: 2,
      assignedUserId: null,
      lastActivityAt: new Date(base.getTime() + 2_000),
    });
    const unreadUnassignedB = await seedConversation({
      orgId: orgA,
      suffix: 'uu-b',
      unreadCount: 1,
      assignedUserId: null,
      lastActivityAt: new Date(base.getTime() + 1_000),
    });
    const unreadAssigned = await seedConversation({
      orgId: orgA,
      suffix: 'u-assigned',
      unreadCount: 3,
      lastActivityAt: new Date(base.getTime() + 5_000),
    });
    for (let index = 0; index < 5; index += 1) {
      await seedConversation({
        orgId: orgA,
        suffix: `unassigned-${index}`,
        assignedUserId: null,
        unreadCount: 0,
        lastActivityAt: new Date(base.getTime() - (index + 1) * 1_000),
      });
    }

    const preview = await service.listAttentionPreview(orgA, { limit: 5 });
    expect(preview.items.map((item) => item.id)).toEqual([
      humanA.id,
      humanB.id,
      unreadUnassignedA.id,
      unreadUnassignedB.id,
      unreadAssigned.id,
    ]);
  });

  it('AP3 — attention preview excludes terminal unassigned-only conversations', async () => {
    await seedConversation({
      orgId: orgA,
      suffix: 'resolved-unassigned',
      status: CommunicationConversationStatus.RESOLVED,
      assignedUserId: null,
      unreadCount: 0,
      lastActivityAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    const preview = await service.listAttentionPreview(orgA, { limit: 5 });
    expect(preview.items).toHaveLength(0);
  });

  it('H6 — recursive PII keys absent from public list/detail/events', async () => {
    const conv = await seedConversation({
      orgId: orgA,
      suffix: 'pii-nested',
      lastActivityAt: new Date(),
      metadata: {
        phone: '+49123',
        secret: 'x',
        intentCode: 'SUPPORT',
        nested: { transcript: 'no', token: 'no' },
      } as Prisma.InputJsonValue,
    });
    await seedEvent({
      orgId: orgA,
      conversationId: conv.id,
      channel: CommunicationChannel.WHATSAPP,
      occurredAt: new Date(),
      metadata: {
        body: 'secret',
        content: 'secret',
        providerResponse: { raw: true },
        intentCode: 'SUPPORT',
      } as Prisma.InputJsonValue,
    });

    const detail = await service.getConversation(orgA, conv.id);
    const events = await service.listConversationEvents(orgA, conv.id, {});
    expect(collectForbiddenPublicKeys(detail)).toEqual([]);
    for (const event of events.items) {
      expect(collectForbiddenPublicKeys(event.metadata)).toEqual([]);
      expect(projectSafeReadMetadata(event.metadata)).toEqual(event.metadata ?? undefined);
    }
  });
});

import { Test } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  ActivityAction,
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationEventType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { StationAccessService } from '@shared/stations/station-access.service';
import { CommunicationEventRepository } from '../communication-event.repository';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationWriteScopeService } from './communication-write-scope.service';
import { CommunicationHumanTakeoverService } from './communication-human-takeover.service';
import {
  CommunicationWriteService,
  MAX_OPTIMISTIC_MUTATION_RETRIES,
} from './communication-write.service';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('Communication write API postgres', () => {
  let prisma: PrismaClient;
  let service: CommunicationWriteService;
  let readRepository: CommunicationReadRepository;
  let auditRecord: jest.Mock;

  let orgA: string;
  let orgB: string;
  let operatorA: string;
  let operatorB: string;
  let manager: string;
  let outsider: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    auditRecord = jest.fn().mockResolvedValue('audit-1');

    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        CommunicationReadRepository,
        CommunicationEventRepository,
        StationAccessService,
        CommunicationWriteScopeService,
        CommunicationHumanTakeoverService,
        CommunicationWriteService,
        { provide: AuditService, useValue: { record: auditRecord } },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    service = moduleRef.get(CommunicationWriteService);
    readRepository = moduleRef.get(CommunicationReadRepository);
  });

  beforeEach(async () => {
    auditRecord.mockClear();
    const ts = Date.now();
    const orgRowA = await prisma.organization.create({
      data: { companyName: `C11 A ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    const orgRowB = await prisma.organization.create({
      data: { companyName: `C11 B ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgA = orgRowA.id;
    orgB = orgRowB.id;

    const mkUser = async (suffix: string, orgId: string, permissions: Prisma.InputJsonValue) => {
      const user = await prisma.user.create({
        data: {
          email: `c11-${suffix}-${ts}@example.com`,
          name: `C11 ${suffix}`,
          status: 'ACTIVE',
        },
      });
      await prisma.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: orgId,
          role: 'WORKER',
          status: 'ACTIVE',
          permissions,
        },
      });
      return user.id;
    };

    operatorA = await mkUser('op-a', orgA, {
      communication: { read: true, write: true, manage: false },
    });
    operatorB = await mkUser('op-b', orgA, {
      communication: { read: true, write: true, manage: false },
    });
    manager = await mkUser('mgr', orgA, {
      communication: { read: true, write: true, manage: true },
    });
    outsider = await mkUser('outsider', orgB, {
      communication: { read: true, write: true, manage: true },
    });
  });

  afterEach(async () => {
    for (const orgId of [orgA, orgB]) {
      await prisma.activityLog.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationEvent.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
      await prisma.user.deleteMany({ where: { email: { contains: `c11-` } } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedConversation(input: {
    orgId: string;
    suffix: string;
    status?: CommunicationConversationStatus;
    assignedUserId?: string | null;
    unreadCount?: number;
    lastContentAt?: Date | null;
    stationId?: string | null;
  }) {
    return prisma.communicationConversation.create({
      data: {
        organizationId: input.orgId,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: `native-${input.suffix}`,
        status: input.status ?? CommunicationConversationStatus.HUMAN_REQUIRED,
        assignedUserId: input.assignedUserId ?? undefined,
        unreadCount: input.unreadCount ?? 0,
        lastContentAt: input.lastContentAt ?? undefined,
        stationId: input.stationId ?? undefined,
        lastActivityAt: new Date(),
      },
    });
  }

  it('claims HUMAN_REQUIRED conversation for operator with response convergence', async () => {
    const convo = await seedConversation({ orgId: orgA, suffix: 'claim-1' });
    const result = await service.claimConversation(orgA, convo.id, { userId: operatorA });

    expect(result.conversation.assignedUser?.id).toBe(operatorA);
    expect(result.conversation.status).toBe(CommunicationConversationStatus.HUMAN_ACTIVE);

    const events = await prisma.communicationEvent.findMany({
      where: { organizationId: orgA, conversationId: convo.id },
    });
    expect(events.some((e) => e.eventType === CommunicationEventType.HUMAN_ASSIGNED)).toBe(true);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ActivityAction.UPDATE,
        entityId: convo.id,
      }),
    );
  });

  it('claim is idempotent for same operator', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'claim-idem',
      status: CommunicationConversationStatus.HUMAN_ACTIVE,
      assignedUserId: operatorA,
    });

    const result = await service.claimConversation(orgA, convo.id, { userId: operatorA });
    expect(result.conversation.status).toBe(CommunicationConversationStatus.HUMAN_ACTIVE);
    expect(result.conversation.assignedUser?.id).toBe(operatorA);

    const events = await prisma.communicationEvent.count({
      where: { organizationId: orgA, conversationId: convo.id },
    });
    expect(events).toBe(0);
    expect(auditRecord).not.toHaveBeenCalled();
  });

  it('claim conflict when already claimed by another operator', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'claim-conflict',
      status: CommunicationConversationStatus.HUMAN_ACTIVE,
      assignedUserId: operatorA,
    });

    await expect(
      service.claimConversation(orgA, convo.id, { userId: operatorB }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('human takeover from AI_ACTIVE converges to HUMAN_ACTIVE with assignee', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'takeover-ai',
      status: CommunicationConversationStatus.AI_ACTIVE,
    });

    const result = await service.claimConversation(orgA, convo.id, { userId: operatorA });
    expect(result.conversation.status).toBe(CommunicationConversationStatus.HUMAN_ACTIVE);
    expect(result.conversation.assignedUser?.id).toBe(operatorA);

    const events = await prisma.communicationEvent.findMany({
      where: { organizationId: orgA, conversationId: convo.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe(CommunicationEventType.HUMAN_ASSIGNED);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ActivityAction.UPDATE,
        entityId: convo.id,
      }),
    );
  });

  it('human takeover from WAITING_CUSTOMER converges to HUMAN_ACTIVE with assignee', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'takeover-waiting',
      status: CommunicationConversationStatus.WAITING_CUSTOMER,
    });

    const result = await service.claimConversation(orgA, convo.id, { userId: operatorA });
    expect(result.conversation.status).toBe(CommunicationConversationStatus.HUMAN_ACTIVE);
    expect(result.conversation.assignedUser?.id).toBe(operatorA);
  });

  it('concurrent AI_ACTIVE takeover allows exactly one winner', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'takeover-race',
      status: CommunicationConversationStatus.AI_ACTIVE,
    });

    const results = await Promise.allSettled([
      service.claimConversation(orgA, convo.id, { userId: operatorA }),
      service.claimConversation(orgA, convo.id, { userId: operatorB }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const final = await prisma.communicationConversation.findUnique({ where: { id: convo.id } });
    expect(final?.status).toBe(CommunicationConversationStatus.HUMAN_ACTIVE);
    expect(final?.assignedUserId).toBeTruthy();
    expect([operatorA, operatorB]).toContain(final?.assignedUserId);

    const events = await prisma.communicationEvent.findMany({
      where: {
        organizationId: orgA,
        conversationId: convo.id,
        eventType: CommunicationEventType.HUMAN_ASSIGNED,
      },
    });
    expect(events).toHaveLength(1);
  });

  it('concurrent claim allows exactly one winner', async () => {
    const convo = await seedConversation({ orgId: orgA, suffix: 'claim-race' });

    const results = await Promise.allSettled([
      service.claimConversation(orgA, convo.id, { userId: operatorA }),
      service.claimConversation(orgA, convo.id, { userId: operatorB }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const final = await prisma.communicationConversation.findUnique({ where: { id: convo.id } });
    expect(final?.assignedUserId).toBeTruthy();
    expect([operatorA, operatorB]).toContain(final?.assignedUserId);
  });

  it('manager can force assign to another operator with response convergence', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'force-assign',
      status: CommunicationConversationStatus.HUMAN_ACTIVE,
      assignedUserId: operatorA,
    });

    const result = await service.assignConversation(orgA, convo.id, operatorB, {
      userId: manager,
    });
    expect(result.conversation.assignedUser?.id).toBe(operatorB);
    expect(result.conversation.status).toBe(CommunicationConversationStatus.HUMAN_ACTIVE);
  });

  it('write-only operator cannot assign to another user', async () => {
    const convo = await seedConversation({ orgId: orgA, suffix: 'assign-deny' });
    await expect(
      service.assignConversation(orgA, convo.id, operatorB, { userId: operatorA }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects assignment on RESOLVED without reopen', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'assign-resolved',
      status: CommunicationConversationStatus.RESOLVED,
      assignedUserId: operatorA,
    });

    await expect(
      service.assignConversation(orgA, convo.id, operatorB, { userId: manager }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
  });

  it('rejects assignment on FAILED without reopen', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'assign-failed',
      status: CommunicationConversationStatus.FAILED,
    });

    await expect(
      service.assignConversation(orgA, convo.id, operatorA, { userId: manager }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_TRANSITION' } });
  });

  it('rejects cross-org assignee without membership leak', async () => {
    const convo = await seedConversation({ orgId: orgA, suffix: 'cross-org-assign' });
    await expect(
      service.assignConversation(orgA, convo.id, outsider, { userId: manager }),
    ).rejects.toMatchObject({ response: { code: 'ASSIGNEE_INVALID' } });
  });

  it('unassign moves HUMAN_ACTIVE to HUMAN_REQUIRED in response', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'unassign',
      status: CommunicationConversationStatus.HUMAN_ACTIVE,
      assignedUserId: operatorA,
    });

    const result = await service.assignConversation(orgA, convo.id, null, {
      userId: operatorA,
    });
    expect(result.conversation.assignedUser).toBeNull();
    expect(result.conversation.status).toBe(CommunicationConversationStatus.HUMAN_REQUIRED);
  });

  it('concurrent manager reassign beats stale self-unassign', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'unassign-race',
      status: CommunicationConversationStatus.HUMAN_ACTIVE,
      assignedUserId: operatorA,
    });

    await Promise.allSettled([
      service.assignConversation(orgA, convo.id, null, { userId: operatorA }),
      service.assignConversation(orgA, convo.id, operatorB, { userId: manager }),
    ]);

    const final = await prisma.communicationConversation.findUnique({ where: { id: convo.id } });
    expect(final?.assignedUserId).toBe(operatorB);
    expect(final?.status).toBe(CommunicationConversationStatus.HUMAN_ACTIVE);
  });

  it('operator cannot unassign after manager reassigned ownership', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'unassign-forbidden',
      status: CommunicationConversationStatus.HUMAN_ACTIVE,
      assignedUserId: operatorA,
    });

    await service.assignConversation(orgA, convo.id, operatorB, { userId: manager });

    await expect(
      service.assignConversation(orgA, convo.id, null, { userId: operatorA }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const final = await prisma.communicationConversation.findUnique({ where: { id: convo.id } });
    expect(final?.assignedUserId).toBe(operatorB);
  });

  it('resolve and reopen cycle emits distinct lifecycle events', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'resolve-cycle',
      status: CommunicationConversationStatus.HUMAN_ACTIVE,
      assignedUserId: operatorA,
    });

    const firstResolve = await service.resolveConversation(orgA, convo.id, { userId: operatorA });
    expect(firstResolve.conversation.status).toBe(CommunicationConversationStatus.RESOLVED);

    const reopened = await service.reopenConversation(orgA, convo.id, { userId: operatorA });
    expect(reopened.conversation.status).toBe(CommunicationConversationStatus.HUMAN_ACTIVE);

    const secondResolve = await service.resolveConversation(orgA, convo.id, { userId: operatorA });
    expect(secondResolve.conversation.status).toBe(CommunicationConversationStatus.RESOLVED);

    const resolveEvents = await prisma.communicationEvent.findMany({
      where: {
        organizationId: orgA,
        conversationId: convo.id,
        eventType: CommunicationEventType.CONVERSATION_RESOLVED,
      },
    });
    const reopenEvents = await prisma.communicationEvent.findMany({
      where: {
        organizationId: orgA,
        conversationId: convo.id,
        eventType: CommunicationEventType.CONVERSATION_REOPENED,
      },
    });

    expect(resolveEvents).toHaveLength(2);
    expect(reopenEvents).toHaveLength(1);
    expect(new Set(resolveEvents.map((event) => event.idempotencyKey)).size).toBe(2);
  });

  it('resolve retries against concurrent claim and still resolves', async () => {
    const convo = await seedConversation({ orgId: orgA, suffix: 'resolve-claim-race' });

    const [claimResult, resolveResult] = await Promise.allSettled([
      service.claimConversation(orgA, convo.id, { userId: operatorA }),
      service.resolveConversation(orgA, convo.id, { userId: operatorA }),
    ]);

    expect(claimResult.status === 'fulfilled' || resolveResult.status === 'fulfilled').toBe(true);

    const final = await prisma.communicationConversation.findUnique({ where: { id: convo.id } });
    expect(final?.status).toBe(CommunicationConversationStatus.RESOLVED);
  });

  it('resolve throws STALE_STATE when optimistic retry budget is exhausted', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'resolve-retry-exhaust',
      status: CommunicationConversationStatus.HUMAN_ACTIVE,
      assignedUserId: operatorA,
    });

    const originalTransaction = prisma.$transaction.bind(prisma);
    const originalFindConversation = readRepository.findConversationById.bind(readRepository);
    let resolveConditionalAttempts = 0;

    const findSpy = jest
      .spyOn(readRepository, 'findConversationById')
      .mockImplementation(async (organizationId, conversationId, tx) => {
        const row = await originalFindConversation(organizationId, conversationId, tx);
        if (!row || conversationId !== convo.id || organizationId !== orgA) return row;
        if (resolveConditionalAttempts === 0) return row;

        return {
          ...row,
          status: CommunicationConversationStatus.HUMAN_REQUIRED,
          updatedAt: new Date(row.updatedAt.getTime() + resolveConditionalAttempts * 1000),
        };
      });

    const transactionSpy = jest.spyOn(prisma, '$transaction').mockImplementation(async (fn, options) => {
      return originalTransaction(async (tx) => {
        const originalUpdateMany = tx.communicationConversation.updateMany.bind(
          tx.communicationConversation,
        );

        jest.spyOn(tx.communicationConversation, 'updateMany').mockImplementation((args) => {
          const where = args.where as Prisma.CommunicationConversationWhereInput | undefined;
          const isResolveConditional =
            where?.id === convo.id
            && where?.organizationId === orgA
            && args.data?.status === CommunicationConversationStatus.RESOLVED
            && where.updatedAt !== undefined;

          if (isResolveConditional) {
            resolveConditionalAttempts++;
            return Promise.resolve({ count: 0 }) as ReturnType<typeof originalUpdateMany>;
          }

          return originalUpdateMany(args);
        });

        return fn(tx);
      }, options);
    });

    await expect(
      service.resolveConversation(orgA, convo.id, { userId: operatorA }),
    ).rejects.toMatchObject({ response: { code: 'STALE_STATE' } });

    expect(resolveConditionalAttempts).toBe(MAX_OPTIMISTIC_MUTATION_RETRIES + 1);

    const resolveEvents = await prisma.communicationEvent.count({
      where: {
        organizationId: orgA,
        conversationId: convo.id,
        eventType: CommunicationEventType.CONVERSATION_RESOLVED,
      },
    });
    expect(resolveEvents).toBe(0);
    expect(auditRecord).not.toHaveBeenCalled();

    const final = await prisma.communicationConversation.findUnique({ where: { id: convo.id } });
    expect(final?.status).toBe(CommunicationConversationStatus.HUMAN_ACTIVE);
    expect(final?.assignedUserId).toBe(operatorA);

    transactionSpy.mockRestore();
    findSpy.mockRestore();
  });

  it('reopen versus concurrent assign preserves status and assignee invariants', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'reopen-assign-race',
      status: CommunicationConversationStatus.RESOLVED,
      assignedUserId: operatorA,
    });

    const [reopenResult, assignResult] = await Promise.allSettled([
      service.reopenConversation(orgA, convo.id, { userId: operatorA }),
      service.assignConversation(orgA, convo.id, operatorB, { userId: manager }),
    ]);

    expect(reopenResult.status).toBe('fulfilled');

    const final = await prisma.communicationConversation.findUnique({ where: { id: convo.id } });
    expect(final).toBeTruthy();
    expect(final!.status).not.toBe(CommunicationConversationStatus.RESOLVED);

    if (final!.status === CommunicationConversationStatus.HUMAN_ACTIVE) {
      expect(final!.assignedUserId).toBeTruthy();
    }
    if (final!.status === CommunicationConversationStatus.HUMAN_REQUIRED) {
      expect(final!.assignedUserId).toBeNull();
    }

    if (assignResult.status === 'fulfilled') {
      expect(final!.assignedUserId).toBe(operatorB);
      expect(final!.status).toBe(CommunicationConversationStatus.HUMAN_ACTIVE);
    }
  });

  it('mark read zeros unread count idempotently in response', async () => {
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'read',
      unreadCount: 3,
      lastContentAt: new Date('2026-08-22T10:00:00.000Z'),
    });

    const first = await service.markConversationRead(orgA, convo.id, { userId: operatorA });
    expect(first.conversation.unreadCount).toBe(0);

    const second = await service.markConversationRead(orgA, convo.id, { userId: operatorA });
    expect(second.conversation.unreadCount).toBe(0);

    const timelineEvents = await prisma.communicationEvent.count({
      where: { organizationId: orgA, conversationId: convo.id },
    });
    expect(timelineEvents).toBe(0);
  });

  it('markConversationRead preserves inbound unread when lastContentAt advances during service call', async () => {
    const contentAt = new Date('2026-08-22T10:00:00.000Z');
    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'read-race',
      unreadCount: 2,
      lastContentAt: contentAt,
    });

    const markPromise = service.markConversationRead(orgA, convo.id, { userId: operatorA });
    await prisma.communicationConversation.update({
      where: { id: convo.id },
      data: {
        unreadCount: 3,
        lastContentAt: new Date('2026-08-22T10:00:01.000Z'),
      },
    });
    const result = await markPromise;

    expect(result.conversation.unreadCount).toBe(3);

    const row = await prisma.communicationConversation.findUnique({ where: { id: convo.id } });
    expect(row?.unreadCount).toBe(3);
  });

  it('cross-tenant mutation returns safe not found', async () => {
    const convo = await seedConversation({ orgId: orgA, suffix: 'cross-tenant' });
    await expect(
      service.claimConversation(orgB, convo.id, { userId: outsider }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('station-scoped operator outside station cannot mutate', async () => {
    const station = await prisma.station.create({
      data: {
        organizationId: orgA,
        name: 'Scoped Station',
        address: 'Test',
        city: 'Berlin',
        country: 'DE',
      },
    });

    const scopedOperator = await prisma.user.create({
      data: {
        email: `c11-scoped-${Date.now()}@example.com`,
        name: 'Scoped Op',
        status: 'ACTIVE',
      },
    });
    await prisma.organizationMembership.create({
      data: {
        userId: scopedOperator.id,
        organizationId: orgA,
        role: 'WORKER',
        status: 'ACTIVE',
        permissions: { communication: { read: true, write: true, manage: false } },
        stationScope: 'ASSIGNED',
        stationIds: [],
      },
    });

    const convo = await seedConversation({
      orgId: orgA,
      suffix: 'station-scope',
      stationId: station.id,
    });

    await expect(
      service.claimConversation(orgA, convo.id, { userId: scopedOperator.id }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

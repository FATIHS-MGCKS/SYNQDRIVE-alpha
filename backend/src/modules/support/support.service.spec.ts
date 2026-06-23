import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SupportService } from './support.service';

function baseTicket(over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    ticketNumber: 42,
    organizationId: 'org1',
    createdByUserId: 'u1',
    reporterEmail: 'user@test.com',
    reporterName: 'User',
    subject: 'Help',
    description: 'Need assistance with vehicle',
    category: 'VEHICLE',
    status: 'OPEN',
    priority: 'NORMAL',
    assignedToUserId: null,
    relatedEntityType: null,
    relatedEntityId: null,
    sourcePage: null,
    lastMessageAt: new Date('2026-06-01T00:00:00Z'),
    lastMessageByRole: 'USER',
    firstResponseAt: null,
    resolvedAt: null,
    closedAt: null,
    reopenedAt: null,
    unreadForUser: false,
    unreadForAdmin: true,
    metadata: null,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    messages: [],
    _count: { messages: 1 },
    ...over,
  };
}

function makePrisma() {
  return {
    supportTicket: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    supportTicketMessage: {
      create: jest.fn(),
    },
    vehicle: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    orgInvoice: { findFirst: jest.fn() },
    customer: { findFirst: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
    orgDataAuthorization: { findFirst: jest.fn() },
    vehicleDataSourceLink: { findFirst: jest.fn() },
  };
}

describe('SupportService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: SupportService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new SupportService(prisma as any);
  });

  it('creates org ticket as OPEN with initial user message', async () => {
    prisma.supportTicket.create.mockResolvedValue(baseTicket());
    prisma.supportTicketMessage.create.mockResolvedValue({});
    prisma.supportTicket.findUnique.mockResolvedValue(baseTicket({ messages: [] }));

    const result = await svc.create({
      organizationId: 'org1',
      createdByUserId: 'u1',
      reporterEmail: 'user@test.com',
      reporterName: 'User',
      subject: 'Help',
      description: 'Need assistance with vehicle',
    });

    expect(result.statusKey).toBe('OPEN');
    expect(prisma.supportTicket.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org1', status: 'OPEN' }),
      }),
    );
  });

  it('org user cannot read ticket from another organization', async () => {
    prisma.supportTicket.findFirst.mockResolvedValue(null);
    await expect(svc.findByIdForOrganization('org1', 'foreign')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lists only org tickets when orgId is provided', async () => {
    prisma.supportTicket.findMany.mockResolvedValue([baseTicket()]);
    prisma.supportTicket.count.mockResolvedValue(1);

    await svc.findByOrganization('org1', { page: 1, limit: 20 });

    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org1' }),
      }),
    );
  });

  it('admin list has no org filter by default', async () => {
    prisma.supportTicket.findMany.mockResolvedValue([baseTicket(), baseTicket({ organizationId: 'org2' })]);
    prisma.supportTicket.count.mockResolvedValue(2);

    const result = await svc.findAll({ page: 1, limit: 20 });
    expect(result.data).toHaveLength(2);
    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it('user cannot message resolved ticket without reopen', async () => {
    prisma.supportTicket.findFirst.mockResolvedValue(baseTicket({ status: 'RESOLVED' }));
    await expect(
      svc.addMessageForOrganization('org1', 't1', {
        senderName: 'User',
        body: 'Still broken',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('user message on open ticket marks unread for admin', async () => {
    prisma.supportTicket.findFirst.mockResolvedValue(baseTicket());
    prisma.supportTicket.findUniqueOrThrow.mockResolvedValue(baseTicket());
    prisma.supportTicketMessage.create.mockResolvedValue({
      id: 'm1',
      senderUserId: 'u1',
      senderName: 'User',
      senderRole: 'USER',
      body: 'Update',
      imageUrl: null,
      isInternal: false,
      createdAt: new Date(),
    });
    prisma.supportTicket.update.mockResolvedValue({});

    await svc.addMessageForOrganization('org1', 't1', {
      senderUserId: 'u1',
      senderName: 'User',
      body: 'Update',
    });

    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ unreadForAdmin: true, unreadForUser: false }),
      }),
    );
  });

  it('admin public reply sets firstResponseAt and unreadForUser', async () => {
    prisma.supportTicket.findUniqueOrThrow.mockResolvedValue(baseTicket());
    prisma.supportTicketMessage.create.mockResolvedValue({
      id: 'm2',
      senderUserId: 'admin1',
      senderName: 'Admin',
      senderRole: 'MASTER_ADMIN',
      body: 'We are on it',
      imageUrl: null,
      isInternal: false,
      createdAt: new Date(),
    });
    prisma.supportTicket.update.mockResolvedValue({});

    await svc.addAdminPublicMessage('t1', {
      senderUserId: 'admin1',
      senderName: 'Admin',
      body: 'We are on it',
    });

    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unreadForUser: true,
          unreadForAdmin: false,
          firstResponseAt: expect.any(Date),
        }),
      }),
    );
  });

  it('admin status change creates system message', async () => {
    prisma.supportTicket.findUniqueOrThrow.mockResolvedValue(baseTicket());
    prisma.supportTicket.update.mockResolvedValue(baseTicket({ status: 'RESOLVED' }));
    prisma.supportTicket.findUnique.mockResolvedValue(
      baseTicket({
        status: 'RESOLVED',
        messages: [
          {
            id: 'sys1',
            senderUserId: null,
            senderName: 'Support Team',
            senderRole: 'SYSTEM',
            body: 'Status geändert: Gelöst',
            isInternal: false,
            imageUrl: null,
            attachments: null,
            createdAt: new Date(),
          },
        ],
      }),
    );

    await svc.update('t1', { status: 'RESOLVED' }, 'Support Team');

    expect(prisma.supportTicketMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ senderRole: 'SYSTEM', isInternal: false }),
      }),
    );
  });

  it('internal notes are hidden from org ticket detail', async () => {
    prisma.supportTicket.findFirst.mockResolvedValue(
      baseTicket({
        messages: [
          {
            id: 'pub',
            senderUserId: 'admin',
            senderName: 'Admin',
            senderRole: 'MASTER_ADMIN',
            body: 'Public',
            isInternal: false,
            imageUrl: null,
            attachments: null,
            createdAt: new Date(),
          },
          {
            id: 'int',
            senderUserId: 'admin',
            senderName: 'Admin',
            senderRole: 'MASTER_ADMIN',
            body: 'Secret',
            isInternal: true,
            imageUrl: null,
            attachments: null,
            createdAt: new Date(),
          },
        ],
      }),
    );

    const ticket = await svc.findByIdForOrganization('org1', 't1');
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages![0]!.body).toBe('Public');
  });

  it('reopen flow sets OPEN and creates system message', async () => {
    prisma.supportTicket.findFirst.mockResolvedValue(baseTicket({ status: 'CLOSED' }));
    prisma.supportTicket.update.mockResolvedValue(baseTicket({ status: 'OPEN' }));
    prisma.supportTicketMessage.create.mockResolvedValue({});
    prisma.supportTicket.findFirst.mockResolvedValueOnce(baseTicket({ status: 'CLOSED' }));
    prisma.supportTicket.findFirst.mockResolvedValueOnce(
      baseTicket({
        status: 'OPEN',
        messages: [],
      }),
    );

    await svc.reopenForOrganization('org1', 't1', 'User');

    expect(prisma.supportTicket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'OPEN', reopenedAt: expect.any(Date) }),
      }),
    );
    expect(prisma.supportTicketMessage.create).toHaveBeenCalled();
  });

  it('filters tickets by search and pagination', async () => {
    prisma.supportTicket.findMany.mockResolvedValue([]);
    prisma.supportTicket.count.mockResolvedValue(0);

    await svc.findAll({ page: 2, limit: 10, search: 'brake', status: 'OPEN' });

    expect(prisma.supportTicket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({ status: 'OPEN' }),
      }),
    );
  });

  it('rejects related entity from another organization on create', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(
      svc.create({
        organizationId: 'org1',
        reporterEmail: 'user@test.com',
        subject: 'Cross-tenant',
        description: 'Should fail',
        relatedEntityType: 'VEHICLE',
        relatedEntityId: 'vehicle-other-org',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

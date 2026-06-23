import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SupportMessageSenderRole,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketRelatedEntityType,
  SupportTicketStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildPaginatedResult,
  PaginationParams,
  parsePagination,
} from '@shared/utils/pagination';
import type { CreateSupportMessageDto, QuerySupportTicketsDto } from '@shared/dto/support.dto';

const STATUS_DISPLAY: Record<SupportTicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_CUSTOMER: 'Waiting',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const PRIORITY_DISPLAY: Record<SupportTicketPriority, string> = {
  LOW: 'Low',
  NORMAL: 'Normal',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

const TERMINAL_STATUSES = new Set<SupportTicketStatus>(['RESOLVED', 'CLOSED']);

type MessageRow = {
  id: string;
  senderUserId: string | null;
  senderName: string;
  senderRole: SupportMessageSenderRole;
  body: string;
  isInternal: boolean;
  imageUrl: string | null;
  attachments: Prisma.JsonValue | null;
  createdAt: Date;
};

type TicketRow = Prisma.SupportTicketGetPayload<{
  include: { messages?: true; _count?: { select: { messages: true } } };
}>;

export interface CreateTicketInput {
  organizationId?: string;
  createdByUserId?: string;
  reporterEmail: string;
  reporterName?: string;
  subject: string;
  description: string;
  category?: SupportTicketCategory;
  priority?: SupportTicketPriority;
  relatedEntityType?: SupportTicketRelatedEntityType;
  relatedEntityId?: string;
  sourcePage?: string;
  metadata?: Prisma.InputJsonValue;
  imageUrl?: string;
  attachments?: Prisma.InputJsonValue;
}

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  ticketCode(ticketNumber: number, createdAt?: Date): string {
    const year = createdAt ? createdAt.getFullYear() : new Date().getFullYear();
    return `SQD-${year}-${String(ticketNumber).padStart(6, '0')}`;
  }

  private legacySenderRole(role: SupportMessageSenderRole): 'user' | 'admin' | 'system' {
    if (role === 'MASTER_ADMIN') return 'admin';
    if (role === 'SYSTEM') return 'system';
    return 'user';
  }

  private formatMessage(m: MessageRow, includeInternal: boolean) {
    if (m.isInternal && !includeInternal) return null;
    return {
      id: m.id,
      senderId: m.senderUserId || '',
      senderUserId: m.senderUserId || '',
      senderName: m.senderName,
      senderRole: this.legacySenderRole(m.senderRole),
      senderRoleKey: m.senderRole,
      body: m.body,
      content: m.body,
      isInternal: m.isInternal,
      imageUrl: m.imageUrl || null,
      attachments: m.attachments ?? null,
      createdAt: m.createdAt.toISOString(),
    };
  }

  formatTicket(ticket: TicketRow, opts?: { includeInternalMessages?: boolean }) {
    const includeInternal = opts?.includeInternalMessages ?? false;
    const messages = ticket.messages
      ? ticket.messages
          .map((m) => this.formatMessage(m as MessageRow, includeInternal))
          .filter(Boolean)
      : undefined;

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticketCode: this.ticketCode(ticket.ticketNumber, ticket.createdAt),
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      status: STATUS_DISPLAY[ticket.status],
      statusKey: ticket.status,
      priority: PRIORITY_DISPLAY[ticket.priority],
      priorityKey: ticket.priority,
      reporterEmail: ticket.reporterEmail,
      reporterName: ticket.reporterName || '',
      organizationId: ticket.organizationId || '',
      createdByUserId: ticket.createdByUserId || '',
      assignedTo: ticket.assignedToUserId || '',
      assignedToUserId: ticket.assignedToUserId || '',
      relatedEntityType: ticket.relatedEntityType ?? null,
      relatedEntityId: ticket.relatedEntityId ?? null,
      sourcePage: ticket.sourcePage ?? null,
      lastMessageAt: ticket.lastMessageAt.toISOString(),
      lastActivityAt: ticket.lastMessageAt.toISOString(),
      lastMessageByRole: ticket.lastMessageByRole ?? null,
      firstResponseAt: ticket.firstResponseAt?.toISOString() ?? null,
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      closedAt: ticket.closedAt?.toISOString() ?? null,
      reopenedAt: ticket.reopenedAt?.toISOString() ?? null,
      unreadForUser: ticket.unreadForUser,
      unreadForAdmin: ticket.unreadForAdmin,
      metadata: ticket.metadata ?? null,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      messages,
      messageCount: ticket._count?.messages,
    };
  }

  private async assertRelatedEntityInOrg(
    orgId: string,
    type: SupportTicketRelatedEntityType,
    entityId: string,
  ): Promise<void> {
    const id = entityId.trim();
    if (!id) throw new BadRequestException('relatedEntityId is required when relatedEntityType is set');

    const checks: Record<SupportTicketRelatedEntityType, () => Promise<boolean>> = {
      VEHICLE: async () =>
        Boolean(await this.prisma.vehicle.findFirst({ where: { id, organizationId: orgId }, select: { id: true } })),
      BOOKING: async () =>
        Boolean(await this.prisma.booking.findFirst({ where: { id, organizationId: orgId }, select: { id: true } })),
      INVOICE: async () =>
        Boolean(await this.prisma.orgInvoice.findFirst({ where: { id, organizationId: orgId }, select: { id: true } })),
      CUSTOMER: async () =>
        Boolean(await this.prisma.customer.findFirst({ where: { id, organizationId: orgId }, select: { id: true } })),
      USER: async () =>
        Boolean(
          await this.prisma.organizationMembership.findFirst({
            where: { userId: id, organizationId: orgId },
            select: { id: true },
          }),
        ),
      AUTHORIZATION: async () =>
        Boolean(
          await this.prisma.orgDataAuthorization.findFirst({
            where: { id, organizationId: orgId },
            select: { id: true },
          }),
        ),
      CONNECTIVITY: async () => {
        const link = await this.prisma.vehicleDataSourceLink.findFirst({
          where: { id },
          select: { vehicleId: true },
        });
        if (!link) return false;
        return Boolean(
          await this.prisma.vehicle.findFirst({
            where: { id: link.vehicleId, organizationId: orgId },
            select: { id: true },
          }),
        );
      },
      HEALTH: async () =>
        Boolean(await this.prisma.vehicle.findFirst({ where: { id, organizationId: orgId }, select: { id: true } })),
      OTHER: async () => true,
    };

    const ok = await checks[type]();
    if (!ok) {
      throw new BadRequestException(`${type} entity not found in this organization`);
    }
  }

  private resolveStatusFilter(status?: string): SupportTicketStatus | undefined {
    if (!status) return undefined;
    const fromDisplay: Record<string, SupportTicketStatus> = {
      Open: 'OPEN',
      'In Progress': 'IN_PROGRESS',
      Waiting: 'WAITING_FOR_CUSTOMER',
      Resolved: 'RESOLVED',
      Closed: 'CLOSED',
    };
    if (fromDisplay[status]) return fromDisplay[status];
    const upper = status.toUpperCase();
    if (upper === 'WAITING') return 'WAITING_FOR_CUSTOMER';
    if (['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'].includes(upper)) {
      return upper as SupportTicketStatus;
    }
    return undefined;
  }

  private buildWhereFromQuery(
    query: QuerySupportTicketsDto,
    orgId?: string,
  ): Prisma.SupportTicketWhereInput {
    const where: Prisma.SupportTicketWhereInput = {};
    if (orgId) where.organizationId = orgId;
    if (query.organizationId) where.organizationId = query.organizationId;
    const status = this.resolveStatusFilter(query.status);
    if (status) {
      where.status = status;
    } else if (query.openOnly === true) {
      where.status = { in: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER'] };
    }
    if (query.priority) where.priority = query.priority;
    if (query.category) where.category = query.category;
    if (query.assignedToUserId) where.assignedToUserId = query.assignedToUserId;
    if (query.relatedEntityType) where.relatedEntityType = query.relatedEntityType;
    if (query.relatedEntityId) where.relatedEntityId = query.relatedEntityId;
    if (query.hasUnread === true) where.unreadForAdmin = true;
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {};
      if (query.createdFrom) {
        const from = new Date(query.createdFrom);
        if (!Number.isNaN(from.getTime())) where.createdAt.gte = from;
      }
      if (query.createdTo) {
        const to = new Date(query.createdTo);
        if (!Number.isNaN(to.getTime())) where.createdAt.lte = to;
      }
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      const num = parseInt(q.replace(/^#/, ''), 10);
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { reporterEmail: { contains: q, mode: 'insensitive' } },
        { reporterName: { contains: q, mode: 'insensitive' } },
        ...(Number.isFinite(num) ? [{ ticketNumber: num }] : []),
      ];
    }
    return where;
  }

  private messageInclude(includeInternal: boolean): Prisma.SupportTicketMessageWhereInput | undefined {
    return includeInternal ? undefined : { isInternal: false };
  }

  async listTickets(query: QuerySupportTicketsDto & PaginationParams, orgId?: string) {
    const { skip, take } = parsePagination(query);
    const where = this.buildWhereFromQuery(query, orgId);

    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip,
        take,
        orderBy: { lastMessageAt: 'desc' },
        include: { _count: { select: { messages: { where: { isInternal: false } } } } },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((t) => this.formatTicket(t as TicketRow)),
      total,
      query,
    );
  }

  async findByOrganization(orgId: string, query: QuerySupportTicketsDto & PaginationParams = {}) {
    return this.listTickets(query, orgId);
  }

  async findAll(params: QuerySupportTicketsDto & PaginationParams) {
    return this.listTickets(params);
  }

  async findById(id: string, opts?: { includeInternalMessages?: boolean }) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        messages: {
          where: this.messageInclude(opts?.includeInternalMessages ?? true),
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { messages: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.unreadForAdmin) {
      await this.prisma.supportTicket.update({
        where: { id },
        data: { unreadForAdmin: false },
      });
      ticket.unreadForAdmin = false;
    }
    return this.formatTicket(ticket as TicketRow, {
      includeInternalMessages: opts?.includeInternalMessages ?? true,
    });
  }

  async findByIdForOrganization(organizationId: string, id: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, organizationId },
      include: {
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { messages: { where: { isInternal: false } } } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.unreadForUser) {
      await this.prisma.supportTicket.update({
        where: { id },
        data: { unreadForUser: false },
      });
      ticket.unreadForUser = false;
    }
    return this.formatTicket(ticket as TicketRow, { includeInternalMessages: false });
  }

  async getUnreadCountForOrganization(organizationId: string) {
    const count = await this.prisma.supportTicket.count({
      where: { organizationId, unreadForUser: true },
    });
    return { count };
  }

  private async loadTicketForOrg(orgId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, organizationId: orgId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async create(data: CreateTicketInput) {
    if (data.organizationId && data.relatedEntityType && data.relatedEntityId) {
      await this.assertRelatedEntityInOrg(data.organizationId, data.relatedEntityType, data.relatedEntityId);
    }

    const now = new Date();
    const ticket = await this.prisma.supportTicket.create({
      data: {
        organizationId: data.organizationId,
        createdByUserId: data.createdByUserId,
        reporterEmail: data.reporterEmail,
        reporterName: data.reporterName,
        subject: data.subject.trim(),
        description: data.description.trim(),
        category: data.category ?? 'OTHER',
        priority: data.priority ?? 'NORMAL',
        relatedEntityType: data.relatedEntityType,
        relatedEntityId: data.relatedEntityId,
        sourcePage: data.sourcePage,
        metadata: data.metadata,
        status: 'OPEN',
        lastMessageAt: now,
        lastMessageByRole: 'USER',
        unreadForAdmin: true,
        unreadForUser: false,
      },
    });

    await this.prisma.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        senderUserId: data.createdByUserId,
        senderName: data.reporterName || data.reporterEmail,
        senderRole: 'USER',
        body: data.description.trim(),
        imageUrl: data.imageUrl ?? null,
        attachments: data.attachments ?? undefined,
      },
    });

    return this.findById(ticket.id, { includeInternalMessages: false });
  }

  private resolveMessageBody(dto: CreateSupportMessageDto): string {
    const body = (dto.body ?? dto.content)?.trim();
    if (!body) throw new BadRequestException('Message body is required');
    return body;
  }

  private attachmentsJson(dto: CreateSupportMessageDto): Prisma.InputJsonValue | undefined {
    if (!dto.attachments?.length) return undefined;
    return dto.attachments as unknown as Prisma.InputJsonValue;
  }

  async addMessage(
    ticketId: string,
    data: {
      senderUserId?: string;
      senderName: string;
      senderRole: SupportMessageSenderRole;
      body: string;
      imageUrl?: string;
      attachments?: Prisma.InputJsonValue;
      isInternal?: boolean;
    },
  ) {
    const ticket = await this.prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
    const isInternal = data.isInternal ?? false;
    const now = new Date();

    const message = await this.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        senderUserId: data.senderUserId,
        senderName: data.senderName,
        senderRole: data.senderRole,
        body: data.body,
        imageUrl: data.imageUrl ?? null,
        attachments: data.attachments,
        isInternal,
      },
    });

    const update: Prisma.SupportTicketUpdateInput = {
      lastMessageAt: now,
      lastMessageByRole: data.senderRole,
    };

    if (data.senderRole === 'MASTER_ADMIN' && !isInternal) {
      update.unreadForUser = true;
      update.unreadForAdmin = false;
      if (!ticket.firstResponseAt) update.firstResponseAt = now;
      if (ticket.status === 'OPEN') update.status = 'IN_PROGRESS';
    }

    if (data.senderRole === 'USER') {
      update.unreadForAdmin = true;
      update.unreadForUser = false;
      if (ticket.status === 'WAITING_FOR_CUSTOMER') {
        update.status = 'IN_PROGRESS';
      }
    }

    await this.prisma.supportTicket.update({ where: { id: ticketId }, data: update });

    return {
      id: message.id,
      senderId: message.senderUserId || '',
      senderName: message.senderName,
      senderRole: this.legacySenderRole(message.senderRole),
      senderRoleKey: message.senderRole,
      body: message.body,
      content: message.body,
      imageUrl: message.imageUrl,
      isInternal: message.isInternal,
      createdAt: message.createdAt.toISOString(),
    };
  }

  async addMessageForOrganization(
    organizationId: string,
    ticketId: string,
    data: {
      senderUserId?: string;
      senderName: string;
      body: string;
      imageUrl?: string;
      attachments?: Prisma.InputJsonValue;
    },
  ) {
    const ticket = await this.loadTicketForOrg(organizationId, ticketId);
    if (TERMINAL_STATUSES.has(ticket.status)) {
      throw new BadRequestException(
        'Ticket is resolved or closed. Reopen the ticket before sending a new message.',
      );
    }
    return this.addMessage(ticketId, {
      ...data,
      senderRole: 'USER',
      isInternal: false,
    });
  }

  async addAdminPublicMessage(
    ticketId: string,
    data: {
      senderUserId?: string;
      senderName: string;
      body: string;
      imageUrl?: string;
      attachments?: Prisma.InputJsonValue;
    },
  ) {
    return this.addMessage(ticketId, {
      ...data,
      senderRole: 'MASTER_ADMIN',
      isInternal: false,
    });
  }

  async addInternalNote(
    ticketId: string,
    data: { senderUserId?: string; senderName: string; body: string },
  ) {
    return this.addMessage(ticketId, {
      ...data,
      senderRole: 'MASTER_ADMIN',
      isInternal: true,
    });
  }

  private statusSystemMessage(status: SupportTicketStatus): string {
    const labels: Record<SupportTicketStatus, string> = {
      OPEN: 'Ticket wurde geöffnet',
      IN_PROGRESS: 'Status geändert: In Bearbeitung',
      WAITING_FOR_CUSTOMER: 'Status geändert: Warten auf Kunde',
      RESOLVED: 'Status geändert: Gelöst',
      CLOSED: 'Status geändert: Geschlossen',
    };
    return labels[status];
  }

  async update(
    id: string,
    data: {
      status?: SupportTicketStatus;
      priority?: SupportTicketPriority;
      category?: SupportTicketCategory;
      assignedToUserId?: string | null;
    },
    actorName = 'Support Team',
  ) {
    const ticket = await this.prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    const updateData: Prisma.SupportTicketUpdateInput = {
      lastMessageAt: new Date(),
    };

    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.assignedToUserId !== undefined) updateData.assignedToUserId = data.assignedToUserId;

    if (data.status !== undefined && data.status !== ticket.status) {
      updateData.status = data.status;
      const now = new Date();
      if (data.status === 'RESOLVED') updateData.resolvedAt = now;
      if (data.status === 'CLOSED') updateData.closedAt = now;
      if (data.status === 'WAITING_FOR_CUSTOMER') {
        updateData.unreadForUser = true;
      }

      await this.prisma.supportTicketMessage.create({
        data: {
          ticketId: id,
          senderName: actorName,
          senderRole: 'SYSTEM',
          body: this.statusSystemMessage(data.status),
          isInternal: false,
        },
      });
      updateData.lastMessageByRole = 'SYSTEM';
    }

    await this.prisma.supportTicket.update({ where: { id }, data: updateData });
    return this.findById(id, { includeInternalMessages: true });
  }

  async updateStatus(id: string, status: SupportTicketStatus, actorName = 'Support Team') {
    return this.update(id, { status }, actorName);
  }

  async reopenForOrganization(organizationId: string, ticketId: string, userName: string) {
    const ticket = await this.loadTicketForOrg(organizationId, ticketId);
    if (!TERMINAL_STATUSES.has(ticket.status)) {
      throw new BadRequestException('Only resolved or closed tickets can be reopened');
    }

    const now = new Date();
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: 'OPEN',
        reopenedAt: now,
        resolvedAt: null,
        closedAt: null,
        unreadForAdmin: true,
        unreadForUser: false,
        lastMessageAt: now,
        lastMessageByRole: 'SYSTEM',
      },
    });

    await this.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        senderName: userName,
        senderRole: 'SYSTEM',
        body: 'Ticket wurde wieder geöffnet',
        isInternal: false,
      },
    });

    return this.findByIdForOrganization(organizationId, ticketId);
  }

  async getStats() {
    const [open, inProgress, waiting, resolved, closed, total, criticalOpen, newTickets, unreadForAdmin] =
      await Promise.all([
        this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
        this.prisma.supportTicket.count({ where: { status: 'IN_PROGRESS' } }),
        this.prisma.supportTicket.count({ where: { status: 'WAITING_FOR_CUSTOMER' } }),
        this.prisma.supportTicket.count({ where: { status: 'RESOLVED' } }),
        this.prisma.supportTicket.count({ where: { status: 'CLOSED' } }),
        this.prisma.supportTicket.count(),
        this.prisma.supportTicket.count({
          where: {
            status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER'] },
            priority: 'CRITICAL',
          },
        }),
        this.prisma.supportTicket.count({
          where: {
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        }),
        this.prisma.supportTicket.count({ where: { unreadForAdmin: true } }),
      ]);

    const [byCategory, byPriority, responseSamples, resolutionSamples] = await Promise.all([
      this.prisma.supportTicket.groupBy({
        by: ['category'],
        _count: true,
        where: { status: { not: 'CLOSED' } },
      }),
      this.prisma.supportTicket.groupBy({
        by: ['priority'],
        _count: true,
        where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER'] } },
      }),
      this.prisma.supportTicket.findMany({
        where: { firstResponseAt: { not: null } },
        select: { createdAt: true, firstResponseAt: true },
        take: 500,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supportTicket.findMany({
        where: { resolvedAt: { not: null } },
        select: { createdAt: true, resolvedAt: true },
        take: 500,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const avgMs = (rows: Array<{ createdAt: Date; firstResponseAt?: Date | null; resolvedAt?: Date | null }>, endKey: 'firstResponseAt' | 'resolvedAt') => {
      const deltas = rows
        .map((r) => {
          const end = r[endKey];
          if (!end) return null;
          return end.getTime() - r.createdAt.getTime();
        })
        .filter((v): v is number => v != null && v >= 0);
      if (!deltas.length) return null;
      return Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
    };

    return {
      open,
      inProgress,
      waiting,
      resolved,
      closed,
      total,
      totalOpen: open + inProgress + waiting,
      newTickets,
      criticalOpen,
      waitingForCustomer: waiting,
      unreadForAdmin,
      unresolved: open + inProgress + waiting,
      avgFirstResponseTimeMs: avgMs(responseSamples, 'firstResponseAt'),
      avgResolutionTimeMs: avgMs(resolutionSamples, 'resolvedAt'),
      ticketsByCategory: byCategory.reduce(
        (acc, row) => ({ ...acc, [row.category]: row._count }),
        {} as Record<string, number>,
      ),
      ticketsByPriority: byPriority.reduce(
        (acc, row) => ({ ...acc, [row.priority]: row._count }),
        {} as Record<string, number>,
      ),
    };
  }

  async getNewest(limit = 5) {
    const tickets = await this.prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { messages: { where: { isInternal: false } } } },
      },
    });
    return tickets.map((t) => {
      const formatted = this.formatTicket(t as TicketRow, { includeInternalMessages: false });
      const lastMsg = t.messages[0];
      return {
        ...formatted,
        lastMessage: lastMsg
          ? {
              content: lastMsg.body,
              body: lastMsg.body,
              senderName: lastMsg.senderName,
              senderRole: this.legacySenderRole(lastMsg.senderRole),
              createdAt: lastMsg.createdAt.toISOString(),
            }
          : null,
      };
    });
  }

  async getOpenTickets(limit = 10) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER'] } },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
    });
    return tickets.map((t) => this.formatTicket(t as TicketRow));
  }

  /** Parse message DTO for controller convenience */
  parseMessageDto(dto: CreateSupportMessageDto) {
    return {
      body: this.resolveMessageBody(dto),
      imageUrl: dto.imageUrl,
      attachments: this.attachmentsJson(dto),
    };
  }
}

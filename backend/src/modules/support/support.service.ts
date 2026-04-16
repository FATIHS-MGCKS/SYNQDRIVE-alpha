import { Injectable, NotFoundException } from '@nestjs/common';
import { TicketStatus, TicketPriority } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
} from '@shared/utils/pagination';

const STATUS_DISPLAY: Record<string, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING: 'Waiting',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

const PRIORITY_DISPLAY: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  private formatTicket(ticket: Record<string, unknown>, messages?: unknown[]) {
    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      description: ticket.description,
      status: STATUS_DISPLAY[ticket.status as string] || ticket.status,
      statusKey: ticket.status,
      priority: PRIORITY_DISPLAY[ticket.priority as string] || ticket.priority,
      priorityKey: ticket.priority,
      reporterEmail: ticket.reporterEmail,
      reporterName: (ticket.reporterName as string) || '',
      organizationId: (ticket.organizationId as string) || '',
      createdByUserId: (ticket.createdByUserId as string) || '',
      assignedTo: (ticket.assignedTo as string) || '',
      lastActivityAt: (ticket.lastActivityAt as Date)?.toISOString?.() || '',
      resolvedAt: (ticket.resolvedAt as Date)?.toISOString?.() || null,
      closedAt: (ticket.closedAt as Date)?.toISOString?.() || null,
      createdAt: (ticket.createdAt as Date)?.toISOString?.() || '',
      updatedAt: (ticket.updatedAt as Date)?.toISOString?.() || '',
      messages: messages
        ? (messages as Record<string, unknown>[]).map((m) => ({
            id: m.id,
            senderId: m.senderId || '',
            senderName: m.senderName,
            senderRole: m.senderRole,
            content: m.content,
            imageUrl: m.imageUrl || null,
            createdAt: (m.createdAt as Date)?.toISOString?.() || '',
          }))
        : undefined,
      messageCount: ticket._count
        ? (ticket._count as Record<string, number>).messages
        : undefined,
    };
  }

  async create(data: {
    organizationId?: string;
    createdByUserId?: string;
    reporterEmail: string;
    reporterName?: string;
    subject: string;
    description: string;
    priority?: TicketPriority;
    imageUrl?: string;
  }) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        organizationId: data.organizationId,
        createdByUserId: data.createdByUserId,
        reporterEmail: data.reporterEmail,
        reporterName: data.reporterName,
        subject: data.subject,
        description: data.description,
        priority: data.priority || 'MEDIUM',
      },
    });

    await this.prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: data.createdByUserId,
        senderName: data.reporterName || data.reporterEmail,
        senderRole: 'user',
        content: data.description,
        imageUrl: data.imageUrl || null,
      },
    });

    return this.findById(ticket.id);
  }

  async findAll(
    params: PaginationParams & {
      status?: string;
      priority?: string;
      organizationId?: string;
    },
  ) {
    const { skip, take } = parsePagination(params);
    const where: Record<string, unknown> = {};

    if (params.status) {
      const statusKey = Object.entries(STATUS_DISPLAY).find(
        ([, v]) => v === params.status,
      )?.[0];
      where.status = statusKey || params.status;
    }
    if (params.priority) {
      const priorityKey = Object.entries(PRIORITY_DISPLAY).find(
        ([, v]) => v === params.priority,
      )?.[0];
      where.priority = priorityKey || params.priority;
    }
    if (params.organizationId) {
      where.organizationId = params.organizationId;
    }

    const [data, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        skip,
        take,
        orderBy: { lastActivityAt: 'desc' },
        include: { _count: { select: { messages: true } } },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return buildPaginatedResult(
      data.map((t) => this.formatTicket(t as unknown as Record<string, unknown>)),
      total,
      params,
    );
  }

  async findByOrganization(orgId: string) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { organizationId: orgId },
      orderBy: { lastActivityAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
    return tickets.map((t) => this.formatTicket(t as unknown as Record<string, unknown>));
  }

  async findById(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.formatTicket(
      ticket as unknown as Record<string, unknown>,
      ticket.messages as unknown as unknown[],
    );
  }

  /** Org-scoped ticket lookup — rejects if ticket does not belong to the org. */
  async findByIdForOrganization(organizationId: string, id: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, organizationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.formatTicket(
      ticket as unknown as Record<string, unknown>,
      ticket.messages as unknown as unknown[],
    );
  }

  /** Org-scoped message creation — verifies ticket belongs to the org before adding. */
  async addMessageForOrganization(
    organizationId: string,
    ticketId: string,
    data: {
      senderId?: string;
      senderName: string;
      senderRole: 'user' | 'admin';
      content: string;
      imageUrl?: string;
    },
  ) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, organizationId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return this.addMessage(ticketId, data);
  }

  async addMessage(
    ticketId: string,
    data: {
      senderId?: string;
      senderName: string;
      senderRole: 'user' | 'admin';
      content: string;
      imageUrl?: string;
    },
  ) {
    await this.prisma.supportTicket.findUniqueOrThrow({
      where: { id: ticketId },
    });

    const message = await this.prisma.supportMessage.create({
      data: {
        ticketId,
        senderId: data.senderId,
        senderName: data.senderName,
        senderRole: data.senderRole,
        content: data.content,
        imageUrl: data.imageUrl || null,
      },
    });

    const statusUpdate: Record<string, unknown> = {
      lastActivityAt: new Date(),
    };
    if (data.senderRole === 'admin') {
      const ticket = await this.prisma.supportTicket.findUnique({
        where: { id: ticketId },
      });
      if (ticket?.status === 'OPEN') {
        statusUpdate.status = 'IN_PROGRESS';
      }
    }

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: statusUpdate,
    });

    return {
      id: message.id,
      senderId: message.senderId || '',
      senderName: message.senderName,
      senderRole: message.senderRole,
      content: message.content,
      imageUrl: message.imageUrl,
      createdAt: message.createdAt.toISOString(),
    };
  }

  async update(
    id: string,
    data: {
      subject?: string;
      description?: string;
      priority?: TicketPriority;
      assignedTo?: string;
      status?: TicketStatus;
    },
  ) {
    await this.prisma.supportTicket.findUniqueOrThrow({ where: { id } });

    const updateData: Record<string, unknown> = {
      lastActivityAt: new Date(),
    };
    if (data.subject !== undefined) updateData.subject = data.subject;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.assignedTo !== undefined) updateData.assignedTo = data.assignedTo;
    if (data.status !== undefined) {
      updateData.status = data.status;
      if (data.status === 'RESOLVED') updateData.resolvedAt = new Date();
      if (data.status === 'CLOSED') updateData.closedAt = new Date();
    }

    const ticket = await this.prisma.supportTicket.update({
      where: { id },
      data: updateData,
    });
    return this.formatTicket(ticket as unknown as Record<string, unknown>);
  }

  async updateStatus(id: string, status: TicketStatus) {
    await this.prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    const updateData: Record<string, unknown> = {
      status,
      lastActivityAt: new Date(),
    };
    if (status === 'RESOLVED') updateData.resolvedAt = new Date();
    if (status === 'CLOSED') updateData.closedAt = new Date();

    const ticket = await this.prisma.supportTicket.update({
      where: { id },
      data: updateData,
    });
    return this.formatTicket(ticket as unknown as Record<string, unknown>);
  }

  async getStats() {
    const [open, inProgress, waiting, resolved, closed, total] =
      await Promise.all([
        this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
        this.prisma.supportTicket.count({ where: { status: 'IN_PROGRESS' } }),
        this.prisma.supportTicket.count({ where: { status: 'WAITING' } }),
        this.prisma.supportTicket.count({ where: { status: 'RESOLVED' } }),
        this.prisma.supportTicket.count({ where: { status: 'CLOSED' } }),
        this.prisma.supportTicket.count(),
      ]);
    return { open, inProgress, waiting, resolved, closed, total };
  }

  async getNewest(limit = 5) {
    const tickets = await this.prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } },
      },
    });
    return tickets.map((t) => {
      const formatted = this.formatTicket(t as unknown as Record<string, unknown>);
      const lastMsg = t.messages[0];
      return {
        ...formatted,
        lastMessage: lastMsg
          ? {
              content: lastMsg.content,
              senderName: lastMsg.senderName,
              senderRole: lastMsg.senderRole,
              createdAt: lastMsg.createdAt.toISOString(),
            }
          : null,
      };
    });
  }

  async getOpenTickets(limit = 10) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] } },
      orderBy: { lastActivityAt: 'desc' },
      take: limit,
    });
    return tickets.map((t) => this.formatTicket(t as unknown as Record<string, unknown>));
  }
}

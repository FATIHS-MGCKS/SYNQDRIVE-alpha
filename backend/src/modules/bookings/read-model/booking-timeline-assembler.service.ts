import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { BookingTimelineItemDto } from '../dto/response/booking-timeline-item.dto';

@Injectable()
export class BookingTimelineAssemblerService {
  constructor(private readonly prisma: PrismaService) {}

  async assembleForBooking(
    orgId: string,
    bookingId: string,
    options?: { limit?: number },
  ): Promise<BookingTimelineItemDto[]> {
    const limit = options?.limit ?? 50;
    const [activityRows, tasks, handovers] = await Promise.all([
      this.prisma.activityLog.findMany({
        where: { organizationId: orgId, entity: 'BOOKING', entityId: bookingId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          action: true,
          description: true,
          createdAt: true,
          userName: true,
        },
      }),
      this.prisma.orgTask.findMany({
        where: { organizationId: orgId, bookingId },
        orderBy: { dueDate: 'asc' },
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          dueDate: true,
          createdAt: true,
        },
      }),
      this.prisma.bookingHandoverProtocol.findMany({
        where: { organizationId: orgId, bookingId },
        orderBy: { performedAt: 'asc' },
        select: {
          id: true,
          kind: true,
          performedAt: true,
          performedByName: true,
        },
      }),
    ]);

    const items: BookingTimelineItemDto[] = [];

    for (const row of activityRows) {
      items.push({
        id: `activity:${row.id}`,
        kind: 'ACTIVITY',
        title: row.action,
        description: row.description,
        occurredAt: row.createdAt.toISOString(),
        status: null,
      });
    }

    for (const task of tasks) {
      items.push({
        id: `task:${task.id}`,
        kind: 'TASK',
        title: task.title,
        description: null,
        occurredAt: (task.dueDate ?? task.createdAt).toISOString(),
        status: task.status,
      });
    }

    for (const handover of handovers) {
      items.push({
        id: `handover:${handover.id}`,
        kind: 'HANDOVER',
        title: handover.kind === 'PICKUP' ? 'Pickup' : 'Return',
        description: handover.performedByName,
        occurredAt: handover.performedAt.toISOString(),
        status: 'completed',
      });
    }

    return items
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, limit);
  }
}

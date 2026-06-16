import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';

@Injectable()
export class FinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
  ) {}

  private format(f: Record<string, unknown>) {
    return {
      id: f.id,
      fineNumber: f.fineNumber || null,
      title: f.title,
      description: f.description || '',
      offenseType: f.offenseType || '',
      issuingAuthority: f.issuingAuthority || '',
      offenseDate: (f.offenseDate as Date)?.toISOString?.() || null,
      receivedDate: (f.receivedDate as Date)?.toISOString?.() || null,
      location: f.location || '',
      amountCents: f.amountCents,
      currency: f.currency,
      dueDate: (f.dueDate as Date)?.toISOString?.() || null,
      status: f.status,
      vehicleId: f.vehicleId || null,
      bookingId: f.bookingId || null,
      customerId: f.customerId || null,
      imageUrl: f.imageUrl || null,
      extractedData: f.extractedData || null,
      notes: f.notes || '',
      createdAt: (f.createdAt as Date)?.toISOString?.() || '',
      updatedAt: (f.updatedAt as Date)?.toISOString?.() || '',
      tasks: undefined as unknown,
    };
  }

  async findByOrg(orgId: string) {
    const fines = await this.prisma.fine.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: { tasks: true },
    });
    return fines.map((f) => {
      const formatted = this.format(f as unknown as Record<string, unknown>);
      formatted.tasks = (f.tasks || []).map((t: Record<string, unknown>) => ({
        id: t.id,
        title: t.title,
        status: t.status,
      }));
      return formatted;
    });
  }

  async findByCustomer(orgId: string, customerId: string) {
    const fines = await this.prisma.fine.findMany({
      where: { organizationId: orgId, customerId },
      orderBy: { offenseDate: 'desc' },
    });
    return fines.map((f) => this.format(f as unknown as Record<string, unknown>));
  }

  async findById(id: string) {
    const fine = await this.prisma.fine.findUnique({
      where: { id },
      include: { tasks: true },
    });
    if (!fine) throw new NotFoundException('Fine not found');
    const formatted = this.format(fine as unknown as Record<string, unknown>);
    formatted.tasks = (fine.tasks || []).map((t: Record<string, unknown>) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      description: t.description,
    }));
    return formatted;
  }

  async create(orgId: string, data: {
    fineNumber?: string;
    title: string;
    description?: string;
    offenseType?: string;
    issuingAuthority?: string;
    offenseDate?: string;
    receivedDate?: string;
    location?: string;
    amountCents: number;
    currency?: string;
    dueDate?: string;
    vehicleId?: string;
    imageUrl?: string;
    extractedData?: Record<string, unknown>;
    notes?: string;
  }) {
    let bookingId: string | undefined;
    let customerId: string | undefined;
    let status: 'NEW' | 'MATCHED' = 'NEW';

    if (data.vehicleId && data.offenseDate) {
      const match = await this.matchBooking(orgId, data.vehicleId, data.offenseDate);
      if (match) {
        bookingId = match.bookingId;
        customerId = match.customerId;
        status = 'MATCHED';
      }
    }

    const fine = await this.prisma.fine.create({
      data: {
        organizationId: orgId,
        fineNumber: data.fineNumber,
        title: data.title,
        description: data.description,
        offenseType: data.offenseType,
        issuingAuthority: data.issuingAuthority,
        offenseDate: data.offenseDate ? new Date(data.offenseDate) : null,
        receivedDate: data.receivedDate ? new Date(data.receivedDate) : null,
        location: data.location,
        amountCents: data.amountCents,
        currency: data.currency || 'EUR',
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        vehicleId: data.vehicleId,
        bookingId,
        customerId,
        status,
        imageUrl: data.imageUrl,
        extractedData: data.extractedData ? (data.extractedData as Prisma.InputJsonValue) : undefined,
        notes: data.notes,
      },
    });

    await this.tasksService.upsertByDedup(orgId, `fine:${fine.id}`, {
      title: `Bußgeld bearbeiten: ${data.title}`,
      description: `Bußgeld "${data.title}" (${(data.amountCents / 100).toFixed(2)} ${data.currency || 'EUR'}) muss geprüft und weiterverarbeitet werden.${customerId ? ' Kunde wurde automatisch zugeordnet.' : ' Kunde konnte nicht automatisch zugeordnet werden – bitte manuell prüfen.'}`,
      category: 'fine',
      type: 'CUSTOMER_FOLLOWUP',
      source: 'FINE',
      sourceType: 'SYSTEM',
      priority: data.amountCents >= 10000 ? 'HIGH' : 'NORMAL',
      vehicleId: data.vehicleId,
      customerId: customerId ?? undefined,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      fineId: fine.id,
    });

    return this.findById(fine.id);
  }

  async update(id: string, data: {
    fineNumber?: string;
    title?: string;
    description?: string;
    offenseType?: string;
    issuingAuthority?: string;
    location?: string;
    amountCents?: number;
    dueDate?: string;
    status?: string;
    vehicleId?: string;
    bookingId?: string;
    customerId?: string;
    notes?: string;
  }) {
    const updateData: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        if (key === 'dueDate') {
          updateData[key] = val ? new Date(val as string) : null;
        } else {
          updateData[key] = val;
        }
      }
    }

    await this.prisma.fine.update({ where: { id }, data: updateData });
    return this.findById(id);
  }

  async matchBooking(orgId: string, vehicleId: string, offenseDateStr: string) {
    const offenseDate = new Date(offenseDateStr);
    const booking = await this.prisma.booking.findFirst({
      where: {
        organizationId: orgId,
        vehicleId,
        startDate: { lte: offenseDate },
        endDate: { gte: offenseDate },
        status: { in: ['ACTIVE', 'COMPLETED', 'CONFIRMED'] },
      },
      orderBy: { startDate: 'desc' },
    });

    if (!booking) return null;
    return {
      bookingId: booking.id,
      customerId: booking.customerId,
    };
  }

  async getStats(orgId: string) {
    const [total, newCount, matched, forwarded, resolved, totalAmount] = await Promise.all([
      this.prisma.fine.count({ where: { organizationId: orgId } }),
      this.prisma.fine.count({ where: { organizationId: orgId, status: 'NEW' } }),
      this.prisma.fine.count({ where: { organizationId: orgId, status: 'MATCHED' } }),
      this.prisma.fine.count({ where: { organizationId: orgId, status: 'FORWARDED' } }),
      this.prisma.fine.count({ where: { organizationId: orgId, status: { in: ['RESOLVED', 'CLOSED'] } } }),
      this.prisma.fine.aggregate({ where: { organizationId: orgId }, _sum: { amountCents: true } }),
    ]);
    return {
      total,
      new: newCount,
      matched,
      forwarded,
      resolved,
      totalAmountCents: totalAmount._sum.amountCents || 0,
    };
  }
}

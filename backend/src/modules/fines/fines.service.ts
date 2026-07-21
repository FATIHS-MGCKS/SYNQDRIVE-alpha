import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '@modules/tasks/tasks.service';

export type CreateFineFromDocumentExtractionInput = {
  organizationId: string;
  vehicleId: string;
  documentExtractionId: string;
  documentActionIdempotencyKey?: string | null;
  fineNumber?: string | null;
  title: string;
  description?: string;
  offenseType: string;
  issuingAuthority?: string | null;
  offenseDate: string;
  receivedDate?: string | null;
  location?: string | null;
  amountCents: number;
  currency?: string;
  dueDate?: string | null;
  imageUrl?: string | null;
  extractedData?: Record<string, unknown>;
  notes?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
  driverCustomerId?: string | null;
};

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
      documentExtractionId: f.documentExtractionId || null,
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

  async findById(orgId: string, id: string) {
    const fine = await this.prisma.fine.findFirst({
      where: { id, organizationId: orgId },
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

  async findByDocumentExtractionId(orgId: string, documentExtractionId: string) {
    return this.prisma.fine.findUnique({
      where: {
        organizationId_documentExtractionId: {
          organizationId: orgId,
          documentExtractionId,
        },
      },
    });
  }

  async findDuplicateByReferenceNumber(
    orgId: string,
    fineNumber: string,
    excludeDocumentExtractionId?: string | null,
  ) {
    return this.prisma.fine.findFirst({
      where: {
        organizationId: orgId,
        fineNumber,
        ...(excludeDocumentExtractionId
          ? { documentExtractionId: { not: excludeDocumentExtractionId } }
          : {}),
      },
      select: { id: true },
    });
  }

  async createFromDocumentExtraction(input: CreateFineFromDocumentExtractionInput) {
    if (!input.documentExtractionId) {
      throw new BadRequestException('documentExtractionId is required for extraction apply');
    }
    if (!input.offenseType?.trim()) {
      throw new BadRequestException('offenseType is required for extraction apply');
    }
    if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) {
      throw new BadRequestException('amountCents must be greater than zero for extraction apply');
    }

    const existing = await this.findByDocumentExtractionId(
      input.organizationId,
      input.documentExtractionId,
    );
    if (existing) {
      await this.syncFineFollowUpTask(input.organizationId, existing.id, input);
      return this.findById(input.organizationId, existing.id);
    }

    if (input.fineNumber) {
      const duplicate = await this.findDuplicateByReferenceNumber(
        input.organizationId,
        input.fineNumber,
        input.documentExtractionId,
      );
      if (duplicate) {
        throw new BadRequestException({
          message: 'Fine reference number already exists for this organization',
          code: 'FINE_DUPLICATE_REFERENCE_NUMBER',
          existingFineId: duplicate.id,
        });
      }
    }

    const validatedLinks = await this.validateConfirmedEntityLinks(input);

    try {
      const fine = await this.prisma.fine.create({
        data: {
          organizationId: input.organizationId,
          documentExtractionId: input.documentExtractionId,
          fineNumber: input.fineNumber ?? undefined,
          title: input.title,
          description: input.description,
          offenseType: input.offenseType,
          issuingAuthority: input.issuingAuthority ?? undefined,
          offenseDate: new Date(input.offenseDate),
          receivedDate: input.receivedDate ? new Date(input.receivedDate) : null,
          location: input.location ?? undefined,
          amountCents: input.amountCents,
          currency: input.currency || 'EUR',
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          vehicleId: input.vehicleId,
          bookingId: validatedLinks.bookingId,
          customerId: validatedLinks.customerId,
          status: 'UNDER_REVIEW',
          imageUrl: input.imageUrl ?? undefined,
          extractedData: {
            ...(input.extractedData ?? {}),
            documentExtractionId: input.documentExtractionId,
            documentActionIdempotencyKey: input.documentActionIdempotencyKey ?? null,
            linkedDriverCustomerId: validatedLinks.driverCustomerId,
            confirmedEntityLinks: input.extractedData?.acceptedEntityLinks ?? undefined,
          } as Prisma.InputJsonValue,
          notes: input.notes ?? undefined,
        },
      });

      await this.syncFineFollowUpTask(input.organizationId, fine.id, input);
      return this.findById(input.organizationId, fine.id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.findByDocumentExtractionId(
          input.organizationId,
          input.documentExtractionId,
        );
        if (raced) {
          await this.syncFineFollowUpTask(input.organizationId, raced.id, input);
          return this.findById(input.organizationId, raced.id);
        }
      }
      throw error;
    }
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

    return this.findById(orgId, fine.id);
  }

  async update(orgId: string, id: string, data: {
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

    await this.findById(orgId, id);
    await this.prisma.fine.update({ where: { id }, data: updateData });
    return this.findById(orgId, id);
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

  private async validateConfirmedEntityLinks(input: CreateFineFromDocumentExtractionInput) {
    let bookingId: string | null = input.bookingId ?? null;
    let customerId: string | null = input.customerId ?? null;
    const driverCustomerId: string | null = input.driverCustomerId ?? null;

    if (bookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: {
          id: bookingId,
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
        },
        select: { id: true, customerId: true },
      });
      if (!booking) {
        throw new BadRequestException('Confirmed booking link is invalid for this vehicle/organization');
      }
      if (!customerId) {
        customerId = booking.customerId;
      }
    }

    if (customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: customerId, organizationId: input.organizationId },
        select: { id: true },
      });
      if (!customer) {
        throw new BadRequestException('Confirmed customer link is invalid for this organization');
      }
    }

    if (driverCustomerId) {
      const driver = await this.prisma.customer.findFirst({
        where: { id: driverCustomerId, organizationId: input.organizationId },
        select: { id: true },
      });
      if (!driver) {
        throw new BadRequestException('Confirmed driver link is invalid for this organization');
      }
    }

    return { bookingId, customerId, driverCustomerId };
  }

  private async syncFineFollowUpTask(
    orgId: string,
    fineId: string,
    input: CreateFineFromDocumentExtractionInput,
  ) {
    const dedupKey = `document-extraction:fine:${input.documentExtractionId}`;
    const customerSuffix = input.customerId
      ? ' Bestätigte Kundenzuordnung liegt vor.'
      : ' Kundenzuordnung bitte manuell prüfen.';

    await this.tasksService.upsertByDedup(orgId, dedupKey, {
      title: `Bußgeld bearbeiten: ${input.title}`,
      description: `Bußgeld "${input.title}" (${(input.amountCents / 100).toFixed(2)} ${input.currency || 'EUR'}) aus Dokumenten-Upload prüfen.${customerSuffix}`,
      category: 'fine',
      type: 'CUSTOMER_FOLLOWUP',
      source: 'FINE',
      sourceType: 'SYSTEM',
      priority: input.amountCents >= 10000 ? 'HIGH' : 'NORMAL',
      vehicleId: input.vehicleId,
      customerId: input.customerId ?? undefined,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      fineId,
      metadata: {
        documentExtractionId: input.documentExtractionId,
        documentActionIdempotencyKey: input.documentActionIdempotencyKey ?? null,
      } as Prisma.InputJsonValue,
    });
  }
}

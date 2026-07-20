import { BadRequestException, Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import {
  Prisma,
  ServiceCaseCategory,
  ServiceCaseSource,
  ServiceCaseStatus,
  TaskPriority,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ServiceOverdueTaskService } from '@modules/vehicle-intelligence/service-compliance/service-overdue-task.service';
import {
  buildServiceCaseListCursorWhere,
  buildServiceCaseListOrderBy,
  decodeServiceCaseListCursor,
  encodeServiceCaseListCursorFromRow,
  isServiceCaseListPaginatedRequest,
  resolveServiceCaseListLimit,
  SERVICE_CASE_LIST_LEGACY_MAX_LIMIT,
  type ServiceCaseListPageResult,
} from './service-case-list-cursor.util';

const STATUS_TRANSITIONS: Record<ServiceCaseStatus, ServiceCaseStatus[]> = {
  OPEN: ['SCHEDULED', 'IN_PROGRESS', 'WAITING_VENDOR', 'WAITING_PARTS', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'WAITING_VENDOR', 'WAITING_PARTS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_VENDOR', 'WAITING_PARTS', 'COMPLETED', 'CANCELLED'],
  WAITING_VENDOR: ['IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'CANCELLED'],
  WAITING_PARTS: ['IN_PROGRESS', 'WAITING_VENDOR', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export interface ListServiceCasesFilters {
  status?: ServiceCaseStatus;
  category?: ServiceCaseCategory;
  priority?: TaskPriority;
  source?: ServiceCaseSource;
  vehicleId?: string;
  vendorId?: string;
  search?: string;
  blocksRental?: boolean;
  scheduledFrom?: string;
  scheduledTo?: string;
  expectedReadyFrom?: string;
  expectedReadyTo?: string;
  limit?: number;
  cursor?: string;
}

type ServiceCaseDetailRow = Prisma.ServiceCaseGetPayload<{
  include: {
    tasks: { select: { id: true; title: true; status: true; type: true; dueDate: true } };
    comments: true;
    attachments: true;
  };
}>;

type ServiceCaseListRow = Prisma.ServiceCaseGetPayload<{
  include: {
    _count: { select: { tasks: true } };
  };
}>;

@Injectable()
export class ServiceCasesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ServiceOverdueTaskService))
    private readonly serviceOverdueTasks: ServiceOverdueTaskService,
  ) {}

  private formatScalars(row: ServiceCaseDetailRow | ServiceCaseListRow) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      vehicleId: row.vehicleId,
      vendorId: row.vendorId,
      title: row.title,
      description: row.description ?? '',
      category: row.category,
      status: row.status,
      priority: row.priority,
      source: row.source,
      openedAt: row.openedAt.toISOString(),
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      expectedReadyAt: row.expectedReadyAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      estimatedCostCents: row.estimatedCostCents ?? null,
      actualCostCents: row.actualCostCents ?? null,
      downtimeStart: row.downtimeStart?.toISOString() ?? null,
      downtimeEnd: row.downtimeEnd?.toISOString() ?? null,
      blocksRental: row.blocksRental,
      completionNotes: row.completionNotes ?? null,
      documentId: row.documentId ?? null,
      metadata: row.metadata ?? null,
      createdByUserId: row.createdByUserId ?? null,
      updatedByUserId: row.updatedByUserId ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private formatList(row: ServiceCaseListRow) {
    return {
      ...this.formatScalars(row),
      taskCount: row._count.tasks,
    };
  }

  private formatDetail(row: ServiceCaseDetailRow) {
    return {
      ...this.formatScalars(row),
      taskCount: row.tasks.length,
      tasks: row.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        type: t.type,
        dueDate: t.dueDate?.toISOString() ?? null,
      })),
      comments: row.comments.map((c) => ({
        id: c.id,
        userId: c.userId,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
      })),
      attachments: row.attachments.map((a) => ({
        id: a.id,
        fileUrl: a.fileUrl,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
        uploadedByUserId: a.uploadedByUserId,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  /** @deprecated use formatDetail */
  private format(row: ServiceCaseDetailRow) {
    return this.formatDetail(row);
  }

  private listInclude() {
    return {
      _count: { select: { tasks: true } },
    };
  }

  private detailInclude() {
    return {
      tasks: {
        select: { id: true, title: true, status: true, type: true, dueDate: true },
        orderBy: { createdAt: 'asc' as const },
      },
      comments: { orderBy: { createdAt: 'asc' as const } },
      attachments: { orderBy: { createdAt: 'asc' as const } },
    };
  }

  private async assertVehicleInOrg(orgId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: { id: true },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found in this organization');
  }

  private async assertVendorInOrg(orgId: string, vendorId: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id: vendorId, organizationId: orgId },
      select: { id: true },
    });
    if (!vendor) throw new BadRequestException('Vendor not found in this organization');
  }

  private async loadOrThrow(orgId: string, id: string) {
    const row = await this.prisma.serviceCase.findFirst({
      where: { id, organizationId: orgId },
      include: this.detailInclude(),
    });
    if (!row) throw new NotFoundException('Service case not found');
    return row;
  }

  private assertTransition(from: ServiceCaseStatus, to: ServiceCaseStatus) {
    if (from === to) return;
    if (!STATUS_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(`Invalid status transition ${from} → ${to}`);
    }
  }

  private buildListWhere(orgId: string, filters: ListServiceCasesFilters): Prisma.ServiceCaseWhereInput {
    const where: Prisma.ServiceCaseWhereInput = { organizationId: orgId };
    if (filters.status) where.status = filters.status;
    if (filters.category) where.category = filters.category;
    if (filters.priority) where.priority = filters.priority;
    if (filters.source) where.source = filters.source;
    if (filters.vehicleId) where.vehicleId = filters.vehicleId;
    if (filters.vendorId) where.vendorId = filters.vendorId;
    if (filters.blocksRental != null) where.blocksRental = filters.blocksRental;

    if (filters.scheduledFrom || filters.scheduledTo) {
      where.scheduledAt = {};
      if (filters.scheduledFrom) {
        (where.scheduledAt as Prisma.DateTimeFilter).gte = new Date(filters.scheduledFrom);
      }
      if (filters.scheduledTo) {
        (where.scheduledAt as Prisma.DateTimeFilter).lte = new Date(filters.scheduledTo);
      }
    }

    if (filters.expectedReadyFrom || filters.expectedReadyTo) {
      where.expectedReadyAt = {};
      if (filters.expectedReadyFrom) {
        (where.expectedReadyAt as Prisma.DateTimeFilter).gte = new Date(filters.expectedReadyFrom);
      }
      if (filters.expectedReadyTo) {
        (where.expectedReadyAt as Prisma.DateTimeFilter).lte = new Date(filters.expectedReadyTo);
      }
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  async list(orgId: string, filters: ListServiceCasesFilters = {}) {
    const paginated = isServiceCaseListPaginatedRequest(filters);
    const limit = paginated ? resolveServiceCaseListLimit(filters.limit) : undefined;
    const cursor = filters.cursor?.trim() || undefined;
    const where = this.buildListWhere(orgId, filters);
    const andFilters: Prisma.ServiceCaseWhereInput[] = [];

    if (cursor) {
      andFilters.push(buildServiceCaseListCursorWhere(decodeServiceCaseListCursor(cursor)));
    }

    const mergedWhere: Prisma.ServiceCaseWhereInput =
      andFilters.length > 0 ? { AND: [where, ...andFilters] } : where;

    const orderBy = buildServiceCaseListOrderBy();
    const take = paginated ? limit! + 1 : SERVICE_CASE_LIST_LEGACY_MAX_LIMIT;

    const rows = await this.prisma.serviceCase.findMany({
      where: mergedWhere,
      include: this.listInclude(),
      orderBy,
      take,
    });

    let nextCursor: string | null = null;
    const pageRows =
      paginated && rows.length > limit!
        ? (() => {
            nextCursor = encodeServiceCaseListCursorFromRow(rows[limit! - 1]!);
            return rows.slice(0, limit!);
          })()
        : rows;

    const data = pageRows.map((row) => this.formatList(row));

    if (paginated) {
      const result: ServiceCaseListPageResult<(typeof data)[number]> = {
        data,
        meta: {
          limit: limit!,
          nextCursor,
        },
      };
      return result;
    }

    return data;
  }

  async getDashboardSummary(orgId: string) {
    const orgFilter = { organizationId: orgId };
    const activeStatuses: ServiceCaseStatus[] = [
      'OPEN',
      'SCHEDULED',
      'IN_PROGRESS',
      'WAITING_VENDOR',
      'WAITING_PARTS',
    ];

    const [byStatusRaw, byPriorityRaw, open, scheduled, inProgress, waitingVendor, waitingParts, completed, cancelled, blocksRental] =
      await Promise.all([
        this.prisma.serviceCase.groupBy({
          by: ['status'],
          where: orgFilter,
          _count: { _all: true },
        }),
        this.prisma.serviceCase.groupBy({
          by: ['priority'],
          where: { ...orgFilter, status: { in: activeStatuses } },
          _count: { _all: true },
        }),
        this.prisma.serviceCase.count({ where: { ...orgFilter, status: 'OPEN' } }),
        this.prisma.serviceCase.count({ where: { ...orgFilter, status: 'SCHEDULED' } }),
        this.prisma.serviceCase.count({ where: { ...orgFilter, status: 'IN_PROGRESS' } }),
        this.prisma.serviceCase.count({ where: { ...orgFilter, status: 'WAITING_VENDOR' } }),
        this.prisma.serviceCase.count({ where: { ...orgFilter, status: 'WAITING_PARTS' } }),
        this.prisma.serviceCase.count({ where: { ...orgFilter, status: 'COMPLETED' } }),
        this.prisma.serviceCase.count({ where: { ...orgFilter, status: 'CANCELLED' } }),
        this.prisma.serviceCase.count({ where: { ...orgFilter, blocksRental: true, status: { in: activeStatuses } } }),
      ]);

    const byStatus = Object.fromEntries(byStatusRaw.map((row) => [row.status, row._count._all]));
    const byPriority = Object.fromEntries(byPriorityRaw.map((row) => [row.priority, row._count._all]));
    const active =
      (byStatus.OPEN ?? 0) +
      (byStatus.SCHEDULED ?? 0) +
      (byStatus.IN_PROGRESS ?? 0) +
      (byStatus.WAITING_VENDOR ?? 0) +
      (byStatus.WAITING_PARTS ?? 0);

    return {
      open,
      active,
      scheduled,
      inProgress,
      waitingVendor,
      waitingParts,
      completed,
      cancelled,
      blocksRental,
      byStatus,
      byPriority,
    };
  }

  async getById(orgId: string, id: string) {
    return this.formatDetail(await this.loadOrThrow(orgId, id));
  }

  async listForVehicle(orgId: string, vehicleId: string, filters: ListServiceCasesFilters = {}) {
    const vid = vehicleId?.trim();
    if (!vid) throw new BadRequestException('vehicleId is required');
    await this.assertVehicleInOrg(orgId, vid);
    return this.list(orgId, { ...filters, vehicleId: vid });
  }

  async listForVendor(orgId: string, vendorId: string, filters: ListServiceCasesFilters = {}) {
    const vid = vendorId?.trim();
    if (!vid) throw new BadRequestException('vendorId is required');
    await this.assertVendorInOrg(orgId, vid);
    return this.list(orgId, { ...filters, vendorId: vid });
  }

  async listCompletedForVendor(orgId: string, vendorId: string) {
    return this.listForVendor(orgId, vendorId, { status: 'COMPLETED' });
  }

  async create(
    orgId: string,
    input: {
      title: string;
      description?: string;
      category: ServiceCaseCategory;
      priority?: TaskPriority;
      source?: ServiceCaseSource;
      vehicleId: string;
      vendorId?: string;
      scheduledAt?: string;
      expectedReadyAt?: string;
      downtimeStart?: string;
      estimatedCostCents?: number;
      blocksRental?: boolean;
      documentId?: string;
      metadata?: Record<string, unknown>;
    },
    userId?: string,
  ) {
    const vehicleId = input.vehicleId.trim();
    if (!vehicleId) throw new BadRequestException('vehicleId is required');
    if (!input.title?.trim()) throw new BadRequestException('title is required');
    await this.assertVehicleInOrg(orgId, vehicleId);
    if (input.vendorId) await this.assertVendorInOrg(orgId, input.vendorId);

    const row = await this.prisma.serviceCase.create({
      data: {
        organizationId: orgId,
        vehicleId,
        vendorId: input.vendorId ?? undefined,
        title: input.title.trim(),
        description: input.description,
        category: input.category,
        priority: input.priority ?? 'NORMAL',
        source: input.source ?? 'MANUAL',
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        expectedReadyAt: input.expectedReadyAt ? new Date(input.expectedReadyAt) : undefined,
        downtimeStart: input.downtimeStart ? new Date(input.downtimeStart) : undefined,
        estimatedCostCents: input.estimatedCostCents,
        blocksRental: input.blocksRental ?? false,
        documentId: input.documentId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        createdByUserId: userId ?? null,
        status: input.scheduledAt ? 'SCHEDULED' : 'OPEN',
      },
      include: this.detailInclude(),
    });

    if (input.category === 'SERVICE' || input.category === 'INSPECTION') {
      void this.serviceOverdueTasks
        .linkServiceCase(orgId, vehicleId, row.id)
        .catch(() => {});
    }

    return this.format(row);
  }

  async update(
    orgId: string,
    id: string,
    input: {
      title?: string;
      description?: string;
      category?: ServiceCaseCategory;
      status?: ServiceCaseStatus;
      priority?: TaskPriority;
      vendorId?: string | null;
      scheduledAt?: string | null;
      expectedReadyAt?: string | null;
      downtimeStart?: string | null;
      downtimeEnd?: string | null;
      estimatedCostCents?: number | null;
      actualCostCents?: number | null;
      blocksRental?: boolean;
      documentId?: string | null;
    },
    userId?: string,
  ) {
    const existing = await this.loadOrThrow(orgId, id);
    if (input.vendorId) await this.assertVendorInOrg(orgId, input.vendorId);
    if (input.status) this.assertTransition(existing.status, input.status);

    const row = await this.prisma.serviceCase.update({
      where: { id },
      data: {
        title: input.title?.trim(),
        description: input.description,
        category: input.category,
        status: input.status,
        priority: input.priority,
        vendorId: input.vendorId === null ? null : input.vendorId ?? undefined,
        scheduledAt:
          input.scheduledAt === null ? null : input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        expectedReadyAt:
          input.expectedReadyAt === null
            ? null
            : input.expectedReadyAt
              ? new Date(input.expectedReadyAt)
              : undefined,
        downtimeStart:
          input.downtimeStart === null ? null : input.downtimeStart ? new Date(input.downtimeStart) : undefined,
        downtimeEnd:
          input.downtimeEnd === null ? null : input.downtimeEnd ? new Date(input.downtimeEnd) : undefined,
        estimatedCostCents: input.estimatedCostCents === null ? null : input.estimatedCostCents,
        actualCostCents: input.actualCostCents === null ? null : input.actualCostCents,
        blocksRental: input.blocksRental,
        documentId: input.documentId === null ? null : input.documentId ?? undefined,
        updatedByUserId: userId ?? null,
      },
      include: this.detailInclude(),
    });
    return this.format(row);
  }

  async complete(
    orgId: string,
    id: string,
    input: { completionNotes?: string; actualCostCents?: number; downtimeEnd?: string },
    userId?: string,
  ) {
    const existing = await this.loadOrThrow(orgId, id);
    this.assertTransition(existing.status, 'COMPLETED');
    const row = await this.prisma.serviceCase.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        completionNotes: input.completionNotes ?? existing.completionNotes,
        actualCostCents: input.actualCostCents ?? existing.actualCostCents,
        downtimeEnd: input.downtimeEnd ? new Date(input.downtimeEnd) : existing.downtimeEnd ?? new Date(),
        updatedByUserId: userId ?? null,
      },
      include: this.detailInclude(),
    });

    void this.serviceOverdueTasks
      .onServiceCaseCompleted(orgId, row.vehicleId, row.id)
      .catch(() => {});

    return this.format(row);
  }

  async cancel(orgId: string, id: string, userId?: string) {
    const existing = await this.loadOrThrow(orgId, id);
    this.assertTransition(existing.status, 'CANCELLED');
    const row = await this.prisma.serviceCase.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        updatedByUserId: userId ?? null,
      },
      include: this.detailInclude(),
    });
    return this.format(row);
  }

  async addComment(orgId: string, id: string, body: string, userId?: string) {
    await this.loadOrThrow(orgId, id);
    await this.prisma.serviceCaseComment.create({
      data: { serviceCaseId: id, body, userId: userId ?? null },
    });
    return this.getById(orgId, id);
  }

  async addAttachment(
    orgId: string,
    id: string,
    data: { fileUrl: string; fileName?: string; mimeType?: string; size?: number },
    userId?: string,
  ) {
    await this.loadOrThrow(orgId, id);
    await this.prisma.serviceCaseAttachment.create({
      data: {
        serviceCaseId: id,
        fileUrl: data.fileUrl,
        fileName: data.fileName,
        mimeType: data.mimeType,
        size: data.size,
        uploadedByUserId: userId ?? null,
      },
    });
    return this.getById(orgId, id);
  }

  /** Used by TasksService when linking a task to a case. */
  async assertCaseAccessible(
    orgId: string,
    serviceCaseId: string,
    links: { vehicleId?: string | null; vendorId?: string | null },
  ) {
    const row = await this.prisma.serviceCase.findFirst({
      where: { id: serviceCaseId, organizationId: orgId },
      select: { id: true, vehicleId: true, vendorId: true, status: true },
    });
    if (!row) throw new BadRequestException('Service case not found in this organization');
    if (row.status === 'COMPLETED' || row.status === 'CANCELLED') {
      throw new BadRequestException('Cannot link tasks to a completed or cancelled service case');
    }
    if (links.vehicleId && links.vehicleId !== row.vehicleId) {
      throw new BadRequestException('Task vehicle does not match service case vehicle');
    }
    if (links.vendorId && row.vendorId && links.vendorId !== row.vendorId) {
      throw new BadRequestException('Task vendor does not match service case vendor');
    }
    return row;
  }
}

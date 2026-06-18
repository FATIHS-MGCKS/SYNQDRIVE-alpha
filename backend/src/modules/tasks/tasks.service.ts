import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, TaskPriority, TaskSource, TaskStatus, TaskType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { checklistForType } from './task-templates';

// ─── Domain constants (V4.8.3 Task Action Layer) ─────────────────────────

/** Active = not terminal. Used for overdue/dedup/summary semantics. */
export const ACTIVE_TASK_STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING'];

/**
 * Allowed status transitions. DONE/CANCELLED are terminal — there is no
 * reopen flow in the repo, so reopening is rejected rather than silently
 * mutating a closed task.
 */
const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  OPEN: ['IN_PROGRESS', 'WAITING', 'DONE', 'CANCELLED'],
  IN_PROGRESS: ['WAITING', 'DONE', 'CANCELLED'],
  WAITING: ['IN_PROGRESS', 'DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
};

/** Completing one of these requires a resolution note (operational evidence). */
export const RESOLUTION_REQUIRED_TYPES: TaskType[] = [
  'REPAIR',
  'BRAKE_CHECK',
  'TIRE_CHECK',
  'BATTERY_CHECK',
  'VEHICLE_SERVICE',
  'VEHICLE_INSPECTION',
];

export interface TaskLinks {
  vehicleId?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
  vendorId?: string | null;
  alertId?: string | null;
  documentId?: string | null;
  fineId?: string | null;
  invoiceId?: string | null;
  assignedUserId?: string | null;
}

export interface CreateManualTaskInput extends TaskLinks {
  title: string;
  description?: string;
  type?: TaskType;
  source?: string;
  sourceType?: TaskSource;
  priority?: TaskPriority;
  category?: string;
  dueDate?: string | Date | null;
  estimatedCostCents?: number | null;
  metadata?: Prisma.InputJsonValue;
  checklist?: Array<{ title: string; description?: string; sortOrder?: number }>;
  blocksVehicleAvailability?: boolean;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string | Date | null;
  assignedUserId?: string | null;
  estimatedCostCents?: number | null;
  actualCostCents?: number | null;
  metadata?: Prisma.InputJsonValue;
  category?: string;
  blocksVehicleAvailability?: boolean;
}

export interface ListTasksFilters {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  type?: TaskType | TaskType[];
  sourceType?: TaskSource | TaskSource[];
  assignedUserId?: string;
  vehicleId?: string;
  bookingId?: string;
  customerId?: string;
  vendorId?: string;
  alertId?: string;
  documentId?: string;
  dueFrom?: string;
  dueTo?: string;
  overdue?: boolean;
  search?: string;
}

type OrgTaskDetail = Prisma.OrgTaskGetPayload<{
  include: {
    checklistItems: true;
    comments: true;
    attachments: true;
    events: true;
  };
}>;
type OrgTaskRow = Prisma.OrgTaskGetPayload<object> | OrgTaskDetail;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Serialization ─────────────────────────────────────────────────────

  private isOverdue(t: { dueDate: Date | null; status: TaskStatus }, now = new Date()): boolean {
    return (
      !!t.dueDate &&
      t.dueDate.getTime() < now.getTime() &&
      t.status !== 'DONE' &&
      t.status !== 'CANCELLED'
    );
  }

  private format(t: OrgTaskRow, now = new Date()) {
    return {
      id: t.id,
      organizationId: t.organizationId,
      title: t.title,
      description: t.description || '',
      category: t.category || '',
      type: t.type,
      status: t.status,
      priority: t.priority,
      source: t.source || null,
      sourceType: t.sourceType,
      dedupKey: t.dedupKey || null,
      vehicleId: t.vehicleId || null,
      bookingId: t.bookingId || null,
      customerId: t.customerId || null,
      vendorId: t.vendorId || null,
      alertId: t.alertId || null,
      documentId: t.documentId || null,
      fineId: t.fineId || null,
      invoiceId: t.invoiceId || null,
      assignedUserId: t.assignedUserId || null,
      estimatedCostCents: t.estimatedCostCents ?? null,
      actualCostCents: t.actualCostCents ?? null,
      resolutionNote: t.resolutionNote || null,
      blocksVehicleAvailability: t.blocksVehicleAvailability ?? false,
      metadata: t.metadata ?? null,
      isOverdue: this.isOverdue(t, now),
      dueDate: (t.dueDate as Date)?.toISOString?.() || null,
      startedAt: (t.startedAt as Date)?.toISOString?.() || null,
      completedAt: (t.completedAt as Date)?.toISOString?.() || null,
      cancelledAt: (t.cancelledAt as Date)?.toISOString?.() || null,
      createdAt: (t.createdAt as Date)?.toISOString?.() || '',
      updatedAt: (t.updatedAt as Date)?.toISOString?.() || '',
      ...( 'checklistItems' in t && t.checklistItems
        ? {
            checklist: t.checklistItems.map((c) => this.formatChecklistItem(c)),
          }
        : {}),
      ...( 'comments' in t && t.comments
        ? { comments: t.comments.map((c) => this.formatComment(c)) }
        : {}),
      ...( 'attachments' in t && t.attachments
        ? { attachments: t.attachments.map((a) => this.formatAttachment(a)) }
        : {}),
      ...( 'events' in t && t.events ? { timeline: t.events.map((e) => this.formatEvent(e)) } : {}),
    };
  }

  private formatChecklistItem(c: Prisma.TaskChecklistItemGetPayload<object>) {
    return {
      id: c.id,
      title: c.title,
      description: c.description || '',
      sortOrder: c.sortOrder,
      isDone: c.isDone,
      completedAt: (c.completedAt as Date)?.toISOString?.() || null,
      completedByUserId: c.completedByUserId || null,
    };
  }

  private formatComment(c: Prisma.TaskCommentGetPayload<object>) {
    return {
      id: c.id,
      userId: c.userId || null,
      body: c.body,
      createdAt: (c.createdAt as Date)?.toISOString?.() || '',
    };
  }

  private formatAttachment(a: Prisma.TaskAttachmentGetPayload<object>) {
    return {
      id: a.id,
      fileUrl: a.fileUrl,
      fileName: a.fileName || null,
      mimeType: a.mimeType || null,
      size: a.size ?? null,
      uploadedByUserId: a.uploadedByUserId || null,
      createdAt: (a.createdAt as Date)?.toISOString?.() || '',
    };
  }

  private formatEvent(e: Prisma.TaskEventGetPayload<object>) {
    return {
      id: e.id,
      type: e.type,
      actorUserId: e.actorUserId || null,
      oldValue: e.oldValue || null,
      newValue: e.newValue || null,
      metadata: e.metadata ?? null,
      createdAt: (e.createdAt as Date)?.toISOString?.() || '',
    };
  }

  // ─── Tenant-scoped link validation ───────────────────────────────────────
  // Every relational id supplied by a caller must belong to the same org.

  private async assertLinksBelongToOrg(orgId: string, links: TaskLinks): Promise<void> {
    if (links.assignedUserId) {
      const member = await this.prisma.organizationMembership.findFirst({
        where: { userId: links.assignedUserId, organizationId: orgId },
        select: { id: true },
      });
      if (!member) {
        throw new BadRequestException('Assigned user is not a member of this organization');
      }
    }
    const checks: Array<[string | null | undefined, () => Promise<unknown>, string]> = [
      [links.vehicleId, () => this.prisma.vehicle.findFirst({ where: { id: links.vehicleId!, organizationId: orgId }, select: { id: true } }), 'Vehicle'],
      [links.bookingId, () => this.prisma.booking.findFirst({ where: { id: links.bookingId!, organizationId: orgId }, select: { id: true } }), 'Booking'],
      [links.customerId, () => this.prisma.customer.findFirst({ where: { id: links.customerId!, organizationId: orgId }, select: { id: true } }), 'Customer'],
      [links.vendorId, () => this.prisma.vendor.findFirst({ where: { id: links.vendorId!, organizationId: orgId }, select: { id: true } }), 'Vendor'],
      [links.alertId, () => this.prisma.dashboardInsight.findFirst({ where: { id: links.alertId!, organizationId: orgId }, select: { id: true } }), 'Alert'],
      [links.fineId, () => this.prisma.fine.findFirst({ where: { id: links.fineId!, organizationId: orgId }, select: { id: true } }), 'Fine'],
      [links.invoiceId, () => this.prisma.orgInvoice.findFirst({ where: { id: links.invoiceId!, organizationId: orgId }, select: { id: true } }), 'Invoice'],
    ];
    for (const [id, query, label] of checks) {
      if (!id) continue;
      const found = await query();
      if (!found) throw new BadRequestException(`${label} not found in this organization`);
    }
    // Documents span several models; reject only when the extraction clearly
    // belongs to another org, otherwise accept (generated/legal docs).
    if (links.documentId) {
      const ext = await this.prisma.vehicleDocumentExtraction.findUnique({
        where: { id: links.documentId },
        select: { organizationId: true },
      });
      if (ext && ext.organizationId && ext.organizationId !== orgId) {
        throw new BadRequestException('Document not found in this organization');
      }
    }
  }

  private async recordEvent(
    taskId: string,
    type: string,
    actorUserId?: string | null,
    oldValue?: string | null,
    newValue?: string | null,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    try {
      await this.prisma.taskEvent.create({
        data: { taskId, type, actorUserId: actorUserId ?? null, oldValue: oldValue ?? null, newValue: newValue ?? null, metadata },
      });
    } catch (err: any) {
      this.logger.warn(`Failed to record task event ${type} for ${taskId}: ${err?.message ?? err}`);
    }
  }

  /**
   * Notification hook. No notification system exists yet (V4.8.3); this is the
   * single seam where task assignment / overdue / critical-creation events
   * would fan out. Kept as a structured no-op so wiring is trivial later.
   */
  private notify(event: 'assigned' | 'created_critical' | 'completed' | 'cancelled', _task: { id: string }): void {
    this.logger.debug(`task.${event}`);
  }

  private async loadTaskOrThrow(id: string, orgId: string) {
    const task = await this.prisma.orgTask.findFirst({ where: { id, organizationId: orgId } });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  // ─── Read APIs ───────────────────────────────────────────────────────────

  async findByOrg(orgId: string) {
    return this.listTasks(orgId, {});
  }

  async listTasks(orgId: string, filters: ListTasksFilters) {
    const now = new Date();
    const where: Prisma.OrgTaskWhereInput = { organizationId: orgId };

    if (filters.status) where.status = Array.isArray(filters.status) ? { in: filters.status } : filters.status;
    if (filters.priority) where.priority = Array.isArray(filters.priority) ? { in: filters.priority } : filters.priority;
    if (filters.type) where.type = Array.isArray(filters.type) ? { in: filters.type } : filters.type;
    if (filters.sourceType) where.sourceType = Array.isArray(filters.sourceType) ? { in: filters.sourceType } : filters.sourceType;
    if (filters.assignedUserId) where.assignedUserId = filters.assignedUserId;
    if (filters.vehicleId) where.vehicleId = filters.vehicleId;
    if (filters.bookingId) where.bookingId = filters.bookingId;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.vendorId) where.vendorId = filters.vendorId;
    if (filters.alertId) where.alertId = filters.alertId;
    if (filters.documentId) where.documentId = filters.documentId;

    if (filters.dueFrom || filters.dueTo) {
      where.dueDate = {};
      if (filters.dueFrom) (where.dueDate as Prisma.DateTimeFilter).gte = new Date(filters.dueFrom);
      if (filters.dueTo) (where.dueDate as Prisma.DateTimeFilter).lte = new Date(filters.dueTo);
    }

    if (filters.overdue) {
      where.status = { in: ACTIVE_TASK_STATUSES };
      where.dueDate = { ...(where.dueDate as object), lt: now };
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const tasks = await this.prisma.orgTask.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    });
    return tasks.map((t) => this.format(t, now));
  }

  async getTaskById(id: string, orgId: string) {
    const task = await this.prisma.orgTask.findFirst({
      where: { id, organizationId: orgId },
      include: {
        checklistItems: { orderBy: { sortOrder: 'asc' } },
        comments: { orderBy: { createdAt: 'asc' } },
        attachments: { orderBy: { createdAt: 'asc' } },
        events: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    return this.format(task);
  }

  /** Backward-compatible alias (used by the controller). Returns full detail. */
  async findById(id: string, orgId?: string) {
    if (orgId) return this.getTaskById(id, orgId);
    const task = await this.prisma.orgTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    return this.format(task);
  }

  async getTasksForVehicle(orgId: string, vehicleId: string, opts?: { activeOnly?: boolean }) {
    return this.listTasks(orgId, {
      vehicleId,
      ...(opts?.activeOnly ? { status: ACTIVE_TASK_STATUSES } : {}),
    });
  }

  async getTasksForBooking(orgId: string, bookingId: string) {
    return this.listTasks(orgId, { bookingId });
  }

  async getTasksForCustomer(orgId: string, customerId: string) {
    return this.listTasks(orgId, { customerId });
  }

  async getTasksForVendor(orgId: string, vendorId: string) {
    return this.listTasks(orgId, { vendorId });
  }

  async getTasksForAlert(orgId: string, alertId: string) {
    return this.listTasks(orgId, { alertId });
  }

  async getDashboardSummary(orgId: string, currentUserId?: string) {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
    const activeFilter = { organizationId: orgId, status: { in: ACTIVE_TASK_STATUSES } };

    const [byStatusRaw, byPriorityRaw, open, overdue, dueToday, critical, assignedToMe] = await Promise.all([
      this.prisma.orgTask.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: { _all: true } }),
      this.prisma.orgTask.groupBy({ by: ['priority'], where: activeFilter, _count: { _all: true } }),
      this.prisma.orgTask.count({ where: { organizationId: orgId, status: 'OPEN' } }),
      this.prisma.orgTask.count({ where: { ...activeFilter, dueDate: { lt: now } } }),
      this.prisma.orgTask.count({ where: { ...activeFilter, dueDate: { gte: startOfDay, lt: endOfDay } } }),
      this.prisma.orgTask.count({ where: { ...activeFilter, priority: 'CRITICAL' } }),
      currentUserId
        ? this.prisma.orgTask.count({ where: { ...activeFilter, assignedUserId: currentUserId } })
        : Promise.resolve(0),
    ]);

    const byStatus = Object.fromEntries(byStatusRaw.map((r) => [r.status, r._count._all]));
    const byPriority = Object.fromEntries(byPriorityRaw.map((r) => [r.priority, r._count._all]));
    const active = (byStatus.OPEN ?? 0) + (byStatus.IN_PROGRESS ?? 0) + (byStatus.WAITING ?? 0);

    return {
      open,
      active,
      inProgress: byStatus.IN_PROGRESS ?? 0,
      waiting: byStatus.WAITING ?? 0,
      done: byStatus.DONE ?? 0,
      cancelled: byStatus.CANCELLED ?? 0,
      dueToday,
      overdue,
      critical,
      assignedToMe,
      byStatus,
      byPriority,
    };
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  private resolveChecklist(
    type: TaskType,
    provided?: Array<{ title: string; description?: string; sortOrder?: number }>,
  ): Array<{ title: string; description?: string; sortOrder?: number }> | undefined {
    if (provided && provided.length > 0) return provided;
    const template = checklistForType(type);
    return template.length > 0 ? template : undefined;
  }

  async createManualTask(orgId: string, input: CreateManualTaskInput, createdByUserId?: string) {
    if (!input.title?.trim()) throw new BadRequestException('Title is required');
    await this.assertLinksBelongToOrg(orgId, input);

    const type = input.type ?? 'CUSTOM';
    const checklist = this.resolveChecklist(type, input.checklist);

    const task = await this.prisma.orgTask.create({
      data: {
        organizationId: orgId,
        title: input.title.trim(),
        description: input.description,
        category: input.category,
        type,
        priority: input.priority ?? 'NORMAL',
        source: input.source ?? null,
        sourceType: input.sourceType ?? 'MANUAL',
        vehicleId: input.vehicleId ?? undefined,
        bookingId: input.bookingId ?? undefined,
        customerId: input.customerId ?? undefined,
        vendorId: input.vendorId ?? undefined,
        alertId: input.alertId ?? undefined,
        documentId: input.documentId ?? undefined,
        fineId: input.fineId ?? undefined,
        invoiceId: input.invoiceId ?? undefined,
        assignedUserId: input.assignedUserId ?? undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        estimatedCostCents: input.estimatedCostCents ?? undefined,
        blocksVehicleAvailability: input.blocksVehicleAvailability ?? false,
        metadata: input.metadata,
        createdByUserId: createdByUserId ?? null,
        checklistItems: checklist
          ? {
              create: checklist.map((c, i) => ({
                title: c.title,
                description: c.description,
                sortOrder: c.sortOrder ?? i,
              })),
            }
          : undefined,
      },
    });

    await this.recordEvent(task.id, 'CREATED', createdByUserId, null, task.status);
    if (task.priority === 'CRITICAL') this.notify('created_critical', task);
    return this.getTaskById(task.id, orgId);
  }

  /**
   * Backward-compatible create (used by fines/invoices and the legacy
   * controller path). Maps the legacy `category`+priority shape onto the new
   * model, inferring a sensible TaskType/TaskSource when not given.
   */
  async create(
    orgId: string,
    data: {
      title: string;
      description?: string;
      category?: string;
      type?: TaskType;
      sourceType?: TaskSource;
      source?: string;
      priority?: TaskPriority;
      vehicleId?: string;
      bookingId?: string;
      customerId?: string;
      vendorId?: string;
      alertId?: string;
      documentId?: string;
      fineId?: string;
      invoiceId?: string;
      assignedUserId?: string;
      dueDate?: string;
      estimatedCostCents?: number;
      blocksVehicleAvailability?: boolean;
    },
    createdByUserId?: string,
  ) {
    return this.createManualTask(
      orgId,
      {
        ...data,
        type: data.type ?? this.inferTypeFromCategory(data.category),
        sourceType: data.sourceType ?? (data.source ? 'SYSTEM' : 'MANUAL'),
      },
      createdByUserId,
    );
  }

  private inferTypeFromCategory(category?: string): TaskType {
    switch ((category || '').toLowerCase()) {
      case 'invoice':
        return 'INVOICE_REQUIRED';
      case 'repair':
        return 'REPAIR';
      case 'cleaning':
        return 'VEHICLE_CLEANING';
      case 'inspection':
      case 'tüv':
      case 'bokraft':
        return 'VEHICLE_INSPECTION';
      case 'maintenance':
      case 'service':
        return 'VEHICLE_SERVICE';
      default:
        return 'CUSTOM';
    }
  }

  // ─── Update / status transitions ──────────────────────────────────────────

  async updateTask(orgId: string, id: string, data: UpdateTaskInput, actorUserId?: string) {
    const existing = await this.loadTaskOrThrow(id, orgId);
    if (existing.status === 'DONE' || existing.status === 'CANCELLED') {
      throw new BadRequestException('A completed or cancelled task can no longer be edited');
    }
    if (data.assignedUserId) await this.assertLinksBelongToOrg(orgId, { assignedUserId: data.assignedUserId });

    const update: Prisma.OrgTaskUpdateInput = {};
    if (data.title !== undefined) update.title = data.title;
    if (data.description !== undefined) update.description = data.description;
    if (data.category !== undefined) update.category = data.category;
    if (data.priority !== undefined) update.priority = data.priority;
    if (data.dueDate !== undefined) update.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.assignedUserId !== undefined) update.assignedUserId = data.assignedUserId;
    if (data.estimatedCostCents !== undefined) update.estimatedCostCents = data.estimatedCostCents;
    if (data.actualCostCents !== undefined) update.actualCostCents = data.actualCostCents;
    if (data.metadata !== undefined) update.metadata = data.metadata;
    if (data.blocksVehicleAvailability !== undefined) {
      update.blocksVehicleAvailability = data.blocksVehicleAvailability;
    }
    update.updatedByUserId = actorUserId ?? null;

    await this.prisma.orgTask.update({ where: { id }, data: update });
    await this.recordEvent(id, 'UPDATED', actorUserId);
    return this.getTaskById(id, orgId);
  }

  /**
   * Backward-compatible update (legacy controller path). Supports the old
   * direct `status` write but routes it through the validated state machine.
   */
  async update(
    id: string,
    data: { title?: string; description?: string; status?: TaskStatus; priority?: TaskPriority; assignedUserId?: string; dueDate?: string },
    orgId?: string,
  ) {
    if (!orgId) {
      const t = await this.prisma.orgTask.findUnique({ where: { id }, select: { organizationId: true } });
      if (!t) throw new NotFoundException('Task not found');
      orgId = t.organizationId;
    }
    if (data.status) {
      await this.changeStatus(orgId, id, data.status);
    }
    const rest: UpdateTaskInput = {};
    if (data.title !== undefined) rest.title = data.title;
    if (data.description !== undefined) rest.description = data.description;
    if (data.priority !== undefined) rest.priority = data.priority;
    if (data.assignedUserId !== undefined) rest.assignedUserId = data.assignedUserId;
    if (data.dueDate !== undefined) rest.dueDate = data.dueDate;
    if (Object.keys(rest).length > 0) {
      // Re-load: status change above may have closed the task.
      const cur = await this.loadTaskOrThrow(id, orgId);
      if (cur.status !== 'DONE' && cur.status !== 'CANCELLED') {
        return this.updateTask(orgId, id, rest);
      }
    }
    return this.getTaskById(id, orgId);
  }

  private assertTransition(from: TaskStatus, to: TaskStatus): void {
    if (from === to) return;
    if (!STATUS_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(`Invalid status transition ${from} → ${to}`);
    }
  }

  private async changeStatus(
    orgId: string,
    id: string,
    to: TaskStatus,
    extra?: { resolutionNote?: string; actualCostCents?: number },
    actorUserId?: string,
  ) {
    const task = await this.loadTaskOrThrow(id, orgId);
    this.assertTransition(task.status, to);
    if (task.status === to) return this.getTaskById(id, orgId);

    const now = new Date();
    const update: Prisma.OrgTaskUpdateInput = { status: to, updatedByUserId: actorUserId ?? null };

    if (to === 'IN_PROGRESS' && !task.startedAt) update.startedAt = now;
    if (to === 'DONE') {
      if (RESOLUTION_REQUIRED_TYPES.includes(task.type) && !extra?.resolutionNote?.trim()) {
        throw new BadRequestException(`A resolution note is required to complete a ${task.type} task`);
      }
      update.completedAt = now;
      if (extra?.resolutionNote !== undefined) update.resolutionNote = extra.resolutionNote;
      if (extra?.actualCostCents !== undefined) update.actualCostCents = extra.actualCostCents;
    }
    if (to === 'CANCELLED') update.cancelledAt = now;

    await this.prisma.orgTask.update({ where: { id }, data: update });
    await this.recordEvent(id, 'STATUS_CHANGED', actorUserId, task.status, to);
    const result = await this.getTaskById(id, orgId);
    if (to === 'DONE') this.notify('completed', result);
    if (to === 'CANCELLED') this.notify('cancelled', result);
    return result;
  }

  async assignTask(orgId: string, id: string, assignedUserId: string | null, actorUserId?: string) {
    const task = await this.loadTaskOrThrow(id, orgId);
    if (task.status === 'DONE' || task.status === 'CANCELLED') {
      throw new BadRequestException('A completed or cancelled task can no longer be assigned');
    }
    if (assignedUserId) await this.assertLinksBelongToOrg(orgId, { assignedUserId });
    await this.prisma.orgTask.update({ where: { id }, data: { assignedUserId, updatedByUserId: actorUserId ?? null } });
    await this.recordEvent(id, 'ASSIGNED', actorUserId, task.assignedUserId, assignedUserId);
    const result = await this.getTaskById(id, orgId);
    if (assignedUserId) this.notify('assigned', result);
    return result;
  }

  async startTask(orgId: string, id: string, actorUserId?: string) {
    return this.changeStatus(orgId, id, 'IN_PROGRESS', undefined, actorUserId);
  }

  async moveTaskToWaiting(orgId: string, id: string, actorUserId?: string) {
    return this.changeStatus(orgId, id, 'WAITING', undefined, actorUserId);
  }

  async completeTask(
    orgId: string,
    id: string,
    extra?: { resolutionNote?: string; actualCostCents?: number },
    actorUserId?: string,
  ) {
    return this.changeStatus(orgId, id, 'DONE', extra, actorUserId);
  }

  async cancelTask(orgId: string, id: string, actorUserId?: string) {
    return this.changeStatus(orgId, id, 'CANCELLED', undefined, actorUserId);
  }

  // ─── Child resources ───────────────────────────────────────────────────────

  async addComment(orgId: string, taskId: string, body: string, userId?: string) {
    await this.loadTaskOrThrow(taskId, orgId);
    if (!body?.trim()) throw new BadRequestException('Comment body is required');
    await this.prisma.taskComment.create({ data: { taskId, body: body.trim(), userId: userId ?? null } });
    await this.recordEvent(taskId, 'COMMENT_ADDED', userId);
    return this.getTaskById(taskId, orgId);
  }

  async addChecklistItem(
    orgId: string,
    taskId: string,
    item: { title: string; description?: string; sortOrder?: number },
    actorUserId?: string,
  ) {
    await this.loadTaskOrThrow(taskId, orgId);
    if (!item.title?.trim()) throw new BadRequestException('Checklist item title is required');
    const count = await this.prisma.taskChecklistItem.count({ where: { taskId } });
    await this.prisma.taskChecklistItem.create({
      data: { taskId, title: item.title.trim(), description: item.description, sortOrder: item.sortOrder ?? count },
    });
    await this.recordEvent(taskId, 'CHECKLIST_ITEM_ADDED', actorUserId);
    return this.getTaskById(taskId, orgId);
  }

  async updateChecklistItem(
    orgId: string,
    taskId: string,
    itemId: string,
    patch: { title?: string; description?: string; sortOrder?: number; isDone?: boolean },
    actorUserId?: string,
  ) {
    await this.loadTaskOrThrow(taskId, orgId);
    const item = await this.prisma.taskChecklistItem.findFirst({ where: { id: itemId, taskId }, select: { id: true } });
    if (!item) throw new NotFoundException('Checklist item not found');
    const data: Prisma.TaskChecklistItemUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
    if (patch.isDone !== undefined) {
      data.isDone = patch.isDone;
      data.completedAt = patch.isDone ? new Date() : null;
      data.completedByUserId = patch.isDone ? actorUserId ?? null : null;
    }
    await this.prisma.taskChecklistItem.update({ where: { id: itemId }, data });
    return this.getTaskById(taskId, orgId);
  }

  async addAttachment(
    orgId: string,
    taskId: string,
    attachment: { fileUrl: string; fileName?: string; mimeType?: string; size?: number },
    uploadedByUserId?: string,
  ) {
    await this.loadTaskOrThrow(taskId, orgId);
    if (!attachment.fileUrl?.trim()) throw new BadRequestException('fileUrl is required');
    await this.prisma.taskAttachment.create({
      data: {
        taskId,
        fileUrl: attachment.fileUrl,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        uploadedByUserId: uploadedByUserId ?? null,
      },
    });
    await this.recordEvent(taskId, 'ATTACHMENT_ADDED', uploadedByUserId);
    return this.getTaskById(taskId, orgId);
  }

  // ─── System / auto-task helpers (dedup) ─────────────────────────────────────
  // The bridge + automation services use these. A single task per generatedKey
  // (`dedupKey`) escalates instead of duplicating across runs.

  async findActiveByDedup(orgId: string, dedupKey: string) {
    const existing = await this.prisma.orgTask.findFirst({
      where: { organizationId: orgId, dedupKey },
    });
    if (!existing) return null;
    if (existing.status === 'DONE' || existing.status === 'CANCELLED') return null;
    return existing;
  }

  /**
   * Idempotently materializes a system task identified by `dedupKey`.
   * Open/in-progress/waiting task with this key → updated in place (escalation).
   * No task, or only a DONE/CANCELLED one → a fresh task is created (the stale
   * closed row's key is parked so the recurrence is tracked anew).
   */
  async upsertByDedup(
    orgId: string,
    dedupKey: string,
    payload: {
      title: string;
      description?: string;
      category?: string;
      type?: TaskType;
      sourceType?: TaskSource;
      priority?: TaskPriority;
      vehicleId?: string | null;
      bookingId?: string | null;
      customerId?: string | null;
      vendorId?: string | null;
      alertId?: string | null;
      documentId?: string | null;
      fineId?: string | null;
      invoiceId?: string | null;
      source: string;
      dueDate?: Date | null;
      metadata?: Prisma.InputJsonValue;
      // Applied only when a brand-new task is created (never on escalation).
      checklist?: Array<{ title: string; description?: string; sortOrder?: number }>;
      blocksVehicleAvailability?: boolean;
    },
  ) {
    const existing = await this.prisma.orgTask.findFirst({
      where: { organizationId: orgId, dedupKey },
    });
    const reusable =
      !!existing &&
      existing.organizationId === orgId &&
      existing.status !== 'DONE' &&
      existing.status !== 'CANCELLED';

    if (reusable) {
      const task = await this.prisma.orgTask.update({
        where: { id: existing!.id },
        data: {
          title: payload.title,
          description: payload.description,
          category: payload.category,
          type: payload.type ?? existing!.type,
          sourceType: payload.sourceType ?? existing!.sourceType,
          priority: payload.priority ?? 'NORMAL',
          vehicleId: payload.vehicleId ?? existing!.vehicleId,
          bookingId: payload.bookingId ?? existing!.bookingId,
          customerId: payload.customerId ?? existing!.customerId,
          vendorId: payload.vendorId ?? existing!.vendorId,
          alertId: payload.alertId ?? existing!.alertId,
          documentId: payload.documentId ?? existing!.documentId,
          fineId: payload.fineId ?? existing!.fineId,
          invoiceId: payload.invoiceId ?? existing!.invoiceId,
          dueDate: payload.dueDate ?? null,
          source: payload.source,
          metadata: payload.metadata,
          blocksVehicleAvailability: payload.blocksVehicleAvailability ?? existing!.blocksVehicleAvailability,
        },
      });
      return this.format(task);
    }

    if (existing && existing.organizationId === orgId) {
      await this.prisma.orgTask.update({
        where: { id: existing.id },
        data: { dedupKey: `${dedupKey}:closed:${existing.id}` },
      });
    }

    const taskType = payload.type ?? 'CUSTOM';
    const checklist = this.resolveChecklist(taskType, payload.checklist);

    const task = await this.prisma.orgTask.create({
      data: {
        organizationId: orgId,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        type: taskType,
        sourceType: payload.sourceType ?? 'SYSTEM',
        priority: payload.priority ?? 'NORMAL',
        vehicleId: payload.vehicleId ?? undefined,
        bookingId: payload.bookingId ?? undefined,
        customerId: payload.customerId ?? undefined,
        vendorId: payload.vendorId ?? undefined,
        alertId: payload.alertId ?? undefined,
        documentId: payload.documentId ?? undefined,
        fineId: payload.fineId ?? undefined,
        invoiceId: payload.invoiceId ?? undefined,
        dueDate: payload.dueDate ?? null,
        source: payload.source,
        dedupKey,
        metadata: payload.metadata,
        blocksVehicleAvailability: payload.blocksVehicleAvailability ?? false,
        checklistItems: checklist
          ? {
              create: checklist.map((c, i) => ({
                  title: c.title,
                  description: c.description,
                  sortOrder: c.sortOrder ?? i,
                })),
            }
          : undefined,
      },
    });
    await this.recordEvent(task.id, 'CREATED', null, null, task.status, { auto: true });
    return this.format(task);
  }

  /**
   * Auto-closes system tasks whose underlying condition no longer fires. Only
   * touches rows whose `source` is in the whitelist and whose `dedupKey` is not
   * among this run's keys — manual tasks are never affected.
   */
  async closeStaleInsightTasks(orgId: string, activeDedupKeys: string[], sources: string[]): Promise<number> {
    const tasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        source: { in: sources },
        status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] },
        dedupKey: { notIn: activeDedupKeys.length > 0 ? activeDedupKeys : ['__never__'] },
      },
      select: { id: true },
    });
    if (tasks.length === 0) return 0;

    const now = new Date();
    await this.prisma.$transaction(
      tasks.map((t) =>
        this.prisma.orgTask.update({ where: { id: t.id }, data: { status: 'DONE', completedAt: now } }),
      ),
    );
    return tasks.length;
  }

  /**
   * Auto-closes superseded booking lifecycle tasks when a booking advances to a
   * new phase. Scoped to one booking so prep/pickup/return keys from prior
   * phases are completed without touching other bookings.
   */
  async closeStaleBookingLifecycleTasks(
    orgId: string,
    bookingId: string,
    activeDedupKeys: string[],
  ): Promise<number> {
    const tasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        bookingId,
        source: 'BOOKING',
        status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] },
        dedupKey: { notIn: activeDedupKeys.length > 0 ? activeDedupKeys : ['__never__'] },
      },
      select: { id: true },
    });
    if (tasks.length === 0) return 0;

    const now = new Date();
    await this.prisma.$transaction(
      tasks.map((t) =>
        this.prisma.orgTask.update({ where: { id: t.id }, data: { status: 'DONE', completedAt: now } }),
      ),
    );
    return tasks.length;
  }
}

import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ActivityAction, ActivityEntity, Prisma, TaskCompletionMode, TaskPriority, TaskSource, TaskStatus, TaskType } from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import type { PermissionActor } from '@shared/auth/permission.util';
import { checklistForType, type TaskChecklistTemplateItem } from './task-templates';
import {
  aggregateChecklistProgressByTaskId,
  calculateChecklistProgress,
  calculateChecklistProgressFromCounts,
  type ChecklistProgressCounts,
} from './checklist-progress.util';
import { assertManualCompletionAllowedByChecklist, getOpenRequiredChecklistItems } from './task-checklist-completion.policy';
import {
  assertTaskChecklistCompletionOverrideAllowed,
  resolveManualCompletionChecklistGate,
  type ManualCompletionOverrideInput,
  type ResolvedManualCompletionChecklistGate,
} from './task-checklist-override.policy';
import { TaskLinkedObjectResolverService } from './task-linked-object-resolver.service';
import {
  buildTaskDetailNormalizedSections,
  buildUserDisplayName,
  type LegacyFormattedTask,
} from './task-detail-view.builder';
import type { TaskDetailResponse, TaskUserRef } from './task-detail-view.types';
import { canOverrideTaskChecklistCompletion } from './task-checklist-override.policy';
import { RESOLUTION_REQUIRED_TYPES } from './task-resolution.constants';
import { assertValidManualResolutionCode } from './task-resolution-policy.util';
import {
  supportTicketFollowupDedupKey,
  voiceConversationTaskDedupKey,
} from './automation/task-automation-rule.util';
import {
  ACTIVE_TASK_STATUSES,
  assertTaskTransition,
  isActiveTaskStatus,
} from './task-transition.policy';
import {
  buildTaskBucketOrderBy,
  buildTaskBucketWhere,
  classifyPrimaryTaskBucket,
  createTaskBucketContext,
  emptyTaskBucketSummaryCounts,
  isTaskActivated,
  isTaskOverdue,
  TASK_OPERATOR_BUCKETS,
  type TaskOperatorBucket,
} from './task-bucket.util';
import { DEFAULT_TARIFF_TIMEZONE } from '@modules/pricing/tariff-instant.util';

// ─── Domain constants (V4.8.3 Task Action Layer) ─────────────────────────

export { RESOLUTION_REQUIRED_TYPES } from './task-resolution.constants';

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
  serviceCaseId?: string | null;
  stationId?: string | null;
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
  activatesAt?: string | Date | null;
  estimatedCostCents?: number | null;
  estimatedDurationMinutes?: number | null;
  metadata?: Prisma.InputJsonValue;
  checklist?: Array<{ title: string; description?: string; sortOrder?: number; isRequired?: boolean }>;
  blocksVehicleAvailability?: boolean;
  initialNote?: string;
  /** When set, creation is idempotent via upsertByDedup (system/integration paths). */
  dedupKey?: string;
}

export interface AutoResolveTaskInput {
  resolutionCode: string;
  reason: string;
  metadata?: Prisma.InputJsonValue;
  resolvedAt?: string | Date;
}

export interface SupersedeTaskInput {
  reason: string;
  resolutionCode: string;
  supersededByTaskId?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface CompleteTaskInput {
  resolutionNote?: string;
  resolutionCode?: string;
  actualCostCents?: number;
  overrideIncompleteChecklist?: boolean;
  overrideReason?: string;
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
  serviceCaseId?: string;
  invoiceId?: string;
  stationId?: string;
  activatesFrom?: string;
  activatesTo?: string;
  dueFrom?: string;
  dueTo?: string;
  overdue?: boolean;
  search?: string;
  bucket?: TaskOperatorBucket;
  includeCancelled?: boolean;
}

export interface BulkTaskActionInput {
  taskIds: string[];
  action: 'assign' | 'set_priority' | 'shift_due_date' | 'set_waiting' | 'cancel';
  assignedUserId?: string | null;
  priority?: TaskPriority;
  dueDate?: string;
  dueDateShiftDays?: number;
}

export interface BulkTaskActionItemResult {
  taskId: string;
  success: boolean;
  error?: string;
}

export interface BulkTaskActionResult {
  results: BulkTaskActionItemResult[];
  succeeded: number;
  failed: number;
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

  /** Limits concurrent terminal transitions per batch (each task still gets its own audit event). */
  private static readonly TERMINAL_TRANSITION_BATCH_SIZE = 20;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
    private readonly linkedObjectResolver: TaskLinkedObjectResolverService,
  ) {}

  // ─── Serialization ─────────────────────────────────────────────────────

  private effectiveActivatesAt(t: { activatesAt?: Date | null; createdAt: Date }): Date {
    return t.activatesAt ?? t.createdAt;
  }

  private isOverdue(
    t: {
      dueDate: Date | null;
      status: TaskStatus;
      priority: TaskPriority;
      activatesAt?: Date | null;
      createdAt: Date;
      assignedUserId?: string | null;
      blocksVehicleAvailability?: boolean;
    },
    now = new Date(),
  ): boolean {
    return isTaskOverdue(
      {
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        activatesAt: t.activatesAt ?? null,
        createdAt: t.createdAt,
        assignedUserId: t.assignedUserId ?? null,
        blocksVehicleAvailability: t.blocksVehicleAvailability ?? false,
      },
      now,
    );
  }

  private format(t: OrgTaskRow, now = new Date(), checklistProgressCounts?: ChecklistProgressCounts | null) {
    const isTerminal = t.status === 'DONE' || t.status === 'CANCELLED';
    const checklistProgress =
      'checklistItems' in t && t.checklistItems
        ? calculateChecklistProgress(
            t.checklistItems.map((c) => ({
              isDone: c.isDone,
              isRequired: c.isRequired ?? false,
            })),
            { isTerminal },
          )
        : checklistProgressCounts
          ? calculateChecklistProgressFromCounts(checklistProgressCounts, { isTerminal })
          : calculateChecklistProgress([], { isTerminal });

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
      serviceCaseId: t.serviceCaseId || null,
      assignedUserId: t.assignedUserId || null,
      createdByUserId: t.createdByUserId || null,
      updatedByUserId: t.updatedByUserId || null,
      estimatedCostCents: t.estimatedCostCents ?? null,
      actualCostCents: t.actualCostCents ?? null,
      resolutionNote: t.resolutionNote || null,
      activatesAt: this.effectiveActivatesAt(t).toISOString(),
      completionMode: t.completionMode ?? null,
      resolutionCode: t.resolutionCode ?? null,
      completedByUserId: t.completedByUserId ?? null,
      supersededByTaskId: t.supersededByTaskId ?? null,
      estimatedDurationMinutes: t.estimatedDurationMinutes ?? null,
      blocksVehicleAvailability: t.blocksVehicleAvailability ?? false,
      metadata: t.metadata ?? null,
      isOverdue: this.isOverdue(t, now),
      dueDate: (t.dueDate as Date)?.toISOString?.() || null,
      startedAt: (t.startedAt as Date)?.toISOString?.() || null,
      completedAt: (t.completedAt as Date)?.toISOString?.() || null,
      cancelledAt: (t.cancelledAt as Date)?.toISOString?.() || null,
      createdAt: (t.createdAt as Date)?.toISOString?.() || '',
      updatedAt: (t.updatedAt as Date)?.toISOString?.() || '',
      checklistProgress,
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
      isRequired: c.isRequired ?? false,
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

  private async assertOrgMember(orgId: string, userId: string): Promise<void> {
    const member = await this.prisma.organizationMembership.findFirst({
      where: { userId, organizationId: orgId },
      select: { id: true },
    });
    if (!member) {
      throw new BadRequestException('User is not a member of this organization');
    }
  }

  private resolveTaskStationId(input: {
    stationId?: string | null;
    metadata?: Prisma.InputJsonValue;
  }): string | undefined {
    if (input.stationId?.trim()) return input.stationId.trim();
    const meta = input.metadata;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined;
    const stationId = (meta as Record<string, unknown>).stationId;
    return typeof stationId === 'string' && stationId.trim() ? stationId.trim() : undefined;
  }

  private async assertLinksBelongToOrg(orgId: string, links: TaskLinks): Promise<void> {
    if (links.assignedUserId) {
      await this.assertOrgMember(orgId, links.assignedUserId);
    }
    const checks: Array<[string | null | undefined, () => Promise<unknown>, string]> = [
      [links.vehicleId, () => this.prisma.vehicle.findFirst({ where: { id: links.vehicleId!, organizationId: orgId }, select: { id: true } }), 'Vehicle'],
      [links.bookingId, () => this.prisma.booking.findFirst({ where: { id: links.bookingId!, organizationId: orgId }, select: { id: true } }), 'Booking'],
      [links.customerId, () => this.prisma.customer.findFirst({ where: { id: links.customerId!, organizationId: orgId }, select: { id: true } }), 'Customer'],
      [links.vendorId, () => this.prisma.vendor.findFirst({ where: { id: links.vendorId!, organizationId: orgId }, select: { id: true } }), 'Vendor'],
      [links.alertId, () => this.prisma.dashboardInsight.findFirst({ where: { id: links.alertId!, organizationId: orgId }, select: { id: true } }), 'Alert'],
      [links.fineId, () => this.prisma.fine.findFirst({ where: { id: links.fineId!, organizationId: orgId }, select: { id: true } }), 'Fine'],
      [links.invoiceId, () => this.prisma.orgInvoice.findFirst({ where: { id: links.invoiceId!, organizationId: orgId }, select: { id: true } }), 'Invoice'],
      [links.stationId, () => this.prisma.station.findFirst({ where: { id: links.stationId!, organizationId: orgId }, select: { id: true } }), 'Station'],
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
    if (links.serviceCaseId) {
      const sc = await this.prisma.serviceCase.findFirst({
        where: { id: links.serviceCaseId, organizationId: orgId },
        select: { id: true, vehicleId: true, vendorId: true, status: true },
      });
      if (!sc) throw new BadRequestException('Service case not found in this organization');
      if (sc.status === 'COMPLETED' || sc.status === 'CANCELLED') {
        throw new BadRequestException('Cannot link tasks to a completed or cancelled service case');
      }
      if (links.vehicleId && links.vehicleId !== sc.vehicleId) {
        throw new BadRequestException('Task vehicle does not match service case vehicle');
      }
      if (links.vendorId && sc.vendorId && links.vendorId !== sc.vendorId) {
        throw new BadRequestException('Task vendor does not match service case vendor');
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
    await this.prisma.taskEvent.create({
      data: { taskId, type, actorUserId: actorUserId ?? null, oldValue: oldValue ?? null, newValue: newValue ?? null, metadata },
    });
  }

  /** Status transitions only — must run inside a transaction; failures propagate. */
  private async recordStatusChangedEvent(
    tx: Prisma.TransactionClient,
    taskId: string,
    actorUserId: string | null | undefined,
    oldValue: TaskStatus,
    newValue: TaskStatus,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.taskEvent.create({
      data: {
        taskId,
        type: 'STATUS_CHANGED',
        actorUserId: actorUserId ?? null,
        oldValue,
        newValue,
        metadata,
      },
    });
  }

  private statusChangedEventMetadata(
    to: TaskStatus,
    checklistGate?: ResolvedManualCompletionChecklistGate,
  ): Prisma.InputJsonValue | undefined {
    if (to === 'DONE' || to === 'CANCELLED') {
      const metadata: Record<string, unknown> = {
        completionMode: to === 'DONE' ? TaskCompletionMode.MANUAL : null,
        resolutionKind: to === 'DONE' ? TaskCompletionMode.MANUAL : null,
      };
      if (checklistGate?.checklistOverridden) {
        metadata.overriddenBlockers = ['CHECKLIST'];
        metadata.checklistOverride = true;
      }
      return metadata as Prisma.InputJsonValue;
    }
    return { transition: to };
  }

  private async recordChecklistCompletionOverriddenEvent(
    tx: Prisma.TransactionClient,
    taskId: string,
    actorUserId: string | null | undefined,
    fromStatus: TaskStatus,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.taskEvent.create({
      data: {
        taskId,
        type: 'CHECKLIST_COMPLETION_OVERRIDDEN',
        actorUserId: actorUserId ?? null,
        oldValue: fromStatus,
        newValue: 'DONE',
        metadata,
      },
    });
  }

  private buildAutoResolvedEventMetadata(
    resolutionCode: string,
    reason: string,
    metadata?: Prisma.InputJsonValue,
  ): Prisma.InputJsonValue {
    const base: Record<string, unknown> = {
      resolutionCode,
      reason,
      completionMode: TaskCompletionMode.AUTO_RESOLVED,
      resolutionKind: TaskCompletionMode.AUTO_RESOLVED,
    };
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      Object.assign(base, metadata as Record<string, unknown>);
    } else if (metadata !== undefined) {
      base.context = metadata;
    }
    return base as Prisma.InputJsonValue;
  }

  private async recordAutoResolvedEvent(
    tx: Prisma.TransactionClient,
    taskId: string,
    oldStatus: TaskStatus,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.taskEvent.create({
      data: {
        taskId,
        type: 'AUTO_RESOLVED',
        actorUserId: null,
        oldValue: oldStatus,
        newValue: 'DONE',
        metadata,
      },
    });
  }

  private buildSupersededEventMetadata(
    resolutionCode: string,
    reason: string,
    supersededByTaskId: string | null,
    metadata?: Prisma.InputJsonValue,
  ): Prisma.InputJsonValue {
    const base: Record<string, unknown> = {
      resolutionCode,
      reason,
      completionMode: TaskCompletionMode.SUPERSEDED,
      resolutionKind: TaskCompletionMode.SUPERSEDED,
      supersededByTaskId,
    };
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      Object.assign(base, metadata as Record<string, unknown>);
    } else if (metadata !== undefined) {
      base.context = metadata;
    }
    return base as Prisma.InputJsonValue;
  }

  private async recordSupersededEvent(
    tx: Prisma.TransactionClient,
    taskId: string,
    oldStatus: TaskStatus,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.taskEvent.create({
      data: {
        taskId,
        type: 'SUPERSEDED',
        actorUserId: null,
        oldValue: oldStatus,
        newValue: 'DONE',
        metadata,
      },
    });
  }

  /**
   * Walks the superseded-by chain from `successorId` and rejects if `taskId`
   * would appear in the chain (direct or indirect cycle).
   */
  private async assertNoSupersedeCycle(orgId: string, taskId: string, successorId: string): Promise<void> {
    const visited = new Set<string>();
    let current: string | null = successorId;
    while (current) {
      if (current === taskId) {
        throw new BadRequestException('supersededByTaskId would create a supersede cycle');
      }
      if (visited.has(current)) break;
      visited.add(current);
      const row: { supersededByTaskId: string | null } | null = await this.prisma.orgTask.findFirst({
        where: { id: current, organizationId: orgId },
        select: { supersededByTaskId: true },
      });
      if (!row) break;
      current = row.supersededByTaskId;
    }
  }

  private isIdempotentSupersedeState(
    task: { status: TaskStatus; completionMode: TaskCompletionMode | null; supersededByTaskId: string | null },
    supersededByTaskId: string | null,
  ): boolean {
    return (
      task.status === 'DONE' &&
      task.completionMode === TaskCompletionMode.SUPERSEDED &&
      (task.supersededByTaskId ?? null) === supersededByTaskId
    );
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

  private assertChecklistMutable(task: { status: TaskStatus }): void {
    if (task.status === 'DONE' || task.status === 'CANCELLED') {
      throw new BadRequestException(
        'Checklistenpunkte können nach Abschluss oder Stornierung nicht mehr geändert werden.',
      );
    }
  }

  /** Tenant-scoped load + canonical progress gate for MANUAL completion only. */
  private async resolveManualCompletionChecklistGate(
    orgId: string,
    taskId: string,
    actor: PermissionActor | undefined,
    override?: ManualCompletionOverrideInput,
  ): Promise<ResolvedManualCompletionChecklistGate> {
    const items = await this.prisma.taskChecklistItem.findMany({
      where: { taskId, task: { id: taskId, organizationId: orgId } },
      select: { id: true, title: true, isDone: true, isRequired: true },
      orderBy: { sortOrder: 'asc' },
    });
    const openRequiredItems = getOpenRequiredChecklistItems(items);
    const gate = resolveManualCompletionChecklistGate(openRequiredItems, override);

    if (openRequiredItems.length > 0 && !gate.checklistOverridden) {
      assertManualCompletionAllowedByChecklist(items);
    }

    if (gate.checklistOverridden) {
      await assertTaskChecklistCompletionOverrideAllowed(this.prisma, actor, orgId);
    }

    return gate;
  }

  private async recordTaskChecklistOverrideActivityLog(
    orgId: string,
    taskId: string,
    actorUserId: string | undefined,
    gate: ResolvedManualCompletionChecklistGate,
  ): Promise<void> {
    if (!gate.checklistOverridden || !gate.overrideReason) return;

    try {
      await this.activityLog.log({
        organizationId: orgId,
        userId: actorUserId,
        action: ActivityAction.UPDATE,
        entity: ActivityEntity.TASK,
        entityId: taskId,
        description: `Task abgeschlossen trotz ${gate.openRequiredItems.length} offener Pflicht-Checklistenpunkte (Manager-Override)`,
        metaJson: {
          kind: 'TASK_CHECKLIST_COMPLETION_OVERRIDE',
          reason: gate.overrideReason,
          openRequiredItems: gate.openRequiredItems,
          remainingRequiredItems: gate.openRequiredItems.length,
        },
      });
    } catch (err: any) {
      this.logger.warn(
        `Failed to record activity log for checklist override on task ${taskId}: ${err?.message ?? err}`,
      );
    }
  }

  // ─── Read APIs ───────────────────────────────────────────────────────────

  async findByOrg(orgId: string) {
    return this.listTasks(orgId, {});
  }

  async listTasks(orgId: string, filters: ListTasksFilters) {
    const now = new Date();
    const timeZone = await this.resolveOrgTimezone(orgId);
    const bucketContext = createTaskBucketContext(now, timeZone);
    const where: Prisma.OrgTaskWhereInput = { organizationId: orgId };
    const andFilters: Prisma.OrgTaskWhereInput[] = [];

    const vehicleId = filters.vehicleId?.trim() || undefined;
    const vendorId = filters.vendorId?.trim() || undefined;
    const bookingId = filters.bookingId?.trim() || undefined;
    const customerId = filters.customerId?.trim() || undefined;
    const assignedUserId = filters.assignedUserId?.trim() || undefined;
    const alertId = filters.alertId?.trim() || undefined;
    const documentId = filters.documentId?.trim() || undefined;
    const serviceCaseId = filters.serviceCaseId?.trim() || undefined;
    const invoiceId = filters.invoiceId?.trim() || undefined;
    const stationId = filters.stationId?.trim() || undefined;
    const search = filters.search?.trim() || undefined;

    if (filters.status) where.status = Array.isArray(filters.status) ? { in: filters.status } : filters.status;
    if (filters.priority) where.priority = Array.isArray(filters.priority) ? { in: filters.priority } : filters.priority;
    if (filters.type) where.type = Array.isArray(filters.type) ? { in: filters.type } : filters.type;
    if (filters.sourceType) where.sourceType = Array.isArray(filters.sourceType) ? { in: filters.sourceType } : filters.sourceType;
    if (assignedUserId) where.assignedUserId = assignedUserId;
    if (vehicleId) where.vehicleId = vehicleId;
    if (bookingId) where.bookingId = bookingId;
    if (customerId) where.customerId = customerId;
    if (vendorId) where.vendorId = vendorId;
    if (alertId) where.alertId = alertId;
    if (documentId) where.documentId = documentId;
    if (serviceCaseId) where.serviceCaseId = serviceCaseId;
    if (invoiceId) where.invoiceId = invoiceId;

    if (stationId) {
      andFilters.push({
        metadata: {
          path: ['stationId'],
          equals: stationId,
        },
      });
    }

    if (filters.activatesFrom || filters.activatesTo) {
      const activatesRange: Prisma.DateTimeFilter = {};
      if (filters.activatesFrom) activatesRange.gte = new Date(filters.activatesFrom);
      if (filters.activatesTo) activatesRange.lte = new Date(filters.activatesTo);
      andFilters.push({ activatesAt: activatesRange });
    }

    if (filters.dueFrom || filters.dueTo) {
      where.dueDate = {};
      if (filters.dueFrom) (where.dueDate as Prisma.DateTimeFilter).gte = new Date(filters.dueFrom);
      if (filters.dueTo) (where.dueDate as Prisma.DateTimeFilter).lte = new Date(filters.dueTo);
    }

    if (filters.overdue) {
      andFilters.push(buildTaskBucketWhere('OVERDUE', orgId, bucketContext));
    }

    if (filters.bucket) {
      andFilters.push(
        buildTaskBucketWhere(filters.bucket, orgId, bucketContext, {
          includeCancelled: filters.includeCancelled,
        }),
      );
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const mergedWhere: Prisma.OrgTaskWhereInput =
      andFilters.length > 0 ? { AND: [where, ...andFilters] } : where;

    const orderBy = filters.bucket
      ? buildTaskBucketOrderBy(filters.bucket)
      : [{ priority: 'desc' as const }, { dueDate: 'asc' as const }, { createdAt: 'desc' as const }];

    const tasks = await this.prisma.orgTask.findMany({
      where: mergedWhere,
      include: {
        attachments: {
          select: {
            id: true,
            fileUrl: true,
            fileName: true,
            mimeType: true,
            size: true,
            uploadedByUserId: true,
            createdAt: true,
          },
        },
      },
      orderBy,
    });

    const taskIds = tasks.map((t) => t.id);
    const checklistRows =
      taskIds.length > 0
        ? await this.prisma.taskChecklistItem.findMany({
            where: { taskId: { in: taskIds } },
            select: { taskId: true, isDone: true, isRequired: true },
          })
        : [];
    const checklistProgressByTaskId = aggregateChecklistProgressByTaskId(checklistRows);

    return tasks.map((t) => {
      const formatted = this.format(t, now, checklistProgressByTaskId.get(t.id) ?? null);
      return {
        ...formatted,
        isActivated: isTaskActivated(t, now),
        bucket: classifyPrimaryTaskBucket(t, bucketContext),
      };
    });
  }

  private async resolveOrgTimezone(orgId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true },
    });
    return org?.timezone?.trim() || DEFAULT_TARIFF_TIMEZONE;
  }

  async getTaskById(id: string, orgId: string, actor?: PermissionActor): Promise<TaskDetailResponse> {
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

    const linkedObjects = await this.linkedObjectResolver.resolveForTask(orgId, {
      vehicleId: task.vehicleId,
      bookingId: task.bookingId,
      customerId: task.customerId,
      vendorId: task.vendorId,
      alertId: task.alertId,
      documentId: task.documentId,
      fineId: task.fineId,
      invoiceId: task.invoiceId,
      serviceCaseId: task.serviceCaseId,
    });

    const legacyFormatted = this.format(task);
    const timeZone = await this.resolveOrgTimezone(orgId);
    const bucketContext = createTaskBucketContext(new Date(), timeZone);
    const usersById = await this.loadTaskDetailUsers(task, legacyFormatted.timeline ?? []);
    const canOverrideChecklist = await this.resolveCanOverrideChecklistCompletion(actor, orgId);
    const normalized = buildTaskDetailNormalizedSections({
      legacy: legacyFormatted as LegacyFormattedTask,
      linkedObjects,
      usersById,
      blocksVehicleAvailability: task.blocksVehicleAvailability ?? false,
      canOverrideChecklist,
      bucketContext,
    });

    return {
      ...legacyFormatted,
      ...normalized,
      timeline: normalized.timeline,
    };
  }

  private async loadTaskDetailUsers(
    task: {
      assignedUserId: string | null;
      createdByUserId: string | null;
      completedByUserId: string | null;
      comments?: Array<{ userId: string | null }>;
    },
    timeline: Array<{ actorUserId: string | null }>,
  ): Promise<Map<string, TaskUserRef>> {
    const ids = new Set<string>();
    if (task.assignedUserId) ids.add(task.assignedUserId);
    if (task.createdByUserId) ids.add(task.createdByUserId);
    if (task.completedByUserId) ids.add(task.completedByUserId);
    for (const comment of task.comments ?? []) {
      if (comment.userId) ids.add(comment.userId);
    }
    for (const event of timeline) {
      if (event.actorUserId) ids.add(event.actorUserId);
    }

    if (ids.size === 0) return new Map();

    const rows = await this.prisma.user.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true, firstName: true, lastName: true, email: true },
    });

    return new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          displayName: buildUserDisplayName(row),
          email: row.email,
        },
      ]),
    );
  }

  private async resolveCanOverrideChecklistCompletion(
    actor: PermissionActor | undefined,
    orgId: string,
  ): Promise<boolean> {
    if (!actor?.id) return false;
    if (actor.platformRole === 'MASTER_ADMIN') return true;

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: actor.id,
        organizationId: orgId,
        status: 'ACTIVE',
      },
      select: { role: true, permissions: true },
    });

    return canOverrideTaskChecklistCompletion(actor, membership);
  }

  /** Backward-compatible alias (used by the controller). Returns full detail. */
  async findById(id: string, orgId?: string) {
    if (orgId) return this.getTaskById(id, orgId);
    const task = await this.prisma.orgTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    return this.format(task);
  }

  async getTasksForVehicle(orgId: string, vehicleId: string, opts?: { activeOnly?: boolean }) {
    const id = vehicleId?.trim();
    if (!id) throw new BadRequestException('vehicleId is required');
    await this.assertLinksBelongToOrg(orgId, { vehicleId: id });
    return this.listTasks(orgId, {
      vehicleId: id,
      ...(opts?.activeOnly ? { status: ACTIVE_TASK_STATUSES } : {}),
    });
  }

  async getTasksForBooking(orgId: string, bookingId: string) {
    const id = bookingId?.trim();
    if (!id) throw new BadRequestException('bookingId is required');
    await this.assertLinksBelongToOrg(orgId, { bookingId: id });
    return this.listTasks(orgId, { bookingId: id });
  }

  async getTasksForCustomer(orgId: string, customerId: string) {
    const id = customerId?.trim();
    if (!id) throw new BadRequestException('customerId is required');
    await this.assertLinksBelongToOrg(orgId, { customerId: id });
    return this.listTasks(orgId, { customerId: id });
  }

  async getTasksForVendor(orgId: string, vendorId: string) {
    const id = vendorId?.trim();
    if (!id) throw new BadRequestException('vendorId is required');
    await this.assertLinksBelongToOrg(orgId, { vendorId: id });
    return this.listTasks(orgId, { vendorId: id });
  }

  async getTasksForAlert(orgId: string, alertId: string) {
    const id = alertId?.trim();
    if (!id) throw new BadRequestException('alertId is required');
    await this.assertLinksBelongToOrg(orgId, { alertId: id });
    return this.listTasks(orgId, { alertId: id });
  }

  async getDashboardSummary(orgId: string, currentUserId?: string) {
    const now = new Date();
    const timeZone = await this.resolveOrgTimezone(orgId);
    const bucketContext = createTaskBucketContext(now, timeZone);
    const activeFilter = { organizationId: orgId, status: { in: ACTIVE_TASK_STATUSES } };

    const bucketCounts = emptyTaskBucketSummaryCounts();

    const [byStatusRaw, byPriorityRaw, open, critical, assignedToMe, ...bucketCountResults] =
      await Promise.all([
      this.prisma.orgTask.groupBy({ by: ['status'], where: { organizationId: orgId }, _count: { _all: true } }),
      this.prisma.orgTask.groupBy({ by: ['priority'], where: activeFilter, _count: { _all: true } }),
      this.prisma.orgTask.count({ where: { organizationId: orgId, status: 'OPEN' } }),
      this.prisma.orgTask.count({
        where: {
          ...activeFilter,
          AND: [{ activatesAt: { lte: now } }],
          priority: 'CRITICAL',
        },
      }),
      currentUserId
        ? this.prisma.orgTask.count({ where: { ...activeFilter, assignedUserId: currentUserId } })
        : Promise.resolve(0),
      ...TASK_OPERATOR_BUCKETS.map((bucket) =>
        this.prisma.orgTask.count({
          where: buildTaskBucketWhere(bucket, orgId, bucketContext),
        }),
      ),
    ]);

    TASK_OPERATOR_BUCKETS.forEach((bucket, index) => {
      bucketCounts[bucket] = bucketCountResults[index] ?? 0;
    });

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
      dueToday: bucketCounts.TODAY,
      overdue: bucketCounts.OVERDUE,
      critical,
      assignedToMe,
      byStatus,
      byPriority,
      buckets: bucketCounts,
      timezone: timeZone,
    };
  }

  // ─── Create ───────────────────────────────────────────────────────────────

  private resolveChecklist(
    type: TaskType,
    provided?: Array<{ title: string; description?: string; sortOrder?: number; isRequired?: boolean }>,
  ): Array<{ title: string; description?: string; sortOrder: number; isRequired: boolean }> | undefined {
    if (provided && provided.length > 0) {
      return provided.map((item, index) => {
        const title = item.title?.trim();
        if (!title) throw new BadRequestException('Checklist item title is required');
        return {
          title,
          description: item.description,
          sortOrder: item.sortOrder ?? index,
          isRequired: item.isRequired ?? false,
        };
      });
    }
    const template = checklistForType(type);
    if (template.length === 0) return undefined;
    return template.map((item: TaskChecklistTemplateItem) => ({
      title: item.title,
      description: item.description,
      sortOrder: item.sortOrder,
      isRequired: item.isRequired,
    }));
  }

  private assertManualTaskTiming(input: {
    dueDate?: string | Date | null;
    activatesAt?: string | Date | null;
  }): void {
    if (!input.dueDate || !input.activatesAt) return;
    const due = new Date(input.dueDate);
    const activates = new Date(input.activatesAt);
    if (Number.isNaN(due.getTime()) || Number.isNaN(activates.getTime())) {
      throw new BadRequestException('Invalid task date values');
    }
    if (due.getTime() < activates.getTime()) {
      throw new BadRequestException('Due date cannot be earlier than activation time');
    }
  }

  private assertManualTaskDuration(estimatedDurationMinutes?: number | null): void {
    if (estimatedDurationMinutes === undefined || estimatedDurationMinutes === null) return;
    if (!Number.isInteger(estimatedDurationMinutes) || estimatedDurationMinutes < 1) {
      throw new BadRequestException('Estimated duration must be a positive number of minutes');
    }
  }

  async createManualTask(orgId: string, input: CreateManualTaskInput, createdByUserId?: string) {
    if (!input.title?.trim()) throw new BadRequestException('Title is required');
    this.assertManualTaskTiming(input);
    this.assertManualTaskDuration(input.estimatedDurationMinutes ?? undefined);
    const stationId = this.resolveTaskStationId(input);
    await this.assertLinksBelongToOrg(orgId, { ...input, stationId });

    const dedupKey = this.resolveManualTaskDedupKey(input);
    if (dedupKey) {
      return this.createManualTaskByDedup(orgId, dedupKey, input, createdByUserId);
    }

    const type = input.type ?? 'CUSTOM';
    const checklist = this.resolveChecklist(type, input.checklist);
    const initialNote = input.initialNote?.trim() || undefined;

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.orgTask.create({
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
          serviceCaseId: input.serviceCaseId ?? undefined,
          assignedUserId: input.assignedUserId ?? undefined,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          activatesAt: input.activatesAt ? new Date(input.activatesAt) : new Date(),
          estimatedCostCents: input.estimatedCostCents ?? undefined,
          estimatedDurationMinutes: input.estimatedDurationMinutes ?? undefined,
          blocksVehicleAvailability: input.blocksVehicleAvailability ?? false,
          metadata: input.metadata,
          createdByUserId: createdByUserId ?? null,
          checklistItems: checklist
            ? {
                create: checklist.map((c, i) => ({
                  title: c.title,
                  description: c.description,
                  sortOrder: c.sortOrder ?? i,
                  isRequired: c.isRequired ?? false,
                })),
              }
            : undefined,
        },
      });

      await tx.taskEvent.create({
        data: {
          taskId: created.id,
          type: 'CREATED',
          actorUserId: createdByUserId ?? null,
          oldValue: null,
          newValue: created.status,
        },
      });

      if (initialNote) {
        const comment = await tx.taskComment.create({
          data: {
            taskId: created.id,
            body: initialNote,
            userId: createdByUserId ?? null,
          },
        });
        await tx.taskEvent.create({
          data: {
            taskId: created.id,
            type: 'COMMENT_ADDED',
            actorUserId: createdByUserId ?? null,
            oldValue: null,
            newValue: null,
            metadata: {
              commentId: comment.id,
              context: 'CREATED',
              bodyPreview:
                initialNote.length > 160 ? `${initialNote.slice(0, 157)}…` : initialNote,
            },
          },
        });
      }

      return created;
    });

    if (task.priority === 'CRITICAL') this.notify('created_critical', task);
    return this.getTaskById(task.id, orgId);
  }

  private resolveManualTaskDedupKey(input: CreateManualTaskInput): string | undefined {
    const explicit = input.dedupKey?.trim();
    if (explicit) return explicit;

    const meta =
      input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
        ? (input.metadata as Record<string, unknown>)
        : undefined;
    if (!meta) return undefined;

    if (typeof meta.voiceConversationId === 'string' && meta.voiceConversationId.trim()) {
      return voiceConversationTaskDedupKey(meta.voiceConversationId.trim());
    }
    if (typeof meta.supportTicketId === 'string' && meta.supportTicketId.trim()) {
      return supportTicketFollowupDedupKey(meta.supportTicketId.trim());
    }
    return undefined;
  }

  private async createManualTaskByDedup(
    orgId: string,
    dedupKey: string,
    input: CreateManualTaskInput,
    createdByUserId?: string,
  ) {
    const existing = await this.findActiveByDedup(orgId, dedupKey);
    if (existing) {
      return this.getTaskById(existing.id, orgId);
    }

    const type = input.type ?? 'CUSTOM';
    const checklist = this.resolveChecklist(type, input.checklist);
    const upserted = await this.upsertByDedup(orgId, dedupKey, {
      title: input.title.trim(),
      description: input.description,
      category: input.category,
      type,
      sourceType: input.sourceType ?? 'MANUAL',
      source: input.source ?? input.sourceType ?? 'MANUAL',
      priority: input.priority,
      vehicleId: input.vehicleId ?? null,
      bookingId: input.bookingId ?? null,
      customerId: input.customerId ?? null,
      vendorId: input.vendorId ?? null,
      alertId: input.alertId ?? null,
      documentId: input.documentId ?? null,
      fineId: input.fineId ?? null,
      invoiceId: input.invoiceId ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      activatesAt: input.activatesAt ? new Date(input.activatesAt) : new Date(),
      metadata: input.metadata,
      checklist,
      blocksVehicleAvailability: input.blocksVehicleAvailability,
    });

    if (input.initialNote?.trim()) {
      await this.addComment(orgId, upserted.id, input.initialNote.trim(), createdByUserId);
    }

    return this.getTaskById(upserted.id, orgId);
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
      if (data.status === 'DONE' || data.status === 'CANCELLED') {
        throw new BadRequestException(
          'Terminal status changes must use the dedicated complete or cancel endpoints',
        );
      }
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

  // ─── Status transitions (task-transition.policy) ─────────────────────────

  private async changeStatus(
    orgId: string,
    id: string,
    to: TaskStatus,
    extra?: CompleteTaskInput,
    actor?: PermissionActor,
  ) {
    const actorUserId = actor?.id;
    const task = await this.loadTaskOrThrow(id, orgId);
    assertTaskTransition(task.status, to);
    if (task.status === to) return this.getTaskById(id, orgId);

    const now = new Date();
    const update: Prisma.OrgTaskUpdateInput = { status: to, updatedByUserId: actorUserId ?? null };
    let checklistGate: ResolvedManualCompletionChecklistGate = {
      checklistOverridden: false,
      openRequiredItems: [],
    };

    if (to === 'IN_PROGRESS' && !task.startedAt) update.startedAt = now;
    if (to === 'DONE') {
      if (!actorUserId) {
        throw new BadRequestException('An authenticated user is required to complete a task');
      }
      const effectiveActivation = this.effectiveActivatesAt(task);
      if (effectiveActivation > now) {
        throw new BadRequestException(
          'Task cannot be completed before its activation time (activatesAt)',
        );
      }
      checklistGate = await this.resolveManualCompletionChecklistGate(orgId, id, actor, {
        overrideIncompleteChecklist: extra?.overrideIncompleteChecklist,
        overrideReason: extra?.overrideReason,
      });
      if (RESOLUTION_REQUIRED_TYPES.includes(task.type) && !extra?.resolutionNote?.trim()) {
        throw new BadRequestException(`A resolution note is required to complete a ${task.type} task`);
      }
      assertValidManualResolutionCode(task.type, extra?.resolutionCode);
      update.completedAt = now;
      update.completionMode = TaskCompletionMode.MANUAL;
      if (extra?.resolutionNote !== undefined) update.resolutionNote = extra.resolutionNote;
      if (extra?.resolutionCode !== undefined) update.resolutionCode = extra.resolutionCode;
      if (extra?.actualCostCents !== undefined) update.actualCostCents = extra.actualCostCents;
      if (actorUserId) {
        await this.assertOrgMember(orgId, actorUserId);
        update.completedByUserId = actorUserId;
      }
    }
    if (to === 'CANCELLED') {
      update.cancelledAt = now;
      if (actorUserId) {
        await this.assertOrgMember(orgId, actorUserId);
        update.completedByUserId = actorUserId;
      }
    }

    const eventMetadata = this.statusChangedEventMetadata(to, checklistGate);

    await this.prisma.$transaction(async (tx) => {
      await tx.orgTask.update({ where: { id }, data: update });
      await this.recordStatusChangedEvent(tx, id, actorUserId, task.status, to, eventMetadata);
      if (to === 'DONE' && checklistGate.checklistOverridden) {
        await this.recordChecklistCompletionOverriddenEvent(tx, id, actorUserId, task.status, {
          reason: checklistGate.overrideReason,
          openRequiredItems: checklistGate.openRequiredItems,
          remainingRequiredItems: checklistGate.openRequiredItems.length,
          overriddenAt: now.toISOString(),
          overriddenBlockers: ['CHECKLIST'],
        } as unknown as Prisma.InputJsonValue);
      }
    });

    if (to === 'DONE' && checklistGate.checklistOverridden) {
      await this.recordTaskChecklistOverrideActivityLog(orgId, id, actorUserId, checklistGate);
    }

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
    return this.changeStatus(orgId, id, 'IN_PROGRESS', undefined, actorUserId ? { id: actorUserId } : undefined);
  }

  async moveTaskToWaiting(orgId: string, id: string, actorUserId?: string) {
    return this.changeStatus(orgId, id, 'WAITING', undefined, actorUserId ? { id: actorUserId } : undefined);
  }

  async completeTask(orgId: string, id: string, extra?: CompleteTaskInput, actor?: PermissionActor) {
    return this.changeStatus(orgId, id, 'DONE', extra, actor);
  }

  async cancelTask(orgId: string, id: string, actorUserId?: string) {
    return this.changeStatus(orgId, id, 'CANCELLED', undefined, actorUserId ? { id: actorUserId } : undefined);
  }

  /**
   * Tenant-scoped bulk mutations — each task is processed through the existing
   * single-task services so status transitions emit TaskEvents (no blind updateMany).
   */
  async bulkTaskActions(
    orgId: string,
    input: BulkTaskActionInput,
    actorUserId?: string,
  ): Promise<BulkTaskActionResult> {
    const uniqueIds = [...new Set(input.taskIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new BadRequestException('At least one task id is required');
    }

    const results: BulkTaskActionItemResult[] = [];

    for (const taskId of uniqueIds) {
      try {
        switch (input.action) {
          case 'assign':
            await this.assignTask(orgId, taskId, input.assignedUserId ?? null, actorUserId);
            break;
          case 'set_priority': {
            if (!input.priority) {
              throw new BadRequestException('priority is required for set_priority');
            }
            await this.updateTask(orgId, taskId, { priority: input.priority }, actorUserId);
            break;
          }
          case 'shift_due_date': {
            const task = await this.loadTaskOrThrow(taskId, orgId);
            if (task.status === 'DONE' || task.status === 'CANCELLED') {
              throw new BadRequestException('A completed or cancelled task can no longer be edited');
            }
            let nextDue: Date | null;
            if (input.dueDate) {
              nextDue = new Date(input.dueDate);
            } else if (input.dueDateShiftDays !== undefined) {
              const base = task.dueDate ?? new Date();
              nextDue = new Date(base);
              nextDue.setUTCDate(nextDue.getUTCDate() + input.dueDateShiftDays);
            } else {
              throw new BadRequestException('dueDate or dueDateShiftDays is required for shift_due_date');
            }
            await this.updateTask(orgId, taskId, { dueDate: nextDue.toISOString() }, actorUserId);
            break;
          }
          case 'set_waiting':
            await this.moveTaskToWaiting(orgId, taskId, actorUserId);
            break;
          case 'cancel':
            await this.cancelTask(orgId, taskId, actorUserId);
            break;
          default:
            throw new BadRequestException(`Unsupported bulk action: ${input.action as string}`);
        }
        results.push({ taskId, success: true });
      } catch (err: unknown) {
        const message =
          err instanceof BadRequestException || err instanceof NotFoundException || err instanceof ForbiddenException
            ? (err as { message?: string | string[] }).message
            : err instanceof Error
              ? err.message
              : 'Bulk action failed';
        results.push({
          taskId,
          success: false,
          error: Array.isArray(message) ? message.join(', ') : String(message ?? 'Bulk action failed'),
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    return {
      results,
      succeeded,
      failed: results.length - succeeded,
    };
  }

  /**
   * Tenant-scoped system close when an external condition is satisfied (invoice paid,
   * insight cleared, document generated, …). Does not attribute completion to a user.
   */
  async autoResolveTask(orgId: string, taskId: string, input: AutoResolveTaskInput) {
    const resolutionCode = input.resolutionCode?.trim();
    const reason = input.reason?.trim();
    if (!resolutionCode) {
      throw new BadRequestException('resolutionCode is required for auto-resolve');
    }
    if (!reason) {
      throw new BadRequestException('reason is required for auto-resolve');
    }

    const task = await this.loadTaskOrThrow(taskId, orgId);

    if (task.status === 'DONE' && task.completionMode === TaskCompletionMode.AUTO_RESOLVED) {
      return this.getTaskById(taskId, orgId);
    }

    if (!isActiveTaskStatus(task.status)) {
      const detail =
        task.status === 'DONE' && task.completionMode
          ? ` (completionMode=${task.completionMode})`
          : '';
      throw new BadRequestException(`Task cannot be auto-resolved from status ${task.status}${detail}`);
    }

    const completedAt = input.resolvedAt ? new Date(input.resolvedAt) : new Date();
    const resolutionNote = `[Auto-resolved] ${reason}`;
    const eventMetadata = this.buildAutoResolvedEventMetadata(resolutionCode, reason, input.metadata);

    await this.prisma.$transaction(async (tx) => {
      await tx.orgTask.update({
        where: { id: taskId },
        data: {
          status: 'DONE',
          completionMode: TaskCompletionMode.AUTO_RESOLVED,
          resolutionCode,
          resolutionNote,
          completedAt,
          completedByUserId: null,
        },
      });
      await this.recordAutoResolvedEvent(tx, taskId, task.status, eventMetadata);
    });

    const result = await this.getTaskById(taskId, orgId);
    this.notify('completed', result);
    return result;
  }

  /**
   * Tenant-scoped system close when a task is obsolete because process moved on
   * (booking phase change, new task with same dedup scope, …).
   */
  async supersedeTask(orgId: string, taskId: string, input: SupersedeTaskInput) {
    const resolutionCode = input.resolutionCode?.trim();
    const reason = input.reason?.trim();
    if (!resolutionCode) {
      throw new BadRequestException('resolutionCode is required for supersede');
    }
    if (!reason) {
      throw new BadRequestException('reason is required for supersede');
    }

    const successorId = input.supersededByTaskId?.trim() || null;
    if (successorId && successorId === taskId) {
      throw new BadRequestException('A task cannot supersede itself');
    }

    const task = await this.loadTaskOrThrow(taskId, orgId);
    const normalizedSuccessorId = successorId;

    if (this.isIdempotentSupersedeState(task, normalizedSuccessorId)) {
      return this.getTaskById(taskId, orgId);
    }

    if (!isActiveTaskStatus(task.status)) {
      const detail =
        task.status === 'DONE' && task.completionMode
          ? ` (completionMode=${task.completionMode})`
          : '';
      throw new BadRequestException(`Task cannot be superseded from status ${task.status}${detail}`);
    }

    if (normalizedSuccessorId) {
      await this.loadTaskOrThrow(normalizedSuccessorId, orgId);
      await this.assertNoSupersedeCycle(orgId, taskId, normalizedSuccessorId);
    }

    const completedAt = new Date();
    const resolutionNote = `[Superseded] ${reason}`;
    const eventMetadata = this.buildSupersededEventMetadata(
      resolutionCode,
      reason,
      normalizedSuccessorId,
      input.metadata,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.orgTask.update({
        where: { id: taskId },
        data: {
          status: 'DONE',
          completionMode: TaskCompletionMode.SUPERSEDED,
          resolutionCode,
          resolutionNote,
          completedAt,
          completedByUserId: null,
          supersededByTaskId: normalizedSuccessorId,
        },
      });
      await this.recordSupersededEvent(tx, taskId, task.status, eventMetadata);
    });

    const result = await this.getTaskById(taskId, orgId);
    this.notify('completed', result);
    return result;
  }

  private chunkItems<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Batch wrapper around {@link autoResolveTask}. Processes tasks in controlled
   * parallel chunks; each task still receives its own atomic update + event.
   */
  async autoResolveTasks(orgId: string, taskIds: string[], input: AutoResolveTaskInput): Promise<number> {
    if (taskIds.length === 0) return 0;
    let resolved = 0;
    for (const taskId of taskIds) {
      await this.autoResolveTask(orgId, taskId, input);
      resolved += 1;
    }
    return resolved;
  }

  /**
   * Batch wrapper around {@link supersedeTask}. Processes tasks sequentially so
   * partial batch failures surface immediately.
   */
  async supersedeTasks(orgId: string, taskIds: string[], input: SupersedeTaskInput): Promise<number> {
    if (taskIds.length === 0) return 0;
    let superseded = 0;
    for (const taskId of taskIds) {
      await this.supersedeTask(orgId, taskId, input);
      superseded += 1;
    }
    return superseded;
  }

  // ─── Child resources ───────────────────────────────────────────────────────

  async addComment(orgId: string, taskId: string, body: string, userId?: string) {
    await this.loadTaskOrThrow(taskId, orgId);
    const trimmed = body?.trim();
    if (!trimmed) throw new BadRequestException('Comment body is required');
    const comment = await this.prisma.taskComment.create({
      data: { taskId, body: trimmed, userId: userId ?? null },
    });
    await this.recordEvent(taskId, 'COMMENT_ADDED', userId, null, null, {
      commentId: comment.id,
      bodyPreview: trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed,
    });
    return this.getTaskById(taskId, orgId);
  }

  async addChecklistItem(
    orgId: string,
    taskId: string,
    item: { title: string; description?: string; sortOrder?: number; isRequired?: boolean },
    actorUserId?: string,
  ) {
    const task = await this.loadTaskOrThrow(taskId, orgId);
    this.assertChecklistMutable(task);
    if (!item.title?.trim()) throw new BadRequestException('Checklist item title is required');
    const count = await this.prisma.taskChecklistItem.count({ where: { taskId } });
    const created = await this.prisma.taskChecklistItem.create({
      data: {
        taskId,
        title: item.title.trim(),
        description: item.description,
        sortOrder: item.sortOrder ?? count,
        isRequired: item.isRequired ?? false,
      },
    });
    await this.recordEvent(taskId, 'CHECKLIST_ITEM_ADDED', actorUserId, null, created.title, {
      itemId: created.id,
      isRequired: created.isRequired,
    });
    return this.getTaskById(taskId, orgId);
  }

  async updateChecklistItem(
    orgId: string,
    taskId: string,
    itemId: string,
    patch: { title?: string; description?: string; sortOrder?: number; isDone?: boolean; isRequired?: boolean },
    actorUserId?: string,
  ) {
    const task = await this.loadTaskOrThrow(taskId, orgId);
    this.assertChecklistMutable(task);
    const item = await this.prisma.taskChecklistItem.findFirst({
      where: { id: itemId, taskId },
      select: { id: true, title: true, isDone: true, isRequired: true },
    });
    if (!item) throw new NotFoundException('Checklist item not found');
    const data: Prisma.TaskChecklistItemUpdateInput = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
    if (patch.isRequired !== undefined) data.isRequired = patch.isRequired;
    if (patch.isDone !== undefined) {
      data.isDone = patch.isDone;
      data.completedAt = patch.isDone ? new Date() : null;
      data.completedByUserId = patch.isDone ? actorUserId ?? null : null;
    }

    const checklistDoneChanged = patch.isDone !== undefined && patch.isDone !== item.isDone;

    await this.prisma.$transaction(async (tx) => {
      await tx.taskChecklistItem.update({ where: { id: itemId }, data });
      if (checklistDoneChanged) {
        await tx.taskEvent.create({
          data: {
            taskId,
            type: 'CHECKLIST_ITEM_UPDATED',
            actorUserId: actorUserId ?? null,
            oldValue: item.isDone ? 'true' : 'false',
            newValue: patch.isDone ? 'true' : 'false',
            metadata: {
              itemId: item.id,
              title: patch.title?.trim() || item.title,
              field: 'isDone',
              isRequired: item.isRequired,
            },
          },
        });
      }
    });
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
      activatesAt?: Date | null;
      metadata?: Prisma.InputJsonValue;
      // Applied only when a brand-new task is created (never on escalation).
      checklist?: Array<{ title: string; description?: string; sortOrder?: number; isRequired?: boolean }>;
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
          dueDate: payload.dueDate !== undefined ? payload.dueDate : existing!.dueDate,
          activatesAt:
            payload.activatesAt != null ? payload.activatesAt : existing!.activatesAt,
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
        activatesAt: payload.activatesAt ?? new Date(),
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
                  isRequired: c.isRequired ?? false,
                })),
            }
          : undefined,
      },
    });
    await this.recordEvent(task.id, 'CREATED', null, null, task.status, { auto: true });
    return this.format(task);
  }

  /**
   * Updates `activatesAt` / `dueDate` on an active task and records `TIMING_CHANGED`.
   * Terminal tasks are left unchanged (no reopen).
   */
  async updateTaskTiming(
    orgId: string,
    taskId: string,
    timing: { activatesAt: Date; dueDate: Date; priority?: TaskPriority },
    context?: {
      ruleId?: string;
      pickupAt?: Date;
      returnAt?: Date;
      timeZone?: string;
      bookingId?: string;
    },
  ) {
    const task = await this.loadTaskOrThrow(taskId, orgId);
    if (!isActiveTaskStatus(task.status)) {
      return this.getTaskById(taskId, orgId);
    }

    const oldActivatesAt = task.activatesAt;
    const oldDueDate = task.dueDate;
    const activatesAt = timing.activatesAt;
    const dueDate = timing.dueDate;
    const priority = timing.priority;

    const timingUnchanged =
      (oldActivatesAt?.getTime() ?? null) === activatesAt.getTime() &&
      (oldDueDate?.getTime() ?? null) === dueDate.getTime() &&
      (priority === undefined || task.priority === priority);

    if (timingUnchanged) {
      return this.getTaskById(taskId, orgId);
    }

    await this.prisma.orgTask.update({
      where: { id: taskId },
      data: {
        activatesAt,
        dueDate,
        ...(priority !== undefined ? { priority } : {}),
      },
    });

    await this.recordEvent(
      taskId,
      'TIMING_CHANGED',
      null,
      JSON.stringify({
        activatesAt: oldActivatesAt?.toISOString() ?? null,
        dueDate: oldDueDate?.toISOString() ?? null,
      }),
      JSON.stringify({
        activatesAt: activatesAt.toISOString(),
        dueDate: dueDate.toISOString(),
      }),
      {
        ruleId: context?.ruleId ?? 'booking.lifecycle.confirmed.prep',
        bookingId: context?.bookingId ?? task.bookingId,
        pickupAt: context?.pickupAt?.toISOString() ?? null,
        returnAt: context?.returnAt?.toISOString() ?? null,
        timeZone: context?.timeZone ?? null,
      } as Prisma.InputJsonValue,
    );

    return this.getTaskById(taskId, orgId);
  }

  /**
   * Auto-resolves the canonical active pickup or return handover task after a
   * successful booking handover. Idempotent when already auto-resolved.
   */
  async autoResolveActiveBookingHandoverTask(
    orgId: string,
    bookingId: string,
    type: Extract<TaskType, 'BOOKING_PICKUP' | 'BOOKING_RETURN'>,
    input: {
      resolutionCode: string;
      reason: string;
      ruleId: string;
      handoverKind: 'PICKUP' | 'RETURN';
    },
  ): Promise<number> {
    const tasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        bookingId,
        type,
        source: 'BOOKING',
        status: { in: ACTIVE_TASK_STATUSES },
      },
      select: { id: true, dedupKey: true },
    });
    if (tasks.length === 0) return 0;

    for (const batch of this.chunkItems(tasks, TasksService.TERMINAL_TRANSITION_BATCH_SIZE)) {
      await Promise.all(
        batch.map((task) =>
          this.autoResolveTask(orgId, task.id, {
            resolutionCode: input.resolutionCode,
            reason: input.reason,
            metadata: {
              ruleId: input.ruleId,
              bookingId,
              handoverKind: input.handoverKind,
              dedupKey: task.dedupKey,
            },
          }),
        ),
      );
    }
    return tasks.length;
  }

  /**
   * Supersedes all active booking lifecycle tasks (prep, pickup, return) when a
   * booking is cancelled or otherwise withdrawn from the rental pipeline.
   */
  async supersedeActiveBookingLifecycleTasks(
    orgId: string,
    bookingId: string,
    input: {
      resolutionCode: string;
      reason: string;
      ruleId: string;
    },
  ): Promise<number> {
    const tasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        bookingId,
        source: 'BOOKING',
        type: { in: ['BOOKING_PREPARATION', 'BOOKING_PICKUP', 'BOOKING_RETURN'] },
        status: { in: ACTIVE_TASK_STATUSES },
      },
      select: { id: true, dedupKey: true },
    });
    if (tasks.length === 0) return 0;

    for (const batch of this.chunkItems(tasks, TasksService.TERMINAL_TRANSITION_BATCH_SIZE)) {
      await Promise.all(
        batch.map((task) =>
          this.supersedeTask(orgId, task.id, {
            resolutionCode: input.resolutionCode,
            reason: input.reason,
            metadata: {
              ruleId: input.ruleId,
              bookingId,
              dedupKey: task.dedupKey,
            },
          }),
        ),
      );
    }
    return tasks.length;
  }

  /** Supersedes open/planned BOOKING_PREPARATION tasks when a booking is cancelled. */
  async supersedeActiveBookingPreparationTasks(orgId: string, bookingId: string): Promise<number> {
    const tasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        bookingId,
        type: 'BOOKING_PREPARATION',
        source: 'BOOKING',
        status: { in: ACTIVE_TASK_STATUSES },
      },
      select: { id: true, dedupKey: true },
    });
    if (tasks.length === 0) return 0;

    for (const batch of this.chunkItems(tasks, TasksService.TERMINAL_TRANSITION_BATCH_SIZE)) {
      await Promise.all(
        batch.map((task) =>
          this.supersedeTask(orgId, task.id, {
            resolutionCode: 'BOOKING_CANCELLED',
            reason: `Booking ${bookingId} cancelled — preparation task superseded`,
            metadata: {
              ruleId: 'booking.lifecycle.cancelled',
              bookingId,
              dedupKey: task.dedupKey,
            },
          }),
        ),
      );
    }
    return tasks.length;
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
        status: { in: ACTIVE_TASK_STATUSES },
        dedupKey: { notIn: activeDedupKeys.length > 0 ? activeDedupKeys : ['__never__'] },
      },
      select: { id: true, source: true, dedupKey: true },
    });
    if (tasks.length === 0) return 0;

    for (const batch of this.chunkItems(tasks, TasksService.TERMINAL_TRANSITION_BATCH_SIZE)) {
      await Promise.all(
        batch.map((task) =>
          this.autoResolveTask(orgId, task.id, {
            resolutionCode: 'INSIGHT_CLEARED',
            reason: `Insight condition no longer active (${task.source ?? 'INSIGHT'})`,
            metadata: {
              ruleId: 'insight.stale_close',
              source: task.source,
              dedupKey: task.dedupKey,
            },
          }),
        ),
      );
    }
    return tasks.length;
  }

  /**
   * Supersedes booking lifecycle tasks when a booking advances to a new phase.
   * Scoped to one booking so prep/pickup/return keys from prior phases are closed
   * without touching other bookings.
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
        status: { in: ACTIVE_TASK_STATUSES },
        dedupKey: { notIn: activeDedupKeys.length > 0 ? activeDedupKeys : ['__never__'] },
      },
      select: { id: true, dedupKey: true },
    });
    if (tasks.length === 0) return 0;

    for (const batch of this.chunkItems(tasks, TasksService.TERMINAL_TRANSITION_BATCH_SIZE)) {
      await Promise.all(
        batch.map((task) =>
          this.supersedeTask(orgId, task.id, {
            resolutionCode: 'BOOKING_PHASE_SUPERSEDED',
            reason: `Booking lifecycle advanced; obsolete task for booking ${bookingId}`,
            metadata: {
              ruleId: 'booking.lifecycle_supersede',
              bookingId,
              dedupKey: task.dedupKey,
              activeDedupKeys,
            },
          }),
        ),
      );
    }
    return tasks.length;
  }

  /** Auto-resolves all active tasks linked to a fully paid invoice. */
  async closeInvoiceLinkedTasks(orgId: string, invoiceId: string): Promise<number> {
    return this.autoResolveInvoicePaymentCheckTasks(orgId, invoiceId, {
      resolutionCode: 'PAYMENT_RECEIVED',
      reason: `Invoice ${invoiceId} fully paid`,
      metadata: { ruleId: 'invoice.payment.received', invoiceId },
    });
  }

  /** Auto-resolves canonical invoice payment-check tasks (`invoice:payment-check:*`). */
  async autoResolveInvoicePaymentCheckTasks(
    orgId: string,
    invoiceId: string,
    input: { resolutionCode: string; reason: string; metadata?: Prisma.InputJsonValue },
  ): Promise<number> {
    const tasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        invoiceId,
        type: 'INVOICE_REQUIRED',
        source: 'INVOICE',
        status: { in: ACTIVE_TASK_STATUSES },
        OR: [
          { dedupKey: { startsWith: 'invoice:payment-check:' } },
          { dedupKey: { startsWith: 'invoice:unpaid:' } },
        ],
      },
      select: { id: true },
    });
    if (tasks.length === 0) return 0;

    for (const batch of this.chunkItems(tasks, TasksService.TERMINAL_TRANSITION_BATCH_SIZE)) {
      await Promise.all(
        batch.map((task) =>
          this.autoResolveTask(orgId, task.id, {
            resolutionCode: input.resolutionCode,
            reason: input.reason,
            metadata: input.metadata,
          }),
        ),
      );
    }
    return tasks.length;
  }

  /** Supersedes canonical invoice payment-check tasks when the invoice is voided/cancelled. */
  async supersedeInvoicePaymentCheckTasks(
    orgId: string,
    invoiceId: string,
    input: { resolutionCode: string; reason: string; metadata?: Prisma.InputJsonValue },
  ): Promise<number> {
    const tasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        invoiceId,
        type: 'INVOICE_REQUIRED',
        source: 'INVOICE',
        status: { in: ACTIVE_TASK_STATUSES },
        OR: [
          { dedupKey: { startsWith: 'invoice:payment-check:' } },
          { dedupKey: { startsWith: 'invoice:unpaid:' } },
        ],
      },
      select: { id: true },
    });
    if (tasks.length === 0) return 0;

    for (const batch of this.chunkItems(tasks, TasksService.TERMINAL_TRANSITION_BATCH_SIZE)) {
      await Promise.all(
        batch.map((task) =>
          this.supersedeTask(orgId, task.id, {
            resolutionCode: input.resolutionCode,
            reason: input.reason,
            metadata: input.metadata,
          }),
        ),
      );
    }
    return tasks.length;
  }

  /** Supersedes legacy `invoice:unpaid:{invoiceId}` rows after package-task migration. */
  async supersedeLegacyInvoicePaymentCheckTasks(orgId: string, invoiceId: string): Promise<number> {
    const legacyKey = `invoice:unpaid:${invoiceId}`;
    const tasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        invoiceId,
        dedupKey: legacyKey,
        status: { in: ACTIVE_TASK_STATUSES },
      },
      select: { id: true },
    });
    if (tasks.length === 0) return 0;

    for (const batch of this.chunkItems(tasks, TasksService.TERMINAL_TRANSITION_BATCH_SIZE)) {
      await Promise.all(
        batch.map((task) =>
          this.supersedeTask(orgId, task.id, {
            resolutionCode: 'INVOICE_TASK_SUPERSEDED',
            reason: `Legacy invoice unpaid task superseded by payment-check task for invoice ${invoiceId}`,
            metadata: {
              ruleId: 'invoice.payment.migrate',
              invoiceId,
              dedupKey: legacyKey,
            },
          }),
        ),
      );
    }
    return tasks.length;
  }

  /**
   * Synchronises checklist rows for a document-package task: one row per missing
   * slot, auto-completing rows when the underlying document appears.
   */
  async syncDocumentPackageChecklist(
    orgId: string,
    taskId: string,
    slots: Array<{ marker: string; title: string; satisfied: boolean }>,
  ): Promise<void> {
    const task = await this.loadTaskOrThrow(taskId, orgId);
    if (!isActiveTaskStatus(task.status)) return;

    const existing = await this.prisma.taskChecklistItem.findMany({
      where: { taskId },
      orderBy: { sortOrder: 'asc' },
    });

    const slotMarkers = new Set(slots.map((s) => s.marker));
    let sortOrder = existing.length;

    for (const slot of slots) {
      const row = existing.find((i) => i.description === slot.marker);
      if (!row) {
        await this.prisma.taskChecklistItem.create({
          data: {
            taskId,
            title: slot.title,
            description: slot.marker,
            sortOrder: sortOrder++,
            isRequired: true,
            isDone: slot.satisfied,
            completedAt: slot.satisfied ? new Date() : null,
          },
        });
        continue;
      }
      if (row.title !== slot.title || row.isDone !== slot.satisfied) {
        await this.prisma.taskChecklistItem.update({
          where: { id: row.id },
          data: {
            title: slot.title,
            isDone: slot.satisfied,
            completedAt: slot.satisfied ? row.completedAt ?? new Date() : null,
          },
        });
      }
    }

    for (const row of existing) {
      if (!row.description || slotMarkers.has(row.description)) continue;
      if (!row.isDone) {
        await this.prisma.taskChecklistItem.update({
          where: { id: row.id },
          data: { isDone: true, completedAt: new Date() },
        });
      }
    }
  }

  /** Auto-resolves the canonical document-package task for a booking phase. */
  async autoResolveActiveDocumentPackageTask(
    orgId: string,
    bookingId: string,
    dedupKey: string,
    input: { phase: string; ruleId?: string },
  ): Promise<number> {
    const tasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        bookingId,
        dedupKey,
        type: 'DOCUMENT_REVIEW',
        source: 'DOCUMENT',
        status: { in: ACTIVE_TASK_STATUSES },
      },
      select: { id: true },
    });
    if (tasks.length === 0) return 0;

    for (const batch of this.chunkItems(tasks, TasksService.TERMINAL_TRANSITION_BATCH_SIZE)) {
      await Promise.all(
        batch.map((task) =>
          this.autoResolveTask(orgId, task.id, {
            resolutionCode: 'DOCUMENT_PACKAGE_COMPLETE',
            reason: `All required documents present for phase ${input.phase}`,
            metadata: {
              ruleId: input.ruleId ?? 'booking.document.package.complete',
              bookingId,
              phase: input.phase,
              dedupKey,
            },
          }),
        ),
      );
    }
    return tasks.length;
  }

  /** Supersedes legacy per-type document tasks (`document:{type}:{bookingId}`). */
  async supersedeLegacyPerTypeDocumentTasks(orgId: string, bookingId: string): Promise<number> {
    const tasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        bookingId,
        source: 'DOCUMENT',
        status: { in: ACTIVE_TASK_STATUSES },
        AND: [
          { dedupKey: { startsWith: 'document:' } },
          { NOT: { dedupKey: { startsWith: 'document:package:' } } },
        ],
      },
      select: { id: true, dedupKey: true },
    });
    if (tasks.length === 0) return 0;

    for (const batch of this.chunkItems(tasks, TasksService.TERMINAL_TRANSITION_BATCH_SIZE)) {
      await Promise.all(
        batch.map((task) =>
          this.supersedeTask(orgId, task.id, {
            resolutionCode: 'DOCUMENT_TASK_SUPERSEDED',
            reason: `Legacy per-type document task superseded by package task for booking ${bookingId}`,
            metadata: {
              ruleId: 'booking.document.package.migrate',
              bookingId,
              dedupKey: task.dedupKey,
            },
          }),
        ),
      );
    }
    return tasks.length;
  }

  /** Supersedes legacy `booking:clean:{bookingId}` rows after canonical vehicle cleaning migration. */
  async supersedeLegacyBookingCleanTasks(
    orgId: string,
    input: {
      bookingId?: string;
      vehicleId?: string;
      reason: string;
      excludeTaskId?: string;
    },
  ): Promise<number> {
    const orClauses: Prisma.OrgTaskWhereInput[] = [];
    if (input.bookingId) {
      orClauses.push({ dedupKey: `booking:clean:${input.bookingId}` });
      orClauses.push({
        bookingId: input.bookingId,
        type: 'VEHICLE_CLEANING',
        dedupKey: { startsWith: 'booking:clean:' },
      });
    }
    if (input.vehicleId) {
      orClauses.push({
        vehicleId: input.vehicleId,
        type: 'VEHICLE_CLEANING',
        dedupKey: { startsWith: 'booking:clean:' },
        status: { in: ACTIVE_TASK_STATUSES },
      });
    }
    if (orClauses.length === 0) return 0;

    const tasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        status: { in: ACTIVE_TASK_STATUSES },
        ...(input.excludeTaskId ? { NOT: { id: input.excludeTaskId } } : {}),
        OR: orClauses,
      },
      select: { id: true, dedupKey: true, bookingId: true },
    });
    if (tasks.length === 0) return 0;

    for (const batch of this.chunkItems(tasks, TasksService.TERMINAL_TRANSITION_BATCH_SIZE)) {
      await Promise.all(
        batch.map((task) =>
          this.supersedeTask(orgId, task.id, {
            resolutionCode: 'CLEANING_TASK_SUPERSEDED',
            reason: input.reason,
            metadata: {
              ruleId: 'vehicle.cleaning.migrate',
              bookingId: task.bookingId ?? input.bookingId,
              vehicleId: input.vehicleId,
              dedupKey: task.dedupKey,
            },
          }),
        ),
      );
    }
    return tasks.length;
  }

  /** Supersedes document-package tasks whose phase is no longer active for the booking. */
  async closeStaleDocumentPackageTasks(
    orgId: string,
    bookingId: string,
    activeDedupKeys: string[],
  ): Promise<number> {
    const tasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        bookingId,
        source: 'DOCUMENT',
        type: 'DOCUMENT_REVIEW',
        status: { in: ACTIVE_TASK_STATUSES },
        dedupKey: { startsWith: 'document:package:' },
        ...(activeDedupKeys.length > 0
          ? { dedupKey: { notIn: activeDedupKeys } }
          : {}),
      },
      select: { id: true, dedupKey: true },
    });
    if (tasks.length === 0) return 0;

    for (const batch of this.chunkItems(tasks, TasksService.TERMINAL_TRANSITION_BATCH_SIZE)) {
      await Promise.all(
        batch.map((task) =>
          this.supersedeTask(orgId, task.id, {
            resolutionCode: 'DOCUMENT_PHASE_SUPERSEDED',
            reason: `Document package phase superseded for booking ${bookingId}`,
            metadata: {
              ruleId: 'booking.document.package.supersede',
              bookingId,
              dedupKey: task.dedupKey,
              activeDedupKeys,
            },
          }),
        ),
      );
    }
    return tasks.length;
  }

  /** Supersedes active document-package tasks when a booking leaves the rental pipeline. */
  async supersedeActiveDocumentPackageTasks(orgId: string, bookingId: string): Promise<number> {
    const tasks = await this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        bookingId,
        source: 'DOCUMENT',
        type: 'DOCUMENT_REVIEW',
        status: { in: ACTIVE_TASK_STATUSES },
        dedupKey: { startsWith: 'document:package:' },
      },
      select: { id: true, dedupKey: true },
    });
    if (tasks.length === 0) return 0;

    for (const batch of this.chunkItems(tasks, TasksService.TERMINAL_TRANSITION_BATCH_SIZE)) {
      await Promise.all(
        batch.map((task) =>
          this.supersedeTask(orgId, task.id, {
            resolutionCode: 'BOOKING_CANCELLED',
            reason: `Booking ${bookingId} left document pipeline — package task superseded`,
            metadata: {
              ruleId: 'booking.document.package.cancelled',
              bookingId,
              dedupKey: task.dedupKey,
            },
          }),
        ),
      );
    }
    return tasks.length;
  }
}

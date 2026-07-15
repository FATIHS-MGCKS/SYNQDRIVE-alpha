import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TaskPriority, TaskSource, TaskType } from '@prisma/client';
import { DEFAULT_TARIFF_TIMEZONE } from '@modules/pricing/tariff-instant.util';
import { PrismaService } from '@shared/database/prisma.service';
import {
  activeRentalPhaseDedupKeys,
  bookingPickupDedupKey,
  bookingPreparationDedupKey,
  bookingReturnDedupKey,
  automationOutboxIdentity,
  buildAutomationMetadataBlock,
  buildAutomationMetadataRef,
  confirmedPhaseActiveDedupKeys,
  getAutomationRuleByCatalogKey,
  requireAutomationRuleById,
  vendorRepairDedupKey,
} from './automation/task-automation-rule.util';
import {
  computeBookingPickupTiming,
  computeBookingReturnTiming,
  isSignificantBookingPickupReschedule as isSignificantPickupMilestoneReschedule,
  isSignificantBookingReturnReschedule,
  type BookingHandoverTiming,
} from './booking-pickup-return-timing.util';
import {
  BOOKING_PICKUP_TIMING_RULE,
  BOOKING_RETURN_TIMING_RULE,
} from './booking-pickup-return-timing.rules';
import {
  computeBookingPreparationTiming,
  isSignificantBookingPickupReschedule,
  type BookingPreparationTiming,
} from './booking-preparation-timing.util';
import { BOOKING_PREPARATION_TIMING_RULE } from './booking-preparation-timing.rules';
import { TasksService } from './tasks.service';
import { checklistForType } from './task-templates';
import { isActiveTaskStatus } from './task-transition.policy';
import { VehicleCleaningTaskService } from './vehicle-cleaning-task.service';
import { TaskAutomationOutboxEnqueueService } from './outbox/task-automation-outbox-enqueue.service';
import { TaskAutomationOutboxExecutionContext } from './outbox/task-automation-outbox-execution.context';
import { buildOutboxMeta } from './outbox/task-automation-outbox-meta.util';
import { sanitizeAutomationError } from './outbox/task-automation-outbox-error.util';

export interface BookingLifecycleTaskInput {
  id: string;
  organizationId: string;
  vehicleId: string;
  customerId: string;
  status: string;
  startDate: Date;
  endDate: Date;
  pickupStationId?: string | null;
  returnStationId?: string | null;
}

export interface SyncBookingPreparationOptions {
  previousStartDate?: Date;
  now?: Date;
}

export interface SyncBookingPickupOptions {
  previousStartDate?: Date;
  now?: Date;
}

export interface SyncBookingReturnOptions {
  previousEndDate?: Date;
  now?: Date;
}

/**
 * V4.8.3 — Booking / Document / Vendor → Task automation.
 *
 * Health/Alert auto-tasks flow through InsightTaskBridgeService (they ride the
 * insight run + auto-close). This service covers the non-insight operational
 * sources. Every task carries a stable `generatedKey` (stored as `dedupKey` +
 * in metadata) so re-running a lifecycle hook escalates a single task instead
 * of duplicating it. Failures are persisted to `task_automation_outbox` for
 * durable worker retry — task automation must never break the booking/vendor/
 * document write that triggered it.
 */
@Injectable()
export class TaskAutomationService {
  private readonly logger = new Logger(TaskAutomationService.name);

  constructor(
    private readonly tasks: TasksService,
    private readonly prisma: PrismaService,
    private readonly vehicleCleaningTasks: VehicleCleaningTaskService,
    private readonly outboxEnqueue: TaskAutomationOutboxEnqueueService,
    private readonly outboxContext: TaskAutomationOutboxExecutionContext,
  ) {}

  private shouldPropagateError(): boolean {
    return this.outboxContext.fromOutbox;
  }

  private async handleAutomationFailure(
    meta: Parameters<TaskAutomationOutboxEnqueueService['enqueueFailure']>[0],
    err: unknown,
    logMessage: string,
  ): Promise<void> {
    if (this.shouldPropagateError()) {
      throw err instanceof Error ? err : new Error(sanitizeAutomationError(err));
    }
    await this.outboxEnqueue.enqueueFailure(meta, err);
    this.logger.warn(logMessage);
  }

  private async resolveOrgTimezone(orgId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true },
    });
    return org?.timezone?.trim() || DEFAULT_TARIFF_TIMEZONE;
  }

  private buildPreparationMetadata(
    generatedKey: string,
    timing: BookingPreparationTiming,
    stationContext?: {
      pickupStationId?: string | null;
      returnStationId?: string | null;
    },
  ): Prisma.InputJsonValue {
    const pickupStationId = stationContext?.pickupStationId ?? null;
    const returnStationId = stationContext?.returnStationId ?? null;
    const stationId = pickupStationId ?? returnStationId ?? null;

    return {
      generatedKey,
      automation: buildAutomationMetadataBlock('BOOKING_PREPARATION'),
      timing: {
        pickupAt: timing.pickupAt.toISOString(),
        scheduledActivatesAt: timing.scheduledActivatesAt.toISOString(),
        activatesAt: timing.activatesAt.toISOString(),
        dueDate: timing.dueDate.toISOString(),
        timeZone: timing.timeZone,
        pickupDateOnly: timing.pickupDateOnly,
        activationLeadMs: BOOKING_PREPARATION_TIMING_RULE.activationLeadBeforePickupMs,
        dueLeadMs: BOOKING_PREPARATION_TIMING_RULE.dueLeadBeforePickupMs,
        immediatelyActive: timing.immediatelyActive,
      },
      ...(stationId ? { stationId } : {}),
      ...(pickupStationId ? { pickupStationId } : {}),
      ...(returnStationId ? { returnStationId } : {}),
    };
  }

  private buildHandoverMetadata(
    generatedKey: string,
    timing: BookingHandoverTiming,
    catalogKey: 'BOOKING_PICKUP' | 'BOOKING_RETURN',
    milestoneField: 'pickupAt' | 'returnAt',
    leadMs: number,
    stationContext?: {
      pickupStationId?: string | null;
      returnStationId?: string | null;
    },
  ): Prisma.InputJsonValue {
    const pickupStationId = stationContext?.pickupStationId ?? null;
    const returnStationId = stationContext?.returnStationId ?? null;
    const stationId = pickupStationId ?? returnStationId ?? null;

    return {
      generatedKey,
      automation: buildAutomationMetadataBlock(catalogKey),
      timing: {
        [milestoneField]: timing.milestoneAt.toISOString(),
        scheduledActivatesAt: timing.scheduledActivatesAt.toISOString(),
        activatesAt: timing.activatesAt.toISOString(),
        dueDate: timing.dueDate.toISOString(),
        timeZone: timing.timeZone,
        milestoneDateOnly: timing.milestoneDateOnly,
        activationLeadMs: leadMs,
        dueLeadMs: 0,
        immediatelyActive: timing.immediatelyActive,
        isOverdue: timing.isOverdue,
      },
      ...(stationId ? { stationId } : {}),
      ...(pickupStationId ? { pickupStationId } : {}),
      ...(returnStationId ? { returnStationId } : {}),
    };
  }

  private async safeUpsert(
    orgId: string,
    generatedKey: string,
    payload: {
      title: string;
      description?: string;
      category?: string;
      type: TaskType;
      priority?: TaskPriority;
      source: string;
      sourceType: TaskSource;
      vehicleId?: string | null;
      bookingId?: string | null;
      customerId?: string | null;
      vendorId?: string | null;
      documentId?: string | null;
      withChecklist?: boolean;
      checklist?: Array<{ title: string; description?: string; sortOrder?: number; isRequired?: boolean }>;
      dueDate?: Date | null;
      activatesAt?: Date | null;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await this.tasks.upsertByDedup(orgId, generatedKey, {
      title: payload.title,
      description: payload.description,
      category: payload.category,
      type: payload.type,
      sourceType: payload.sourceType,
      priority: payload.priority ?? 'NORMAL',
      vehicleId: payload.vehicleId ?? null,
      bookingId: payload.bookingId ?? null,
      customerId: payload.customerId ?? null,
      vendorId: payload.vendorId ?? null,
      documentId: payload.documentId ?? null,
      source: payload.source,
      dueDate: payload.dueDate ?? null,
      activatesAt: payload.activatesAt ?? null,
      metadata: payload.metadata ?? { generatedKey },
      checklist: payload.withChecklist
        ? checklistForType(payload.type)
        : payload.checklist,
    });
  }

  /**
   * Materializes or refreshes the canonical BOOKING_PREPARATION task for a
   * CONFIRMED booking, including activation and due timing.
   */
  async syncBookingPreparationTiming(
    booking: BookingLifecycleTaskInput,
    options?: SyncBookingPreparationOptions,
  ): Promise<void> {
    if (booking.status !== 'CONFIRMED') return;

    try {
      const now = options?.now ?? new Date();
      const timeZone = await this.resolveOrgTimezone(booking.organizationId);
      const timing = computeBookingPreparationTiming(booking.startDate, now, timeZone);
      const dedupKey = bookingPreparationDedupKey(booking.id);

      const existing = await this.prisma.orgTask.findFirst({
        where: { organizationId: booking.organizationId, dedupKey },
        orderBy: { createdAt: 'desc' },
      });

      const pickupMoved =
        options?.previousStartDate != null &&
        options.previousStartDate.getTime() !== booking.startDate.getTime();

      if (existing && pickupMoved) {
        if (existing.status === 'DONE') {
          if (
            isSignificantBookingPickupReschedule(options.previousStartDate!, booking.startDate)
          ) {
            await this.materializeBookingPreparationTask(booking, timing, dedupKey);
          }
          return;
        }
        if (existing.status === 'CANCELLED') {
          return;
        }
        if (isActiveTaskStatus(existing.status)) {
          await this.tasks.updateTaskTiming(
            booking.organizationId,
            existing.id,
            { activatesAt: timing.activatesAt, dueDate: timing.dueDate },
            {
              ruleId: getAutomationRuleByCatalogKey('BOOKING_PREPARATION').ruleId,
              pickupAt: timing.pickupAt,
              timeZone,
              bookingId: booking.id,
            },
          );
          await this.prisma.orgTask.update({
            where: { id: existing.id },
            data: {
              vehicleId: booking.vehicleId,
              customerId: booking.customerId,
              metadata: this.buildPreparationMetadata(dedupKey, timing, booking) as Prisma.InputJsonValue,
            },
          });
          return;
        }
      }

      await this.materializeBookingPreparationTask(booking, timing, dedupKey);
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: booking.organizationId,
          ...automationOutboxIdentity('BOOKING_PREPARATION'),
          entityType: 'BOOKING',
          entityId: booking.id,
          operation: 'SYNC_BOOKING_PREPARATION',
          payload: {
            bookingId: booking.id,
            previousStartDate: options?.previousStartDate?.toISOString(),
          },
        }),
        err,
        `syncBookingPreparationTiming(${booking.id}) failed: ${sanitizeAutomationError(err)}`,
      );
    }
  }

  /**
   * Materializes or refreshes the canonical BOOKING_PICKUP task for a CONFIRMED
   * booking. Visible before planned pickup; escalates priority when overdue.
   */
  async syncBookingPickupTiming(
    booking: BookingLifecycleTaskInput,
    options?: SyncBookingPickupOptions,
  ): Promise<void> {
    if (booking.status !== 'CONFIRMED') return;

    try {
      const now = options?.now ?? new Date();
      const timeZone = await this.resolveOrgTimezone(booking.organizationId);
      const timing = computeBookingPickupTiming(booking.startDate, now, timeZone);
      const dedupKey = bookingPickupDedupKey(booking.id);

      const existing = await this.prisma.orgTask.findFirst({
        where: { organizationId: booking.organizationId, dedupKey },
        orderBy: { createdAt: 'desc' },
      });

      const pickupMoved =
        options?.previousStartDate != null &&
        options.previousStartDate.getTime() !== booking.startDate.getTime();

      if (existing && pickupMoved) {
        if (existing.status === 'DONE') {
          if (isSignificantPickupMilestoneReschedule(options.previousStartDate!, booking.startDate)) {
        await this.materializeBookingPickupTask(booking, timing, dedupKey);
          }
          return;
        }
        if (existing.status === 'CANCELLED') {
          return;
        }
        if (isActiveTaskStatus(existing.status)) {
          await this.refreshBookingPickupTask(existing.id, booking, timing, dedupKey, timeZone);
          return;
        }
      }

      if (existing && isActiveTaskStatus(existing.status)) {
        await this.refreshBookingPickupTask(existing.id, booking, timing, dedupKey, timeZone);
        return;
      }

      if (!existing || existing.status !== 'DONE') {
        await this.materializeBookingPickupTask(booking, timing, dedupKey);
      }
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: booking.organizationId,
          ...automationOutboxIdentity('BOOKING_PICKUP'),
          entityType: 'BOOKING',
          entityId: booking.id,
          operation: 'SYNC_BOOKING_PICKUP',
          payload: {
            bookingId: booking.id,
            previousStartDate: options?.previousStartDate?.toISOString(),
          },
        }),
        err,
        `syncBookingPickupTiming(${booking.id}) failed: ${sanitizeAutomationError(err)}`,
      );
    }
  }

  /**
   * Materializes or refreshes the canonical BOOKING_RETURN task for an ACTIVE
   * rental. Visible before planned return; escalates priority when overdue.
   */
  async syncBookingReturnTiming(
    booking: BookingLifecycleTaskInput,
    options?: SyncBookingReturnOptions,
  ): Promise<void> {
    if (booking.status !== 'ACTIVE') return;

    try {
      const now = options?.now ?? new Date();
      const timeZone = await this.resolveOrgTimezone(booking.organizationId);
      const timing = computeBookingReturnTiming(booking.endDate, now, timeZone);
      const dedupKey = bookingReturnDedupKey(booking.id);

      const existing = await this.prisma.orgTask.findFirst({
        where: { organizationId: booking.organizationId, dedupKey },
        orderBy: { createdAt: 'desc' },
      });

      const returnMoved =
        options?.previousEndDate != null &&
        options.previousEndDate.getTime() !== booking.endDate.getTime();

      if (existing && returnMoved) {
        if (existing.status === 'DONE') {
          if (isSignificantBookingReturnReschedule(options.previousEndDate!, booking.endDate)) {
        await this.materializeBookingReturnTask(booking, timing, dedupKey);
          }
          return;
        }
        if (existing.status === 'CANCELLED') {
          return;
        }
        if (isActiveTaskStatus(existing.status)) {
          await this.refreshBookingReturnTask(existing.id, booking, timing, dedupKey, timeZone);
          return;
        }
      }

      if (existing && isActiveTaskStatus(existing.status)) {
        await this.refreshBookingReturnTask(existing.id, booking, timing, dedupKey, timeZone);
        return;
      }

      if (!existing || existing.status !== 'DONE') {
        await this.materializeBookingReturnTask(booking, timing, dedupKey);
      }
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: booking.organizationId,
          ...automationOutboxIdentity('BOOKING_RETURN'),
          entityType: 'BOOKING',
          entityId: booking.id,
          operation: 'SYNC_BOOKING_RETURN',
          payload: {
            bookingId: booking.id,
            previousEndDate: options?.previousEndDate?.toISOString(),
          },
        }),
        err,
        `syncBookingReturnTiming(${booking.id}) failed: ${sanitizeAutomationError(err)}`,
      );
    }
  }

  /** Supersedes open booking lifecycle tasks when a booking is cancelled. */
  async supersedeBookingLifecycleOnCancellation(orgId: string, bookingId: string): Promise<void> {
    const cancelledRule = requireAutomationRuleById('booking.lifecycle.cancelled');
    try {
      await this.tasks.supersedeActiveBookingLifecycleTasks(orgId, bookingId, {
        resolutionCode: 'BOOKING_CANCELLED',
        reason: `Booking ${bookingId} cancelled — lifecycle tasks superseded`,
        ruleId: cancelledRule.ruleId,
      });
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: orgId,
          ...automationOutboxIdentity(cancelledRule.ruleId),
          entityType: 'BOOKING',
          entityId: bookingId,
          operation: 'SUPERSEDE_BOOKING_LIFECYCLE',
          payload: { bookingId },
        }),
        err,
        `supersedeBookingLifecycleOnCancellation(${bookingId}) failed: ${sanitizeAutomationError(err)}`,
      );
    }
  }

  /** @deprecated Use {@link supersedeBookingLifecycleOnCancellation} */
  async supersedeBookingPreparationOnCancellation(orgId: string, bookingId: string): Promise<void> {
    await this.supersedeBookingLifecycleOnCancellation(orgId, bookingId);
  }

  /**
   * Closes booking lifecycle tasks when a confirmed booking is marked no-show.
   * Pickup is auto-resolved; preparation and any other active lifecycle tasks
   * are superseded.
   */
  async handleBookingNoShow(orgId: string, bookingId: string): Promise<void> {
    const noShowRule = requireAutomationRuleById('booking.lifecycle.cancelled.noshow');
    try {
      await this.tasks.autoResolveActiveBookingHandoverTask(orgId, bookingId, 'BOOKING_PICKUP', {
        resolutionCode: 'BOOKING_NO_SHOW',
        reason: `Booking ${bookingId} marked no-show — pickup task closed`,
        ruleId: noShowRule.ruleId,
        handoverKind: 'PICKUP',
      });
      await this.tasks.supersedeActiveBookingLifecycleTasks(orgId, bookingId, {
        resolutionCode: 'BOOKING_NO_SHOW',
        reason: `Booking ${bookingId} marked no-show — lifecycle tasks superseded`,
        ruleId: noShowRule.ruleId,
      });
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: orgId,
          ...automationOutboxIdentity(noShowRule.ruleId),
          entityType: 'BOOKING',
          entityId: bookingId,
          operation: 'HANDLE_BOOKING_NO_SHOW',
          payload: { bookingId },
        }),
        err,
        `handleBookingNoShow(${bookingId}) failed: ${sanitizeAutomationError(err)}`,
      );
    }
  }

  /**
   * After a successful pickup handover: auto-resolve the pickup task and
   * materialize the return task for the now-active rental.
   */
  async onPickupHandoverCompleted(booking: BookingLifecycleTaskInput): Promise<void> {
    const pickupCompletedRule = requireAutomationRuleById('booking.handover.pickup.completed');
    try {
      await this.tasks.autoResolveActiveBookingHandoverTask(
        booking.organizationId,
        booking.id,
        'BOOKING_PICKUP',
        {
          resolutionCode: 'HANDOVER_PICKUP_COMPLETED',
          reason: `Pickup handover completed for booking ${booking.id}`,
          ruleId: pickupCompletedRule.ruleId,
          handoverKind: 'PICKUP',
        },
      );
      await this.ensureBookingLifecycleTasks({ ...booking, status: 'ACTIVE' });
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: booking.organizationId,
          ...automationOutboxIdentity(pickupCompletedRule.ruleId),
          entityType: 'BOOKING',
          entityId: booking.id,
          operation: 'ON_PICKUP_HANDOVER_COMPLETED',
          payload: { bookingId: booking.id },
        }),
        err,
        `onPickupHandoverCompleted(${booking.id}) failed: ${sanitizeAutomationError(err)}`,
      );
    }
  }

  /**
   * After a successful return handover: auto-resolve the return task and close
   * any remaining booking lifecycle tasks for the completed rental.
   */
  async onReturnHandoverCompleted(booking: BookingLifecycleTaskInput): Promise<void> {
    const returnCompletedRule = requireAutomationRuleById('booking.handover.return.completed');
    try {
      await this.tasks.autoResolveActiveBookingHandoverTask(
        booking.organizationId,
        booking.id,
        'BOOKING_RETURN',
        {
          resolutionCode: 'HANDOVER_RETURN_COMPLETED',
          reason: `Return handover completed for booking ${booking.id}`,
          ruleId: returnCompletedRule.ruleId,
          handoverKind: 'RETURN',
        },
      );
      await this.ensureBookingLifecycleTasks({ ...booking, status: 'COMPLETED' });
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: booking.organizationId,
          ...automationOutboxIdentity(returnCompletedRule.ruleId),
          entityType: 'BOOKING',
          entityId: booking.id,
          operation: 'ON_RETURN_HANDOVER_COMPLETED',
          payload: { bookingId: booking.id },
        }),
        err,
        `onReturnHandoverCompleted(${booking.id}) failed: ${sanitizeAutomationError(err)}`,
      );
    }
  }

  private async materializeBookingPreparationTask(
    booking: BookingLifecycleTaskInput,
    timing: BookingPreparationTiming,
    dedupKey: string,
  ): Promise<void> {
    const rule = getAutomationRuleByCatalogKey('BOOKING_PREPARATION');
    await this.safeUpsert(booking.organizationId, dedupKey, {
      vehicleId: booking.vehicleId,
      bookingId: booking.id,
      customerId: booking.customerId,
      title: rule.nameDe,
      description: rule.descriptionDe,
      category: rule.category,
      type: rule.taskType!,
      source: rule.source,
      sourceType: rule.sourceType,
      withChecklist: true,
      activatesAt: timing.activatesAt,
      dueDate: timing.dueDate,
      metadata: this.buildPreparationMetadata(dedupKey, timing, booking),
    });
  }

  private async materializeBookingPickupTask(
    booking: BookingLifecycleTaskInput,
    timing: BookingHandoverTiming,
    dedupKey: string,
  ): Promise<void> {
    const rule = getAutomationRuleByCatalogKey('BOOKING_PICKUP');
    await this.safeUpsert(booking.organizationId, dedupKey, {
      vehicleId: booking.vehicleId,
      bookingId: booking.id,
      customerId: booking.customerId,
      title: rule.nameDe,
      description: rule.descriptionDe,
      category: rule.category,
      type: rule.taskType!,
      priority: timing.priority,
      source: rule.source,
      sourceType: rule.sourceType,
      withChecklist: true,
      activatesAt: timing.activatesAt,
      dueDate: timing.dueDate,
      metadata: this.buildHandoverMetadata(
        dedupKey,
        timing,
        'BOOKING_PICKUP',
        'pickupAt',
        BOOKING_PICKUP_TIMING_RULE.activationLeadBeforePickupMs,
        booking,
      ),
    });
  }

  private async materializeBookingReturnTask(
    booking: BookingLifecycleTaskInput,
    timing: BookingHandoverTiming,
    dedupKey: string,
  ): Promise<void> {
    const rule = getAutomationRuleByCatalogKey('BOOKING_RETURN');
    await this.safeUpsert(booking.organizationId, dedupKey, {
      vehicleId: booking.vehicleId,
      bookingId: booking.id,
      customerId: booking.customerId,
      title: rule.nameDe,
      description: rule.descriptionDe,
      category: rule.category,
      type: rule.taskType!,
      priority: timing.priority,
      source: rule.source,
      sourceType: rule.sourceType,
      withChecklist: true,
      activatesAt: timing.activatesAt,
      dueDate: timing.dueDate,
      metadata: this.buildHandoverMetadata(
        dedupKey,
        timing,
        'BOOKING_RETURN',
        'returnAt',
        BOOKING_RETURN_TIMING_RULE.activationLeadBeforeReturnMs,
        booking,
      ),
    });
  }

  private async refreshBookingPickupTask(
    taskId: string,
    booking: BookingLifecycleTaskInput,
    timing: BookingHandoverTiming,
    dedupKey: string,
    timeZone: string,
  ): Promise<void> {
    const pickupRule = getAutomationRuleByCatalogKey('BOOKING_PICKUP');
    await this.tasks.updateTaskTiming(
      booking.organizationId,
      taskId,
      {
        activatesAt: timing.activatesAt,
        dueDate: timing.dueDate,
        priority: timing.priority,
      },
      {
        ruleId: pickupRule.ruleId,
        pickupAt: timing.milestoneAt,
        timeZone,
        bookingId: booking.id,
      },
    );
    await this.prisma.orgTask.update({
      where: { id: taskId },
      data: {
        vehicleId: booking.vehicleId,
        customerId: booking.customerId,
        metadata: this.buildHandoverMetadata(
          dedupKey,
          timing,
          'BOOKING_PICKUP',
          'pickupAt',
          BOOKING_PICKUP_TIMING_RULE.activationLeadBeforePickupMs,
          booking,
        ) as Prisma.InputJsonValue,
      },
    });
  }

  private async refreshBookingReturnTask(
    taskId: string,
    booking: BookingLifecycleTaskInput,
    timing: BookingHandoverTiming,
    dedupKey: string,
    timeZone: string,
  ): Promise<void> {
    const returnRule = getAutomationRuleByCatalogKey('BOOKING_RETURN');
    await this.tasks.updateTaskTiming(
      booking.organizationId,
      taskId,
      {
        activatesAt: timing.activatesAt,
        dueDate: timing.dueDate,
        priority: timing.priority,
      },
      {
        ruleId: returnRule.ruleId,
        returnAt: timing.milestoneAt,
        timeZone,
        bookingId: booking.id,
      },
    );
    await this.prisma.orgTask.update({
      where: { id: taskId },
      data: {
        vehicleId: booking.vehicleId,
        customerId: booking.customerId,
        metadata: this.buildHandoverMetadata(
          dedupKey,
          timing,
          'BOOKING_RETURN',
          'returnAt',
          BOOKING_RETURN_TIMING_RULE.activationLeadBeforeReturnMs,
          booking,
        ) as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Idempotently materializes the operational tasks for a booking based on its
   * current status. Safe to call on every booking create/update.
   */
  async ensureBookingLifecycleTasks(booking: BookingLifecycleTaskInput): Promise<void> {
    const { id, organizationId: orgId, status } = booking;
    const activeDedupKeys = this.activeBookingLifecycleDedupKeys(id, status);

    try {
      if (status === 'CONFIRMED') {
        await this.syncBookingPreparationTiming(booking);
        await this.syncBookingPickupTiming(booking);
        await this.vehicleCleaningTasks.syncBookingPreparationContext(booking);
      }

      if (status === 'ACTIVE') {
        await this.syncBookingReturnTiming(booking);
      }

      await this.tasks.closeStaleBookingLifecycleTasks(orgId, id, activeDedupKeys);
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: orgId,
          ...automationOutboxIdentity('booking.lifecycle.ensure'),
          entityType: 'BOOKING',
          entityId: id,
          operation: 'ENSURE_BOOKING_LIFECYCLE',
          payload: { bookingId: id },
        }),
        err,
        `ensureBookingLifecycleTasks(${id}) failed: ${sanitizeAutomationError(err)}`,
      );
    }
  }

  /** Dedup keys that remain open for the booking's current lifecycle phase. */
  private activeBookingLifecycleDedupKeys(bookingId: string, status: string): string[] {
    switch (status) {
      case 'CONFIRMED':
        return confirmedPhaseActiveDedupKeys(bookingId);
      case 'ACTIVE':
        return activeRentalPhaseDedupKeys(bookingId);
      case 'COMPLETED':
      case 'CANCELLED':
      case 'NO_SHOW':
        return [];
      default:
        return [];
    }
  }

  /** Repair/work-order task linked to a vendor (workshop). */
  async ensureRepairTask(
    orgId: string,
    input: {
      vehicleId: string;
      vendorId?: string | null;
      reason: string;
      title: string;
      description?: string;
      priority?: TaskPriority;
    },
  ): Promise<void> {
    const repairRule = getAutomationRuleByCatalogKey('REPAIR_REQUIRED');
    const key = vendorRepairDedupKey(input.vehicleId, input.vendorId, input.reason);
    try {
      await this.safeUpsert(orgId, key, {
        title: input.title || repairRule.nameDe,
        description: input.description ?? repairRule.descriptionDe,
        category: repairRule.category,
        type: repairRule.taskType!,
        priority: input.priority ?? repairRule.defaultPriority,
        source: repairRule.source,
        sourceType: repairRule.sourceType,
        vehicleId: input.vehicleId,
        vendorId: input.vendorId ?? null,
        metadata: {
          generatedKey: key,
          automation: buildAutomationMetadataBlock('REPAIR_REQUIRED'),
        },
      });
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: orgId,
          ...automationOutboxIdentity('REPAIR_REQUIRED'),
          entityType: 'VENDOR',
          entityId: input.vendorId ?? input.vehicleId,
          operation: 'ENSURE_REPAIR_TASK',
          payload: {
            vehicleId: input.vehicleId,
            vendorId: input.vendorId ?? undefined,
            repairReason: input.reason,
          },
        }),
        err,
        `ensureRepairTask(${input.vehicleId}) failed: ${sanitizeAutomationError(err)}`,
      );
    }
  }

  /**
   * Materialises or refreshes the single DOCUMENT_REVIEW task for a booking
   * document phase. Auto-resolves when no documents are missing.
   */
  async syncBookingDocumentPackageTask(
    orgId: string,
    input: {
      bookingId: string;
      vehicleId: string;
      customerId: string;
      phase: string;
      dedupKey: string;
      missingDocuments: Array<{
        documentType: string;
        humanReadableLabel: string;
        reason: string;
        actionType: string;
        canGenerateAutomatically: boolean;
        configurationProblem: boolean;
      }>;
    },
  ): Promise<void> {
    try {
      await this.tasks.supersedeLegacyPerTypeDocumentTasks(orgId, input.bookingId);

      if (input.missingDocuments.length === 0) {
        await this.tasks.autoResolveActiveDocumentPackageTask(orgId, input.bookingId, input.dedupKey, {
          phase: input.phase,
        });
        return;
      }

      const documentRule = getAutomationRuleByCatalogKey('DOCUMENT_PACKAGE_INCOMPLETE');
      const title = this.buildDocumentPackageTitle(input.missingDocuments.length);
      const metadata: Prisma.InputJsonValue = {
        generatedKey: input.dedupKey,
        automation: buildAutomationMetadataBlock('DOCUMENT_PACKAGE_INCOMPLETE'),
        documentPackage: {
          phase: input.phase,
          missingDocuments: input.missingDocuments,
        },
      };

      await this.safeUpsert(orgId, input.dedupKey, {
        vehicleId: input.vehicleId,
        bookingId: input.bookingId,
        customerId: input.customerId,
        title,
        description: documentRule.descriptionDe,
        category: documentRule.category,
        type: documentRule.taskType!,
        source: documentRule.source,
        sourceType: documentRule.sourceType,
        priority: input.missingDocuments.some((d) => d.documentType === 'FINAL_INVOICE')
          ? 'HIGH'
          : documentRule.defaultPriority,
        metadata,
        checklist: input.missingDocuments.map((slot, index) => ({
          title: slot.humanReadableLabel,
          description: `documentSlot:${slot.documentType}`,
          sortOrder: index,
          isRequired: true,
        })),
      });

      const existing = await this.prisma.orgTask.findFirst({
        where: { organizationId: orgId, dedupKey: input.dedupKey },
        orderBy: { createdAt: 'desc' },
      });
      if (existing && isActiveTaskStatus(existing.status)) {
        await this.tasks.syncDocumentPackageChecklist(
          orgId,
          existing.id,
          input.missingDocuments.map((slot) => ({
            marker: `documentSlot:${slot.documentType}`,
            title: slot.humanReadableLabel,
            satisfied: false,
          })),
        );
      }
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: orgId,
          ...automationOutboxIdentity('DOCUMENT_PACKAGE_INCOMPLETE'),
          entityType: 'DOCUMENT',
          entityId: input.bookingId,
          operation: 'SYNC_DOCUMENT_PACKAGES',
          payload: { bookingId: input.bookingId, phase: input.phase, dedupKey: input.dedupKey },
        }),
        err,
        `syncBookingDocumentPackageTask(${input.bookingId}/${input.phase}) failed: ${sanitizeAutomationError(err)}`,
      );
    }
  }

  private buildDocumentPackageTitle(missingCount: number): string {
    if (missingCount === 1) return 'Dokumentenpaket unvollständig – 1 Dokument fehlt';
    return `Dokumentenpaket unvollständig – ${missingCount} Dokumente fehlen`;
  }

  /** Supersedes all active document-package tasks when a booking is withdrawn. */
  async supersedeBookingDocumentPackageTasks(orgId: string, bookingId: string): Promise<void> {
    try {
      await this.tasks.supersedeActiveDocumentPackageTasks(orgId, bookingId);
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: orgId,
          ...automationOutboxIdentity('booking.document.package.supersede'),
          entityType: 'DOCUMENT',
          entityId: bookingId,
          operation: 'SUPERSEDE_DOCUMENT_PACKAGES',
          payload: { bookingId },
        }),
        err,
        `supersedeBookingDocumentPackageTasks(${bookingId}) failed: ${sanitizeAutomationError(err)}`,
      );
    }
  }

  async closeStaleDocumentPackageTasksForBooking(
    orgId: string,
    bookingId: string,
    activeDedupKeys: string[],
  ): Promise<void> {
    try {
      await this.tasks.closeStaleDocumentPackageTasks(orgId, bookingId, activeDedupKeys);
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: orgId,
          ...automationOutboxIdentity('booking.document.package.close_stale'),
          entityType: 'DOCUMENT',
          entityId: bookingId,
          operation: 'CLOSE_STALE_DOCUMENT_PACKAGES',
          payload: { bookingId, dedupKey: activeDedupKeys[0] },
        }),
        err,
        `closeStaleDocumentPackageTasksForBooking(${bookingId}) failed: ${sanitizeAutomationError(err)}`,
      );
    }
  }

  /** @deprecated Use {@link syncBookingDocumentPackageTask} — per-type tasks are superseded. */
  async ensureDocumentTask(
    orgId: string,
    input: {
      kind: string;
      documentId?: string | null;
      bookingId?: string | null;
      vehicleId?: string | null;
      title: string;
      description?: string;
      type?: Extract<TaskType, 'DOCUMENT_REVIEW' | 'INVOICE_REQUIRED'>;
      priority?: TaskPriority;
    },
  ): Promise<void> {
    const ref = input.documentId ?? input.bookingId ?? input.vehicleId ?? 'unknown';
    const key = `document:${input.kind}:${ref}`;
    await this.safeUpsert(orgId, key, {
      title: input.title,
      description: input.description,
      category: 'Documents',
      type: input.type ?? 'DOCUMENT_REVIEW',
      priority: input.priority ?? 'NORMAL',
      source: 'DOCUMENT',
      sourceType: 'DOCUMENT',
      documentId: input.documentId ?? null,
      bookingId: input.bookingId ?? null,
      vehicleId: input.vehicleId ?? null,
      metadata: { generatedKey: key },
    });
  }
}

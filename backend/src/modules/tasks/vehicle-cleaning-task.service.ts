import { Injectable, Logger } from '@nestjs/common';
import { CleaningStatus, Prisma, TaskPriority, TaskType } from '@prisma/client';
import { DEFAULT_TARIFF_TIMEZONE } from '@modules/pricing/tariff-instant.util';
import { PrismaService } from '@shared/database/prisma.service';
import { TaskAutomationRuleResolverService } from './automation/task-automation-rule-resolver.service';
import { shouldMaterializeFromResolvedRule } from './automation/task-automation-effective-rule.util';
import { getAutomationRuleByCatalogKey } from './automation/task-automation-rule.util';
import { TasksService } from './tasks.service';
import { checklistForType } from './task-templates';
import type { BookingLifecycleTaskInput } from './task-automation.service';
import { TaskAutomationOutboxEnqueueService } from './outbox/task-automation-outbox-enqueue.service';
import { TaskAutomationOutboxExecutionContext } from './outbox/task-automation-outbox-execution.context';
import { buildOutboxMeta } from './outbox/task-automation-outbox-meta.util';
import { sanitizeAutomationError } from './outbox/task-automation-outbox-error.util';
import { computeBookingPreparationTiming } from './booking-preparation-timing.util';
import {
  buildVehicleCleaningMetadata,
  isBareLegacyVehicleCleaningDedupKey,
  isLegacyBookingCleanDedupKey,
  legacyBookingCleanDedupKey,
  readCleaningMetadataNextBookingId,
  resolveCleaningPriorityFromPickup,
  resolveCleaningPurpose,
  vehicleCleaningDedupKey,
} from './vehicle-cleaning-task.util';
import { CleaningPurpose } from './vehicle-cleaning-task.rules';

export type CleaningTaskAction = 'created' | 'existing' | 'updated' | 'completed' | 'none';

export interface CleaningTaskMaterializeResult {
  action: CleaningTaskAction;
  taskId?: string;
  completedCount?: number;
}

const ACTIVE_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING'] as const;
const vehicleCleaningRule = getAutomationRuleByCatalogKey('VEHICLE_CLEANING_REQUIRED');

@Injectable()
export class VehicleCleaningTaskService {
  private readonly logger = new Logger(VehicleCleaningTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly outboxEnqueue: TaskAutomationOutboxEnqueueService,
    private readonly outboxContext: TaskAutomationOutboxExecutionContext,
    private readonly ruleResolver: TaskAutomationRuleResolverService,
  ) {}

  private async handleAutomationFailure(
    meta: Parameters<TaskAutomationOutboxEnqueueService['enqueueFailure']>[0],
    err: unknown,
    logMessage: string,
  ): Promise<void> {
    if (this.outboxContext.fromOutbox) {
      throw err instanceof Error ? err : new Error(sanitizeAutomationError(err));
    }
    await this.outboxEnqueue.enqueueFailure(meta, err);
    this.logger.warn(logMessage);
  }

  private async isCleaningAutomationEnabled(orgId: string): Promise<boolean> {
    const resolved = await this.ruleResolver.resolveTaskAutomationRule(
      orgId,
      vehicleCleaningRule.ruleId,
    );
    return shouldMaterializeFromResolvedRule(resolved);
  }

  /**
   * Ensures exactly one active cleaning task exists when the vehicle is marked
   * NEEDS_CLEANING. Uses canonical dedup + open-task scan (legacy rows included).
   */
  async ensureCleaningTask(orgId: string, vehicleId: string): Promise<CleaningTaskMaterializeResult> {
    return this.syncVehicleCleaningTask(orgId, vehicleId, { materializeIfNeeded: true });
  }

  /**
   * Refreshes booking context on an existing cleaning task for a CONFIRMED booking.
   * Does not auto-create a cleaning task — only materializes when cleaning is needed.
   */
  async syncBookingPreparationContext(
    booking: BookingLifecycleTaskInput,
    options?: { now?: Date },
  ): Promise<CleaningTaskMaterializeResult> {
    if (!(await this.isCleaningAutomationEnabled(booking.organizationId))) {
      return { action: 'none' };
    }

    if (booking.status !== 'CONFIRMED') {
      return { action: 'none' };
    }

    try {
      const needsCleaning = await this.vehicleNeedsCleaning(booking.organizationId, booking.vehicleId);
      const existing = await this.findPrimaryOpenCleaningTask(booking.organizationId, booking.vehicleId);

      if (!needsCleaning && !existing) {
        return { action: 'none' };
      }

      return this.syncVehicleCleaningTask(booking.organizationId, booking.vehicleId, {
        materializeIfNeeded: needsCleaning,
        bookingContext: booking,
        now: options?.now,
      });
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: booking.organizationId,
          ruleId: 'vehicle.cleaning.booking.sync',
          ruleVersion: 1,
          entityType: 'VEHICLE',
          entityId: booking.vehicleId,
          operation: 'SYNC_VEHICLE_CLEANING_BOOKING',
          payload: { bookingId: booking.id, vehicleId: booking.vehicleId },
        }),
        err,
        `syncBookingPreparationContext(${booking.id}) failed: ${sanitizeAutomationError(err)}`,
      );
      return { action: 'none' };
    }
  }

  /** Detaches or closes cleaning tasks when a booking is cancelled. */
  async onBookingCancelled(
    orgId: string,
    bookingId: string,
    vehicleId: string,
  ): Promise<void> {
    try {
      await this.tasks.supersedeLegacyBookingCleanTasks(orgId, {
        bookingId,
        vehicleId,
        reason: `Booking ${bookingId} cancelled — legacy booking:clean superseded`,
      });

      const needsCleaning = await this.vehicleNeedsCleaning(orgId, vehicleId);
      const openTasks = await this.findOpenCleaningTasks(orgId, vehicleId);

      for (const task of openTasks) {
        const linked =
          task.bookingId === bookingId ||
          readCleaningMetadataNextBookingId(task.metadata) === bookingId;
        if (!linked) continue;

        if (needsCleaning) {
          await this.detachBookingContext(orgId, task, vehicleId);
        } else {
          await this.tasks.supersedeTask(orgId, task.id, {
            resolutionCode: 'BOOKING_CANCELLED',
            reason: `Booking ${bookingId} cancelled — no cleaning need remains`,
            metadata: {
              ruleId: 'vehicle.cleaning.cancel',
              bookingId,
              vehicleId,
            },
          });
        }
      }
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: orgId,
          ruleId: 'vehicle.cleaning.cancel',
          ruleVersion: 1,
          entityType: 'VEHICLE',
          entityId: vehicleId,
          operation: 'VEHICLE_CLEANING_ON_CANCEL',
          payload: { bookingId, vehicleId },
        }),
        err,
        `onBookingCancelled(${bookingId}) failed: ${sanitizeAutomationError(err)}`,
      );
    }
  }

  /** Moves booking context when a confirmed booking switches vehicles. */
  async onBookingVehicleChanged(
    booking: BookingLifecycleTaskInput,
    previousVehicleId: string,
    options?: { now?: Date },
  ): Promise<void> {
    if (previousVehicleId === booking.vehicleId) return;

    try {
      await this.tasks.supersedeLegacyBookingCleanTasks(booking.organizationId, {
        bookingId: booking.id,
        vehicleId: previousVehicleId,
        reason: `Booking ${booking.id} vehicle changed — legacy clean on old vehicle superseded`,
      });

      const oldTasks = await this.findOpenCleaningTasks(booking.organizationId, previousVehicleId);
      for (const task of oldTasks) {
        const linked =
          task.bookingId === booking.id ||
          readCleaningMetadataNextBookingId(task.metadata) === booking.id;
        if (!linked) continue;

        const needsCleaningOld = await this.vehicleNeedsCleaning(
          booking.organizationId,
          previousVehicleId,
        );
        if (needsCleaningOld) {
          await this.detachBookingContext(booking.organizationId, task, previousVehicleId);
        } else {
          await this.tasks.supersedeTask(booking.organizationId, task.id, {
            resolutionCode: 'BOOKING_VEHICLE_CHANGED',
            reason: `Booking ${booking.id} moved to another vehicle — cleaning no longer required here`,
            metadata: {
              ruleId: 'vehicle.cleaning.vehicle_change',
              bookingId: booking.id,
              vehicleId: previousVehicleId,
              nextVehicleId: booking.vehicleId,
            },
          });
        }
      }

      if (booking.status === 'CONFIRMED') {
        await this.syncBookingPreparationContext(booking, options);
      }
    } catch (err: unknown) {
      await this.handleAutomationFailure(
        buildOutboxMeta({
          organizationId: booking.organizationId,
          ruleId: 'vehicle.cleaning.vehicle_change',
          ruleVersion: 1,
          entityType: 'VEHICLE',
          entityId: booking.vehicleId,
          operation: 'VEHICLE_CLEANING_ON_VEHICLE_CHANGE',
          payload: {
            bookingId: booking.id,
            vehicleId: booking.vehicleId,
            previousVehicleId: previousVehicleId,
          },
        }),
        err,
        `onBookingVehicleChanged(${booking.id}) failed: ${sanitizeAutomationError(err)}`,
      );
    }
  }

  /** Completes all active cleaning tasks when the vehicle is marked clean. */
  async completeOpenCleaningTasks(
    orgId: string,
    vehicleId: string,
    actorUserId?: string,
  ): Promise<CleaningTaskMaterializeResult> {
    const openTasks = await this.findOpenCleaningTasks(orgId, vehicleId);

    if (openTasks.length === 0) {
      return { action: 'none', completedCount: 0 };
    }

    for (const row of openTasks) {
      await this.tasks.autoResolveTask(orgId, row.id, {
        resolutionCode: 'VEHICLE_CLEANED',
        reason: 'Vehicle marked as clean',
        metadata: {
          ruleId: 'vehicle.cleaning_auto_resolve',
          vehicleId,
          ...(actorUserId ? { triggeredByUserId: actorUserId } : {}),
        },
      });
    }

    return {
      action: 'completed',
      completedCount: openTasks.length,
      taskId: openTasks[0]?.id,
    };
  }

  private async syncVehicleCleaningTask(
    orgId: string,
    vehicleId: string,
    options: {
      materializeIfNeeded: boolean;
      bookingContext?: BookingLifecycleTaskInput;
      now?: Date;
    },
  ): Promise<CleaningTaskMaterializeResult> {
    if (!(await this.isCleaningAutomationEnabled(orgId))) {
      return { action: 'none' };
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: {
        id: true,
        licensePlate: true,
        make: true,
        model: true,
        organizationId: true,
        cleaningStatus: true,
      },
    });
    if (!vehicle) {
      return { action: 'none' };
    }

    const needsCleaning = vehicle.cleaningStatus === 'NEEDS_CLEANING';
    const now = options.now ?? new Date();
    let existing = await this.findPrimaryOpenCleaningTask(orgId, vehicleId);

    if (!needsCleaning) {
      if (existing) {
        await this.tasks.supersedeTask(orgId, existing.id, {
          resolutionCode: 'VEHICLE_CLEANED',
          reason: 'Vehicle is clean — open cleaning task superseded',
          metadata: {
            ruleId: 'vehicle.cleaning.clean_status',
            vehicleId,
          },
        });
      }
      await this.tasks.supersedeLegacyBookingCleanTasks(orgId, {
        vehicleId,
        bookingId: options.bookingContext?.id,
        reason: `No cleaning need for vehicle ${vehicleId}`,
      });
      return { action: 'none' };
    }

    const bookingContext =
      options.bookingContext ??
      (await this.resolveNextBookingContext(orgId, vehicleId));

    await this.tasks.supersedeLegacyBookingCleanTasks(orgId, {
      vehicleId,
      bookingId: bookingContext?.id,
      excludeTaskId: existing?.id,
      reason: `Canonical vehicle cleaning task for vehicle ${vehicleId}`,
    });

    existing = (await this.findPrimaryOpenCleaningTask(orgId, vehicleId)) ?? existing;

    const purpose = resolveCleaningPurpose({
      nextBookingId: bookingContext?.id,
      preparationWindow: bookingContext ? 'PRE_BOOKING' : null,
    });
    const dedupKey = vehicleCleaningDedupKey(vehicleId, purpose);
    const priority = await this.resolveCleaningPriority(
      orgId,
      vehicleId,
      bookingContext?.startDate ?? null,
      now,
    );
    const timing = bookingContext
      ? await this.resolvePreparationTiming(bookingContext, now)
      : null;

    if (existing) {
      await this.refreshCleaningTask(orgId, existing, {
        vehicle,
        dedupKey,
        purpose,
        priority,
        bookingContext,
        timing,
      });
      return {
        action: options.bookingContext ? 'updated' : 'existing',
        taskId: existing.id,
      };
    }

    if (!needsCleaning) {
      return { action: 'none' };
    }

    const label =
      [vehicle.make, vehicle.model].filter(Boolean).join(' ') ||
      vehicle.licensePlate ||
      vehicleId;
    const plate = vehicle.licensePlate ?? '—';

    const task = await this.tasks.upsertByDedup(orgId, dedupKey, {
      title: 'Vehicle cleaning required',
      description: `Interior/exterior cleaning required for ${label} (${plate}).`,
      category: 'Cleaning',
      type: 'VEHICLE_CLEANING' as TaskType,
      sourceType: 'SYSTEM',
      source: 'VEHICLE_CLEANING',
      vehicleId,
      bookingId: bookingContext?.id ?? null,
      customerId: bookingContext?.customerId ?? null,
      priority,
      blocksVehicleAvailability: true,
      dueDate: timing?.dueDate ?? null,
      activatesAt: timing?.activatesAt ?? now,
      checklist: checklistForType('VEHICLE_CLEANING'),
      metadata: buildVehicleCleaningMetadata({
        dedupKey,
        vehicleId,
        cleaningPurpose: purpose,
        nextBookingId: bookingContext?.id ?? null,
        nextPickupAt: bookingContext?.startDate?.toISOString() ?? null,
        customerId: bookingContext?.customerId ?? null,
      }),
    });

    return { action: 'created', taskId: task.id };
  }

  private async refreshCleaningTask(
    orgId: string,
    task: { id: string; dedupKey: string | null; metadata: unknown },
    input: {
      vehicle: {
        id: string;
        licensePlate: string | null;
        make: string | null;
        model: string | null;
      };
      dedupKey: string;
      purpose: CleaningPurpose;
      priority: TaskPriority;
      bookingContext?: BookingLifecycleTaskInput | null;
      timing?: { activatesAt: Date; dueDate: Date } | null;
    },
  ): Promise<void> {
    const metadata = buildVehicleCleaningMetadata({
      dedupKey: input.dedupKey,
      vehicleId: input.vehicle.id,
      cleaningPurpose: input.purpose,
      nextBookingId: input.bookingContext?.id ?? null,
      nextPickupAt: input.bookingContext?.startDate?.toISOString() ?? null,
      customerId: input.bookingContext?.customerId ?? null,
    });

    const nextDedupKey =
      task.dedupKey && task.dedupKey !== input.dedupKey
        ? input.dedupKey
        : task.dedupKey ?? input.dedupKey;

    if (
      !task.dedupKey ||
      isBareLegacyVehicleCleaningDedupKey(task.dedupKey) ||
      isLegacyBookingCleanDedupKey(task.dedupKey) ||
      task.dedupKey !== input.dedupKey
    ) {
      const conflict = await this.prisma.orgTask.findFirst({
        where: {
          organizationId: orgId,
          dedupKey: input.dedupKey,
          NOT: { id: task.id },
        },
        select: { id: true },
      });
      if (!conflict) {
        await this.prisma.orgTask.update({
          where: { id: task.id },
          data: { dedupKey: input.dedupKey },
        });
      }
    }

    await this.prisma.orgTask.update({
      where: { id: task.id },
      data: {
        bookingId: input.bookingContext?.id ?? null,
        customerId: input.bookingContext?.customerId ?? null,
        priority: input.priority,
        dueDate: input.timing?.dueDate ?? null,
        activatesAt: input.timing?.activatesAt ?? undefined,
        metadata: metadata as Prisma.InputJsonValue,
        ...(nextDedupKey !== task.dedupKey && !isBareLegacyVehicleCleaningDedupKey(task.dedupKey ?? '')
          ? {}
          : {}),
      },
    });

    if (input.timing) {
      await this.tasks.updateTaskTiming(
        orgId,
        task.id,
        {
          activatesAt: input.timing.activatesAt,
          dueDate: input.timing.dueDate,
          priority: input.priority,
        },
        {
          ruleId: 'vehicle.cleaning.context_sync',
          bookingId: input.bookingContext?.id,
        },
      );
    }
  }

  private async detachBookingContext(
    orgId: string,
    task: { id: string; dedupKey: string | null; metadata: unknown },
    vehicleId: string,
  ): Promise<void> {
    const purpose: CleaningPurpose = 'STANDALONE';
    const dedupKey = vehicleCleaningDedupKey(vehicleId, purpose);
    const metadata = buildVehicleCleaningMetadata({
      dedupKey,
      vehicleId,
      cleaningPurpose: purpose,
      nextBookingId: null,
      nextPickupAt: null,
    });

    const conflict = await this.prisma.orgTask.findFirst({
      where: {
        organizationId: orgId,
        dedupKey,
        NOT: { id: task.id },
      },
      select: { id: true },
    });

    await this.prisma.orgTask.update({
      where: { id: task.id },
      data: {
        bookingId: null,
        customerId: null,
        priority: 'NORMAL',
        metadata: metadata as Prisma.InputJsonValue,
        ...(conflict ? {} : { dedupKey }),
      },
    });
  }

  private async findOpenCleaningTasks(orgId: string, vehicleId: string) {
    return this.prisma.orgTask.findMany({
      where: {
        organizationId: orgId,
        vehicleId,
        type: 'VEHICLE_CLEANING',
        status: { in: [...ACTIVE_STATUSES] },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async findPrimaryOpenCleaningTask(orgId: string, vehicleId: string) {
    const openTasks = await this.findOpenCleaningTasks(orgId, vehicleId);
    if (openTasks.length === 0) return null;
    if (openTasks.length === 1) return openTasks[0]!;

    const [primary, ...duplicates] = openTasks;
    for (const dup of duplicates) {
      await this.tasks.supersedeTask(orgId, dup.id, {
        resolutionCode: 'CLEANING_TASK_SUPERSEDED',
        reason: 'Duplicate cleaning task consolidated under canonical vehicle identity',
        metadata: {
          ruleId: 'vehicle.cleaning.dedup',
          canonicalTaskId: primary!.id,
          vehicleId,
        },
      });
    }
    return primary!;
  }

  private async vehicleNeedsCleaning(orgId: string, vehicleId: string): Promise<boolean> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: { cleaningStatus: true },
    });
    return vehicle?.cleaningStatus === ('NEEDS_CLEANING' as CleaningStatus);
  }

  private async resolveNextBookingContext(
    orgId: string,
    vehicleId: string,
    excludeBookingId?: string,
  ): Promise<BookingLifecycleTaskInput | null> {
    const nextBooking = await this.prisma.booking.findFirst({
      where: {
        organizationId: orgId,
        vehicleId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startDate: { gt: new Date() },
        ...(excludeBookingId ? { NOT: { id: excludeBookingId } } : {}),
      },
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        customerId: true,
        status: true,
        startDate: true,
        endDate: true,
        pickupStationId: true,
        returnStationId: true,
      },
    });
    return nextBooking;
  }

  private async resolveCleaningPriority(
    orgId: string,
    vehicleId: string,
    nextPickupAt: Date | null,
    now: Date,
  ): Promise<TaskPriority> {
    if (nextPickupAt) {
      return resolveCleaningPriorityFromPickup(nextPickupAt, now);
    }
    const nextBooking = await this.prisma.booking.findFirst({
      where: {
        organizationId: orgId,
        vehicleId,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startDate: { gt: now },
      },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    });
    return resolveCleaningPriorityFromPickup(nextBooking?.startDate ?? null, now);
  }

  private async resolvePreparationTiming(booking: BookingLifecycleTaskInput, now: Date) {
    const timeZone = await this.resolveOrgTimezone(booking.organizationId);
    const timing = computeBookingPreparationTiming(booking.startDate, now, timeZone);
    return { activatesAt: timing.activatesAt, dueDate: timing.dueDate };
  }

  private async resolveOrgTimezone(orgId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true },
    });
    return org?.timezone?.trim() || DEFAULT_TARIFF_TIMEZONE;
  }
}

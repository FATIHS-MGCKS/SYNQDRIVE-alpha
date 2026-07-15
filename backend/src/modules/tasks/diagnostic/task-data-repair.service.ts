import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TaskCompletionMode } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TasksService } from '../tasks.service';
import { isActiveTaskStatus } from '../task-transition.policy';
import { TaskDataDiagnosticService } from './task-data-diagnostic.service';
import {
  buildBackfillMetadata,
  chunkItems,
  groupActiveDuplicates,
  hasCompletionEvent,
  hasLegacyChecklistDocumented,
  inferCompletedAt,
  inferCompletionMode,
  pickCanonicalTask,
} from './task-data-repair.util';
import {
  TASK_DATA_REPAIR_SCRIPT_VERSION,
  type RepairTaskRow,
  type TaskRepairAction,
  type TaskRepairActionId,
  type TaskRepairAuditLogEntry,
  type TaskRepairReport,
  type TaskRepairRunOptions,
  type TaskRepairSkipped,
  type TaskRepairUnresolved,
} from './task-data-repair.types';

const DEFAULT_BATCH_SIZE = 20;

@Injectable()
export class TaskDataRepairService {
  private readonly logger = new Logger(TaskDataRepairService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly diagnostic: TaskDataDiagnosticService,
  ) {}

  async runRepair(options: TaskRepairRunOptions = {}): Promise<TaskRepairReport> {
    const apply = options.apply === true;
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const referenceNow = options.referenceNow ?? new Date();
    const orgIds = options.organizationId
      ? [options.organizationId]
      : (await this.prisma.organization.findMany({ select: { id: true } })).map((o) => o.id);

    const diagnosticBefore = await this.diagnostic.runDiagnostic({
      organizationId: options.organizationId,
      referenceNow,
      includeFindings: false,
    });

    const actions: TaskRepairAction[] = [];
    const unresolved: TaskRepairUnresolved[] = [];
    const skipped: TaskRepairSkipped[] = [];
    const auditLog: TaskRepairAuditLogEntry[] = [];
    let tasksScanned = 0;
    let errorCount = 0;

    const log = (
      level: TaskRepairAuditLogEntry['level'],
      message: string,
      meta?: { actionId?: TaskRepairActionId; taskId?: string },
    ) => {
      auditLog.push({
        at: new Date().toISOString(),
        level,
        message,
        ...meta,
      });
    };

    log('info', `Repair started (dryRun=${!apply}, apply=${apply}, batchSize=${batchSize})`);

    for (const organizationId of orgIds) {
      const tasks = await this.loadRepairTasks(organizationId);
      tasksScanned += tasks.length;

      const planned = this.planRepairs(organizationId, tasks, unresolved, skipped);
      actions.push(...planned);

      if (!apply) {
        log('info', `Dry-run: planned ${planned.length} action(s) for org ${organizationId}`);
        continue;
      }

      for (const batch of chunkItems(planned, batchSize)) {
        for (const action of batch) {
          try {
            await this.applyAction(action);
            action.applied = true;
            log('action', action.description, { actionId: action.actionId, taskId: action.taskId });
          } catch (err: unknown) {
            errorCount += 1;
            const message = err instanceof Error ? err.message : String(err);
            log('error', `Failed ${action.actionId} on ${action.taskId}: ${message}`, {
              actionId: action.actionId,
              taskId: action.taskId,
            });
            this.logger.error(`Repair action failed: ${action.actionId} ${action.taskId}`, err as Error);
          }
        }
      }
    }

    const diagnosticAfter = apply
      ? await this.diagnostic.runDiagnostic({
          organizationId: options.organizationId,
          referenceNow,
          includeFindings: false,
        })
      : undefined;

    const byAction: Partial<Record<TaskRepairActionId, number>> = {};
    for (const action of actions) {
      byAction[action.actionId] = (byAction[action.actionId] ?? 0) + 1;
    }

    return {
      mode: 'repair',
      dryRun: !apply,
      apply,
      scriptVersion: TASK_DATA_REPAIR_SCRIPT_VERSION,
      generatedAt: new Date().toISOString(),
      organizationId: options.organizationId ?? null,
      organizationCount: orgIds.length,
      tasksScanned,
      summary: {
        planned: actions.length,
        applied: actions.filter((a) => a.applied).length,
        skipped: skipped.length,
        unresolved: unresolved.length,
        errors: errorCount,
        byAction,
      },
      actions,
      unresolved,
      skipped,
      auditLog,
      diagnosticBefore,
      diagnosticAfter,
    };
  }

  private async loadRepairTasks(organizationId: string): Promise<RepairTaskRow[]> {
    return this.prisma.orgTask.findMany({
      where: { organizationId },
      include: {
        checklistItems: { select: { id: true, isDone: true, isRequired: true } },
        events: {
          select: {
            type: true,
            actorUserId: true,
            oldValue: true,
            newValue: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { comments: true, attachments: true } },
      },
    }) as Promise<RepairTaskRow[]>;
  }

  private planRepairs(
    organizationId: string,
    tasks: RepairTaskRow[],
    unresolved: TaskRepairUnresolved[],
    skipped: TaskRepairSkipped[],
  ): TaskRepairAction[] {
    const actions: TaskRepairAction[] = [];
    const supersedeTargets = new Set<string>();

    for (const group of groupActiveDuplicates(tasks)) {
      const canonical = pickCanonicalTask(group);
      for (const duplicate of group) {
        if (duplicate.id === canonical.id) continue;
        if (supersedeTargets.has(duplicate.id)) continue;
        supersedeTargets.add(duplicate.id);

        const commentCount = duplicate._count?.comments ?? 0;
        const attachmentCount = duplicate._count?.attachments ?? 0;
        if (commentCount > 0 || attachmentCount > 0) {
          actions.push({
            actionId: 'reassign_task_resources',
            organizationId,
            taskId: duplicate.id,
            relatedTaskId: canonical.id,
            description: `Move ${commentCount} comment(s) and ${attachmentCount} attachment(s) from duplicate task to canonical task`,
            before: { comments: commentCount, attachments: attachmentCount, taskId: duplicate.id },
            after: { comments: commentCount, attachments: attachmentCount, taskId: canonical.id },
            applied: false,
          });
        }

        actions.push({
          actionId: 'supersede_duplicate_task',
          organizationId,
          taskId: duplicate.id,
          relatedTaskId: canonical.id,
          description: `Supersede duplicate active task in favor of canonical task ${canonical.id}`,
          before: { status: duplicate.status, dedupKey: duplicate.dedupKey },
          after: {
            status: 'DONE',
            completionMode: TaskCompletionMode.SUPERSEDED,
            supersededByTaskId: canonical.id,
          },
          applied: false,
        });
      }
    }

    for (const task of tasks) {
      this.planDoneIntegrityRepairs(task, actions, unresolved);
      this.planChecklistLegacyRepairs(task, actions, skipped);
      this.planTimingRepairs(task, actions, skipped);
      this.planAuditRepairs(task, actions, unresolved, skipped);
    }

    return this.dedupePlannedActions(actions);
  }

  private planDoneIntegrityRepairs(
    task: RepairTaskRow,
    actions: TaskRepairAction[],
    unresolved: TaskRepairUnresolved[],
  ): void {
    if (task.status !== 'DONE') return;

    const inferredMode = inferCompletionMode(task);
    if (!task.completionMode) {
      if (inferredMode) {
        actions.push({
          actionId: 'backfill_completion_mode',
          organizationId: task.organizationId,
          taskId: task.id,
          description: `Backfill completionMode=${inferredMode}`,
          before: { completionMode: null },
          after: { completionMode: inferredMode },
          applied: false,
        });
      } else {
        unresolved.push({
          organizationId: task.organizationId,
          taskId: task.id,
          rule: 'backfill_completion_mode',
          reason: 'Completion provenance is not reliably derivable',
        });
      }
    }

    if (!task.completedAt) {
      const inferredAt = inferCompletedAt(task);
      if (inferredAt) {
        actions.push({
          actionId: 'backfill_completed_at',
          organizationId: task.organizationId,
          taskId: task.id,
          description: `Backfill completedAt=${inferredAt.toISOString()}`,
          before: { completedAt: null },
          after: { completedAt: inferredAt.toISOString() },
          applied: false,
        });
      } else {
        unresolved.push({
          organizationId: task.organizationId,
          taskId: task.id,
          rule: 'backfill_completed_at',
          reason: 'No reliable completion timestamp source',
        });
      }
    }

    const effectiveMode = task.completionMode ?? inferredMode;
    if (!hasCompletionEvent(task) && effectiveMode) {
      const eventPlan = this.planCompletionEventBackfill(task, effectiveMode);
      if (eventPlan) {
        actions.push(eventPlan);
      } else {
        unresolved.push({
          organizationId: task.organizationId,
          taskId: task.id,
          rule: 'backfill_completion_event',
          reason: 'Missing completion event but provenance is unclear',
          details: { completionMode: effectiveMode },
        });
      }
    }
  }

  private planCompletionEventBackfill(
    task: RepairTaskRow,
    mode: TaskCompletionMode,
  ): TaskRepairAction | null {
    if (mode === TaskCompletionMode.MANUAL) {
      if (task.events.some((e) => e.type === 'CHECKLIST_COMPLETION_OVERRIDDEN')) {
        return null;
      }
      if (!task.completedByUserId) return null;
      const fromStatus =
        task.events.find((e) => e.type === 'STATUS_CHANGED')?.oldValue ??
        task.events[0]?.oldValue ??
        'OPEN';
      return {
        actionId: 'backfill_completion_event',
        organizationId: task.organizationId,
        taskId: task.id,
        description: 'Backfill STATUS_CHANGED→DONE completion event for manual completion',
        before: { completionEvent: null },
        after: {
          eventType: 'STATUS_CHANGED',
          oldValue: fromStatus,
          newValue: 'DONE',
          actorUserId: task.completedByUserId,
        },
        applied: false,
      };
    }

    if (mode === TaskCompletionMode.AUTO_RESOLVED) {
      if (task.events.some((e) => e.type === 'AUTO_RESOLVED')) return null;
      const fromStatus =
        task.events.filter((e) => e.type === 'STATUS_CHANGED').at(-1)?.oldValue ?? 'OPEN';
      return {
        actionId: 'backfill_completion_event',
        organizationId: task.organizationId,
        taskId: task.id,
        description: 'Backfill AUTO_RESOLVED completion event',
        before: { completionEvent: null },
        after: {
          eventType: 'AUTO_RESOLVED',
          oldValue: fromStatus,
          newValue: 'DONE',
          completionMode: TaskCompletionMode.AUTO_RESOLVED,
        },
        applied: false,
      };
    }

    if (mode === TaskCompletionMode.SUPERSEDED) {
      if (task.events.some((e) => e.type === 'SUPERSEDED')) return null;
      const fromStatus =
        task.events.filter((e) => e.type === 'STATUS_CHANGED').at(-1)?.oldValue ?? 'OPEN';
      return {
        actionId: 'backfill_completion_event',
        organizationId: task.organizationId,
        taskId: task.id,
        description: 'Backfill SUPERSEDED completion event',
        before: { completionEvent: null },
        after: {
          eventType: 'SUPERSEDED',
          oldValue: fromStatus,
          newValue: 'DONE',
          supersededByTaskId: task.supersededByTaskId,
        },
        applied: false,
      };
    }

    return null;
  }

  private planChecklistLegacyRepairs(
    task: RepairTaskRow,
    actions: TaskRepairAction[],
    skipped: TaskRepairSkipped[],
  ): void {
    if (task.status !== 'DONE' || task.checklistItems.length === 0) return;

    const openRequired = task.checklistItems.filter((item) => item.isRequired && !item.isDone);
    const allOpen = task.checklistItems.every((item) => !item.isDone);
    const hasRequired = task.checklistItems.some((item) => item.isRequired);
    const hasInconsistency =
      openRequired.length > 0 || (allOpen && !hasRequired && task.checklistItems.length > 0);

    if (!hasInconsistency) return;
    if (hasLegacyChecklistDocumented(task)) {
      skipped.push({
        organizationId: task.organizationId,
        taskId: task.id,
        rule: 'document_legacy_checklist_inconsistency',
        reason: 'Legacy checklist inconsistency already documented',
      });
      return;
    }

    actions.push({
      actionId: 'document_legacy_checklist_inconsistency',
      organizationId: task.organizationId,
      taskId: task.id,
      description: 'Document legacy checklist inconsistency without mutating checklist items',
      before: {
        openRequiredCount: openRequired.length,
        checklistItemCount: task.checklistItems.length,
      },
      after: {
        metadataFlag: 'legacyChecklistInconsistency',
        eventType: 'LEGACY_CHECKLIST_INCONSISTENCY',
      },
      applied: false,
    });
  }

  private planTimingRepairs(
    task: RepairTaskRow,
    actions: TaskRepairAction[],
    skipped: TaskRepairSkipped[],
  ): void {
    if (task.activatesAt && task.dueDate && task.activatesAt.getTime() > task.dueDate.getTime()) {
      if (!isActiveTaskStatus(task.status)) {
        skipped.push({
          organizationId: task.organizationId,
          taskId: task.id,
          rule: 'fix_timing_activates_after_due',
          reason: 'Timing repair only applies to active tasks',
        });
        return;
      }
      actions.push({
        actionId: 'fix_timing_activates_after_due',
        organizationId: task.organizationId,
        taskId: task.id,
        description: 'Clamp activatesAt to dueDate (activatesAt was after dueDate)',
        before: {
          activatesAt: task.activatesAt.toISOString(),
          dueDate: task.dueDate.toISOString(),
        },
        after: {
          activatesAt: task.dueDate.toISOString(),
          dueDate: task.dueDate.toISOString(),
        },
        applied: false,
      });
    }

    if (task.completedAt && task.completedAt.getTime() < task.createdAt.getTime()) {
      actions.push({
        actionId: 'fix_timing_completed_before_created',
        organizationId: task.organizationId,
        taskId: task.id,
        description: 'Set completedAt to createdAt (completedAt was before createdAt)',
        before: {
          completedAt: task.completedAt.toISOString(),
          createdAt: task.createdAt.toISOString(),
        },
        after: { completedAt: task.createdAt.toISOString() },
        applied: false,
      });
    }
  }

  private planAuditRepairs(
    task: RepairTaskRow,
    actions: TaskRepairAction[],
    unresolved: TaskRepairUnresolved[],
    skipped: TaskRepairSkipped[],
  ): void {
    if (
      task.completionMode === TaskCompletionMode.AUTO_RESOLVED &&
      !task.events.some((e) => e.type === 'AUTO_RESOLVED') &&
      !actions.some((a) => a.taskId === task.id && a.actionId === 'backfill_completion_event')
    ) {
      const fromStatus =
        task.events.filter((e) => e.type === 'STATUS_CHANGED').at(-1)?.oldValue ?? 'OPEN';
      actions.push({
        actionId: 'backfill_auto_resolved_event',
        organizationId: task.organizationId,
        taskId: task.id,
        description: 'Backfill missing AUTO_RESOLVED audit event',
        before: { autoResolvedEvent: null },
        after: { eventType: 'AUTO_RESOLVED', oldValue: fromStatus, newValue: 'DONE' },
        applied: false,
      });
    }

    if (task.assignedUserId) {
      const assignmentEvents = task.events.filter((e) => e.type === 'ASSIGNED');
      const needsBackfill =
        assignmentEvents.length === 0 ||
        (assignmentEvents.at(-1)?.newValue && assignmentEvents.at(-1)!.newValue !== task.assignedUserId);

      if (needsBackfill) {
        if (assignmentEvents.length > 0) {
          unresolved.push({
            organizationId: task.organizationId,
            taskId: task.id,
            rule: 'backfill_assigned_event',
            reason: 'assignedUserId conflicts with last ASSIGNED event — manual review required',
            details: { assignedUserId: task.assignedUserId },
          });
        } else {
          actions.push({
            actionId: 'backfill_assigned_event',
            organizationId: task.organizationId,
            taskId: task.id,
            description: 'Backfill missing ASSIGNED audit event',
            before: { assignedEvent: null },
            after: {
              eventType: 'ASSIGNED',
              newValue: task.assignedUserId,
            },
            applied: false,
          });
        }
      }
    }

    if (task.cancelledAt && task.status === 'DONE') {
      skipped.push({
        organizationId: task.organizationId,
        taskId: task.id,
        rule: 'done_with_cancelled_at',
        reason: 'Ambiguous DONE task with cancelledAt — not auto-repaired',
      });
    }
  }

  private dedupePlannedActions(actions: TaskRepairAction[]): TaskRepairAction[] {
    const seen = new Set<string>();
    const out: TaskRepairAction[] = [];
    for (const action of actions) {
      const key = `${action.actionId}:${action.taskId}:${action.relatedTaskId ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(action);
    }
    return out;
  }

  private async applyAction(action: TaskRepairAction): Promise<void> {
    switch (action.actionId) {
      case 'backfill_completion_mode':
        await this.applyBackfillCompletionMode(action);
        return;
      case 'backfill_completed_at':
        await this.applyBackfillCompletedAt(action);
        return;
      case 'backfill_completion_event':
        await this.applyBackfillCompletionEvent(action);
        return;
      case 'backfill_auto_resolved_event':
        await this.applyBackfillAutoResolvedEvent(action);
        return;
      case 'backfill_assigned_event':
        await this.applyBackfillAssignedEvent(action);
        return;
      case 'reassign_task_resources':
        await this.applyReassignTaskResources(action);
        return;
      case 'supersede_duplicate_task':
        await this.applySupersedeDuplicate(action);
        return;
      case 'fix_timing_activates_after_due':
        await this.applyFixTimingActivatesAfterDue(action);
        return;
      case 'fix_timing_completed_before_created':
        await this.applyFixTimingCompletedBeforeCreated(action);
        return;
      case 'document_legacy_checklist_inconsistency':
        await this.applyDocumentLegacyChecklist(action);
        return;
      default:
        throw new Error(`Unknown repair action: ${action.actionId}`);
    }
  }

  private async applyBackfillCompletionMode(action: TaskRepairAction): Promise<void> {
    const mode = action.after.completionMode as TaskCompletionMode;
    const task = await this.prisma.orgTask.findFirst({
      where: { id: action.taskId, organizationId: action.organizationId },
      select: { completionMode: true },
    });
    if (!task || task.completionMode === mode) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.orgTask.update({
        where: { id: action.taskId },
        data: { completionMode: mode },
      });
      await tx.taskEvent.create({
        data: {
          taskId: action.taskId,
          type: 'DATA_REPAIR_BACKFILL',
          actorUserId: null,
          oldValue: task.completionMode,
          newValue: mode,
          metadata: buildBackfillMetadata('backfill_completion_mode') as Prisma.InputJsonValue,
        },
      });
    });
  }

  private async applyBackfillCompletedAt(action: TaskRepairAction): Promise<void> {
    const completedAt = new Date(String(action.after.completedAt));
    const task = await this.prisma.orgTask.findFirst({
      where: { id: action.taskId, organizationId: action.organizationId },
      select: { completedAt: true },
    });
    if (!task || task.completedAt) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.orgTask.update({
        where: { id: action.taskId },
        data: { completedAt },
      });
      await tx.taskEvent.create({
        data: {
          taskId: action.taskId,
          type: 'DATA_REPAIR_BACKFILL',
          actorUserId: null,
          oldValue: null,
          newValue: completedAt.toISOString(),
          metadata: buildBackfillMetadata('backfill_completed_at') as Prisma.InputJsonValue,
        },
      });
    });
  }

  private async applyBackfillCompletionEvent(action: TaskRepairAction): Promise<void> {
    const eventType = String(action.after.eventType);
    const task = await this.prisma.orgTask.findFirst({
      where: { id: action.taskId, organizationId: action.organizationId },
      select: { events: { select: { type: true, newValue: true } } },
    });
    if (!task) return;

    const alreadyPresent = task.events.some(
      (e) =>
        (eventType === 'STATUS_CHANGED' && e.type === 'STATUS_CHANGED' && e.newValue === 'DONE') ||
        e.type === eventType,
    );
    if (alreadyPresent) return;

    const metadata = buildBackfillMetadata('backfill_completion_event', {
      resolutionKind: action.after.newValue === 'DONE' ? action.after.completionMode : undefined,
      supersededByTaskId: action.after.supersededByTaskId ?? null,
    });

    await this.prisma.taskEvent.create({
      data: {
        taskId: action.taskId,
        type: eventType,
        actorUserId: (action.after.actorUserId as string | undefined) ?? null,
        oldValue: (action.after.oldValue as string | undefined) ?? null,
        newValue: (action.after.newValue as string | undefined) ?? null,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private async applyBackfillAutoResolvedEvent(action: TaskRepairAction): Promise<void> {
    const task = await this.prisma.orgTask.findFirst({
      where: { id: action.taskId, organizationId: action.organizationId },
      select: { events: { where: { type: 'AUTO_RESOLVED' }, select: { id: true } } },
    });
    if (!task || task.events.length > 0) return;

    await this.prisma.taskEvent.create({
      data: {
        taskId: action.taskId,
        type: 'AUTO_RESOLVED',
        actorUserId: null,
        oldValue: (action.after.oldValue as string | undefined) ?? null,
        newValue: 'DONE',
        metadata: buildBackfillMetadata('backfill_auto_resolved_event', {
          resolutionKind: TaskCompletionMode.AUTO_RESOLVED,
        }) as Prisma.InputJsonValue,
      },
    });
  }

  private async applyBackfillAssignedEvent(action: TaskRepairAction): Promise<void> {
    const task = await this.prisma.orgTask.findFirst({
      where: { id: action.taskId, organizationId: action.organizationId },
      select: {
        assignedUserId: true,
        events: { where: { type: 'ASSIGNED' }, select: { id: true } },
      },
    });
    if (!task || !task.assignedUserId || task.events.length > 0) return;

    await this.prisma.taskEvent.create({
      data: {
        taskId: action.taskId,
        type: 'ASSIGNED',
        actorUserId: null,
        oldValue: null,
        newValue: task.assignedUserId,
        metadata: buildBackfillMetadata('backfill_assigned_event') as Prisma.InputJsonValue,
      },
    });
  }

  private async applyReassignTaskResources(action: TaskRepairAction): Promise<void> {
    const fromTaskId = action.taskId;
    const toTaskId = action.relatedTaskId;
    if (!toTaskId) throw new Error('reassign_task_resources requires relatedTaskId');

    await this.prisma.$transaction(async (tx) => {
      const comments = await tx.taskComment.updateMany({
        where: { taskId: fromTaskId },
        data: { taskId: toTaskId },
      });
      const attachments = await tx.taskAttachment.updateMany({
        where: { taskId: fromTaskId },
        data: { taskId: toTaskId },
      });
      if (comments.count > 0 || attachments.count > 0) {
        await tx.taskEvent.create({
          data: {
            taskId: toTaskId,
            type: 'DATA_REPAIR_BACKFILL',
            actorUserId: null,
            oldValue: fromTaskId,
            newValue: toTaskId,
            metadata: buildBackfillMetadata('reassign_task_resources', {
              movedComments: comments.count,
              movedAttachments: attachments.count,
            }) as Prisma.InputJsonValue,
          },
        });
      }
    });
  }

  private async applySupersedeDuplicate(action: TaskRepairAction): Promise<void> {
    const canonicalId = action.relatedTaskId;
    if (!canonicalId) throw new Error('supersede_duplicate_task requires relatedTaskId');

    await this.tasks.supersedeTask(action.organizationId, action.taskId, {
      resolutionCode: 'TASK_DATA_REPAIR_SUPERSEDED',
      reason: 'Duplicate active task consolidated by task data repair script',
      supersededByTaskId: canonicalId,
      metadata: buildBackfillMetadata('supersede_duplicate_task', {
        canonicalTaskId: canonicalId,
        scriptVersion: TASK_DATA_REPAIR_SCRIPT_VERSION,
      }) as Prisma.InputJsonValue,
    });
  }

  private async applyFixTimingActivatesAfterDue(action: TaskRepairAction): Promise<void> {
    const dueDate = new Date(String(action.after.dueDate));
    await this.tasks.updateTaskTiming(
      action.organizationId,
      action.taskId,
      { activatesAt: dueDate, dueDate },
      { ruleId: 'task.data.repair.timing.clamp' },
    );
  }

  private async applyFixTimingCompletedBeforeCreated(action: TaskRepairAction): Promise<void> {
    const completedAt = new Date(String(action.after.completedAt));
    const task = await this.prisma.orgTask.findFirst({
      where: { id: action.taskId, organizationId: action.organizationId },
      select: { completedAt: true, createdAt: true },
    });
    if (!task || !task.completedAt || task.completedAt.getTime() >= task.createdAt.getTime()) return;
    const previousCompletedAt = task.completedAt;

    await this.prisma.$transaction(async (tx) => {
      await tx.orgTask.update({
        where: { id: action.taskId },
        data: { completedAt },
      });
      await tx.taskEvent.create({
        data: {
          taskId: action.taskId,
          type: 'DATA_REPAIR_BACKFILL',
          actorUserId: null,
          oldValue: previousCompletedAt.toISOString(),
          newValue: completedAt.toISOString(),
          metadata: buildBackfillMetadata('fix_timing_completed_before_created') as Prisma.InputJsonValue,
        },
      });
    });
  }

  private async applyDocumentLegacyChecklist(action: TaskRepairAction): Promise<void> {
    const task = await this.prisma.orgTask.findFirst({
      where: { id: action.taskId, organizationId: action.organizationId },
      select: { metadata: true, checklistItems: { select: { isDone: true, isRequired: true } } },
    });
    if (!task || hasLegacyChecklistDocumented({ metadata: task.metadata } as RepairTaskRow)) return;

    const openRequiredCount = task.checklistItems.filter((i) => i.isRequired && !i.isDone).length;
    const openCount = task.checklistItems.filter((i) => !i.isDone).length;
    const existingMeta =
      task.metadata && typeof task.metadata === 'object' && !Array.isArray(task.metadata)
        ? (task.metadata as Record<string, unknown>)
        : {};
    const legacyDoc = {
      documentedAt: new Date().toISOString(),
      openRequiredCount,
      openChecklistItemCount: openCount,
      checklistItemCount: task.checklistItems.length,
      scriptVersion: TASK_DATA_REPAIR_SCRIPT_VERSION,
      provenance: 'BACKFILL',
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.orgTask.update({
        where: { id: action.taskId },
        data: {
          metadata: {
            ...existingMeta,
            legacyChecklistInconsistency: legacyDoc,
          } as Prisma.InputJsonValue,
        },
      });
      await tx.taskEvent.create({
        data: {
          taskId: action.taskId,
          type: 'LEGACY_CHECKLIST_INCONSISTENCY',
          actorUserId: null,
          oldValue: null,
          newValue: String(openRequiredCount),
          metadata: buildBackfillMetadata('document_legacy_checklist_inconsistency', legacyDoc) as Prisma.InputJsonValue,
        },
      });
    });
  }
}

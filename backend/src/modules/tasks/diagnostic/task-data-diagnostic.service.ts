import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TaskCompletionMode,
  TaskType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isLegacyPerTypeDocumentDedupKey } from '@modules/documents/booking-document-phase.util';
import { isInvoicePaymentCheckDedupKey } from '@modules/invoices/invoice-payment-task.util';
import {
  bookingPickupDedupKey,
  bookingPreparationDedupKey,
  bookingReturnDedupKey,
} from '../booking-task-automation.constants';
import { isActiveTaskStatus } from '../task-transition.policy';
import {
  isBareLegacyVehicleCleaningDedupKey,
  isCanonicalVehicleCleaningDedupKey,
  isLegacyBookingCleanDedupKey,
} from '../vehicle-cleaning-task.util';
import { TASK_DIAGNOSTIC_CHECK_META } from './task-data-diagnostic-check-meta';
import { maskTaskId } from './task-data-diagnostic.safety.util';
import type {
  TaskDiagnosticCategory,
  TaskDiagnosticCheckId,
  TaskDiagnosticFinding,
  TaskDiagnosticReport,
  TaskDiagnosticRunOptions,
  TaskDiagnosticSeverity,
} from './task-data-diagnostic.types';

const DEFAULT_SAMPLE_LIMIT = 25;

const KNOWN_AUTOMATION_SOURCES = new Set([
  'BOOKING',
  'DOCUMENT',
  'VENDOR',
  'INVOICE',
  'INSIGHT_SERVICE',
  'INSIGHT_COMPLIANCE',
  'INSIGHT_HEALTH',
  'VEHICLE_CLEANING',
]);

type TaskRow = Prisma.OrgTaskGetPayload<{
  include: {
    checklistItems: { select: { id: true; isDone: true; isRequired: true } };
    events: { select: { type: true; oldValue: true; newValue: true; createdAt: true } };
  };
}>;

interface OrgLinkIndex {
  bookings: Map<string, string>;
  vehicles: Map<string, string>;
  invoices: Map<string, string>;
  generatedDocuments: Set<string>;
  extractions: Map<string, string | null>;
}

@Injectable()
export class TaskDataDiagnosticService {
  constructor(private readonly prisma: PrismaService) {}

  async runDiagnostic(options: TaskDiagnosticRunOptions = {}): Promise<TaskDiagnosticReport> {
    const sampleLimit = options.sampleLimit ?? DEFAULT_SAMPLE_LIMIT;
    const referenceNow = options.referenceNow ?? new Date();
    const orgIds = options.organizationId
      ? [options.organizationId]
      : (await this.prisma.organization.findMany({ select: { id: true } })).map((o) => o.id);

    const findings: TaskDiagnosticFinding[] = [];
    let tasksScanned = 0;

    for (const organizationId of orgIds) {
      const linkIndex = await this.loadOrgLinkIndex(organizationId);
      const tasks = await this.prisma.orgTask.findMany({
        where: { organizationId },
        include: {
          checklistItems: { select: { id: true, isDone: true, isRequired: true } },
          events: {
            select: { type: true, oldValue: true, newValue: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      tasksScanned += tasks.length;

      for (const task of tasks) {
        findings.push(
          ...this.checkDoneIntegrity(task),
          ...this.checkDoneChecklist(task),
          ...this.checkTiming(task, referenceNow),
          ...this.checkMissingLinks(task, linkIndex),
          ...this.checkAudit(task),
          ...this.checkLegacyAutomation(task),
        );
      }

      findings.push(...this.checkActiveDuplicates(tasks));
    }

    return this.buildReport({
      findings,
      tasksScanned,
      organizationId: options.organizationId ?? null,
      organizationCount: orgIds.length,
      referenceNow,
      sampleLimit,
      includeFindings: options.includeFindings ?? false,
    });
  }

  private async loadOrgLinkIndex(organizationId: string): Promise<OrgLinkIndex> {
    const [bookings, vehicles, invoices, generatedDocuments, extractions] = await Promise.all([
      this.prisma.booking.findMany({
        where: { organizationId },
        select: { id: true, organizationId: true },
      }),
      this.prisma.vehicle.findMany({
        where: { organizationId },
        select: { id: true, organizationId: true },
      }),
      this.prisma.orgInvoice.findMany({
        where: { organizationId },
        select: { id: true, organizationId: true },
      }),
      this.prisma.generatedDocument.findMany({
        where: { organizationId },
        select: { id: true },
      }),
      this.prisma.vehicleDocumentExtraction.findMany({
        where: { organizationId },
        select: { id: true, organizationId: true },
      }),
    ]);

    return {
      bookings: new Map(bookings.map((b) => [b.id, b.organizationId])),
      vehicles: new Map(vehicles.map((v) => [v.id, v.organizationId])),
      invoices: new Map(invoices.map((i) => [i.id, i.organizationId])),
      generatedDocuments: new Set(generatedDocuments.map((d) => d.id)),
      extractions: new Map(extractions.map((e) => [e.id, e.organizationId])),
    };
  }

  private push(
    bucket: TaskDiagnosticFinding[],
    checkId: TaskDiagnosticCheckId,
    task: TaskRow,
    message: string,
    details?: TaskDiagnosticFinding['details'],
  ): void {
    const meta = TASK_DIAGNOSTIC_CHECK_META[checkId];
    bucket.push({
      checkId,
      category: meta.category,
      severity: meta.severity,
      organizationId: task.organizationId,
      taskId: task.id,
      message,
      details,
    });
  }

  private checkDoneIntegrity(task: TaskRow): TaskDiagnosticFinding[] {
    const out: TaskDiagnosticFinding[] = [];
    if (task.status !== 'DONE') return out;

    if (!task.completedAt) {
      this.push(out, 'done_missing_completed_at', task, 'Task is DONE but completedAt is null');
    }

    if (!task.completionMode) {
      this.push(out, 'done_missing_completion_mode', task, 'Task is DONE but completionMode is null');
    }

    if (!this.hasCompletionEvent(task)) {
      this.push(out, 'done_missing_completion_event', task, 'No STATUS_CHANGED→DONE, AUTO_RESOLVED, or CHECKLIST_COMPLETION_OVERRIDDEN event');
    }

    const note = task.resolutionNote?.trim().toLowerCase() ?? '';
    if (note) {
      const autoHint = /(automatisch|auto[\s-]?resolved|auto[\s-]?closed|system)/i.test(note);
      const manualHint = /(manuell|manual|von operator|durch mitarbeiter)/i.test(note);
      if (task.completionMode === TaskCompletionMode.AUTO_RESOLVED && manualHint) {
        this.push(
          out,
          'done_contradictory_resolution_note',
          task,
          'AUTO_RESOLVED task has manual-sounding resolutionNote',
        );
      } else if (task.completionMode === TaskCompletionMode.MANUAL && autoHint) {
        this.push(
          out,
          'done_contradictory_resolution_note',
          task,
          'MANUAL task has auto-sounding resolutionNote',
        );
      }
    }

    if (task.cancelledAt) {
      this.push(out, 'done_with_cancelled_at', task, 'Task is DONE but cancelledAt is set');
    }

    return out;
  }

  private hasCompletionEvent(task: TaskRow): boolean {
    return task.events.some(
      (e) =>
        (e.type === 'STATUS_CHANGED' && e.newValue === 'DONE') ||
        e.type === 'AUTO_RESOLVED' ||
        e.type === 'CHECKLIST_COMPLETION_OVERRIDDEN',
    );
  }

  private checkDoneChecklist(task: TaskRow): TaskDiagnosticFinding[] {
    const out: TaskDiagnosticFinding[] = [];
    if (task.status !== 'DONE' || task.checklistItems.length === 0) return out;

    const openRequired = task.checklistItems.filter((item) => item.isRequired && !item.isDone);
    if (openRequired.length > 0) {
      this.push(out, 'done_with_open_required_checklist', task, `${openRequired.length} required checklist item(s) still open`, {
        openRequiredCount: openRequired.length,
      });
    }

    const allOpen = task.checklistItems.every((item) => !item.isDone);
    const hasRequired = task.checklistItems.some((item) => item.isRequired);
    if (allOpen && !hasRequired) {
      this.push(
        out,
        'done_with_fully_open_checklist',
        task,
        'DONE task has checklist but every item is still open (legacy checklist without required flags)',
        { checklistItemCount: task.checklistItems.length },
      );
    }

    return out;
  }

  private checkTiming(task: TaskRow, referenceNow: Date): TaskDiagnosticFinding[] {
    const out: TaskDiagnosticFinding[] = [];

    if (task.activatesAt && task.dueDate && task.activatesAt.getTime() > task.dueDate.getTime()) {
      this.push(out, 'timing_activates_after_due', task, 'activatesAt is after dueDate');
    }

    if (task.completedAt && task.completedAt.getTime() < task.createdAt.getTime()) {
      this.push(out, 'timing_completed_before_created', task, 'completedAt is before createdAt');
    }

    if (
      isActiveTaskStatus(task.status) &&
      task.activatesAt &&
      task.activatesAt.getTime() > referenceNow.getTime()
    ) {
      this.push(
        out,
        'timing_future_activates_legacy_visible',
        task,
        'Active-status task has future activatesAt — would appear open under legacy null-activatesAt logic',
        { activatesAt: task.activatesAt.toISOString() },
      );
    }

    return out;
  }

  private checkMissingLinks(task: TaskRow, index: OrgLinkIndex): TaskDiagnosticFinding[] {
    const out: TaskDiagnosticFinding[] = [];

    if (task.bookingId) {
      const org = index.bookings.get(task.bookingId);
      if (!org) {
        this.push(out, 'missing_link_booking', task, `bookingId ${maskTaskId(task.bookingId)} not found in org`);
      } else if (org !== task.organizationId) {
        this.push(out, 'cross_org_booking_link', task, 'bookingId belongs to another organization');
      }
    }

    if (task.vehicleId) {
      const org = index.vehicles.get(task.vehicleId);
      if (!org) {
        this.push(out, 'missing_link_vehicle', task, `vehicleId ${maskTaskId(task.vehicleId)} not found in org`);
      } else if (org !== task.organizationId) {
        this.push(out, 'cross_org_vehicle_link', task, 'vehicleId belongs to another organization');
      }
    }

    if (task.invoiceId) {
      const org = index.invoices.get(task.invoiceId);
      if (!org) {
        this.push(out, 'missing_link_invoice', task, `invoiceId ${maskTaskId(task.invoiceId)} not found in org`);
      } else if (org !== task.organizationId) {
        this.push(out, 'cross_org_invoice_link', task, 'invoiceId belongs to another organization');
      }
    }

    if (task.documentId) {
      const inGenerated = index.generatedDocuments.has(task.documentId);
      const extractionOrg = index.extractions.get(task.documentId);
      const inExtraction = extractionOrg !== undefined;
      if (!inGenerated && !inExtraction) {
        this.push(
          out,
          'missing_link_document',
          task,
          `documentId ${maskTaskId(task.documentId)} not found as GeneratedDocument or VehicleDocumentExtraction`,
        );
      } else if (extractionOrg && extractionOrg !== task.organizationId) {
        this.push(out, 'cross_org_document_link', task, 'documentId extraction belongs to another organization');
      }
    }

    return out;
  }

  private checkAudit(task: TaskRow): TaskDiagnosticFinding[] {
    const out: TaskDiagnosticFinding[] = [];

    const statusEvents = task.events.filter((e) =>
      ['STATUS_CHANGED', 'AUTO_RESOLVED', 'SUPERSEDED', 'CHECKLIST_COMPLETION_OVERRIDDEN'].includes(e.type),
    );
    if (statusEvents.length > 0) {
      const last = statusEvents[statusEvents.length - 1];
      const expected = task.status;
      if (last.newValue && last.newValue !== expected) {
        this.push(
          out,
          'audit_status_event_mismatch',
          task,
          `Task status ${expected} does not match last status event newValue ${last.newValue}`,
          { lastEventType: last.type },
        );
      }
    }

    if (
      task.completionMode === TaskCompletionMode.AUTO_RESOLVED &&
      !task.events.some((e) => e.type === 'AUTO_RESOLVED')
    ) {
      this.push(out, 'audit_auto_close_without_event', task, 'completionMode AUTO_RESOLVED without AUTO_RESOLVED event');
    }

    if (task.assignedUserId) {
      const assignmentEvents = task.events.filter((e) => e.type === 'ASSIGNED');
      if (assignmentEvents.length === 0) {
        this.push(out, 'audit_assignment_without_event', task, 'assignedUserId set but no ASSIGNED event in timeline');
      } else {
        const lastAssign = assignmentEvents[assignmentEvents.length - 1];
        if (lastAssign.newValue && lastAssign.newValue !== task.assignedUserId) {
          this.push(
            out,
            'audit_assignment_without_event',
            task,
            'assignedUserId does not match last ASSIGNED event',
            { lastAssignedUserId: lastAssign.newValue },
          );
        }
      }
    }

    return out;
  }

  private checkLegacyAutomation(task: TaskRow): TaskDiagnosticFinding[] {
    const out: TaskDiagnosticFinding[] = [];

    if (task.source && !KNOWN_AUTOMATION_SOURCES.has(task.source)) {
      this.push(out, 'legacy_automation_source', task, `Non-canonical source string: ${task.source}`);
    }

    if (task.dedupKey && this.isLegacyDedupKey(task)) {
      this.push(out, 'legacy_dedup_key_format', task, `Legacy or non-canonical dedupKey: ${task.dedupKey}`, {
        taskType: task.type,
      });
    }

    return out;
  }

  private isLegacyDedupKey(task: TaskRow): boolean {
    const key = task.dedupKey!;
    if (isLegacyBookingCleanDedupKey(key)) return true;
    if (isBareLegacyVehicleCleaningDedupKey(key)) return true;
    if (isLegacyPerTypeDocumentDedupKey(key)) return true;
    if (key.startsWith('invoice:unpaid:')) return true;

    switch (task.type) {
      case 'BOOKING_PREPARATION':
        return key !== bookingPreparationDedupKey(task.bookingId ?? '');
      case 'BOOKING_PICKUP':
        return key !== bookingPickupDedupKey(task.bookingId ?? '');
      case 'BOOKING_RETURN':
        return key !== bookingReturnDedupKey(task.bookingId ?? '');
      case 'DOCUMENT_REVIEW':
        return !key.startsWith('document:package:');
      case 'VEHICLE_CLEANING':
        return !isCanonicalVehicleCleaningDedupKey(key);
      case 'INVOICE_REQUIRED':
        return task.invoiceId ? !isInvoicePaymentCheckDedupKey(key) : false;
      default:
        return false;
    }
  }

  private checkActiveDuplicates(tasks: TaskRow[]): TaskDiagnosticFinding[] {
    const out: TaskDiagnosticFinding[] = [];
    const active = tasks.filter((t) => isActiveTaskStatus(t.status));

    const byDedup = new Map<string, TaskRow[]>();
    for (const task of active) {
      if (!task.dedupKey) continue;
      const list = byDedup.get(task.dedupKey) ?? [];
      list.push(task);
      byDedup.set(task.dedupKey, list);
    }
    for (const [dedupKey, group] of byDedup) {
      if (group.length <= 1) continue;
      for (const task of group) {
        this.push(out, 'active_duplicate_dedup_key', task, `dedupKey ${dedupKey} has ${group.length} active tasks`, {
          dedupKey,
          activeCount: group.length,
        });
      }
    }

    this.pushGroupedDuplicates(
      out,
      active.filter((t) => t.type === 'BOOKING_PREPARATION' && t.bookingId),
      (t) => `booking-prep:${t.bookingId}`,
      'multiple_booking_preparation',
      'Multiple active BOOKING_PREPARATION tasks for same booking',
    );

    this.pushGroupedDuplicates(
      out,
      active.filter((t) => t.type === 'DOCUMENT_REVIEW' && t.dedupKey?.startsWith('document:package:')),
      (t) => t.dedupKey!,
      'multiple_document_review_phase',
      'Multiple active DOCUMENT_REVIEW tasks for same booking phase',
    );

    this.pushGroupedDuplicates(
      out,
      active.filter((t) => t.type === 'VEHICLE_CLEANING' && t.vehicleId),
      (t) => this.cleaningWindowKey(t),
      'multiple_vehicle_cleaning_window',
      'Multiple active VEHICLE_CLEANING tasks for same vehicle window',
    );

    this.pushGroupedDuplicates(
      out,
      active.filter((t) => t.type === 'INVOICE_REQUIRED' && t.invoiceId),
      (t) => `invoice-payment:${t.invoiceId}`,
      'multiple_invoice_payment_task',
      'Multiple active invoice payment-check tasks for same invoice',
    );

    return out;
  }

  private cleaningWindowKey(task: TaskRow): string {
    if (task.dedupKey && isCanonicalVehicleCleaningDedupKey(task.dedupKey)) {
      return task.dedupKey;
    }
    if (task.dedupKey && isLegacyBookingCleanDedupKey(task.dedupKey)) {
      return `legacy-booking-clean:${task.dedupKey}`;
    }
    return `vehicle:${task.vehicleId}:fallback`;
  }

  private pushGroupedDuplicates(
    out: TaskDiagnosticFinding[],
    tasks: TaskRow[],
    keyFn: (task: TaskRow) => string,
    checkId: TaskDiagnosticCheckId,
    message: string,
  ): void {
    const groups = new Map<string, TaskRow[]>();
    for (const task of tasks) {
      const key = keyFn(task);
      const list = groups.get(key) ?? [];
      list.push(task);
      groups.set(key, list);
    }
    for (const [groupKey, group] of groups) {
      if (group.length <= 1) continue;
      for (const task of group) {
        this.push(out, checkId, task, message, { groupKey, activeCount: group.length });
      }
    }
  }

  private buildReport(input: {
    findings: TaskDiagnosticFinding[];
    tasksScanned: number;
    organizationId: string | null;
    organizationCount: number;
    referenceNow: Date;
    sampleLimit: number;
    includeFindings: boolean;
  }): TaskDiagnosticReport {
    const byCategory = this.emptyCategoryCounts();
    const byCheck: Partial<Record<TaskDiagnosticCheckId, number>> = {};
    let errors = 0;
    let warnings = 0;
    let infos = 0;

    for (const finding of input.findings) {
      byCategory[finding.category] += 1;
      byCheck[finding.checkId] = (byCheck[finding.checkId] ?? 0) + 1;
      if (finding.severity === 'error') errors += 1;
      else if (finding.severity === 'warning') warnings += 1;
      else infos += 1;
    }

    const checks = (Object.keys(TASK_DIAGNOSTIC_CHECK_META) as TaskDiagnosticCheckId[])
      .map((checkId) => {
        const related = input.findings.filter((f) => f.checkId === checkId);
        if (related.length === 0) return null;
        const meta = TASK_DIAGNOSTIC_CHECK_META[checkId];
        return {
          checkId,
          category: meta.category,
          severity: meta.severity,
          label: meta.label,
          count: related.length,
          sampleTaskIds: related.slice(0, input.sampleLimit).map((f) => maskTaskId(f.taskId)),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => b.count - a.count);

    return {
      mode: 'diagnostic',
      dryRun: true,
      readOnly: true,
      generatedAt: new Date().toISOString(),
      referenceNow: input.referenceNow.toISOString(),
      organizationId: input.organizationId,
      organizationCount: input.organizationCount,
      tasksScanned: input.tasksScanned,
      summary: {
        totalFindings: input.findings.length,
        errors,
        warnings,
        infos,
        byCategory,
        byCheck,
      },
      checks,
      findings: input.includeFindings
        ? input.findings.slice(0, input.sampleLimit * checks.length).map((f) => ({
            ...f,
            taskId: maskTaskId(f.taskId),
            details: f.details,
          }))
        : undefined,
    };
  }

  private emptyCategoryCounts(): Record<TaskDiagnosticCategory, number> {
    return {
      done_integrity: 0,
      done_checklist: 0,
      active_duplicates: 0,
      missing_links: 0,
      timing: 0,
      audit: 0,
      legacy_automation: 0,
    };
  }
}

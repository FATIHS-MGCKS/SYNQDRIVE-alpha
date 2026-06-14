import { Injectable, Logger } from '@nestjs/common';
import { TaskPriority, TaskType } from '@prisma/client';
import { TasksService } from './tasks.service';
import { checklistForType } from './task-templates';

/**
 * V4.8.3 — Booking / Document / Vendor → Task automation.
 *
 * Health/Alert auto-tasks flow through InsightTaskBridgeService (they ride the
 * insight run + auto-close). This service covers the non-insight operational
 * sources. Every task carries a stable `generatedKey` (stored as `dedupKey` +
 * in metadata) so re-running a lifecycle hook escalates a single task instead
 * of duplicating it. Failures are swallowed and logged — task automation must
 * never break the booking/vendor/document write that triggered it.
 */
@Injectable()
export class TaskAutomationService {
  private readonly logger = new Logger(TaskAutomationService.name);

  constructor(private readonly tasks: TasksService) {}

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
      sourceType: 'BOOKING' | 'DOCUMENT' | 'VENDOR';
      vehicleId?: string | null;
      bookingId?: string | null;
      customerId?: string | null;
      vendorId?: string | null;
      documentId?: string | null;
      withChecklist?: boolean;
    },
  ): Promise<void> {
    try {
      await this.tasks.upsertByDedup(orgId, generatedKey, {
        title: payload.title,
        description: payload.description,
        category: payload.category,
        type: payload.type,
        sourceType: payload.sourceType,
        priority: payload.priority ?? 'MEDIUM',
        vehicleId: payload.vehicleId ?? null,
        bookingId: payload.bookingId ?? null,
        customerId: payload.customerId ?? null,
        vendorId: payload.vendorId ?? null,
        documentId: payload.documentId ?? null,
        source: payload.source,
        metadata: { generatedKey },
        checklist: payload.withChecklist ? checklistForType(payload.type) : undefined,
      });
    } catch (err: any) {
      this.logger.warn(`Auto-task ${generatedKey} (org ${orgId}) failed: ${err?.message ?? err}`);
    }
  }

  /**
   * Idempotently materializes the operational tasks for a booking based on its
   * current status. Safe to call on every booking create/update.
   */
  async ensureBookingLifecycleTasks(booking: {
    id: string;
    organizationId: string;
    vehicleId: string;
    customerId: string;
    status: string;
  }): Promise<void> {
    const { id, organizationId: orgId, vehicleId, customerId, status } = booking;
    const base = { vehicleId, bookingId: id, customerId } as const;

    if (status === 'CONFIRMED') {
      await this.safeUpsert(orgId, `booking:prep:${id}`, {
        ...base,
        title: 'Buchung vorbereiten',
        description: 'Fahrzeug und Dokumente für die anstehende Buchung vorbereiten.',
        category: 'Booking',
        type: 'BOOKING_PREPARATION',
        source: 'BOOKING',
        sourceType: 'BOOKING',
        withChecklist: true,
      });
      await this.safeUpsert(orgId, `booking:clean:${id}`, {
        ...base,
        title: 'Fahrzeug reinigen',
        category: 'Cleaning',
        type: 'VEHICLE_CLEANING',
        source: 'BOOKING',
        sourceType: 'BOOKING',
        withChecklist: true,
      });
      await this.safeUpsert(orgId, `booking:document:${id}`, {
        ...base,
        title: 'Buchungsdokumente prüfen',
        category: 'Documents',
        type: 'DOCUMENT_REVIEW',
        source: 'BOOKING',
        sourceType: 'BOOKING',
      });
    }

    if (status === 'ACTIVE') {
      await this.safeUpsert(orgId, `booking:pickup:${id}`, {
        ...base,
        title: 'Fahrzeugübergabe (Pickup)',
        category: 'Booking',
        type: 'BOOKING_PICKUP',
        priority: 'HIGH',
        source: 'BOOKING',
        sourceType: 'BOOKING',
        withChecklist: true,
      });
    }

    if (status === 'COMPLETED') {
      await this.safeUpsert(orgId, `booking:return:${id}`, {
        ...base,
        title: 'Fahrzeugrücknahme (Return)',
        category: 'Booking',
        type: 'BOOKING_RETURN',
        priority: 'HIGH',
        source: 'BOOKING',
        sourceType: 'BOOKING',
        withChecklist: true,
      });
      await this.safeUpsert(orgId, `booking:invoice:${id}`, {
        ...base,
        title: 'Schlussrechnung erstellen/prüfen',
        category: 'invoice',
        type: 'INVOICE_REQUIRED',
        source: 'BOOKING',
        sourceType: 'BOOKING',
      });
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
    const key = `vendor:repair:${input.vehicleId}:${input.vendorId ?? 'none'}:${input.reason}`;
    await this.safeUpsert(orgId, key, {
      title: input.title,
      description: input.description,
      category: 'Repair',
      type: 'REPAIR',
      priority: input.priority ?? 'HIGH',
      source: 'VENDOR',
      sourceType: 'VENDOR',
      vehicleId: input.vehicleId,
      vendorId: input.vendorId ?? null,
    });
  }

  /** Review/invoice task for a (possibly missing) required document. */
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
      priority: input.priority ?? 'MEDIUM',
      source: 'DOCUMENT',
      sourceType: 'DOCUMENT',
      documentId: input.documentId ?? null,
      bookingId: input.bookingId ?? null,
      vehicleId: input.vehicleId ?? null,
    });
  }
}

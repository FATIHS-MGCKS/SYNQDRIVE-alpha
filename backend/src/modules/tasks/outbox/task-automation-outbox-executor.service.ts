import { Injectable } from '@nestjs/common';
import type { TaskAutomationOutbox } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import { InsightTaskBridgeService } from '@modules/business-insights/insight-task-bridge.service';
import { InvoicePaymentTaskService } from '@modules/invoices/invoice-payment-task.service';
import { TaskAutomationService } from '../task-automation.service';
import { VehicleCleaningTaskService } from '../vehicle-cleaning-task.service';
import { TaskAutomationOutboxExecutionContext } from './task-automation-outbox-execution.context';
import type { TaskAutomationOutboxPayload } from './task-automation-outbox.types';

@Injectable()
export class TaskAutomationOutboxExecutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executionContext: TaskAutomationOutboxExecutionContext,
    private readonly taskAutomation: TaskAutomationService,
    private readonly invoicePaymentTasks: InvoicePaymentTaskService,
    private readonly insightBridge: InsightTaskBridgeService,
    private readonly vehicleCleaning: VehicleCleaningTaskService,
    private readonly documentBundle: BookingDocumentBundleService,
  ) {}

  async execute(row: TaskAutomationOutbox): Promise<void> {
    const payload = row.payload as unknown as TaskAutomationOutboxPayload;
    this.executionContext.fromOutbox = true;
    try {
      switch (payload.operation) {
        case 'ENSURE_BOOKING_LIFECYCLE':
          await this.taskAutomation.ensureBookingLifecycleTasks(
            await this.loadBookingLifecycle(row.organizationId, payload.bookingId!),
          );
          break;
        case 'SYNC_BOOKING_PREPARATION':
          await this.taskAutomation.syncBookingPreparationTiming(
            await this.loadBookingLifecycle(row.organizationId, payload.bookingId!),
            {
              previousStartDate: payload.previousStartDate
                ? new Date(payload.previousStartDate)
                : undefined,
            },
          );
          break;
        case 'SYNC_BOOKING_PICKUP':
          await this.taskAutomation.syncBookingPickupTiming(
            await this.loadBookingLifecycle(row.organizationId, payload.bookingId!),
            {
              previousStartDate: payload.previousStartDate
                ? new Date(payload.previousStartDate)
                : undefined,
            },
          );
          break;
        case 'SYNC_BOOKING_RETURN':
          await this.taskAutomation.syncBookingReturnTiming(
            await this.loadBookingLifecycle(row.organizationId, payload.bookingId!),
            {
              previousEndDate: payload.previousEndDate
                ? new Date(payload.previousEndDate)
                : undefined,
            },
          );
          break;
        case 'SUPERSEDE_BOOKING_LIFECYCLE':
          await this.taskAutomation.supersedeBookingLifecycleOnCancellation(
            row.organizationId,
            payload.bookingId!,
          );
          break;
        case 'HANDLE_BOOKING_NO_SHOW':
          await this.taskAutomation.handleBookingNoShow(row.organizationId, payload.bookingId!);
          break;
        case 'ON_PICKUP_HANDOVER_COMPLETED':
          await this.taskAutomation.onPickupHandoverCompleted(
            await this.loadBookingLifecycle(row.organizationId, payload.bookingId!),
          );
          break;
        case 'ON_RETURN_HANDOVER_COMPLETED':
          await this.taskAutomation.onReturnHandoverCompleted(
            await this.loadBookingLifecycle(row.organizationId, payload.bookingId!),
          );
          break;
        case 'SYNC_DOCUMENT_PACKAGES':
          await this.documentBundle.resyncBookingDocumentTasks(
            row.organizationId,
            payload.bookingId!,
          );
          break;
        case 'SUPERSEDE_DOCUMENT_PACKAGES':
          await this.taskAutomation.supersedeBookingDocumentPackageTasks(
            row.organizationId,
            payload.bookingId!,
          );
          break;
        case 'CLOSE_STALE_DOCUMENT_PACKAGES':
          await this.taskAutomation.closeStaleDocumentPackageTasksForBooking(
            row.organizationId,
            payload.bookingId!,
            payload.dedupKey ? [payload.dedupKey] : [],
          );
          break;
        case 'SYNC_INVOICE_PAYMENT_CHECK':
          await this.invoicePaymentTasks.syncPaymentCheckTaskById(
            row.organizationId,
            payload.invoiceId!,
          );
          break;
        case 'MATERIALIZE_INSIGHT_TASK':
          await this.insightBridge.rematerializeFromOutbox(
            row.organizationId,
            payload.insightDedupKey!,
          );
          break;
        case 'SYNC_VEHICLE_CLEANING_BOOKING':
          await this.vehicleCleaning.syncBookingPreparationContext(
            await this.loadBookingLifecycle(row.organizationId, payload.bookingId!),
          );
          break;
        case 'VEHICLE_CLEANING_ON_CANCEL':
          await this.vehicleCleaning.onBookingCancelled(
            row.organizationId,
            payload.bookingId!,
            payload.vehicleId!,
          );
          break;
        case 'VEHICLE_CLEANING_ON_VEHICLE_CHANGE': {
          const booking = await this.loadBookingLifecycle(row.organizationId, payload.bookingId!);
          await this.vehicleCleaning.onBookingVehicleChanged(
            booking,
            payload.previousVehicleId ?? payload.vehicleId!,
          );
          break;
        }
        case 'ENSURE_REPAIR_TASK':
          await this.taskAutomation.ensureRepairTask(row.organizationId, {
            vehicleId: payload.vehicleId!,
            vendorId: payload.vendorId ?? null,
            reason: payload.repairReason ?? 'repair',
            title: 'Repair task',
          });
          break;
        default:
          throw new Error(`Unknown task automation operation: ${(payload as { operation: string }).operation}`);
      }
    } finally {
      this.executionContext.fromOutbox = false;
    }
  }

  private async loadBookingLifecycle(orgId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
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
    if (!booking) {
      throw new Error(`Booking ${bookingId} not found for org ${orgId}`);
    }
    return booking;
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingPreparationArtifactType, Prisma } from '@prisma/client';
import type { PermissionActor } from '@shared/auth/permission.util';
import { assertMembershipPermission } from '@shared/auth/permission.util';
import { BusinessAuditService } from '@modules/business-audit/business-audit.service';
import { BusinessAuditAction, BUSINESS_AUDIT_ENTITY_TYPE } from '@modules/business-audit/business-audit.constants';
import { buildBusinessAuditIdempotencyKey } from '@modules/business-audit/business-audit-idempotency.util';
import { PrismaService } from '@shared/database/prisma.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { BookingDocumentGenerationDispatcherService } from '@modules/documents/booking-document-generation/booking-document-generation.dispatcher.service';
import { BookingLegalDocumentEmailService } from '@modules/outbound-email/booking-legal-document-email.service';
import { BookingInternalNotificationEmailService } from '@modules/outbound-email/booking-internal-notification-email.service';
import { TaskAutomationService } from '@modules/tasks/task-automation.service';
import {
  BOOKING_PREPARATION_ARTIFACT_TYPES,
  BOOKING_PREPARATION_RECOVERY_ACTIONS,
  buildBookingPreparationRecoveryIdempotencyKey,
  type BookingPreparationRecoveryAction,
} from './booking-preparation.constants';
import { BookingPreparationStateRepository } from './booking-preparation-state.repository';
import { BookingPreparationStateService } from './booking-preparation-state.service';
import type { BookingPreparationRecoveryResult } from './booking-preparation.types';
import type { HandoverActorContext } from '../booking-pickup-gate/booking-pickup-gate.types';

@Injectable()
export class BookingPreparationRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: BookingPreparationStateRepository,
    private readonly preparationState: BookingPreparationStateService,
    private readonly businessAudit: BusinessAuditService,
    private readonly invoicesService: InvoicesService,
    private readonly documentDispatcher: BookingDocumentGenerationDispatcherService,
    private readonly legalEmail: BookingLegalDocumentEmailService,
    private readonly internalEmail: BookingInternalNotificationEmailService,
    private readonly taskAutomation: TaskAutomationService,
  ) {}

  async retryArtifact(
    orgId: string,
    bookingId: string,
    artifactType: BookingPreparationArtifactType,
    actor: HandoverActorContext,
    clientIdempotencyKey?: string | null,
  ): Promise<BookingPreparationRecoveryResult> {
    await assertMembershipPermission(
      this.prisma,
      {
        id: actor.userId,
        platformRole: actor.platformRole ?? undefined,
        membershipRole: actor.membershipRole ?? undefined,
        organizationId: orgId,
      } satisfies PermissionActor,
      orgId,
      'bookings',
      'manage',
    );

    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const action = this.actionForArtifact(artifactType);
    const idempotencyKey =
      clientIdempotencyKey?.trim() ||
      buildBookingPreparationRecoveryIdempotencyKey([
        orgId,
        bookingId,
        artifactType,
        action,
        new Date().toISOString().slice(0, 16),
      ]);

    const existing = await this.repo.findRecoveryByKey(idempotencyKey);
    if (existing) {
      return {
        action,
        artifactType,
        deduplicated: true,
        status: 'SKIPPED',
        message: 'Recovery already executed for this idempotency key',
      };
    }

    await this.preparationState.markRetryScheduled(orgId, bookingId, artifactType, actor.userId);

    let metadata: Record<string, unknown> = { action, artifactType };
    switch (action) {
      case BOOKING_PREPARATION_RECOVERY_ACTIONS.RETRY_INVOICE:
        metadata = {
          ...metadata,
          invoice: await this.invoicesService.bootstrapBookingInvoice(orgId, {
            id: booking.id,
            customerId: booking.customerId,
            vehicleId: booking.vehicleId,
            totalPriceCents: booking.totalPriceCents,
            dailyRateCents: booking.dailyRateCents,
            startDate: booking.startDate,
            endDate: booking.endDate,
            currency: booking.currency,
            kmIncluded: booking.kmIncluded,
          }),
        };
        break;

      case BOOKING_PREPARATION_RECOVERY_ACTIONS.RETRY_DOCUMENT:
        metadata = {
          ...metadata,
          job: await this.documentDispatcher.enqueueInitialBundle(orgId, bookingId, actor.userId),
        };
        break;

      case BOOKING_PREPARATION_RECOVERY_ACTIONS.RETRY_EMAIL:
        if (artifactType === BOOKING_PREPARATION_ARTIFACT_TYPES.CUSTOMER_EMAIL) {
          metadata = {
            ...metadata,
            email: await this.legalEmail.maybeAutoSendFrozenBookingDocuments(
              orgId,
              bookingId,
              actor.userId,
            ),
          };
        } else {
          metadata = {
            ...metadata,
            email: await this.internalEmail.maybeSendBookingInternalNotification({
              organizationId: orgId,
              bookingId,
              eventType: 'BookingConfirmed',
              idempotencyKey: `booking-internal:recovery:${bookingId}:${idempotencyKey}`,
              actorUserId: actor.userId,
            }),
          };
        }
        break;

      case BOOKING_PREPARATION_RECOVERY_ACTIONS.REBUILD_TASKS:
        await this.taskAutomation.ensureBookingLifecycleTasks({
          id: booking.id,
          organizationId: orgId,
          vehicleId: booking.vehicleId,
          customerId: booking.customerId,
          status: booking.status,
          startDate: booking.startDate,
          endDate: booking.endDate,
          pickupStationId: booking.pickupStationId,
          returnStationId: booking.returnStationId,
        });
        if (booking.status === 'ACTIVE' || booking.status === 'COMPLETED') {
          await this.taskAutomation.onReturnHandoverCompleted({
            id: booking.id,
            organizationId: orgId,
            vehicleId: booking.vehicleId,
            customerId: booking.customerId,
            status: booking.status,
            startDate: booking.startDate,
            endDate: booking.endDate,
            pickupStationId: booking.pickupStationId,
            returnStationId: booking.returnStationId,
          });
        }
        metadata = { ...metadata, rebuilt: true };
        break;

      default:
        throw new ConflictException({ code: 'UNSUPPORTED_RECOVERY', artifactType });
    }

    await this.repo.createRecoveryAttempt({
      organizationId: orgId,
      bookingId,
      artifactType,
      action,
      idempotencyKey,
      actorUserId: actor.userId,
      metadata: metadata as Prisma.InputJsonValue,
    });

    await this.businessAudit.enqueue({
      organizationId: orgId,
      idempotencyKey: buildBusinessAuditIdempotencyKey({
        action: BusinessAuditAction.BOOKING_PREPARATION_RECOVERY,
        organizationId: orgId,
        entityType: BUSINESS_AUDIT_ENTITY_TYPE.BOOKING,
        entityId: bookingId,
        correlationId: idempotencyKey,
      }),
      action: BusinessAuditAction.BOOKING_PREPARATION_RECOVERY,
      entityType: BUSINESS_AUDIT_ENTITY_TYPE.BOOKING,
      entityId: bookingId,
      actorUserId: actor.userId,
      correlationId: idempotencyKey,
      outcome: 'QUEUED',
      description: 'Booking preparation recovery requested',
      metadata: {
        artifactType,
        recoveryAction: action,
        idempotencyKey,
      },
    });

    await this.preparationState.reconcile(orgId, bookingId);

    return {
      action,
      artifactType,
      deduplicated: false,
      status: 'QUEUED',
    };
  }

  private actionForArtifact(
    artifactType: BookingPreparationArtifactType,
  ): BookingPreparationRecoveryAction {
    switch (artifactType) {
      case BOOKING_PREPARATION_ARTIFACT_TYPES.INVOICE:
        return BOOKING_PREPARATION_RECOVERY_ACTIONS.RETRY_INVOICE;
      case BOOKING_PREPARATION_ARTIFACT_TYPES.LEGAL_DOCUMENTS:
      case BOOKING_PREPARATION_ARTIFACT_TYPES.RENTAL_AGREEMENT:
        return BOOKING_PREPARATION_RECOVERY_ACTIONS.RETRY_DOCUMENT;
      case BOOKING_PREPARATION_ARTIFACT_TYPES.CUSTOMER_EMAIL:
      case BOOKING_PREPARATION_ARTIFACT_TYPES.INTERNAL_NOTIFICATION:
        return BOOKING_PREPARATION_RECOVERY_ACTIONS.RETRY_EMAIL;
      case BOOKING_PREPARATION_ARTIFACT_TYPES.PICKUP_TASK:
      case BOOKING_PREPARATION_ARTIFACT_TYPES.RETURN_TASK:
        return BOOKING_PREPARATION_RECOVERY_ACTIONS.REBUILD_TASKS;
      case BOOKING_PREPARATION_ARTIFACT_TYPES.PAYMENT:
        return BOOKING_PREPARATION_RECOVERY_ACTIONS.RETRY_INVOICE;
      default:
        throw new ConflictException({ code: 'UNSUPPORTED_ARTIFACT', artifactType });
    }
  }
}

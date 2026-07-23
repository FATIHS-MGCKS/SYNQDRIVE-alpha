import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingEligibilityApprovalStatus,
  MembershipRole,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BusinessAuditService } from '@modules/business-audit/business-audit.service';
import {
  BUSINESS_AUDIT_ENTITY_TYPE,
  BusinessAuditAction,
} from '@modules/business-audit/business-audit.constants';
import { buildBusinessAuditIdempotencyKey } from '@modules/business-audit/business-audit-idempotency.util';
import {
  assertMembershipPermission,
  type PermissionActor,
} from '@shared/auth/permission.util';
import { BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS } from '../booking-eligibility-permission.constants';
import { BookingEligibilityGatekeeperService } from '../booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.service';
import type { BookingEligibilityGateResult } from '../booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.types';
import {
  parseForeignTravelRequested,
  resolveGatekeeperPaymentIntent,
} from '../booking-eligibility-gatekeeper/booking-eligibility-context.util';
import type { BookingEligibilityInvalidationFact } from '../booking-eligibility-gatekeeper/booking-eligibility-status-transition.matrix';
import { BOOKING_ELIGIBILITY_TRANSITION_CODE } from '../booking-eligibility-gatekeeper/booking-eligibility-transition.policy';
import type { BookingEligibilityMutationContext } from '../booking-eligibility-gatekeeper/booking-eligibility-enforcement.service';
import {
  BOOKING_ELIGIBILITY_APPROVAL_ERROR_CODE,
  BOOKING_ELIGIBILITY_APPROVAL_TTL_MS,
} from './booking-eligibility-approval.constants';
import type {
  BookingEligibilityApprovalView,
  ValidatedBookingEligibilityApproval,
} from './booking-eligibility-approval.types';
import {
  buildBookingEligibilityDataVersion,
  buildBookingEligibilityFingerprint,
  buildBookingEligibilityRuleRevision,
  buildGateResultSnapshot,
  resolveApprovalGateStage,
  resolveApprovalTargetStatus,
} from './booking-eligibility-approval.util';
import { BookingEligibilityDecisionService } from '../booking-eligibility-decision/booking-eligibility-decision.service';
import { BOOKING_ELIGIBILITY_GATE_ENGINE_VERSION } from '../booking-eligibility-gatekeeper/booking-eligibility-gatekeeper.constants';

type Tx = Prisma.TransactionClient;

@Injectable()
export class BookingEligibilityApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gatekeeper: BookingEligibilityGatekeeperService,
    private readonly eligibilityDecision: BookingEligibilityDecisionService,
    private readonly businessAudit: BusinessAuditService,
  ) {}

  async listForBooking(
    organizationId: string,
    bookingId: string,
  ): Promise<BookingEligibilityApprovalView[]> {
    await this.expireStale(organizationId);
    await this.assertBooking(organizationId, bookingId);

    const rows = await this.prisma.bookingEligibilityApproval.findMany({
      where: { organizationId, bookingId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.mapRow(row));
  }

  async createRequest(input: {
    organizationId: string;
    bookingId: string;
    requestedByUserId: string;
    exceptionReason: string;
    targetBookingStatus?: 'CONFIRMED' | 'ACTIVE';
  }): Promise<BookingEligibilityApprovalView> {
    if (!input.requestedByUserId) {
      throw new BadRequestException('Authenticated user is required to request eligibility approval');
    }

    await this.expireStale(input.organizationId);
    const booking = await this.assertBooking(input.organizationId, input.bookingId);
    const targetBookingStatus = resolveApprovalTargetStatus({
      requested: input.targetBookingStatus,
      bookingStatus: booking.status,
    });
    const gateStage = resolveApprovalGateStage(targetBookingStatus);
    const additionalDriverCount = await this.countAdditionalDrivers(
      input.organizationId,
      input.bookingId,
    );
    const depositReceived = await this.isDepositReceived(input.organizationId, input.bookingId);

    const gateResult = await this.gatekeeper.evaluate({
      organizationId: input.organizationId,
      customerId: booking.customerId,
      vehicleId: booking.vehicleId,
      stage: gateStage,
      startDate: booking.startDate,
      endDate: booking.endDate,
      bookingId: booking.id,
      requestedStatus: targetBookingStatus,
      paymentIntent: resolveGatekeeperPaymentIntent(booking.paymentIntent),
      foreignTravelRequested: parseForeignTravelRequested(booking.extrasJson),
      additionalDriverCount,
      depositReceived,
      includeVehicleReadiness: true,
    });

    if (gateResult.status !== 'MANUAL_APPROVAL_REQUIRED') {
      throw new ConflictException({
        code: BOOKING_ELIGIBILITY_APPROVAL_ERROR_CODE.GATE_NOT_MANUAL,
        message:
          'Eligibility approval can only be requested when the gatekeeper requires manual approval.',
        eligibilityStatus: gateResult.status,
      });
    }

    const expiresAt = new Date(Date.now() + BOOKING_ELIGIBILITY_APPROVAL_TTL_MS);
    const dataContext = {
      customerId: booking.customerId,
      vehicleId: booking.vehicleId,
      startDate: booking.startDate,
      endDate: booking.endDate,
      paymentIntent: booking.paymentIntent,
      extrasJson: booking.extrasJson,
      additionalDriverCount,
    };

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.bookingEligibilityApproval.create({
        data: {
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          eligibilityDecision: gateResult.status,
          exceptionReason: input.exceptionReason.trim(),
          reasonCodes: gateResult.reasonCodes,
          status: BookingEligibilityApprovalStatus.PENDING,
          gateStage,
          targetBookingStatus,
          requestedByUserId: input.requestedByUserId,
          eligibilityFingerprint: buildBookingEligibilityFingerprint(gateResult),
          ruleRevision: buildBookingEligibilityRuleRevision(gateResult),
          bookingDataVersion: buildBookingEligibilityDataVersion(dataContext),
          gateResultSnapshot: buildGateResultSnapshot(gateResult) as unknown as Prisma.InputJsonValue,
          expiresAt,
        },
      });

      const outbox = await this.businessAudit.enqueueInTransaction(tx, {
        organizationId: input.organizationId,
        idempotencyKey: buildBusinessAuditIdempotencyKey({
          action: BusinessAuditAction.MANUAL_APPROVAL_REQUESTED,
          organizationId: input.organizationId,
          entityType: BUSINESS_AUDIT_ENTITY_TYPE.BOOKING_ELIGIBILITY_APPROVAL,
          entityId: row.id,
          correlationId: `manual-approval-request:${row.id}`,
        }),
        action: BusinessAuditAction.MANUAL_APPROVAL_REQUESTED,
        actorUserId: input.requestedByUserId,
        entityType: BUSINESS_AUDIT_ENTITY_TYPE.BOOKING_ELIGIBILITY_APPROVAL,
        entityId: row.id,
        correlationId: `manual-approval-request:${row.id}`,
        after: {
          bookingId: input.bookingId,
          gateStage,
          targetBookingStatus,
          eligibilityFingerprint: row.eligibilityFingerprint,
          ruleRevision: row.ruleRevision,
          reasonCodeCount: gateResult.reasonCodes.length,
        },
        changeReason: input.exceptionReason.trim(),
        outcome: 'requested',
        description: 'Manual booking eligibility approval requested',
        metadata: {
          bookingId: input.bookingId,
          gateStage,
          targetBookingStatus,
        },
      });

      return { row, outboxId: outbox.id };
    });

    await this.businessAudit.flushCritical([created.outboxId]);

    return this.mapRow(created.row);
  }

  async decide(input: {
    organizationId: string;
    bookingId: string;
    approvalId: string;
    decidedByUserId: string;
    decision: 'APPROVE' | 'REJECT';
    decisionReason: string;
    platformRole?: string | null;
    membershipRole?: MembershipRole | null;
  }): Promise<BookingEligibilityApprovalView> {
    const reason = input.decisionReason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: BOOKING_ELIGIBILITY_APPROVAL_ERROR_CODE.DECISION_REASON_REQUIRED,
        message: 'A decision reason is required.',
      });
    }

    await this.assertOverridePermission(input);
    await this.expireStale(input.organizationId);

    const approval = await this.prisma.bookingEligibilityApproval.findFirst({
      where: {
        id: input.approvalId,
        organizationId: input.organizationId,
        bookingId: input.bookingId,
      },
    });
    if (!approval) {
      throw new NotFoundException({
        code: BOOKING_ELIGIBILITY_APPROVAL_ERROR_CODE.NOT_FOUND,
        message: 'Eligibility approval request not found.',
      });
    }

    if (approval.requestedByUserId === input.decidedByUserId) {
      throw new ForbiddenException({
        code: BOOKING_ELIGIBILITY_APPROVAL_ERROR_CODE.SELF_DECISION_DENIED,
        message:
          'Four-eyes policy: the approver must be a different user than the requester.',
      });
    }

    if (approval.status !== BookingEligibilityApprovalStatus.PENDING) {
      throw new ConflictException({
        code: BOOKING_ELIGIBILITY_APPROVAL_ERROR_CODE.INVALID_STATUS,
        message: `Approval is already ${approval.status}.`,
        status: approval.status,
      });
    }

    if (approval.expiresAt.getTime() <= Date.now()) {
      await this.markExpired(approval.id);
      throw new ConflictException({
        code: BOOKING_ELIGIBILITY_APPROVAL_ERROR_CODE.EXPIRED,
        message: 'Eligibility approval request has expired.',
      });
    }

    const nextStatus =
      input.decision === 'APPROVE'
        ? BookingEligibilityApprovalStatus.APPROVED
        : BookingEligibilityApprovalStatus.REJECTED;

    const auditAction =
      input.decision === 'APPROVE'
        ? BusinessAuditAction.MANUAL_APPROVAL_APPROVED
        : BusinessAuditAction.MANUAL_APPROVAL_REJECTED;

    const { updated, auditOutboxId } = await this.prisma.$transaction(async (tx) => {
      if (input.decision === 'APPROVE') {
        await tx.bookingEligibilityApproval.updateMany({
          where: {
            organizationId: input.organizationId,
            bookingId: input.bookingId,
            targetBookingStatus: approval.targetBookingStatus,
            status: BookingEligibilityApprovalStatus.APPROVED,
            id: { not: approval.id },
          },
          data: {
            status: BookingEligibilityApprovalStatus.REVOKED,
            decidedAt: new Date(),
            decisionReason: 'Superseded by a newer approved eligibility override.',
          },
        });
      }

      const row = await tx.bookingEligibilityApproval.update({
        where: { id: approval.id },
        data: {
          status: nextStatus,
          decidedByUserId: input.decidedByUserId,
          decisionReason: reason,
          decidedAt: new Date(),
        },
      });

      const outbox = await this.businessAudit.enqueueInTransaction(tx, {
        organizationId: input.organizationId,
        idempotencyKey: buildBusinessAuditIdempotencyKey({
          action: auditAction,
          organizationId: input.organizationId,
          entityType: BUSINESS_AUDIT_ENTITY_TYPE.BOOKING_ELIGIBILITY_APPROVAL,
          entityId: row.id,
          correlationId: `manual-approval:${row.id}:${input.decision}`,
        }),
        action: auditAction,
        actorUserId: input.decidedByUserId,
        entityType: BUSINESS_AUDIT_ENTITY_TYPE.BOOKING_ELIGIBILITY_APPROVAL,
        entityId: row.id,
        correlationId: `manual-approval:${row.id}:${input.decision}`,
        before: {
          status: approval.status,
        },
        after: {
          status: row.status,
          decidedByUserId: row.decidedByUserId,
        },
        changeReason: reason,
        outcome: input.decision === 'APPROVE' ? 'approved' : 'rejected',
        description: `Manual booking eligibility approval ${input.decision === 'APPROVE' ? 'approved' : 'rejected'}`,
        metadata: {
          bookingId: input.bookingId,
          requestedByUserId: approval.requestedByUserId,
        },
      });

      return { updated: row, auditOutboxId: outbox.id };
    });

    await this.businessAudit.flushCritical([auditOutboxId]);

    await this.eligibilityDecision.appendManualApprovalDecision({
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      eventType:
        input.decision === 'APPROVE'
          ? 'MANUAL_APPROVAL_APPROVED'
          : 'MANUAL_APPROVAL_REJECTED',
      approval: {
        id: updated.id,
        eligibilityDecision: updated.eligibilityDecision,
        reasonCodes: updated.reasonCodes,
        gateResultSnapshot: updated.gateResultSnapshot,
        ruleRevision: updated.ruleRevision,
        bookingDataVersion: updated.bookingDataVersion,
        eligibilityFingerprint: updated.eligibilityFingerprint,
      },
      correlationId: `manual-approval:${updated.id}:${input.decision}`,
      evaluatedAt: updated.decidedAt?.toISOString() ?? new Date().toISOString(),
      engineVersion: BOOKING_ELIGIBILITY_GATE_ENGINE_VERSION,
    });

    return this.mapRow(updated);
  }

  async assertValidForTransition(input: {
    organizationId: string;
    bookingId: string;
    approvalId: string;
    gateResult: BookingEligibilityGateResult;
    bookingContext: BookingEligibilityMutationContext;
    additionalDriverCount?: number;
  }): Promise<ValidatedBookingEligibilityApproval> {
    await this.expireStale(input.organizationId);

    const approval = await this.prisma.bookingEligibilityApproval.findFirst({
      where: {
        id: input.approvalId,
        organizationId: input.organizationId,
        bookingId: input.bookingId,
      },
    });
    if (!approval) {
      throw new ConflictException({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.MANUAL_APPROVAL_REQUIRED,
        message: 'A valid eligibility approval is required before this transition.',
        requiresApproval: true,
      });
    }

    if (approval.status === BookingEligibilityApprovalStatus.EXPIRED) {
      throw new ConflictException({
        code: BOOKING_ELIGIBILITY_APPROVAL_ERROR_CODE.EXPIRED,
        message: 'Eligibility approval has expired.',
        approvalId: approval.id,
      });
    }

    if (approval.status === BookingEligibilityApprovalStatus.REVOKED) {
      throw new ConflictException({
        code: BOOKING_ELIGIBILITY_APPROVAL_ERROR_CODE.STALE,
        message: 'Eligibility approval was revoked because booking data changed.',
        approvalId: approval.id,
      });
    }

    if (approval.status !== BookingEligibilityApprovalStatus.APPROVED) {
      throw new ConflictException({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.MANUAL_APPROVAL_REQUIRED,
        message: 'Eligibility approval must be approved before this transition.',
        approvalId: approval.id,
        approvalStatus: approval.status,
        requiresApproval: true,
      });
    }

    if (approval.expiresAt.getTime() <= Date.now()) {
      await this.markExpired(approval.id);
      throw new ConflictException({
        code: BOOKING_ELIGIBILITY_APPROVAL_ERROR_CODE.EXPIRED,
        message: 'Eligibility approval has expired.',
        approvalId: approval.id,
      });
    }

    if (input.gateResult.status !== 'MANUAL_APPROVAL_REQUIRED') {
      throw new ConflictException({
        code: BOOKING_ELIGIBILITY_APPROVAL_ERROR_CODE.STALE,
        message: 'Eligibility no longer requires manual approval.',
        approvalId: approval.id,
        eligibilityStatus: input.gateResult.status,
      });
    }

    const currentFingerprint = buildBookingEligibilityFingerprint(input.gateResult);
    const currentRuleRevision = buildBookingEligibilityRuleRevision(input.gateResult);
    const currentDataVersion = buildBookingEligibilityDataVersion({
      customerId: input.bookingContext.customerId,
      vehicleId: input.bookingContext.vehicleId,
      startDate: input.bookingContext.startDate,
      endDate: input.bookingContext.endDate,
      paymentIntent: input.bookingContext.paymentIntent,
      extrasJson: input.bookingContext.extrasJson,
      additionalDriverCount: input.additionalDriverCount,
    });

    if (
      approval.eligibilityFingerprint !== currentFingerprint ||
      approval.ruleRevision !== currentRuleRevision ||
      approval.bookingDataVersion !== currentDataVersion
    ) {
      await this.revokeApproval(approval.id, 'Eligibility context changed since approval.');
      throw new ConflictException({
        code: BOOKING_ELIGIBILITY_APPROVAL_ERROR_CODE.STALE,
        message:
          'Eligibility approval is no longer valid because eligibility or booking data changed.',
        approvalId: approval.id,
      });
    }

    return {
      id: approval.id,
      status: 'APPROVED',
      eligibilityFingerprint: approval.eligibilityFingerprint,
      ruleRevision: approval.ruleRevision,
      bookingDataVersion: approval.bookingDataVersion,
      targetBookingStatus: approval.targetBookingStatus,
      gateStage: approval.gateStage,
    };
  }

  async tryResolveValidatedApproval(input: {
    organizationId: string;
    bookingId: string;
    approvalId?: string | null;
    gateResult: BookingEligibilityGateResult;
    bookingContext: BookingEligibilityMutationContext;
    additionalDriverCount?: number;
  }): Promise<ValidatedBookingEligibilityApproval | null> {
    if (input.gateResult.status !== 'MANUAL_APPROVAL_REQUIRED') {
      return null;
    }
    if (!input.approvalId?.trim()) {
      return null;
    }
    return this.assertValidForTransition({
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      approvalId: input.approvalId.trim(),
      gateResult: input.gateResult,
      bookingContext: input.bookingContext,
      additionalDriverCount: input.additionalDriverCount,
    });
  }

  async revokeActiveApprovals(
    input: {
      organizationId: string;
      bookingId: string;
      reason: string;
      revokedByUserId?: string | null;
      invalidationFacts?: BookingEligibilityInvalidationFact[];
    },
    tx?: Tx,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const reason =
      input.invalidationFacts && input.invalidationFacts.length > 0
        ? `${input.reason} (${input.invalidationFacts.join(', ')})`
        : input.reason;

    const activeRows = await client.bookingEligibilityApproval.findMany({
      where: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        status: {
          in: [
            BookingEligibilityApprovalStatus.PENDING,
            BookingEligibilityApprovalStatus.APPROVED,
          ],
        },
      },
      select: { id: true, status: true },
    });

    const result = await client.bookingEligibilityApproval.updateMany({
      where: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        status: {
          in: [
            BookingEligibilityApprovalStatus.PENDING,
            BookingEligibilityApprovalStatus.APPROVED,
          ],
        },
      },
      data: {
        status: BookingEligibilityApprovalStatus.REVOKED,
        decidedAt: new Date(),
        decidedByUserId: input.revokedByUserId ?? null,
        decisionReason: reason,
      },
    });

    if (!tx) {
      for (const row of activeRows) {
        await this.businessAudit.enqueue({
          organizationId: input.organizationId,
          idempotencyKey: buildBusinessAuditIdempotencyKey({
            action: BusinessAuditAction.MANUAL_APPROVAL_REVOKED,
            organizationId: input.organizationId,
            entityType: BUSINESS_AUDIT_ENTITY_TYPE.BOOKING_ELIGIBILITY_APPROVAL,
            entityId: row.id,
            correlationId: `manual-approval-revoked:${row.id}`,
          }),
          action: BusinessAuditAction.MANUAL_APPROVAL_REVOKED,
          actorUserId: input.revokedByUserId ?? null,
          entityType: BUSINESS_AUDIT_ENTITY_TYPE.BOOKING_ELIGIBILITY_APPROVAL,
          entityId: row.id,
          correlationId: `manual-approval-revoked:${row.id}`,
          before: { status: row.status },
          after: { status: BookingEligibilityApprovalStatus.REVOKED },
          changeReason: reason,
          outcome: 'revoked',
          description: 'Manual booking eligibility approval revoked',
          metadata: {
            bookingId: input.bookingId,
            invalidationFacts: input.invalidationFacts ?? [],
          },
        });
      }
    }

    return result.count;
  }

  async expireStale(organizationId: string): Promise<number> {
    const now = new Date();
    const staleRows = await this.prisma.bookingEligibilityApproval.findMany({
      where: {
        organizationId,
        status: BookingEligibilityApprovalStatus.PENDING,
        expiresAt: { lte: now },
      },
      select: { id: true, bookingId: true },
    });

    const result = await this.prisma.bookingEligibilityApproval.updateMany({
      where: {
        organizationId,
        status: BookingEligibilityApprovalStatus.PENDING,
        expiresAt: { lte: now },
      },
      data: {
        status: BookingEligibilityApprovalStatus.EXPIRED,
        decidedAt: now,
        decisionReason: 'Approval request expired before a decision was recorded.',
      },
    });

    for (const row of staleRows) {
      await this.businessAudit.enqueue({
        organizationId,
        idempotencyKey: buildBusinessAuditIdempotencyKey({
          action: BusinessAuditAction.MANUAL_APPROVAL_EXPIRED,
          organizationId,
          entityType: BUSINESS_AUDIT_ENTITY_TYPE.BOOKING_ELIGIBILITY_APPROVAL,
          entityId: row.id,
          correlationId: `manual-approval-expired:${row.id}`,
        }),
        action: BusinessAuditAction.MANUAL_APPROVAL_EXPIRED,
        entityType: BUSINESS_AUDIT_ENTITY_TYPE.BOOKING_ELIGIBILITY_APPROVAL,
        entityId: row.id,
        correlationId: `manual-approval-expired:${row.id}`,
        before: { status: BookingEligibilityApprovalStatus.PENDING },
        after: { status: BookingEligibilityApprovalStatus.EXPIRED },
        outcome: 'expired',
        description: 'Manual booking eligibility approval expired',
        metadata: {
          bookingId: row.bookingId,
        },
      });
    }

    return result.count;
  }

  private async markExpired(approvalId: string) {
    const row = await this.prisma.bookingEligibilityApproval.update({
      where: { id: approvalId },
      data: {
        status: BookingEligibilityApprovalStatus.EXPIRED,
        decidedAt: new Date(),
        decisionReason: 'Approval request expired before a decision was recorded.',
      },
    });

    await this.businessAudit.enqueue({
      organizationId: row.organizationId,
      idempotencyKey: buildBusinessAuditIdempotencyKey({
        action: BusinessAuditAction.MANUAL_APPROVAL_EXPIRED,
        organizationId: row.organizationId,
        entityType: BUSINESS_AUDIT_ENTITY_TYPE.BOOKING_ELIGIBILITY_APPROVAL,
        entityId: row.id,
        correlationId: `manual-approval-expired:${row.id}`,
      }),
      action: BusinessAuditAction.MANUAL_APPROVAL_EXPIRED,
      entityType: BUSINESS_AUDIT_ENTITY_TYPE.BOOKING_ELIGIBILITY_APPROVAL,
      entityId: row.id,
      correlationId: `manual-approval-expired:${row.id}`,
      before: { status: BookingEligibilityApprovalStatus.PENDING },
      after: { status: BookingEligibilityApprovalStatus.EXPIRED },
      outcome: 'expired',
      description: 'Manual booking eligibility approval expired',
      metadata: {
        bookingId: row.bookingId,
      },
    });
  }

  private async revokeApproval(approvalId: string, reason: string) {
    await this.prisma.bookingEligibilityApproval.update({
      where: { id: approvalId },
      data: {
        status: BookingEligibilityApprovalStatus.REVOKED,
        decidedAt: new Date(),
        decisionReason: reason,
      },
    });
  }

  private async assertBooking(organizationId: string, bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: {
        id: true,
        status: true,
        customerId: true,
        vehicleId: true,
        startDate: true,
        endDate: true,
        paymentIntent: true,
        extrasJson: true,
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found for organization');
    }
    return booking;
  }

  private async assertOverridePermission(input: {
    organizationId: string;
    decidedByUserId: string;
    platformRole?: string | null;
    membershipRole?: MembershipRole | null;
  }) {
    const requirement =
      BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS['booking_eligibility.override'];
    const actor: PermissionActor = {
      id: input.decidedByUserId,
      organizationId: input.organizationId,
      platformRole: input.platformRole ?? undefined,
      membershipRole: input.membershipRole ?? undefined,
    };
    await assertMembershipPermission(
      this.prisma,
      actor,
      input.organizationId,
      requirement.module,
      requirement.level,
    );
  }

  private async countAdditionalDrivers(organizationId: string, bookingId: string) {
    return this.prisma.bookingAllowedDriver.count({
      where: { organizationId, bookingId, role: 'ADDITIONAL' },
    });
  }

  private async isDepositReceived(organizationId: string, bookingId: string) {
    const deposit = await this.prisma.bookingDeposit.findFirst({
      where: { organizationId, bookingId },
      select: { status: true },
    });
    if (!deposit) return false;
    return ['RECEIVED', 'PARTIALLY_USED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(
      deposit.status,
    );
  }

  private mapRow(
    row: Prisma.BookingEligibilityApprovalGetPayload<object>,
  ): BookingEligibilityApprovalView {
    return {
      id: row.id,
      organizationId: row.organizationId,
      bookingId: row.bookingId,
      eligibilityDecision: row.eligibilityDecision,
      exceptionReason: row.exceptionReason,
      reasonCodes: Array.isArray(row.reasonCodes)
        ? (row.reasonCodes as string[])
        : [],
      status: row.status,
      gateStage: row.gateStage,
      targetBookingStatus: row.targetBookingStatus,
      requestedByUserId: row.requestedByUserId,
      decidedByUserId: row.decidedByUserId,
      decisionReason: row.decisionReason,
      eligibilityFingerprint: row.eligibilityFingerprint,
      ruleRevision: row.ruleRevision,
      bookingDataVersion: row.bookingDataVersion,
      gateResultSnapshot: row.gateResultSnapshot,
      createdAt: row.createdAt.toISOString(),
      decidedAt: row.decidedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt.toISOString(),
    };
  }
}

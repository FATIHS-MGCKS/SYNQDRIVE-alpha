import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import type { BookingStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingEligibilityApprovalService } from '../booking-eligibility-approval/booking-eligibility-approval.service';
import {
  buildBookingEligibilityDataVersion,
} from '../booking-eligibility-approval/booking-eligibility-approval.util';
import { BookingEligibilityDecisionService } from '../booking-eligibility-decision/booking-eligibility-decision.service';
import { BookingEligibilityEnforcementService } from '../booking-eligibility-gatekeeper/booking-eligibility-enforcement.service';
import type { BookingEligibilityInvalidationFact } from '../booking-eligibility-gatekeeper/booking-eligibility-status-transition.matrix';
import {
  BOOKING_ELIGIBILITY_RECHECK_TRIGGER,
  type BookingEligibilityRecheckTrigger,
  RETROACTIVITY_RECHECK_OUTCOME,
} from './booking-eligibility-retroactivity.constants';
import {
  resolveInvalidationFactsToTrigger,
  resolveRetroactivityPolicy,
} from './booking-eligibility-retroactivity.policy';
import type {
  BookingEligibilityRecheckContext,
  BookingEligibilityRecheckResult,
  MutationRecheckInput,
  RulePublishRecheckInput,
} from './booking-eligibility-recheck.types';

@Injectable()
export class BookingEligibilityRecheckService {
  private readonly logger = new Logger(BookingEligibilityRecheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decisions: BookingEligibilityDecisionService,
    private readonly enforcement: BookingEligibilityEnforcementService,
    @Inject(forwardRef(() => BookingEligibilityApprovalService))
    private readonly approvals: BookingEligibilityApprovalService,
  ) {}

  async processRulePublishRechecks(
    input: RulePublishRecheckInput,
  ): Promise<BookingEligibilityRecheckResult[]> {
    if (input.affectedBookingIds.length === 0) return [];

    const bookings = await this.prisma.booking.findMany({
      where: {
        organizationId: input.organizationId,
        id: { in: input.affectedBookingIds },
        status: { in: ['PENDING', 'CONFIRMED', 'ACTIVE'] },
        endDate: { gte: new Date() },
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
        notes: true,
        customerId: true,
        vehicleId: true,
        startDate: true,
        endDate: true,
        paymentIntent: true,
        extrasJson: true,
        vehicle: { select: { rentalCategoryId: true } },
      },
    });

    const results: BookingEligibilityRecheckResult[] = [];
    for (const booking of bookings) {
      const result = await this.processBookingRecheck({
        context: this.toRecheckContext(input.organizationId, booking),
        trigger: BOOKING_ELIGIBILITY_RECHECK_TRIGGER.RULE_PUBLISH,
        correlationId: `${input.correlationId}:booking:${booking.id}`,
        criticalRuleChange: input.criticalRuleChange,
        publishedRevisionId: input.publishedRevisionId,
      });
      results.push(result);
    }

    return results;
  }

  async processMutationRecheck(input: MutationRecheckInput): Promise<BookingEligibilityRecheckResult | null> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: input.bookingId, organizationId: input.organizationId },
      select: {
        id: true,
        organizationId: true,
        status: true,
        notes: true,
        customerId: true,
        vehicleId: true,
        startDate: true,
        endDate: true,
        paymentIntent: true,
        extrasJson: true,
        vehicle: { select: { rentalCategoryId: true } },
      },
    });
    if (!booking) return null;

    return this.processBookingRecheck({
      context: this.toRecheckContext(input.organizationId, booking),
      trigger: input.trigger,
      correlationId: `mutation:${input.bookingId}:${input.trigger}`,
      invalidationFacts: input.invalidationFacts,
      actorUserId: input.actorUserId,
    });
  }

  async processMutationRecheckFromInvalidationFacts(input: {
    organizationId: string;
    bookingId: string;
    invalidationFacts: BookingEligibilityInvalidationFact[];
    actorUserId?: string | null;
  }): Promise<BookingEligibilityRecheckResult | null> {
    if (input.invalidationFacts.length === 0) return null;
    return this.processMutationRecheck({
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      trigger: resolveInvalidationFactsToTrigger(input.invalidationFacts),
      invalidationFacts: input.invalidationFacts,
      actorUserId: input.actorUserId,
    });
  }

  async processDueScheduledRechecks(limit = 50): Promise<BookingEligibilityRecheckResult[]> {
    const due = await this.decisions.findDueRecheckDecisions(limit);
    const results: BookingEligibilityRecheckResult[] = [];

    for (const row of due) {
      const booking = await this.prisma.booking.findFirst({
        where: { id: row.bookingId, organizationId: row.organizationId },
        select: {
          id: true,
          status: true,
          notes: true,
          customerId: true,
          vehicleId: true,
          startDate: true,
          endDate: true,
          paymentIntent: true,
          extrasJson: true,
          vehicle: { select: { rentalCategoryId: true } },
        },
      });
      if (!booking) continue;

      results.push(
        await this.processBookingRecheck({
          context: this.toRecheckContext(row.organizationId, booking),
          trigger: BOOKING_ELIGIBILITY_RECHECK_TRIGGER.SCHEDULED_RECHECK,
          correlationId: `scheduled:${row.id}`,
        }),
      );
    }

    return results;
  }

  async processPickupPrecheck(
    organizationId: string,
    bookingId: string,
    actorUserId?: string | null,
  ): Promise<BookingEligibilityRecheckResult | null> {
    return this.processMutationRecheck({
      organizationId,
      bookingId,
      trigger: BOOKING_ELIGIBILITY_RECHECK_TRIGGER.PICKUP_PRECHECK,
      actorUserId,
    });
  }

  async processApprovalExpiredRecheck(
    organizationId: string,
    bookingId: string,
    approvalId: string,
  ): Promise<BookingEligibilityRecheckResult | null> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: {
        id: true,
        organizationId: true,
        status: true,
        notes: true,
        customerId: true,
        vehicleId: true,
        startDate: true,
        endDate: true,
        paymentIntent: true,
        extrasJson: true,
        vehicle: { select: { rentalCategoryId: true } },
      },
    });
    if (!booking) return null;

    return this.processBookingRecheck({
      context: this.toRecheckContext(organizationId, booking),
      trigger: BOOKING_ELIGIBILITY_RECHECK_TRIGGER.APPROVAL_EXPIRED,
      correlationId: `approval-expired:${approvalId}`,
    });
  }

  private async processBookingRecheck(input: {
    context: BookingEligibilityRecheckContext;
    trigger: BookingEligibilityRecheckTrigger;
    correlationId: string;
    invalidationFacts?: BookingEligibilityInvalidationFact[];
    criticalRuleChange?: boolean;
    publishedRevisionId?: string;
    actorUserId?: string | null;
  }): Promise<BookingEligibilityRecheckResult> {
    const rentalCategoryId = await this.resolveRentalCategoryId(
      input.context.organizationId,
      input.context.vehicleId,
    );
    const priorRulesHash = await this.decisions.getLatestConfirmRulesHash(
      input.context.organizationId,
      input.context.bookingId,
    );
    const currentRulesHash = await this.decisions.resolveCurrentRulesHashForBooking(
      input.context.organizationId,
      input.context.vehicleId,
      rentalCategoryId,
    );
    const ruleDriftDetected = Boolean(
      priorRulesHash && priorRulesHash !== currentRulesHash,
    );

    const policy = resolveRetroactivityPolicy({
      bookingStatus: input.context.bookingStatus,
      notes: input.context.notes,
      trigger: input.trigger,
      invalidationFacts: input.invalidationFacts,
      ruleDriftDetected,
      criticalRuleChange: input.criticalRuleChange,
    });

    if (!policy.appendRecheckSnapshot && !policy.enforceGatekeeper && !policy.revokeApprovals) {
      return {
        bookingId: input.context.bookingId,
        trigger: input.trigger,
        policy,
        outcome: policy.expectedOutcome,
        priorRulesHash,
        currentRulesHash,
        ruleDriftDetected,
        skipped: true,
        skipReason: 'Policy does not require recheck action for this booking state.',
      };
    }

    if (policy.revokeApprovals) {
      await this.approvals.revokeActiveApprovals({
        organizationId: input.context.organizationId,
        bookingId: input.context.bookingId,
        reason:
          input.trigger === BOOKING_ELIGIBILITY_RECHECK_TRIGGER.RULE_PUBLISH
            ? 'Rental rules were published; prior eligibility approvals are no longer valid.'
            : 'Booking eligibility context changed.',
        revokedByUserId: input.actorUserId ?? null,
        invalidationFacts: input.invalidationFacts,
      });
    }

    let gateResult: BookingEligibilityRecheckResult['gateResult'];
    if (policy.enforceGatekeeper) {
      const targetStatus = this.resolveTargetStatusForRecheck(
        input.context.bookingStatus,
        input.trigger,
      );
      const evaluated = await this.enforcement.previewEvaluation(
        {
          organizationId: input.context.organizationId,
          bookingId: input.context.bookingId,
          customerId: input.context.customerId,
          vehicleId: input.context.vehicleId,
          startDate: input.context.startDate,
          endDate: input.context.endDate,
          targetStatus,
          notes: input.context.notes,
          paymentIntent: input.context.paymentIntent,
          extrasJson: input.context.extrasJson,
        },
        { userId: input.actorUserId ?? null, intent: 'preview' },
      );
      gateResult = {
        status: evaluated.status,
        allowed: evaluated.allowed,
        reasonCodes: evaluated.reasonCodes,
      };
    }

    let outcome = policy.expectedOutcome;
    if (policy.markReviewRequired) {
      outcome = RETROACTIVITY_RECHECK_OUTCOME.REVIEW_REQUIRED;
    } else if (ruleDriftDetected && policy.snapshotPolicy === 'FROZEN_GRANDFATHER') {
      outcome = RETROACTIVITY_RECHECK_OUTCOME.GRANDFATHERED;
    }

    const eventType = this.resolveRecheckEventType(input.trigger);
    const bookingDataVersion = buildBookingEligibilityDataVersion({
      customerId: input.context.customerId,
      vehicleId: input.context.vehicleId,
      startDate: input.context.startDate,
      endDate: input.context.endDate,
      paymentIntent: input.context.paymentIntent,
      extrasJson: input.context.extrasJson,
    });

    const decision = await this.decisions.appendRecheckDecision({
      organizationId: input.context.organizationId,
      bookingId: input.context.bookingId,
      eventType,
      decisionStatus: gateResult?.status ?? outcome,
      correlationId: input.correlationId,
      priorRulesHash,
      currentRulesHash,
      bookingDataVersion,
      reasonCodes: gateResult?.reasonCodes ?? [],
      derivedFacts: {
        trigger: input.trigger,
        outcome,
        snapshotPolicy: policy.snapshotPolicy,
        markReviewRequired: policy.markReviewRequired,
        ruleDriftDetected,
        isWizardDraft: policy.isWizardDraft,
        publishedRevisionId: input.publishedRevisionId ?? null,
        invalidationFacts: input.invalidationFacts ?? [],
        gateAllowed: gateResult?.allowed ?? null,
      },
      recheckAt: gateResult?.status === 'MISSING_INFORMATION' ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
    });

    this.logger.log(
      JSON.stringify({
        event: 'booking_eligibility_recheck',
        organizationId: input.context.organizationId,
        bookingId: input.context.bookingId,
        trigger: input.trigger,
        outcome,
        ruleDriftDetected,
        bookingStatus: input.context.bookingStatus,
      }),
    );

    return {
      bookingId: input.context.bookingId,
      trigger: input.trigger,
      policy,
      outcome,
      priorRulesHash,
      currentRulesHash,
      ruleDriftDetected,
      gateResult,
      decisionId: decision.id,
    };
  }

  private resolveRecheckEventType(
    trigger: BookingEligibilityRecheckTrigger,
  ): 'RULE_PUBLISH_RECHECK' | 'MUTATION_RECHECK' | 'SCHEDULED_RECHECK' | 'APPROVAL_EXPIRED_RECHECK' {
    if (trigger === BOOKING_ELIGIBILITY_RECHECK_TRIGGER.RULE_PUBLISH) {
      return 'RULE_PUBLISH_RECHECK';
    }
    if (
      trigger === BOOKING_ELIGIBILITY_RECHECK_TRIGGER.SCHEDULED_RECHECK ||
      trigger === BOOKING_ELIGIBILITY_RECHECK_TRIGGER.PICKUP_PRECHECK
    ) {
      return 'SCHEDULED_RECHECK';
    }
    if (trigger === BOOKING_ELIGIBILITY_RECHECK_TRIGGER.APPROVAL_EXPIRED) {
      return 'APPROVAL_EXPIRED_RECHECK';
    }
    return 'MUTATION_RECHECK';
  }

  private resolveTargetStatusForRecheck(
    status: BookingStatus,
    trigger: BookingEligibilityRecheckTrigger,
  ): BookingStatus {
    if (
      trigger === BOOKING_ELIGIBILITY_RECHECK_TRIGGER.PICKUP_PRECHECK ||
      trigger === BOOKING_ELIGIBILITY_RECHECK_TRIGGER.SCHEDULED_RECHECK
    ) {
      return 'ACTIVE';
    }
    if (status === 'CONFIRMED') return 'CONFIRMED';
    return status;
  }

  private async resolveRentalCategoryId(
    organizationId: string,
    vehicleId: string,
  ): Promise<string | null> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { rentalCategoryId: true },
    });
    return vehicle?.rentalCategoryId ?? null;
  }

  private toRecheckContext(
    organizationId: string,
    booking: {
      id: string;
      status: BookingStatus;
      notes: string | null;
      customerId: string;
      vehicleId: string;
      startDate: Date;
      endDate: Date;
      paymentIntent: unknown;
      extrasJson: unknown;
    },
  ): BookingEligibilityRecheckContext {
    return {
      organizationId,
      bookingId: booking.id,
      bookingStatus: booking.status,
      notes: booking.notes,
      customerId: booking.customerId,
      vehicleId: booking.vehicleId,
      startDate: booking.startDate,
      endDate: booking.endDate,
      paymentIntent: booking.paymentIntent,
      extrasJson: booking.extrasJson,
    };
  }
}

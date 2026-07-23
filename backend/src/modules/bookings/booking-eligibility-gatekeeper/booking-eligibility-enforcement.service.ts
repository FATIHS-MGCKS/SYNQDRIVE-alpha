import { Injectable } from '@nestjs/common';
import { BookingStatus, MembershipRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isWizardDraftBooking } from '../booking-wizard-draft.util';
import { BookingEligibilityGatekeeperService } from './booking-eligibility-gatekeeper.service';
import {
  parseForeignTravelRequested,
  resolveGatekeeperPaymentIntent,
} from './booking-eligibility-context.util';
import {
  assertBookingEligibilityTransitionAllowed,
  resolveEligibilityPolicyMode,
  resolveGateStageForPolicyMode,
  shouldSkipEligibilityEnforcement,
} from './booking-eligibility-transition.policy';
import {
  shouldEnforceBookingEligibilityForUpdate,
} from './booking-eligibility-status-transition.matrix';
import type { BookingEligibilityGateResult } from './booking-eligibility-gatekeeper.types';
import {
  buildBookingEligibilityCorrelationIds,
  type BookingEligibilityCommandKind,
} from './booking-eligibility-correlation.util';
import { BookingEligibilityAuditLogger } from './booking-eligibility-audit.logger';
import {
  buildTechnicalFailureGateResult,
  type BookingEligibilityEvaluationIntent,
  mapGateStatusToTransitionCode,
  shouldFailClosedForPolicyMode,
  throwBookingEligibilityViolation,
} from './booking-eligibility-error.policy';
import { BOOKING_ELIGIBILITY_TRANSITION_CODE } from './booking-eligibility-transition.policy';
import { BookingEligibilityApprovalService } from '../booking-eligibility-approval/booking-eligibility-approval.service';
import { BookingEligibilityDecisionService } from '../booking-eligibility-decision/booking-eligibility-decision.service';
import type { BookingEligibilityDecisionEventType } from '@prisma/client';

export type BookingEligibilityMutationContext = {
  organizationId: string;
  customerId: string;
  vehicleId: string;
  startDate: Date;
  endDate: Date;
  targetStatus: BookingStatus;
  bookingId?: string;
  notes?: string | null;
  paymentIntent?: unknown;
  extrasJson?: unknown;
  foreignTravelRequested?: boolean;
  additionalDriverCount?: number;
};

export type BookingEligibilityEnforcementOptions = {
  userId?: string | null;
  platformRole?: string | null;
  membershipRole?: MembershipRole | null;
  /** @deprecated Use eligibilityApprovalId — direct override reasons are no longer accepted. */
  eligibilityOverrideReason?: string | null;
  eligibilityApprovalId?: string | null;
  intent?: BookingEligibilityEvaluationIntent;
  command?: BookingEligibilityCommandKind;
  parentCommandId?: string | null;
};

@Injectable()
export class BookingEligibilityEnforcementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gatekeeper: BookingEligibilityGatekeeperService,
    private readonly auditLogger: BookingEligibilityAuditLogger,
    private readonly eligibilityApproval: BookingEligibilityApprovalService,
    private readonly eligibilityDecision: BookingEligibilityDecisionService,
  ) {}

  shouldEnforceForUpdate(input: {
    existing: {
      status: BookingStatus;
      customerId: string;
      vehicleId: string;
      startDate: Date;
      endDate: Date;
      notes?: string | null;
      paymentIntent?: unknown;
      extrasJson?: unknown;
    };
    next: BookingEligibilityMutationContext;
    customerIdChanged: boolean;
    vehicleIdChanged: boolean;
    datesChanged: boolean;
    paymentIntentChanged: boolean;
    extrasChanged: boolean;
    additionalDriversChanged?: boolean;
    statusChanged: boolean;
  }): boolean {
    const isWizardDraft =
      isWizardDraftBooking({
        status: input.next.targetStatus,
        notes: input.next.notes ?? input.existing.notes,
      }) && input.next.targetStatus === 'PENDING';

    return shouldEnforceBookingEligibilityForUpdate({
      existingStatus: input.existing.status,
      targetStatus: input.next.targetStatus,
      isWizardDraft,
      mutation: {
        customerIdChanged: input.customerIdChanged,
        vehicleIdChanged: input.vehicleIdChanged,
        datesChanged: input.datesChanged,
        paymentIntentChanged: input.paymentIntentChanged,
        extrasChanged: input.extrasChanged,
        additionalDriversChanged: input.additionalDriversChanged,
        statusChanged: input.statusChanged,
      },
    });
  }

  async previewEvaluation(
    context: BookingEligibilityMutationContext,
    options: BookingEligibilityEnforcementOptions = {},
  ): Promise<BookingEligibilityGateResult> {
    return this.runEvaluation(context, { ...options, intent: 'preview' });
  }

  async assertAllowed(
    context: BookingEligibilityMutationContext,
    options: BookingEligibilityEnforcementOptions = {},
  ): Promise<BookingEligibilityGateResult | null> {
    const isWizardDraft =
      isWizardDraftBooking({
        status: context.targetStatus,
        notes: context.notes,
      }) && context.targetStatus === 'PENDING';

    const mode = resolveEligibilityPolicyMode({
      targetStatus: context.targetStatus,
      isWizardDraft,
    });
    if (shouldSkipEligibilityEnforcement(mode)) {
      return null;
    }

    const gateResult = await this.runEvaluation(context, {
      ...options,
      intent: 'enforce',
      command: options.command ?? this.resolveCommandForMode(mode!),
    });

    const additionalDriverCount =
      context.additionalDriverCount ??
      (context.bookingId
        ? await this.countAdditionalDrivers(context.organizationId, context.bookingId)
        : 0);

    const needsApproval =
      gateResult.status === 'MANUAL_APPROVAL_REQUIRED' &&
      (mode === 'CONFIRMED' || mode === 'ACTIVE');

    let validatedApproval = null;
    if (needsApproval) {
      if (!context.bookingId) {
        assertBookingEligibilityTransitionAllowed(gateResult, mode!, {
          validatedApproval: null,
          correlation: gateResult.correlation,
        });
        return gateResult;
      }
      if (options.eligibilityApprovalId?.trim()) {
        validatedApproval = await this.eligibilityApproval.assertValidForTransition({
          organizationId: context.organizationId,
          bookingId: context.bookingId,
          approvalId: options.eligibilityApprovalId.trim(),
          gateResult,
          bookingContext: context,
          additionalDriverCount,
        });
      }
    }

    const command = options.command ?? this.resolveCommandForMode(mode!);

    try {
      assertBookingEligibilityTransitionAllowed(gateResult, mode!, {
        validatedApproval,
        correlation: gateResult.correlation,
      });
    } catch (error) {
      await this.recordDecisionSnapshot({
        context,
        gateResult,
        command,
        blocked: true,
        manualApprovalId: options.eligibilityApprovalId,
        additionalDriverCount,
      });
      throw error;
    }

    await this.recordDecisionSnapshot({
      context,
      gateResult,
      command,
      blocked: false,
      manualApprovalId: options.eligibilityApprovalId,
      additionalDriverCount,
    });

    return gateResult;
  }

  async recordConfirmSucceededSnapshot(input: {
    organizationId: string;
    bookingId: string;
    gateResult: BookingEligibilityGateResult;
    manualApprovalId?: string | null;
    bookingDataContext: {
      customerId: string;
      vehicleId: string;
      startDate: Date;
      endDate: Date;
      paymentIntent?: unknown;
      extrasJson?: unknown;
      additionalDriverCount?: number;
    };
  }) {
    return this.eligibilityDecision.appendFromGateResult({
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      eventType: 'CONFIRM_SUCCEEDED',
      gateResult: input.gateResult,
      manualApprovalId: input.manualApprovalId,
      bookingDataContext: input.bookingDataContext,
    });
  }

  private async recordDecisionSnapshot(input: {
    context: BookingEligibilityMutationContext;
    gateResult: BookingEligibilityGateResult;
    command: BookingEligibilityCommandKind;
    blocked: boolean;
    manualApprovalId?: string | null;
    additionalDriverCount: number;
  }): Promise<void> {
    if (!input.context.bookingId) return;

    const eventType = this.resolveDecisionEventType(input.command, input.blocked);
    if (!eventType) return;

    await this.eligibilityDecision.appendFromGateResult({
      organizationId: input.context.organizationId,
      bookingId: input.context.bookingId,
      eventType,
      gateResult: input.gateResult,
      manualApprovalId: input.manualApprovalId,
      bookingDataContext: {
        customerId: input.context.customerId,
        vehicleId: input.context.vehicleId,
        startDate: input.context.startDate,
        endDate: input.context.endDate,
        paymentIntent: input.context.paymentIntent,
        extrasJson: input.context.extrasJson,
        additionalDriverCount: input.additionalDriverCount,
      },
    });
  }

  private resolveDecisionEventType(
    command: BookingEligibilityCommandKind,
    blocked: boolean,
  ): BookingEligibilityDecisionEventType | null {
    if (command === 'confirm') {
      return blocked ? 'CONFIRM_REJECTED' : 'CONFIRM_ATTEMPT';
    }
    if (command === 'pickup') {
      return 'PICKUP_CHECK';
    }
    return null;
  }

  async assertAllowedForBooking(
    organizationId: string,
    bookingId: string,
    targetStatus: BookingStatus,
    options: BookingEligibilityEnforcementOptions & {
      foreignTravelRequested?: boolean;
      additionalDriverCount?: number;
    } = {},
  ): Promise<BookingEligibilityGateResult | null> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: {
        id: true,
        customerId: true,
        vehicleId: true,
        startDate: true,
        endDate: true,
        status: true,
        notes: true,
        paymentIntent: true,
        extrasJson: true,
      },
    });
    if (!booking) return null;

    return this.assertAllowed(
      {
        organizationId,
        bookingId: booking.id,
        customerId: booking.customerId,
        vehicleId: booking.vehicleId,
        startDate: booking.startDate,
        endDate: booking.endDate,
        targetStatus,
        notes: booking.notes,
        paymentIntent: booking.paymentIntent,
        extrasJson: booking.extrasJson,
        foreignTravelRequested: options.foreignTravelRequested,
        additionalDriverCount: options.additionalDriverCount,
      },
      options,
    );
  }

  /**
   * Fresh PICKUP-stage gatekeeper evaluation immediately before CONFIRMED → ACTIVE.
   * Used by pickup handover — document/legal gates remain in BookingPickupGateService.
   */
  async assertAllowedForPickup(
    organizationId: string,
    bookingId: string,
    options: BookingEligibilityEnforcementOptions = {},
  ): Promise<BookingEligibilityGateResult> {
    const result = await this.assertAllowedForBooking(
      organizationId,
      bookingId,
      'ACTIVE',
      {
        ...options,
        command: 'pickup',
        intent: 'enforce',
      },
    );
    if (!result) {
      throwBookingEligibilityViolation({
        code: BOOKING_ELIGIBILITY_TRANSITION_CODE.TECHNICAL_ERROR,
        message: 'Pickup eligibility evaluation returned no result.',
      });
    }
    return result;
  }

  private async runEvaluation(
    context: BookingEligibilityMutationContext,
    options: BookingEligibilityEnforcementOptions,
  ): Promise<BookingEligibilityGateResult> {
    const isWizardDraft =
      isWizardDraftBooking({
        status: context.targetStatus,
        notes: context.notes,
      }) && context.targetStatus === 'PENDING';
    const mode = resolveEligibilityPolicyMode({
      targetStatus: context.targetStatus,
      isWizardDraft,
    });
    const intent = options.intent ?? 'enforce';
    const command = options.command ?? this.resolveCommandForMode(mode ?? 'PENDING');
    const correlation = buildBookingEligibilityCorrelationIds({
      organizationId: context.organizationId,
      bookingId: context.bookingId,
      command,
      parentCommandId: options.parentCommandId,
    });
    const stage = resolveGateStageForPolicyMode(mode ?? 'PENDING');

    let gateResult: BookingEligibilityGateResult;
    try {
      const additionalDriverCount =
        context.additionalDriverCount ??
        (context.bookingId
          ? await this.countAdditionalDrivers(context.organizationId, context.bookingId)
          : 0);
      const depositReceived = context.bookingId
        ? await this.isDepositReceived(context.organizationId, context.bookingId)
        : false;

      gateResult = await this.gatekeeper.evaluate({
        organizationId: context.organizationId,
        customerId: context.customerId,
        vehicleId: context.vehicleId,
        stage,
        startDate: context.startDate,
        endDate: context.endDate,
        bookingId: context.bookingId,
        requestedStatus: context.targetStatus,
        paymentIntent: resolveGatekeeperPaymentIntent(context.paymentIntent),
        foreignTravelRequested:
          context.foreignTravelRequested ??
          parseForeignTravelRequested(context.extrasJson),
        additionalDriverCount,
        depositReceived,
        includeVehicleReadiness:
          context.targetStatus === 'CONFIRMED' || context.targetStatus === 'ACTIVE',
        correlation,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Eligibility evaluation failed unexpectedly';
      gateResult = buildTechnicalFailureGateResult({
        organizationId: context.organizationId,
        customerId: context.customerId,
        vehicleId: context.vehicleId,
        bookingId: context.bookingId,
        stage,
        message,
        correlation,
      });
    }

    const outcome =
      gateResult.status === 'TECHNICAL_ERROR' || gateResult.status === 'TEMPORARILY_UNAVAILABLE'
        ? 'technical_error'
        : gateResult.allowed
          ? 'allowed'
          : 'blocked';

    this.auditLogger.logEvaluation({
      correlation: gateResult.correlation,
      organizationId: context.organizationId,
      bookingId: context.bookingId,
      vehicleId: context.vehicleId,
      stage,
      command,
      policyMode: mode,
      intent,
      outcome: intent === 'preview' ? 'preview_only' : outcome,
      gateResult,
      errorCode:
        gateResult.status === 'TECHNICAL_ERROR' ||
        gateResult.status === 'TEMPORARILY_UNAVAILABLE'
          ? mapGateStatusToTransitionCode(gateResult.status)
          : undefined,
      retryable:
        gateResult.status === 'TECHNICAL_ERROR' ||
        gateResult.status === 'TEMPORARILY_UNAVAILABLE',
    });

    if (
      intent === 'enforce' &&
      mode &&
      shouldFailClosedForPolicyMode(mode) &&
      (gateResult.status === 'TECHNICAL_ERROR' ||
        gateResult.status === 'TEMPORARILY_UNAVAILABLE')
    ) {
      throwBookingEligibilityViolation({
        code: mapGateStatusToTransitionCode(gateResult.status),
        message:
          gateResult.status === 'TEMPORARILY_UNAVAILABLE'
            ? 'Rental eligibility is temporarily unavailable.'
            : 'Rental eligibility could not be evaluated.',
        gateResult,
        correlation: gateResult.correlation,
      });
    }

    return gateResult;
  }

  private resolveCommandForMode(
    mode: NonNullable<ReturnType<typeof resolveEligibilityPolicyMode>>,
  ): BookingEligibilityCommandKind {
    if (mode === 'CONFIRMED') return 'confirm';
    if (mode === 'ACTIVE') return 'pickup';
    if (mode === 'DRAFT') return 'create';
    return 'update';
  }

  private async countAdditionalDrivers(
    organizationId: string,
    bookingId: string,
  ): Promise<number> {
    return this.prisma.bookingAllowedDriver.count({
      where: {
        organizationId,
        bookingId,
        role: 'ADDITIONAL',
      },
    });
  }

  private async isDepositReceived(
    organizationId: string,
    bookingId: string,
  ): Promise<boolean> {
    const deposit = await this.prisma.bookingDeposit.findFirst({
      where: { organizationId, bookingId },
      select: { status: true },
    });
    if (!deposit) return false;
    return ['RECEIVED', 'PARTIALLY_USED', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(
      deposit.status,
    );
  }
}

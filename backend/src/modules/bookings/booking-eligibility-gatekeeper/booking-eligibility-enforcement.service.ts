import { Injectable } from '@nestjs/common';
import { BookingStatus, MembershipRole } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  assertMembershipPermission,
  type PermissionActor,
} from '@shared/auth/permission.util';
import { BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS } from '../booking-eligibility-permission.constants';
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
  eligibilityOverrideReason?: string | null;
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

    const hasOverridePermission = await this.canOverrideEligibility(
      options,
      context.organizationId,
    );

    assertBookingEligibilityTransitionAllowed(gateResult, mode!, {
      eligibilityOverrideReason: options.eligibilityOverrideReason,
      hasOverridePermission,
      correlation: gateResult.correlation,
    });

    return gateResult;
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

  private async canOverrideEligibility(
    options: BookingEligibilityEnforcementOptions,
    organizationId: string,
  ): Promise<boolean> {
    if (!options.userId) return false;
    try {
      const requirement =
        BOOKING_ELIGIBILITY_PERMISSION_REQUIREMENTS['booking_eligibility.override'];
      const actor: PermissionActor = {
        id: options.userId,
        organizationId,
        platformRole: options.platformRole ?? undefined,
        membershipRole: options.membershipRole ?? undefined,
      };
      await assertMembershipPermission(
        this.prisma,
        actor,
        organizationId,
        requirement.module,
        requirement.level,
      );
      return true;
    } catch {
      return false;
    }
  }
}

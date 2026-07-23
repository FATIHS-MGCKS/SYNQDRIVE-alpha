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
  isEligibilityRelevantBookingMutation,
  resolveEligibilityPolicyMode,
  resolveGateStageForPolicyMode,
  shouldSkipEligibilityEnforcement,
} from './booking-eligibility-transition.policy';
import type { BookingEligibilityGateResult } from './booking-eligibility-gatekeeper.types';

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
};

@Injectable()
export class BookingEligibilityEnforcementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gatekeeper: BookingEligibilityGatekeeperService,
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
    statusChanged: boolean;
  }): boolean {
    const terminal: BookingStatus[] = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
    if (terminal.includes(input.existing.status) && !input.statusChanged) {
      return false;
    }

    const isWizardDraft =
      isWizardDraftBooking({
        status: input.next.targetStatus,
        notes: input.next.notes ?? input.existing.notes,
      }) && input.next.targetStatus === 'PENDING';

    const mode = resolveEligibilityPolicyMode({
      targetStatus: input.next.targetStatus,
      isWizardDraft,
    });
    if (shouldSkipEligibilityEnforcement(mode)) {
      return false;
    }

    if (input.statusChanged && input.next.targetStatus === 'CONFIRMED') {
      return true;
    }

    if (input.next.targetStatus === 'CONFIRMED') {
      return isEligibilityRelevantBookingMutation({
        customerIdChanged: input.customerIdChanged,
        vehicleIdChanged: input.vehicleIdChanged,
        datesChanged: input.datesChanged,
        paymentIntentChanged: input.paymentIntentChanged,
        extrasChanged: input.extrasChanged,
        statusChanged: input.statusChanged,
      });
    }

    if (input.next.targetStatus === 'PENDING' && !isWizardDraft) {
      return isEligibilityRelevantBookingMutation({
        customerIdChanged: input.customerIdChanged,
        vehicleIdChanged: input.vehicleIdChanged,
        datesChanged: input.datesChanged,
        paymentIntentChanged: input.paymentIntentChanged,
        extrasChanged: input.extrasChanged,
        statusChanged: input.statusChanged,
      });
    }

    return false;
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

    const stage = resolveGateStageForPolicyMode(mode!);
    const additionalDriverCount =
      context.additionalDriverCount ??
      (context.bookingId
        ? await this.countAdditionalDrivers(context.organizationId, context.bookingId)
        : 0);
    const depositReceived = context.bookingId
      ? await this.isDepositReceived(context.organizationId, context.bookingId)
      : false;

    const gateResult = await this.gatekeeper.evaluate({
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
      includeVehicleReadiness: context.targetStatus === 'CONFIRMED',
    });

    const hasOverridePermission = await this.canOverrideEligibility(
      options,
      context.organizationId,
    );

    assertBookingEligibilityTransitionAllowed(gateResult, mode!, {
      eligibilityOverrideReason: options.eligibilityOverrideReason,
      hasOverridePermission,
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

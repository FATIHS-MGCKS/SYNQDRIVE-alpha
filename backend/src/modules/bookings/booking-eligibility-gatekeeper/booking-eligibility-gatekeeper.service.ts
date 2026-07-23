import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { CustomerEligibilityService } from '@modules/customers/customer-eligibility.service';
import { CustomerVerificationService } from '@modules/customer-verification/customer-verification.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { BookingRentalEligibilityService } from '../booking-rental-eligibility.service';
import {
  BOOKING_ELIGIBILITY_DECISION_AUTHORITY,
} from './booking-eligibility-decision.policy';
import {
  BOOKING_ELIGIBILITY_GATE_ENGINE_VERSION,
  BOOKING_ELIGIBILITY_GATE_DOMAIN,
  BOOKING_ELIGIBILITY_REASON_CODE,
} from './booking-eligibility-gatekeeper.constants';
import type {
  BookingEligibilityDomainEvaluator,
  BookingEligibilityGateInput,
  BookingEligibilityGateReason,
  BookingEligibilityGateResult,
  BookingEligibilityGateStatus,
} from './booking-eligibility-gatekeeper.types';
import {
  assembleGateResult,
  collectSourceRuleIds,
  dedupeGateReasons,
  mapCustomerEligibilityToGateReasons,
  mapRentalEligibilityToGateReasons,
  mapVerificationToGateReasons,
  resolveAggregateGateStatus,
} from './booking-eligibility-gatekeeper.util';
import type { BookingEligibilityDomainContribution } from './booking-eligibility-decision.policy';
import { buildBookingEligibilityCorrelationIds } from './booking-eligibility-correlation.util';

/**
 * Central orchestrator for booking transition eligibility.
 *
 * Subsystems contribute facts and partial domain results; this service is the
 * sole producer of the final booking eligibility decision.
 */
@Injectable()
export class BookingEligibilityGatekeeperService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerEligibility: CustomerEligibilityService,
    private readonly verificationService: CustomerVerificationService,
    private readonly rentalEligibility: BookingRentalEligibilityService,
    private readonly rentalHealth: RentalHealthService,
  ) {}

  async evaluate(input: BookingEligibilityGateInput): Promise<BookingEligibilityGateResult> {
    const evaluatedAt = new Date();
    const correlation =
      input.correlation ??
      buildBookingEligibilityCorrelationIds({
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        command: input.stage === 'PREVIEW' ? 'preview' : input.stage === 'CONFIRM' ? 'confirm' : input.stage === 'PICKUP' ? 'pickup' : 'create',
      });
    const contributions: BookingEligibilityDomainContribution[] = [];
    let recheckRequired = false;
    let sourceRuleIds: string[] = [];

    const vehicleSlice = await this.evaluateVehicleReference(input);
    if (!vehicleSlice.vehicleFound) {
      if (vehicleSlice.error) {
        contributions.push({
          domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE,
          status: 'TECHNICAL_ERROR',
          blockingReasons: [{
            code: BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR,
            domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE,
            message: vehicleSlice.error,
          }],
          warnings: [],
        });
      } else {
        contributions.push({
          domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE,
          status: 'NOT_ELIGIBLE',
          blockingReasons: [{
            code: BOOKING_ELIGIBILITY_REASON_CODE.VEHICLE_NOT_FOUND,
            domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE,
            message: `Vehicle ${input.vehicleId} not found in organization`,
          }],
          warnings: [],
        });
      }
    }

    const verificationSlice = await this.evaluateVerificationDomain(input);
    let verificationMapped: ReturnType<typeof mapVerificationToGateReasons> | null = null;
    if (verificationSlice.evaluated && verificationSlice.result) {
      verificationMapped = mapVerificationToGateReasons(
        verificationSlice.result,
        input.stage,
      );
      contributions.push(verificationMapped);
      if (
        verificationSlice.result.idDocument === 'pending' ||
        verificationSlice.result.drivingLicense === 'pending' ||
        verificationSlice.result.idDocument === 'requires_review' ||
        verificationSlice.result.drivingLicense === 'requires_review'
      ) {
        recheckRequired = true;
      }
    } else if (verificationSlice.error) {
      contributions.push({
        domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION,
        status: 'TECHNICAL_ERROR',
        blockingReasons: [{
          code: BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR,
          domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION,
          message: verificationSlice.error,
        }],
        warnings: [],
      });
    }

    const customerSlice = await this.evaluateCustomerDomain(
      input,
      verificationSlice.result,
    );
    let customerMapped: ReturnType<typeof mapCustomerEligibilityToGateReasons> | null = null;
    if (customerSlice.evaluated && customerSlice.result) {
      customerMapped = mapCustomerEligibilityToGateReasons(
        customerSlice.result,
        input.stage,
      );
      contributions.push(customerMapped);
    } else if (customerSlice.error) {
      contributions.push({
        domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.CUSTOMER,
        status: 'TECHNICAL_ERROR',
        blockingReasons: [{
          code: BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR,
          domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.CUSTOMER,
          message: customerSlice.error,
        }],
        warnings: [],
      });
    }

    const rentalSlice = await this.evaluateRentalRulesDomain(input);
    if (rentalSlice.evaluated && rentalSlice.result) {
      const mapped = mapRentalEligibilityToGateReasons(rentalSlice.result);
      contributions.push(mapped);
      sourceRuleIds = collectSourceRuleIds(rentalSlice.result.effectiveRules);
      if (mapped.status === 'MISSING_INFORMATION') {
        recheckRequired = true;
      }
    } else if (rentalSlice.error) {
      contributions.push({
        domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.RENTAL_RULES,
        status: 'TECHNICAL_ERROR',
        blockingReasons: [{
          code: BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR,
          domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.RENTAL_RULES,
          message: rentalSlice.error,
        }],
        warnings: [],
      });
    }

    const vehicleReadinessSlice = await this.evaluateVehicleReadinessDomain(input);
    if (vehicleReadinessSlice.evaluated && !vehicleReadinessSlice.skipped) {
      if (
        vehicleReadinessSlice.healthGateStatus === 'UNAVAILABLE' ||
        vehicleReadinessSlice.healthGateStatus === 'UNKNOWN'
      ) {
        contributions.push({
          domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE_READINESS,
          status: 'TEMPORARILY_UNAVAILABLE',
          blockingReasons: [{
            code: BOOKING_ELIGIBILITY_REASON_CODE.VEHICLE_READINESS_UNAVAILABLE,
            domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE_READINESS,
            message: vehicleReadinessSlice.error ?? 'Vehicle health gate unavailable',
          }],
          warnings: [],
        });
        recheckRequired = true;
      } else if (vehicleReadinessSlice.blocked) {
        contributions.push({
          domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE_READINESS,
          status: 'NOT_ELIGIBLE',
          blockingReasons: [{
            code: BOOKING_ELIGIBILITY_REASON_CODE.VEHICLE_RENTAL_BLOCKED,
            domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE_READINESS,
            message: vehicleReadinessSlice.error ?? 'Vehicle rental blocked by health gate',
          }],
          warnings: [],
        });
      }
    } else if (!vehicleReadinessSlice.skipped && vehicleReadinessSlice.blocked) {
      contributions.push({
        domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE_READINESS,
        status: 'TECHNICAL_ERROR',
        blockingReasons: [{
          code: BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR,
          domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE_READINESS,
          message: vehicleReadinessSlice.error ?? 'Vehicle readiness evaluation failed',
        }],
        warnings: [],
      });
    }

    const pricingDepositSlice = this.buildSkippedPricingDepositSlice(
      input.includePricingDeposit === true,
    );

    const core = assembleGateResult({
      stage: input.stage,
      organizationId: input.organizationId,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      bookingId: input.bookingId,
      contributions: contributions.map((contribution) => ({
        ...contribution,
        blockingReasons: dedupeGateReasons(contribution.blockingReasons),
        warnings: dedupeGateReasons(contribution.warnings),
      })),
      sourceRuleIds,
      evaluatedAt,
      recheckRequired,
    });

    const canProceedForStage = resolveCustomerCanProceedForStage(
      customerSlice.result,
      input.stage,
    );

    return {
      ...core,
      engineVersion: BOOKING_ELIGIBILITY_GATE_ENGINE_VERSION,
      decisionAuthority: BOOKING_ELIGIBILITY_DECISION_AUTHORITY,
      correlation,
      domains: {
        customer: {
          ...customerSlice,
          canProceedForStage,
        },
        verification: verificationSlice,
        rentalRules: rentalSlice,
        vehicle: vehicleSlice,
        vehicleReadiness: vehicleReadinessSlice,
        pricingDeposit: pricingDepositSlice,
      },
    };
  }

  async evaluateForBooking(
    organizationId: string,
    bookingId: string,
    stage: BookingEligibilityGateInput['stage'],
    overrides: Partial<
      Pick<
        BookingEligibilityGateInput,
        | 'paymentIntent'
        | 'foreignTravelRequested'
        | 'additionalDriverCount'
        | 'depositReceived'
        | 'includeVehicleReadiness'
        | 'includePricingDeposit'
      >
    > = {},
  ): Promise<BookingEligibilityGateResult> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId },
      select: {
        id: true,
        customerId: true,
        vehicleId: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return this.evaluate({
      organizationId,
      customerId: booking.customerId,
      vehicleId: booking.vehicleId,
      stage,
      startDate: booking.startDate,
      endDate: booking.endDate,
      bookingId: booking.id,
      requestedStatus: booking.status,
      ...overrides,
    });
  }

  async evaluateWithExtensions(
    input: BookingEligibilityGateInput,
    extensions: BookingEligibilityDomainEvaluator[] = [],
  ): Promise<BookingEligibilityGateResult> {
    const base = await this.evaluate(input);
    if (extensions.length === 0) return base;

    const extraContributions: BookingEligibilityDomainContribution[] = [];
    const extraStatuses: BookingEligibilityGateStatus[] = [base.status];

    for (const evaluator of extensions) {
      try {
        const slice = await evaluator.evaluate(input, {
          effectiveRules: base.domains.rentalRules.result?.effectiveRules ?? null,
        });
        if (slice.skipped) continue;
        extraContributions.push({
          domain: evaluator.domain,
          status: slice.status ?? 'ELIGIBLE',
          blockingReasons: slice.blockingReasons,
          warnings: slice.warnings,
        });
        if (slice.status) extraStatuses.push(slice.status);
      } catch (error) {
        extraStatuses.push('TECHNICAL_ERROR');
        extraContributions.push({
          domain: evaluator.domain,
          status: 'TECHNICAL_ERROR',
          blockingReasons: [{
            code: BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR,
            domain: evaluator.domain,
            message: error instanceof Error ? error.message : 'Extension evaluator failed',
          }],
          warnings: [],
        });
      }
    }

    const status = resolveAggregateGateStatus(extraStatuses);
    const extraBlocking = extraContributions.flatMap((c) => c.blockingReasons);
    const extraWarnings = extraContributions.flatMap((c) => c.warnings);

    return {
      ...base,
      status,
      allowed: status === 'ELIGIBLE' || status === 'MANUAL_APPROVAL_REQUIRED',
      blockingReasons: dedupeGateReasons([
        ...base.blockingReasons,
        ...extraBlocking,
      ]),
      warnings: dedupeGateReasons([...base.warnings, ...extraWarnings]),
      reasonCodes: [
        ...new Set([
          ...base.blockingReasons,
          ...extraBlocking,
          ...base.warnings,
          ...extraWarnings,
        ].map((r) => r.code)),
      ],
    };
  }

  private async evaluateVehicleReference(
    input: BookingEligibilityGateInput,
  ): Promise<BookingEligibilityGateResult['domains']['vehicle']> {
    try {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.organizationId },
        select: { id: true },
      });
      return {
        evaluated: true,
        vehicleFound: Boolean(vehicle),
        vehicleId: input.vehicleId,
      };
    } catch (error) {
      return {
        evaluated: false,
        vehicleFound: false,
        vehicleId: input.vehicleId,
        error: error instanceof Error ? error.message : 'Vehicle lookup failed',
      };
    }
  }

  private async evaluateCustomerDomain(
    input: BookingEligibilityGateInput,
    verificationSnapshot: BookingEligibilityGateResult['domains']['verification']['result'],
  ): Promise<BookingEligibilityGateResult['domains']['customer']> {
    try {
      const result = await this.customerEligibility.evaluateForBooking(
        input.organizationId,
        input.customerId,
        {
          requestedStatus: input.requestedStatus,
          startDate: input.startDate,
          endDate: input.endDate,
          bookingId: input.bookingId,
          verificationSnapshot: verificationSnapshot ?? undefined,
        },
      );
      return { evaluated: true, canProceedForStage: false, result };
    } catch (error) {
      return {
        evaluated: false,
        canProceedForStage: false,
        result: null,
        error: error instanceof Error ? error.message : 'Customer eligibility failed',
      };
    }
  }

  private async evaluateVerificationDomain(
    input: BookingEligibilityGateInput,
  ): Promise<BookingEligibilityGateResult['domains']['verification']> {
    try {
      const result = await this.verificationService.getEligibilityStatus(
        input.organizationId,
        input.customerId,
        {
          bookingId: input.bookingId,
          startDate: input.startDate,
        },
      );
      return { evaluated: true, result };
    } catch (error) {
      return {
        evaluated: false,
        result: null,
        error: error instanceof Error ? error.message : 'Verification lookup failed',
      };
    }
  }

  private async evaluateRentalRulesDomain(
    input: BookingEligibilityGateInput,
  ): Promise<BookingEligibilityGateResult['domains']['rentalRules']> {
    try {
      const result = await this.rentalEligibility.check({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        customerId: input.customerId,
        startDate: input.startDate,
        endDate: input.endDate,
        bookingId: input.bookingId,
        paymentIntent: input.paymentIntent,
        foreignTravelRequested: input.foreignTravelRequested,
        additionalDriverCount: input.additionalDriverCount,
        depositReceived: input.depositReceived,
        skipVerificationImpact: true,
      });
      return { evaluated: true, result };
    } catch (error) {
      return {
        evaluated: false,
        result: null,
        error: error instanceof Error ? error.message : 'Rental eligibility failed',
      };
    }
  }

  private async evaluateVehicleReadinessDomain(
    input: BookingEligibilityGateInput,
  ): Promise<BookingEligibilityGateResult['domains']['vehicleReadiness']> {
    if (!input.includeVehicleReadiness) {
      return {
        evaluated: false,
        skipped: true,
        blocked: false,
      };
    }

    try {
      const gate = await this.rentalHealth.isRentalBlocked(
        input.organizationId,
        input.vehicleId,
      );
      return {
        evaluated: true,
        skipped: false,
        blocked: gate.blocked,
        healthGateStatus: gate.healthGateStatus,
        error: gate.reasons[0] ?? gate.healthGateWarning ?? undefined,
      };
    } catch (error) {
      return {
        evaluated: false,
        skipped: false,
        blocked: true,
        healthGateStatus: 'UNAVAILABLE',
        error: error instanceof Error ? error.message : 'Vehicle readiness check failed',
      };
    }
  }

  private buildSkippedPricingDepositSlice(
    requested: boolean,
  ): BookingEligibilityGateResult['domains']['pricingDeposit'] {
    return {
      evaluated: false,
      skipped: !requested,
      error: requested
        ? 'Pricing/deposit evaluator not yet implemented (Prompt 22)'
        : undefined,
    };
  }
}

function resolveCustomerCanProceedForStage(
  result: BookingEligibilityGateResult['domains']['customer']['result'],
  stage: BookingEligibilityGateInput['stage'],
): boolean {
  if (!result) return false;
  if (stage === 'CONFIRM') return result.stages.confirmBooking.canProceed;
  if (stage === 'PICKUP') return result.stages.startPickup.canProceed;
  return result.stages.createBooking.canProceed;
}

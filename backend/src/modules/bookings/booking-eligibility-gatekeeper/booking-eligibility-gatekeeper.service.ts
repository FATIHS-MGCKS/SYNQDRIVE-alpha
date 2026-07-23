import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { CustomerEligibilityService } from '@modules/customers/customer-eligibility.service';
import { CustomerVerificationService } from '@modules/customer-verification/customer-verification.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { BookingRentalEligibilityService } from '../booking-rental-eligibility.service';
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
import { buildBookingEligibilityCorrelationIds } from './booking-eligibility-correlation.util';

/**
 * Central orchestrator for booking transition eligibility.
 *
 * Composes existing domain evaluators without duplicating their business logic:
 * - {@link CustomerEligibilityService} — customer lifecycle / policy
 * - {@link CustomerVerificationService} — document verification status
 * - {@link BookingRentalEligibilityService} — effective rental rules
 * - {@link RentalHealthService} — optional vehicle readiness (when enabled)
 *
 * Wired into BookingsService create/update via BookingEligibilityEnforcementService (Prompt 8).
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
    const blockingReasons: BookingEligibilityGateReason[] = [];
    const warnings: BookingEligibilityGateReason[] = [];
    const missingFields: string[] = [];
    const domainStatuses: BookingEligibilityGateStatus[] = [];
    let recheckRequired = false;

    const vehicleSlice = await this.evaluateVehicleReference(input);
    if (!vehicleSlice.vehicleFound) {
      if (vehicleSlice.error) {
        domainStatuses.push('TECHNICAL_ERROR');
        blockingReasons.push({
          code: BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR,
          domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE,
          message: vehicleSlice.error,
        });
      } else {
        blockingReasons.push({
          code: BOOKING_ELIGIBILITY_REASON_CODE.VEHICLE_NOT_FOUND,
          domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE,
          message: `Vehicle ${input.vehicleId} not found in organization`,
        });
        domainStatuses.push('NOT_ELIGIBLE');
      }
    }

    const customerSlice = await this.evaluateCustomerDomain(input);
    let customerMapped: ReturnType<typeof mapCustomerEligibilityToGateReasons> | null = null;
    if (customerSlice.evaluated && customerSlice.result) {
      customerMapped = mapCustomerEligibilityToGateReasons(
        customerSlice.result,
        input.stage,
      );
      blockingReasons.push(...customerMapped.blockingReasons);
      warnings.push(...customerMapped.warnings);
      domainStatuses.push(customerMapped.status);
    } else if (customerSlice.error) {
      domainStatuses.push('TECHNICAL_ERROR');
      blockingReasons.push({
        code: BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR,
        domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.CUSTOMER,
        message: customerSlice.error,
      });
    }

    const verificationSlice = await this.evaluateVerificationDomain(input);
    if (verificationSlice.evaluated && verificationSlice.result) {
      const mapped = mapVerificationToGateReasons(
        verificationSlice.result,
        input.stage,
      );
      blockingReasons.push(...mapped.blockingReasons);
      warnings.push(...mapped.warnings);
      if (mapped.blockingReasons.length > 0) {
        domainStatuses.push('NOT_ELIGIBLE');
      }
      if (
        verificationSlice.result.idDocument === 'pending' ||
        verificationSlice.result.drivingLicense === 'pending'
      ) {
        recheckRequired = true;
      }
    } else if (verificationSlice.error) {
      domainStatuses.push('TECHNICAL_ERROR');
      blockingReasons.push({
        code: BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR,
        domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VERIFICATION,
        message: verificationSlice.error,
      });
    }

    const rentalSlice = await this.evaluateRentalRulesDomain(input);
    let sourceRuleIds: string[] = [];
    if (rentalSlice.evaluated && rentalSlice.result) {
      const mapped = mapRentalEligibilityToGateReasons(rentalSlice.result);
      blockingReasons.push(...mapped.blockingReasons);
      warnings.push(...mapped.warnings);
      missingFields.push(...mapped.missingFields);
      domainStatuses.push(mapped.status);
      sourceRuleIds = collectSourceRuleIds(rentalSlice.result.effectiveRules);
      if (mapped.status === 'MISSING_INFORMATION') {
        recheckRequired = true;
      }
    } else if (rentalSlice.error) {
      domainStatuses.push('TECHNICAL_ERROR');
      blockingReasons.push({
        code: BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR,
        domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.RENTAL_RULES,
        message: rentalSlice.error,
      });
    }

    const vehicleReadinessSlice = await this.evaluateVehicleReadinessDomain(input);
    if (vehicleReadinessSlice.evaluated && !vehicleReadinessSlice.skipped) {
      if (
        vehicleReadinessSlice.healthGateStatus === 'UNAVAILABLE' ||
        vehicleReadinessSlice.healthGateStatus === 'UNKNOWN'
      ) {
        domainStatuses.push('TEMPORARILY_UNAVAILABLE');
        blockingReasons.push({
          code: BOOKING_ELIGIBILITY_REASON_CODE.VEHICLE_READINESS_UNAVAILABLE,
          domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE_READINESS,
          message: vehicleReadinessSlice.error ?? 'Vehicle health gate unavailable',
        });
        recheckRequired = true;
      } else if (vehicleReadinessSlice.blocked) {
        domainStatuses.push('NOT_ELIGIBLE');
        blockingReasons.push({
          code: BOOKING_ELIGIBILITY_REASON_CODE.VEHICLE_RENTAL_BLOCKED,
          domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE_READINESS,
          message: vehicleReadinessSlice.error ?? 'Vehicle rental blocked by health gate',
        });
      }
    } else if (!vehicleReadinessSlice.skipped && vehicleReadinessSlice.blocked) {
      domainStatuses.push('TECHNICAL_ERROR');
      blockingReasons.push({
        code: BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR,
        domain: BOOKING_ELIGIBILITY_GATE_DOMAIN.VEHICLE_READINESS,
        message: vehicleReadinessSlice.error ?? 'Vehicle readiness evaluation failed',
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
      blockingReasons: dedupeGateReasons(blockingReasons),
      warnings: dedupeGateReasons(warnings),
      missingFields: [...new Set(missingFields)],
      sourceRuleIds,
      domainStatuses:
        domainStatuses.length > 0 ? domainStatuses : ['ELIGIBLE'],
      evaluatedAt,
      recheckRequired,
    });

    return {
      ...core,
      engineVersion: BOOKING_ELIGIBILITY_GATE_ENGINE_VERSION,
      correlation,
      domains: {
        customer: {
          ...customerSlice,
          canProceedForStage: customerMapped?.canProceedForStage ?? false,
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

  /**
   * Allows injecting additional domain evaluators (e.g. pricing/deposit) without
   * modifying the core orchestration path.
   */
  async evaluateWithExtensions(
    input: BookingEligibilityGateInput,
    extensions: BookingEligibilityDomainEvaluator[] = [],
  ): Promise<BookingEligibilityGateResult> {
    const base = await this.evaluate(input);
    if (extensions.length === 0) return base;

    const extraBlocking: BookingEligibilityGateReason[] = [];
    const extraWarnings: BookingEligibilityGateReason[] = [];
    const extraStatuses: BookingEligibilityGateStatus[] = [base.status];

    for (const evaluator of extensions) {
      try {
        const slice = await evaluator.evaluate(input, {
          effectiveRules: base.domains.rentalRules.result?.effectiveRules ?? null,
        });
        if (slice.skipped) continue;
        extraBlocking.push(...slice.blockingReasons);
        extraWarnings.push(...slice.warnings);
        if (slice.status) extraStatuses.push(slice.status);
      } catch (error) {
        extraStatuses.push('TECHNICAL_ERROR');
        extraBlocking.push({
          code: BOOKING_ELIGIBILITY_REASON_CODE.TECHNICAL_ERROR,
          domain: evaluator.domain,
          message: error instanceof Error ? error.message : 'Extension evaluator failed',
        });
      }
    }

    const status = resolveAggregateGateStatus(extraStatuses);
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

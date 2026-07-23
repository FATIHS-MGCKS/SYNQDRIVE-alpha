import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BookingDriverRole, BookingStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CustomerEligibilityService } from '@modules/customers/customer-eligibility.service';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { PricingQuoteService } from '@modules/pricing/pricing-quote.service';
import type { BookingPricingInputDto } from '@modules/pricing/dto';
import type { PricingContextDto } from '@modules/pricing/pricing-context.types';
import { computeRentalDays } from '@modules/pricing/pricing-rental-days.util';
import { StationValidationService } from '@modules/stations/station-validation.service';
import { assertValidBookingWindow } from './booking-conflict.util';
import {
  BOOKING_CREATE_ERROR_CODES,
  DEFAULT_MAXIMUM_RENTAL_DAYS,
} from './booking-create-error.codes';
import type { CreateBookingCommand } from './booking-command.types';

export interface BookingCreateValidationResult {
  rentalGate: Awaited<ReturnType<RentalHealthService['isRentalBlocked']>>;
  stationFields: Awaited<ReturnType<StationValidationService['validateBookingStations']>> & {
    pickupStationId: string | null;
    returnStationId: string | null;
    pickupAddressOverride?: string | null;
    returnAddressOverride?: string | null;
    stationTransferFeeCents?: number | null;
  };
  notes: string | null;
  validatedAllowedDriverIds: string[];
}

@Injectable()
export class BookingCreateValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stationValidation: StationValidationService,
    private readonly rentalHealthService: RentalHealthService,
    private readonly customerEligibilityService: CustomerEligibilityService,
    private readonly pricingQuoteService: PricingQuoteService,
  ) {}

  async validate(
    orgId: string,
    command: CreateBookingCommand,
    options?: { userId?: string | null },
  ): Promise<BookingCreateValidationResult> {
    this.assertValidDateWindow(command.pickupAt, command.returnAt);
    await this.assertTenantResources(orgId, command);
    await this.assertQuotePreconditions(orgId, command, options?.userId ?? null);
    const stationFields = await this.assertStationConfiguration(orgId, command);
    const validatedAllowedDriverIds = await this.assertAllowedDrivers(orgId, command);
    const rentalGate = await this.assertVehicleRentalHealth(orgId, command.vehicleId);
    await this.assertCustomerEligibility(orgId, command);
    const notes = this.mergeNotes(command);

    return {
      rentalGate,
      stationFields: {
        ...stationFields,
        pickupAddressOverride: command.pickupAddressOverride ?? null,
        returnAddressOverride: command.returnAddressOverride ?? null,
        stationTransferFeeCents: null,
      },
      notes,
      validatedAllowedDriverIds,
    };
  }

  private assertValidDateWindow(pickupAt: Date, returnAt: Date): void {
    try {
      assertValidBookingWindow(pickupAt, returnAt);
    } catch (error) {
      const code = (error as Error).message;
      if (code === 'END_BEFORE_START') {
        throw new BadRequestException({
          message: 'returnAt must be after pickupAt',
          code: BOOKING_CREATE_ERROR_CODES.BOOKING_END_BEFORE_START,
        });
      }
      throw new BadRequestException({
        message: 'Invalid booking dates',
        code: BOOKING_CREATE_ERROR_CODES.BOOKING_INVALID_DATES,
      });
    }
  }

  private async assertTenantResources(
    orgId: string,
    command: CreateBookingCommand,
  ): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: command.customerId, organizationId: orgId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException({
        message: 'Customer not found',
        code: BOOKING_CREATE_ERROR_CODES.CUSTOMER_NOT_FOUND,
        customerId: command.customerId,
      });
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: command.vehicleId, organizationId: orgId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException({
        message: 'Vehicle not found',
        code: BOOKING_CREATE_ERROR_CODES.VEHICLE_NOT_FOUND,
        vehicleId: command.vehicleId,
      });
    }

    const stationIds = [command.pickupStationId, command.returnStationId].filter(
      Boolean,
    ) as string[];
    if (stationIds.length > 0) {
      const stations = await this.prisma.station.findMany({
        where: { organizationId: orgId, id: { in: stationIds } },
        select: { id: true },
      });
      const found = new Set(stations.map((s) => s.id));
      for (const stationId of stationIds) {
        if (!found.has(stationId)) {
          throw new NotFoundException({
            message: `Station ${stationId} not found`,
            code: BOOKING_CREATE_ERROR_CODES.STATION_NOT_FOUND,
            stationId,
          });
        }
      }
    }
  }

  private async assertQuotePreconditions(
    orgId: string,
    command: CreateBookingCommand,
    userId: string | null,
  ): Promise<void> {
    const quote = await this.prisma.pricingQuote.findFirst({
      where: { id: command.pricingQuoteId, organizationId: orgId },
    });
    if (!quote) {
      throw new NotFoundException({
        message: 'Preisquote nicht gefunden',
        code: 'PRICING_QUOTE_NOT_FOUND',
        quoteId: command.pricingQuoteId,
      });
    }

    if (command.currency && command.currency !== quote.currency.toLowerCase()) {
      throw new BadRequestException({
        message: 'Currency does not match pricing quote',
        code: BOOKING_CREATE_ERROR_CODES.BOOKING_CURRENCY_MISMATCH,
        expectedCurrency: quote.currency,
        providedCurrency: command.currency,
      });
    }

    const pricingContext = quote.pricingContextJson as unknown as PricingContextDto;
    const rentalDays = computeRentalDays(command.pickupAt, command.returnAt);
    const minimumRentalDays = pricingContext?.rate?.minimumRentalDays ?? null;
    if (minimumRentalDays != null && rentalDays < minimumRentalDays) {
      throw new BadRequestException({
        message: `Minimum rental duration is ${minimumRentalDays} day(s)`,
        code: BOOKING_CREATE_ERROR_CODES.BOOKING_MINIMUM_RENTAL_DAYS,
        minimumRentalDays,
        rentalDays,
      });
    }

    if (rentalDays > DEFAULT_MAXIMUM_RENTAL_DAYS) {
      throw new BadRequestException({
        message: `Maximum rental duration is ${DEFAULT_MAXIMUM_RENTAL_DAYS} day(s)`,
        code: BOOKING_CREATE_ERROR_CODES.BOOKING_MAXIMUM_RENTAL_DAYS,
        maximumRentalDays: DEFAULT_MAXIMUM_RENTAL_DAYS,
        rentalDays,
      });
    }

    const pricingInput = (command.pricingInput ?? {}) as BookingPricingInputDto;
    await this.pricingQuoteService.assertQuoteReadyForBooking({
      organizationId: orgId,
      userId,
      quoteId: command.pricingQuoteId,
      vehicleId: command.vehicleId,
      pickupAt: command.pickupAt,
      returnAt: command.returnAt,
      pricingInput,
    });
  }

  private async assertStationConfiguration(
    orgId: string,
    command: CreateBookingCommand,
  ) {
    const validated = await this.stationValidation.validateBookingStations(orgId, {
      pickupStationId: command.pickupStationId,
      returnStationId: command.returnStationId,
      pickupAddressOverride: command.pickupAddressOverride,
      returnAddressOverride: command.returnAddressOverride,
      isOneWayRental: command.isOneWayRental,
      pickupAt: command.pickupAt,
      returnAt: command.returnAt,
    });

    if (
      command.isOneWayRental !== undefined &&
      command.isOneWayRental !== validated.isOneWayRental &&
      validated.pickupStationId &&
      validated.returnStationId
    ) {
      throw new BadRequestException({
        message: 'isOneWayRental does not match pickup/return station selection',
        code: BOOKING_CREATE_ERROR_CODES.ONE_WAY_RENTAL_MISMATCH,
        expectedIsOneWayRental: validated.isOneWayRental,
        providedIsOneWayRental: command.isOneWayRental,
      });
    }

    return validated;
  }

  private async assertAllowedDrivers(
    orgId: string,
    command: CreateBookingCommand,
  ): Promise<string[]> {
    const ids = command.allowedDriverIds ?? [];
    if (ids.length === 0) return [];

    if (ids.includes(command.customerId)) {
      throw new BadRequestException({
        message: 'Contract holder cannot be listed in allowedDriverIds',
        code: BOOKING_CREATE_ERROR_CODES.ALLOWED_DRIVER_IS_CONTRACT_HOLDER,
        customerId: command.customerId,
      });
    }

    const unique = [...new Set(ids)];
    if (unique.length !== ids.length) {
      throw new BadRequestException({
        message: 'allowedDriverIds must be unique',
        code: BOOKING_CREATE_ERROR_CODES.ALLOWED_DRIVER_DUPLICATE,
      });
    }

    const drivers = await this.prisma.customer.findMany({
      where: { organizationId: orgId, id: { in: unique } },
      select: { id: true },
    });
    if (drivers.length !== unique.length) {
      const found = new Set(drivers.map((d) => d.id));
      const missing = unique.filter((id) => !found.has(id));
      throw new NotFoundException({
        message: 'Allowed driver customer not found for organization',
        code: BOOKING_CREATE_ERROR_CODES.ALLOWED_DRIVER_NOT_FOUND,
        missingDriverIds: missing,
      });
    }

    return unique;
  }

  private async assertVehicleRentalHealth(orgId: string, vehicleId: string) {
    const rentalGate = await this.rentalHealthService.isRentalBlocked(orgId, vehicleId);
    if (
      rentalGate.healthGateStatus === 'UNAVAILABLE' ||
      rentalGate.healthGateStatus === 'UNKNOWN'
    ) {
      throw new ConflictException({
        message:
          rentalGate.healthGateWarning ??
          'Fahrzeug-Gesundheit konnte nicht geprüft werden — manuelle Prüfung erforderlich.',
        code: BOOKING_CREATE_ERROR_CODES.VEHICLE_HEALTH_GATE_UNAVAILABLE,
        healthGateStatus: rentalGate.healthGateStatus,
        manualReviewRequired: true,
        blockingReasons: rentalGate.reasons,
        vehicleId,
      });
    }
    if (rentalGate.blocked) {
      throw new ConflictException({
        message:
          'Dieses Fahrzeug ist aktuell nicht vermietbar. ' +
          rentalGate.reasons.join(' · '),
        code: BOOKING_CREATE_ERROR_CODES.VEHICLE_RENTAL_BLOCKED,
        blockingReasons: rentalGate.reasons,
        vehicleId,
      });
    }
    return rentalGate;
  }

  private async assertCustomerEligibility(
    orgId: string,
    command: CreateBookingCommand,
  ): Promise<void> {
    const requestedStatus: BookingStatus = command.status ?? 'PENDING';
    const eligibility = await this.customerEligibilityService.evaluateForBooking(
      orgId,
      command.customerId,
      { requestedStatus, startDate: command.pickupAt },
    );

    let allowed = true;
    let message = 'Customer is not eligible for this booking';
    let code:
      | typeof BOOKING_CREATE_ERROR_CODES.CUSTOMER_BOOKING_BLOCKED
      | typeof BOOKING_CREATE_ERROR_CODES.CUSTOMER_CONFIRMATION_BLOCKED =
      BOOKING_CREATE_ERROR_CODES.CUSTOMER_BOOKING_BLOCKED;

    if (requestedStatus === 'PENDING') {
      allowed = eligibility.canCreatePendingBooking;
      message = 'Customer is not eligible for a new booking';
      code = BOOKING_CREATE_ERROR_CODES.CUSTOMER_BOOKING_BLOCKED;
    } else if (requestedStatus === 'CONFIRMED') {
      allowed = eligibility.canConfirmBooking;
      message = 'Customer is not eligible for a confirmed booking';
      code = BOOKING_CREATE_ERROR_CODES.CUSTOMER_CONFIRMATION_BLOCKED;
    }

    if (!allowed) {
      const stageBlockingReasons =
        requestedStatus === 'PENDING'
          ? eligibility.stages.createBooking.blockingReasons
          : eligibility.stages.confirmBooking.blockingReasons;

      throw new ConflictException({
        code,
        message,
        blockingReasons: stageBlockingReasons,
        warnings: eligibility.warnings,
        requiredActions: eligibility.requiredActions,
        customerId: command.customerId,
      });
    }
  }

  private mergeNotes(command: CreateBookingCommand): string | null {
    const customer = command.customerNotes?.trim() ?? '';
    const internal = command.internalNotes?.trim() ?? '';
    if (customer && internal) {
      return `${customer}\n\n[Internal]\n${internal}`;
    }
    const merged = customer || internal;
    return merged.length > 0 ? merged : null;
  }
}

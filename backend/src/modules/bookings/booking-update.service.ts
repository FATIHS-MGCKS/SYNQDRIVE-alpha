import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Booking, BookingDriverRole, BookingStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CustomerEligibilityService } from '@modules/customers/customer-eligibility.service';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import { BookingDocumentGenerationDispatcherService } from '@modules/documents/booking-document-generation/booking-document-generation.dispatcher.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { PricingService } from '@modules/pricing/pricing.service';
import { PricingQuoteService, requireQuoteId } from '@modules/pricing/pricing-quote.service';
import type { BookingPricingInputDto } from '@modules/pricing/dto';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { RentalHealthSummaryCacheService } from '@modules/rental-health/rental-health-summary-cache.service';
import { StationValidationService } from '@modules/stations/station-validation.service';
import { FleetMapCacheService } from '@modules/vehicles/fleet-map-cache.service';
import { TaskAutomationService } from '@modules/tasks/task-automation.service';
import { VehicleCleaningTaskService } from '@modules/tasks/vehicle-cleaning-task.service';
import {
  assertValidBookingWindow,
  buildOverlapWhere,
} from './booking-conflict.util';
import { BOOKING_AVAILABILITY_ERROR_CODES } from './availability/booking-availability.constants';
import { BookingAvailabilityBufferService } from './availability/booking-availability-buffer.service';
import { BookingVehicleAvailabilityService } from './availability/booking-vehicle-availability.service';
import { BookingIdempotencyService } from './idempotency/booking-idempotency.service';
import { BOOKING_CREATE_ERROR_CODES } from './booking-create-error.codes';
import { mergeNotesCommandToStorage } from './booking-update-command.mapper';
import type {
  BookingUpdateContext,
  UpdateBookingAllowedDriversCommand,
  UpdateBookingCustomerCommand,
  UpdateBookingNotesCommand,
  UpdateBookingOptionsCommand,
  UpdateBookingScheduleCommand,
  UpdateBookingStationsCommand,
  UpdateBookingVehicleCommand,
} from './booking-update-command.types';
import { BOOKING_UPDATE_ERROR_CODES } from './booking-update-error.codes';

const TERMINAL_STATUSES: BookingStatus[] = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];

type PricingApplyInput = {
  organizationId: string;
  bookingId: string;
  userId?: string | null;
  vehicleId: string;
  pickupAt: Date;
  returnAt: Date;
  pricingQuoteId?: string;
  pricingInput?: BookingPricingInputDto;
  insuranceOptions?: string[];
  extrasJson?: unknown;
};

@Injectable()
export class BookingUpdateService {
  private readonly logger = new Logger(BookingUpdateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rentalHealthService: RentalHealthService,
    private readonly customerEligibilityService: CustomerEligibilityService,
    private readonly pricingService: PricingService,
    private readonly pricingQuoteService: PricingQuoteService,
    private readonly stationValidation: StationValidationService,
    private readonly bundleService: BookingDocumentBundleService,
    private readonly documentGenerationDispatcher: BookingDocumentGenerationDispatcherService,
    private readonly invoicesService: InvoicesService,
    private readonly taskAutomationService: TaskAutomationService,
    private readonly vehicleCleaningTasks: VehicleCleaningTaskService,
    private readonly fleetMapCache: FleetMapCacheService,
    private readonly rentalHealthSummaryCache: RentalHealthSummaryCacheService,
    private readonly availabilityBuffer: BookingAvailabilityBufferService,
    private readonly vehicleAvailability: BookingVehicleAvailabilityService,
    private readonly bookingIdempotency: BookingIdempotencyService,
  ) {}

  async updateSchedule(
    orgId: string,
    bookingId: string,
    command: UpdateBookingScheduleCommand,
    ctx?: BookingUpdateContext,
  ): Promise<Booking> {
    const idempotencyKey = this.bookingIdempotency.requireKey(
      ctx?.idempotencyKey,
      'BOOKING_UPDATE_SCHEDULE',
    );

    const executed = await this.bookingIdempotency.execute({
      organizationId: orgId,
      actorUserId: ctx?.userId ?? null,
      operation: 'BOOKING_UPDATE_SCHEDULE',
      idempotencyKey,
      resourceId: bookingId,
      fingerprintPayload: {
        bookingId,
        pickupAt: command.pickupAt?.toISOString() ?? null,
        returnAt: command.returnAt?.toISOString() ?? null,
        expectedUpdatedAt: command.expectedUpdatedAt.toISOString(),
        pricingQuoteId: command.pricingQuoteId ?? null,
        allowTerminalOverride: command.allowTerminalOverride ?? false,
      },
      handler: async () => {
        const booking = await this.updateScheduleInternal(orgId, bookingId, command, ctx);
        return { result: { bookingId: booking.id }, resultReference: booking.id };
      },
    });

    return this.prisma.booking.findFirstOrThrow({
      where: {
        id: (executed.result as { bookingId: string }).bookingId,
        organizationId: orgId,
      },
    });
  }

  private async updateScheduleInternal(
    orgId: string,
    bookingId: string,
    command: UpdateBookingScheduleCommand,
    ctx?: BookingUpdateContext,
  ): Promise<Booking> {
    const existing = await this.loadBooking(orgId, bookingId);
    this.assertConcurrency(existing, command.expectedUpdatedAt);
    this.assertMutable(existing, 'schedule', command.allowTerminalOverride, ctx?.hasOverridePermission);

    const pickupAt = command.pickupAt ?? existing.startDate;
    const returnAt = command.returnAt ?? existing.endDate;
    if (
      pickupAt.getTime() === existing.startDate.getTime() &&
      returnAt.getTime() === existing.endDate.getTime()
    ) {
      throw new BadRequestException({
        message: 'Schedule unchanged',
        code: BOOKING_UPDATE_ERROR_CODES.BOOKING_SCHEDULE_UNCHANGED,
      });
    }

    this.assertValidWindow(pickupAt, returnAt);
    await this.assertNoVehicleOverlap({
      organizationId: orgId,
      vehicleId: existing.vehicleId,
      startDate: pickupAt,
      endDate: returnAt,
      excludeBookingId: bookingId,
    });
    await this.assertCustomerEligibility(orgId, existing.customerId, existing.status, pickupAt);

    const pricingInput = this.pricingService.extractPricingInputFromBookingData({});
    const priced = await this.resolvePricing(orgId, bookingId, {
      organizationId: orgId,
      bookingId,
      userId: ctx?.userId ?? null,
      vehicleId: existing.vehicleId,
      pickupAt,
      returnAt,
      pricingQuoteId: command.pricingQuoteId,
      pricingInput,
    });

    const updated = await this.persistWithAvailabilityCheck(existing, {
      vehicleId: existing.vehicleId,
      startDate: pickupAt,
      endDate: returnAt,
      data: {
        startDate: pickupAt,
        endDate: returnAt,
        ...priced.bookingFields,
      },
    });

    await this.afterPricingMutation(orgId, bookingId, updated, existing, priced, ctx?.userId ?? null);
    return updated;
  }

  async updateCustomer(
    orgId: string,
    bookingId: string,
    command: UpdateBookingCustomerCommand,
    ctx?: BookingUpdateContext,
  ): Promise<Booking> {
    const existing = await this.loadBooking(orgId, bookingId);
    this.assertConcurrency(existing, command.expectedUpdatedAt);
    this.assertMutable(existing, 'customer', command.allowTerminalOverride, ctx?.hasOverridePermission);

    if (command.customerId === existing.customerId) {
      throw new BadRequestException({
        message: 'Customer unchanged',
        code: BOOKING_UPDATE_ERROR_CODES.BOOKING_CUSTOMER_UNCHANGED,
      });
    }

    await this.assertCustomerInOrg(orgId, command.customerId);
    await this.assertCustomerEligibility(
      orgId,
      command.customerId,
      existing.status,
      existing.startDate,
    );

    const updated = await this.persistOptimistic(existing, {
      customerId: command.customerId,
    });

    await this.syncLifecycleTasks(updated, existing);
    await this.invalidateCaches(orgId, updated.vehicleId, existing.vehicleId);
    return updated;
  }

  async updateVehicle(
    orgId: string,
    bookingId: string,
    command: UpdateBookingVehicleCommand,
    ctx?: BookingUpdateContext,
  ): Promise<Booking> {
    const idempotencyKey = this.bookingIdempotency.requireKey(
      ctx?.idempotencyKey,
      'BOOKING_UPDATE_VEHICLE',
    );

    const executed = await this.bookingIdempotency.execute({
      organizationId: orgId,
      actorUserId: ctx?.userId ?? null,
      operation: 'BOOKING_UPDATE_VEHICLE',
      idempotencyKey,
      resourceId: bookingId,
      fingerprintPayload: {
        bookingId,
        vehicleId: command.vehicleId,
        expectedUpdatedAt: command.expectedUpdatedAt.toISOString(),
        pricingQuoteId: command.pricingQuoteId ?? null,
        allowTerminalOverride: command.allowTerminalOverride ?? false,
      },
      handler: async () => {
        const booking = await this.updateVehicleInternal(orgId, bookingId, command, ctx);
        return { result: { bookingId: booking.id }, resultReference: booking.id };
      },
    });

    return this.prisma.booking.findFirstOrThrow({
      where: {
        id: (executed.result as { bookingId: string }).bookingId,
        organizationId: orgId,
      },
    });
  }

  private async updateVehicleInternal(
    orgId: string,
    bookingId: string,
    command: UpdateBookingVehicleCommand,
    ctx?: BookingUpdateContext,
  ): Promise<Booking> {
    const existing = await this.loadBooking(orgId, bookingId);
    this.assertConcurrency(existing, command.expectedUpdatedAt);
    this.assertMutable(existing, 'vehicle', command.allowTerminalOverride, ctx?.hasOverridePermission);

    if (command.vehicleId === existing.vehicleId) {
      throw new BadRequestException({
        message: 'Vehicle unchanged',
        code: BOOKING_UPDATE_ERROR_CODES.BOOKING_VEHICLE_UNCHANGED,
      });
    }

    await this.assertVehicleInOrg(orgId, command.vehicleId);
    await this.assertNoVehicleOverlap({
      organizationId: orgId,
      vehicleId: command.vehicleId,
      startDate: existing.startDate,
      endDate: existing.endDate,
      excludeBookingId: bookingId,
    });
    await this.assertRentalHealth(orgId, command.vehicleId);

    const pricingInput = this.pricingService.extractPricingInputFromBookingData({});
    const priced = await this.resolvePricing(orgId, bookingId, {
      organizationId: orgId,
      bookingId,
      userId: ctx?.userId ?? null,
      vehicleId: command.vehicleId,
      pickupAt: existing.startDate,
      returnAt: existing.endDate,
      pricingQuoteId: command.pricingQuoteId,
      pricingInput,
    });

    const updated = await this.persistWithAvailabilityCheck(existing, {
      vehicleId: command.vehicleId,
      startDate: existing.startDate,
      endDate: existing.endDate,
      data: {
        vehicleId: command.vehicleId,
        ...priced.bookingFields,
      },
    });

    await this.afterPricingMutation(orgId, bookingId, updated, existing, priced, ctx?.userId ?? null);
    void this.vehicleCleaningTasks
      .onBookingVehicleChanged(
        {
          id: updated.id,
          organizationId: orgId,
          vehicleId: updated.vehicleId,
          customerId: updated.customerId,
          status: updated.status,
          startDate: updated.startDate,
          endDate: updated.endDate,
          pickupStationId: updated.pickupStationId,
          returnStationId: updated.returnStationId,
        },
        existing.vehicleId,
      )
      .catch(() => {});
    return updated;
  }

  async updateStations(
    orgId: string,
    bookingId: string,
    command: UpdateBookingStationsCommand,
    ctx?: BookingUpdateContext,
  ): Promise<Booking> {
    const existing = await this.loadBooking(orgId, bookingId);
    this.assertConcurrency(existing, command.expectedUpdatedAt);
    this.assertMutable(existing, 'stations', command.allowTerminalOverride, ctx?.hasOverridePermission);

    const merged = {
      pickupStationId: command.pickupStationId !== undefined ? command.pickupStationId : existing.pickupStationId,
      returnStationId: command.returnStationId !== undefined ? command.returnStationId : existing.returnStationId,
      pickupAddressOverride:
        command.pickupAddressOverride !== undefined
          ? command.pickupAddressOverride
          : existing.pickupAddressOverride,
      returnAddressOverride:
        command.returnAddressOverride !== undefined
          ? command.returnAddressOverride
          : existing.returnAddressOverride,
      isOneWayRental: command.isOneWayRental ?? existing.isOneWayRental,
    };

    const unchanged =
      merged.pickupStationId === existing.pickupStationId &&
      merged.returnStationId === existing.returnStationId &&
      merged.pickupAddressOverride === existing.pickupAddressOverride &&
      merged.returnAddressOverride === existing.returnAddressOverride &&
      merged.isOneWayRental === existing.isOneWayRental;
    if (unchanged) {
      throw new BadRequestException({
        message: 'Stations unchanged',
        code: BOOKING_UPDATE_ERROR_CODES.BOOKING_STATIONS_UNCHANGED,
      });
    }

    const validated = await this.stationValidation.validateBookingStations(orgId, {
      ...merged,
      pickupAt: existing.startDate,
      returnAt: existing.endDate,
    });

    const updated = await this.persistOptimistic(existing, {
      pickupStationId: validated.pickupStationId,
      returnStationId: validated.returnStationId,
      pickupAddressOverride: merged.pickupAddressOverride,
      returnAddressOverride: merged.returnAddressOverride,
      isOneWayRental: validated.isOneWayRental,
    });

    void this.documentGenerationDispatcher
      .enqueueInitialBundle(orgId, bookingId, ctx?.userId ?? null)
      .catch(() => {});
    await this.invalidateCaches(orgId, updated.vehicleId);
    return updated;
  }

  async updateNotes(
    orgId: string,
    bookingId: string,
    command: UpdateBookingNotesCommand,
  ): Promise<Booking> {
    const existing = await this.loadBooking(orgId, bookingId);
    this.assertConcurrency(existing, command.expectedUpdatedAt);

    const notes = mergeNotesCommandToStorage(command);
    if ((existing.notes ?? null) === notes) {
      throw new BadRequestException({
        message: 'Notes unchanged',
        code: BOOKING_UPDATE_ERROR_CODES.BOOKING_NOTES_UNCHANGED,
      });
    }

    return this.persistOptimistic(existing, { notes });
  }

  async updateOptions(
    orgId: string,
    bookingId: string,
    command: UpdateBookingOptionsCommand,
    ctx?: BookingUpdateContext,
  ): Promise<Booking> {
    const existing = await this.loadBooking(orgId, bookingId);
    this.assertConcurrency(existing, command.expectedUpdatedAt);
    this.assertMutable(existing, 'options', command.allowTerminalOverride, ctx?.hasOverridePermission);

    const pricingInput = this.pricingService.extractPricingInputFromBookingData({
      pricingInput: command.pricingInput,
      extrasJson: command.extrasJson,
      insuranceOptions: command.insuranceOptions,
    });

    const priced = await this.resolvePricing(orgId, bookingId, {
      organizationId: orgId,
      bookingId,
      userId: ctx?.userId ?? null,
      vehicleId: existing.vehicleId,
      pickupAt: existing.startDate,
      returnAt: existing.endDate,
      pricingQuoteId: command.pricingQuoteId,
      pricingInput,
      insuranceOptions: command.insuranceOptions,
      extrasJson: command.extrasJson,
    });

    const prismaData: Prisma.BookingUncheckedUpdateInput = { ...priced.bookingFields };
    if (command.kmIncluded !== undefined) prismaData.kmIncluded = command.kmIncluded;
    if (command.insuranceOptions !== undefined) {
      prismaData.insuranceOptions = command.insuranceOptions;
    }
    if (command.extrasJson !== undefined) {
      prismaData.extrasJson = command.extrasJson as Prisma.InputJsonValue;
    }

    const updated = await this.persistOptimistic(existing, prismaData);
    await this.afterPricingMutation(orgId, bookingId, updated, existing, priced, ctx?.userId ?? null);
    return updated;
  }

  async updateAllowedDrivers(
    orgId: string,
    bookingId: string,
    command: UpdateBookingAllowedDriversCommand,
    ctx?: BookingUpdateContext,
  ): Promise<Booking> {
    const existing = await this.loadBooking(orgId, bookingId);
    this.assertConcurrency(existing, command.expectedUpdatedAt);
    this.assertMutable(
      existing,
      'allowedDrivers',
      command.allowTerminalOverride,
      ctx?.hasOverridePermission,
    );

    const unique = [...new Set(command.allowedDriverIds)];
    if (unique.includes(existing.customerId)) {
      throw new BadRequestException({
        message: 'Contract holder cannot be listed in allowedDriverIds',
        code: BOOKING_UPDATE_ERROR_CODES.ALLOWED_DRIVER_IS_CONTRACT_HOLDER,
      });
    }

    const drivers = await this.prisma.customer.findMany({
      where: { organizationId: orgId, id: { in: unique } },
      select: { id: true },
    });
    if (drivers.length !== unique.length) {
      throw new NotFoundException({
        message: 'Allowed driver customer not found for organization',
        code: BOOKING_CREATE_ERROR_CODES.ALLOWED_DRIVER_NOT_FOUND,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const lock = await tx.booking.updateMany({
        where: { id: bookingId, organizationId: orgId, updatedAt: existing.updatedAt },
        data: { updatedAt: new Date() },
      });
      if (lock.count !== 1) {
        throw new ConflictException({
          message: 'Booking was modified by another user',
          code: BOOKING_UPDATE_ERROR_CODES.BOOKING_VERSION_CONFLICT,
          bookingId,
          expectedUpdatedAt: existing.updatedAt.toISOString(),
        });
      }

      await tx.bookingAllowedDriver.deleteMany({
        where: { bookingId, organizationId: orgId },
      });

      if (unique.length > 0) {
        await tx.bookingAllowedDriver.createMany({
          data: unique.map((customerId) => ({
            organizationId: orgId,
            bookingId,
            customerId,
            role: BookingDriverRole.ADDITIONAL,
            addedByUserId: ctx?.userId ?? null,
          })),
        });
      }

      if (command.primaryDriverId) {
        await tx.bookingAllowedDriver.updateMany({
          where: { bookingId, customerId: command.primaryDriverId },
          data: { role: BookingDriverRole.PRIMARY },
        });
        await tx.booking.update({
          where: { id: bookingId },
          data: { assignedDriverId: command.primaryDriverId },
        });
      }
    });

    return this.prisma.booking.findFirstOrThrow({
      where: { id: bookingId, organizationId: orgId },
    });
  }

  private async loadBooking(orgId: string, bookingId: string): Promise<Booking> {
    const booking = await this.prisma.booking.findFirst({
      where: { id: bookingId, organizationId: orgId },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    return booking;
  }

  private assertConcurrency(existing: Booking, expectedUpdatedAt: Date): void {
    if (existing.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
      throw new ConflictException({
        message: 'Booking was modified by another user',
        code: BOOKING_UPDATE_ERROR_CODES.BOOKING_VERSION_CONFLICT,
        bookingId: existing.id,
        expectedUpdatedAt: expectedUpdatedAt.toISOString(),
        currentUpdatedAt: existing.updatedAt.toISOString(),
      });
    }
  }

  private assertMutable(
    existing: Booking,
    commandKind: string,
    allowTerminalOverride?: boolean,
    hasOverridePermission?: boolean,
  ): void {
    if (!TERMINAL_STATUSES.includes(existing.status)) return;
    if (commandKind === 'notes') return;
    if (allowTerminalOverride && hasOverridePermission) return;
    throw new ConflictException({
      message: `Bookings with status ${existing.status} cannot be modified via ${commandKind}`,
      code: BOOKING_UPDATE_ERROR_CODES.BOOKING_TERMINAL_STATE_LOCKED,
      status: existing.status,
      command: commandKind,
    });
  }

  private assertValidWindow(pickupAt: Date, returnAt: Date): void {
    try {
      assertValidBookingWindow(pickupAt, returnAt);
    } catch (error) {
      if ((error as Error).message === 'END_BEFORE_START') {
        throw new BadRequestException({
          message: 'returnAt must be after pickupAt',
          code: BOOKING_UPDATE_ERROR_CODES.BOOKING_END_BEFORE_START,
        });
      }
      throw new BadRequestException({
        message: 'Invalid booking dates',
        code: BOOKING_UPDATE_ERROR_CODES.BOOKING_INVALID_DATES,
      });
    }
  }

  private async assertNoVehicleOverlap(input: {
    organizationId: string;
    vehicleId: string;
    startDate: Date;
    endDate: Date;
    excludeBookingId?: string;
  }): Promise<void> {
    const overlapping = await this.prisma.booking.findFirst({
      where: buildOverlapWhere(input),
      select: { id: true, startDate: true, endDate: true, status: true },
    });
    if (overlapping) {
      throw new ConflictException({
        message: 'Dieses Fahrzeug ist im gewählten Zeitraum bereits gebucht.',
        code: BOOKING_AVAILABILITY_ERROR_CODES.BOOKING_CONFLICT,
        conflictingBookingId: overlapping.id,
        conflictRange: {
          startDate: overlapping.startDate.toISOString(),
          endDate: overlapping.endDate.toISOString(),
          status: overlapping.status,
        },
      });
    }
  }

  private async persistWithAvailabilityCheck(
    existing: Booking,
    input: {
      vehicleId: string;
      startDate: Date;
      endDate: Date;
      data: Prisma.BookingUncheckedUpdateInput;
    },
  ): Promise<Booking> {
    const turnaroundBufferMinutes =
      await this.availabilityBuffer.resolveTurnaroundBufferMinutes(existing.organizationId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.vehicleAvailability.acquireVehicleLock(
          tx,
          existing.organizationId,
          input.vehicleId,
        );

        if (this.vehicleAvailability.isBlockingStatus(existing.status)) {
          await this.vehicleAvailability.assertNoBlockingConflict(tx, {
            organizationId: existing.organizationId,
            vehicleId: input.vehicleId,
            startDate: input.startDate,
            endDate: input.endDate,
            turnaroundBufferMinutes,
            excludeBookingId: existing.id,
          });
        }

        const result = await tx.booking.updateMany({
          where: {
            id: existing.id,
            organizationId: existing.organizationId,
            updatedAt: existing.updatedAt,
          },
          data: {
            ...input.data,
            turnaroundBufferMinutes,
          },
        });

        if (result.count !== 1) {
          throw new ConflictException({
            message: 'Booking was modified by another user',
            code: BOOKING_UPDATE_ERROR_CODES.BOOKING_VERSION_CONFLICT,
            bookingId: existing.id,
            expectedUpdatedAt: existing.updatedAt.toISOString(),
          });
        }

        return tx.booking.findFirstOrThrow({
          where: { id: existing.id, organizationId: existing.organizationId },
        });
      });
    } catch (error) {
      this.vehicleAvailability.rethrowAvailabilityError(error);
    }
  }

  private async assertRentalHealth(orgId: string, vehicleId: string): Promise<void> {
    const rentalGate = await this.rentalHealthService.isRentalBlocked(orgId, vehicleId);
    if (
      rentalGate.healthGateStatus === 'UNAVAILABLE' ||
      rentalGate.healthGateStatus === 'UNKNOWN'
    ) {
      throw new ConflictException({
        message:
          rentalGate.healthGateWarning ??
          'Fahrzeug-Gesundheit konnte nicht geprüft werden.',
        code: BOOKING_CREATE_ERROR_CODES.VEHICLE_HEALTH_GATE_UNAVAILABLE,
        vehicleId,
      });
    }
    if (rentalGate.blocked) {
      throw new ConflictException({
        message: 'Dieses Fahrzeug ist aktuell nicht vermietbar.',
        code: BOOKING_CREATE_ERROR_CODES.VEHICLE_RENTAL_BLOCKED,
        blockingReasons: rentalGate.reasons,
        vehicleId,
      });
    }
  }

  private async assertCustomerEligibility(
    orgId: string,
    customerId: string,
    status: BookingStatus,
    startDate: Date,
  ): Promise<void> {
    const eligibility = await this.customerEligibilityService.evaluateForBooking(
      orgId,
      customerId,
      { requestedStatus: status, startDate },
    );
    const allowed =
      status === 'CONFIRMED' || status === 'ACTIVE'
        ? eligibility.canConfirmBooking
        : eligibility.canCreatePendingBooking;
    if (!allowed) {
      throw new ConflictException({
        code: BOOKING_CREATE_ERROR_CODES.CUSTOMER_BOOKING_BLOCKED,
        message: 'Customer is not eligible for this booking',
        customerId,
      });
    }
  }

  private async assertCustomerInOrg(orgId: string, customerId: string): Promise<void> {
    const row = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId: orgId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException({ code: BOOKING_CREATE_ERROR_CODES.CUSTOMER_NOT_FOUND });
  }

  private async assertVehicleInOrg(orgId: string, vehicleId: string): Promise<void> {
    const row = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException({ code: BOOKING_CREATE_ERROR_CODES.VEHICLE_NOT_FOUND });
  }

  private async resolvePricing(
    orgId: string,
    bookingId: string,
    input: PricingApplyInput,
  ): Promise<{
    bookingFields: ReturnType<PricingService['legacyBookingFieldsFromSimulation']>;
    quotedPricingInput: BookingPricingInputDto;
    simulation: Awaited<ReturnType<PricingService['simulateBookingPrice']>>;
    quoteId?: string;
  }> {
    const pricingInput: BookingPricingInputDto =
      input.pricingInput ??
      this.pricingService.extractPricingInputFromBookingData({
        pricingInput: input.pricingInput,
        extrasJson: input.extrasJson,
        insuranceOptions: input.insuranceOptions,
      }) ??
      {};

    if (input.pricingQuoteId) {
      const quoteId = requireQuoteId(input.pricingQuoteId);
      await this.pricingQuoteService.assertQuoteReadyForBooking({
        organizationId: orgId,
        userId: input.userId ?? null,
        quoteId,
        vehicleId: input.vehicleId,
        pickupAt: input.pickupAt,
        returnAt: input.returnAt,
        pricingInput,
      });
      const quote = await this.prisma.pricingQuote.findFirstOrThrow({
        where: { id: quoteId, organizationId: orgId },
      });
      const payload = this.pricingQuoteService.decodeStoredQuote(quote);
      return {
        bookingFields: this.pricingService.legacyBookingFieldsFromSimulation(payload.simulation),
        quotedPricingInput: pricingInput,
        simulation: payload.simulation,
        quoteId,
      };
    }

    const simulation = await this.pricingService.simulateBookingPrice(orgId, {
      vehicleId: input.vehicleId,
      pickupAt: input.pickupAt.toISOString(),
      returnAt: input.returnAt.toISOString(),
      selectedMileagePackageId: pricingInput?.selectedMileagePackageId,
      selectedInsuranceOptionIds: pricingInput?.selectedInsuranceOptionIds,
      selectedExtraOptionIds: pricingInput?.selectedExtraOptionIds,
      manualDiscountCents: pricingInput?.manualDiscountCents,
      manualAdjustmentCents: pricingInput?.manualAdjustmentCents,
    });

    return {
      bookingFields: this.pricingService.legacyBookingFieldsFromSimulation(simulation),
      quotedPricingInput: pricingInput,
      simulation,
    };
  }

  private async persistOptimistic(
    existing: Booking,
    data: Prisma.BookingUncheckedUpdateInput,
  ): Promise<Booking> {
    const result = await this.prisma.booking.updateMany({
      where: {
        id: existing.id,
        organizationId: existing.organizationId,
        updatedAt: existing.updatedAt,
      },
      data,
    });
    if (result.count !== 1) {
      throw new ConflictException({
        message: 'Booking was modified by another user',
        code: BOOKING_UPDATE_ERROR_CODES.BOOKING_VERSION_CONFLICT,
        bookingId: existing.id,
        expectedUpdatedAt: existing.updatedAt.toISOString(),
      });
    }
    return this.prisma.booking.findFirstOrThrow({
      where: { id: existing.id, organizationId: existing.organizationId },
    });
  }

  private async afterPricingMutation(
    orgId: string,
    bookingId: string,
    updated: Booking,
    existing: Booking,
    priced: {
      quotedPricingInput: BookingPricingInputDto;
      simulation: Awaited<ReturnType<PricingService['simulateBookingPrice']>>;
      quoteId?: string;
    },
    userId: string | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (priced.quoteId) {
        const currentQuote = await tx.pricingQuote.findFirst({
          where: { organizationId: orgId, consumedByBookingId: bookingId },
        });
        if (currentQuote && currentQuote.id !== priced.quoteId) {
          await this.pricingQuoteService.releaseQuoteFromWizardDraft(tx, orgId, bookingId);
        }
        await this.pricingQuoteService.markConsumed(tx, priced.quoteId, orgId, bookingId);
      }
      await this.pricingService.createBookingPriceSnapshotFromSimulation(
        orgId,
        bookingId,
        priced.simulation,
        priced.quotedPricingInput,
        tx,
      );
    });
    await this.invoicesService.bootstrapBookingInvoice(orgId, {
      id: updated.id,
      customerId: updated.customerId,
      vehicleId: updated.vehicleId,
      totalPriceCents: updated.totalPriceCents,
      dailyRateCents: updated.dailyRateCents,
      startDate: updated.startDate,
      endDate: updated.endDate,
      currency: updated.currency,
      kmIncluded: updated.kmIncluded,
    });

    for (const type of ['BOOKING_INVOICE', 'RENTAL_CONTRACT', 'DEPOSIT_RECEIPT'] as const) {
      try {
        await this.bundleService.regenerate(orgId, bookingId, type, userId);
      } catch {
        /* best-effort */
      }
    }

    void this.documentGenerationDispatcher
      .enqueueInitialBundle(orgId, bookingId, userId)
      .catch((err) => {
        this.logger.warn(
          `Document enqueue after pricing update failed for ${bookingId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

    await this.syncLifecycleTasks(updated, existing);
    await this.invalidateCaches(orgId, updated.vehicleId, existing.vehicleId);
  }

  private async syncLifecycleTasks(updated: Booking, existing: Booking): Promise<void> {
    const lifecycleInput = {
      id: updated.id,
      organizationId: updated.organizationId,
      vehicleId: updated.vehicleId,
      customerId: updated.customerId,
      status: updated.status,
      startDate: updated.startDate,
      endDate: updated.endDate,
      pickupStationId: updated.pickupStationId,
      returnStationId: updated.returnStationId,
    };

    if (updated.startDate.getTime() !== existing.startDate.getTime()) {
      void this.taskAutomationService
        .syncBookingPreparationTiming(lifecycleInput, { previousStartDate: existing.startDate })
        .catch(() => {});
      void this.taskAutomationService
        .syncBookingPickupTiming(lifecycleInput, { previousStartDate: existing.startDate })
        .catch(() => {});
    } else if (
      updated.endDate.getTime() !== existing.endDate.getTime() &&
      updated.status === 'ACTIVE'
    ) {
      void this.taskAutomationService
        .syncBookingReturnTiming(lifecycleInput, { previousEndDate: existing.endDate })
        .catch(() => {});
    } else {
      void this.taskAutomationService.ensureBookingLifecycleTasks(lifecycleInput).catch(() => {});
    }
  }

  private async invalidateCaches(
    orgId: string,
    ...vehicleIds: Array<string | null | undefined>
  ): Promise<void> {
    await this.fleetMapCache.invalidate(orgId);
    const unique = [...new Set(vehicleIds.filter((id): id is string => Boolean(id)))];
    await Promise.all(
      unique.map((vehicleId) => this.rentalHealthSummaryCache.invalidate(orgId, vehicleId)),
    );
  }
}

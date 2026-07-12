import {
  Injectable,
  Inject,
  forwardRef,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Booking, Prisma, BookingStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalDrivingAnalysisService } from '../rental-driving-analysis/rental-driving-analysis.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import {
  parsePagination,
  buildPaginatedResult,
  PaginationParams,
  PaginatedResult,
} from '@shared/utils/pagination';
import { HandoverProtocolDto } from './handover.types';
import { RentalHealthService } from '@modules/rental-health/rental-health.service';
import { TaskAutomationService } from '@modules/tasks/task-automation.service';
import { CustomerEligibilityService } from '@modules/customers/customer-eligibility.service';
import { PricingService } from '@modules/pricing/pricing.service';
import {
  PricingQuoteService,
  requireQuoteId,
} from '@modules/pricing/pricing-quote.service';
import { StationValidationService } from '@modules/stations/station-validation.service';
import {
  assertValidBookingWindow,
  buildOverlapWhere,
} from './booking-conflict.util';
import type { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import type {
  BookingDetailDto,
  BookingStationContext,
  HandoverSideSummary,
} from './booking-detail.types';
import { DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { formatStationAddress } from '@modules/stations/station.types';
import { BookingDocumentEmailService } from '@modules/outbound-email/booking-document-email.service';
import type { Station } from '@prisma/client';

const BOOKING_STATUS_DISPLAY: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No Show',
};

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rentalDrivingAnalysisService: RentalDrivingAnalysisService,
    @Inject(forwardRef(() => InvoicesService))
    private readonly invoicesService: InvoicesService,
    // V4.6.76 Rental Health V1 — server-side rental_blocked gate. We
    // read-through the same aggregator the UI uses so the message and
    // the gate can never disagree about "why this vehicle is blocked".
    @Inject(forwardRef(() => RentalHealthService))
    private readonly rentalHealthService: RentalHealthService,
    // Booking Document Lifecycle — generates the initial document bundle when a
    // booking is confirmed. Fire-and-forget; never blocks/breaks booking create.
    @Inject(forwardRef(() => BookingDocumentBundleService))
    private readonly bookingDocumentBundleService: BookingDocumentBundleService,
    @Inject(forwardRef(() => GeneratedDocumentsService))
    private readonly generatedDocumentsService: GeneratedDocumentsService,
    @Inject(forwardRef(() => BookingDocumentEmailService))
    private readonly bookingDocumentEmailService: BookingDocumentEmailService,
    // V4.8.3 Task Action Layer — materializes booking lifecycle tasks
    // (preparation / pickup / return / invoice). Idempotent + fire-and-forget;
    // never blocks/breaks booking writes.
    private readonly taskAutomationService: TaskAutomationService,
    private readonly customerEligibilityService: CustomerEligibilityService,
    private readonly pricingService: PricingService,
    private readonly pricingQuoteService: PricingQuoteService,
    private readonly stationValidation: StationValidationService,
  ) {}

  /**
   * Enforce the rental-health gate for booking create/update. Fails CLOSED in
   * both failure modes, but surfaces them as DISTINCT, explainable errors:
   *   - a genuine health block → VEHICLE_RENTAL_BLOCKED (with reasons)
   *   - a technically unavailable/unknown gate → VEHICLE_HEALTH_GATE_UNAVAILABLE
   *     (+ manualReviewRequired) so the operator never books on a check that
   *     silently failed open.
   */
  private enforceRentalHealthGate(
    rentalGate: Awaited<ReturnType<RentalHealthService['isRentalBlocked']>>,
    vehicleId: string,
  ): void {
    if (
      rentalGate.healthGateStatus === 'UNAVAILABLE' ||
      rentalGate.healthGateStatus === 'UNKNOWN'
    ) {
      throw new ConflictException({
        message:
          rentalGate.healthGateWarning ??
          'Fahrzeug-Gesundheit konnte nicht geprüft werden — manuelle Prüfung erforderlich. Buchung wurde nicht freigegeben.',
        code: 'VEHICLE_HEALTH_GATE_UNAVAILABLE',
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
        code: 'VEHICLE_RENTAL_BLOCKED',
        blockingReasons: rentalGate.reasons,
        vehicleId,
      });
    }
  }

  async create(
    orgId: string,
    data: Omit<Prisma.BookingCreateInput, 'organization'>,
    options?: { userId?: string | null },
  ): Promise<Booking> {
    // V4.6.74 — server-side gate: prevent double-booking the SAME vehicle
    // within overlapping time windows. The frontend already tries to block
    // this, but the UI gate was broken (it filtered on a field that wasn't
    // returned by the API), and even with a working UI gate we must not
    // rely on the client for a conflict invariant like this. Two overlapping
    // bookings on the SAME vehicle are never valid. Different vehicles on
    // the same dates are always allowed.
    const anyData = data as any;
    const vehicleId: string | undefined =
      anyData.vehicleId ?? anyData.vehicle?.connect?.id;
    const startDate =
      anyData.startDate instanceof Date
        ? anyData.startDate
        : anyData.startDate
        ? new Date(anyData.startDate)
        : null;
    const endDate =
      anyData.endDate instanceof Date
        ? anyData.endDate
        : anyData.endDate
        ? new Date(anyData.endDate)
        : null;

    if (!vehicleId || !startDate || !endDate || isNaN(+startDate) || isNaN(+endDate)) {
      throw new BadRequestException(
        'vehicleId, startDate and endDate are required to create a booking',
      );
    }
    try {
      assertValidBookingWindow(startDate, endDate);
    } catch (e) {
      if ((e as Error).message === 'END_BEFORE_START') {
        throw new BadRequestException('endDate must be after startDate');
      }
      throw new BadRequestException('Invalid booking dates');
    }

    await this.assertNoVehicleOverlap({
      organizationId: orgId,
      vehicleId,
      startDate,
      endDate,
    });

    // V4.6.76 Rental Health V1 — rental_blocked hard-gate. On technical
    // gate failure we do not silently pretend the vehicle is healthy: the
    // response carries healthGateStatus=UNAVAILABLE + manualReviewRequired.
    const rentalGate = await this.rentalHealthService.isRentalBlocked(
      orgId,
      vehicleId,
    );
    this.enforceRentalHealthGate(rentalGate, vehicleId);

    const customerId: string | undefined =
      anyData.customerId ?? anyData.customer?.connect?.id;
    const requestedStatus: BookingStatus =
      (anyData.status as BookingStatus) ?? 'PENDING';

    if (!customerId) {
      throw new BadRequestException(
        'customerId is required to create a booking',
      );
    }

    await this.assertCustomerBookingEligibility(
      orgId,
      customerId,
      requestedStatus,
      startDate,
    );

    const pricingInput = this.pricingService.extractPricingInputFromBookingData(anyData);
    const quoteId = requireQuoteId(anyData.quoteId);

    const existingBookingId = await this.pricingQuoteService.findConsumedBookingId(
      orgId,
      quoteId,
    );
    if (existingBookingId) {
      const existing = await this.prisma.booking.findFirst({
        where: { id: existingBookingId, organizationId: orgId },
      });
      if (existing) {
        return existing;
      }
    }

    const { simulation, pricingInput: quotedPricingInput } =
      await this.pricingQuoteService.consumeForBooking({
        organizationId: orgId,
        userId: options?.userId ?? null,
        quoteId,
        vehicleId,
        pickupAt: startDate,
        returnAt: endDate,
        pricingInput,
      });

    const pricedFields = this.pricingService.legacyBookingFieldsFromSimulation(simulation);
    const stationFields = await this.resolveBookingStationFields(
      orgId,
      await this.applyBookingStationDefaults(orgId, anyData, vehicleId),
    );
    const bookingData = this.stripBookingStationScalars(data as Record<string, unknown>);

    const booking = await this.prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          ...bookingData,
          ...pricedFields,
          ...this.stationFieldsToPrismaInput(stationFields),
          organization: { connect: { id: orgId } },
        } as Prisma.BookingCreateInput,
      });

      await this.pricingQuoteService.markConsumed(tx, quoteId, orgId, created.id);
      await this.pricingService.createBookingPriceSnapshotFromSimulation(
        orgId,
        created.id,
        simulation,
        quotedPricingInput,
        tx,
      );

      return created;
    });

    const invoicePromise = this.invoicesService
      .createBookingInvoice(orgId, {
        id: booking.id,
        customerId: booking.customerId,
        vehicleId: booking.vehicleId,
        totalPriceCents: booking.totalPriceCents,
        dailyRateCents: booking.dailyRateCents,
        startDate: booking.startDate,
        endDate: booking.endDate,
        currency: booking.currency,
        kmIncluded: booking.kmIncluded,
      })
      .catch(() => null);

    // Generate the initial document bundle for operator/rental bookings once
    // created (PENDING or CONFIRMED). Wizard checkout drafts call generate
    // explicitly as well — the bundle service is idempotent.
    if (booking.status === 'CONFIRMED' || booking.status === 'PENDING') {
      void invoicePromise
        .then(() => this.bookingDocumentBundleService.generateInitialBundle(orgId, booking.id))
        .then(() => {
          if (booking.status === 'CONFIRMED') {
            return this.bookingDocumentEmailService.maybeAutoSendBookingDocuments(
              orgId,
              booking.id,
              options?.userId ?? null,
            );
          }
        })
        .catch(() => {});
    }

    void this.taskAutomationService
      .ensureBookingLifecycleTasks({
        id: booking.id,
        organizationId: orgId,
        vehicleId: booking.vehicleId,
        customerId: booking.customerId,
        status: booking.status,
      })
      .catch(() => {});

    return {
      ...booking,
      healthGateStatus: rentalGate.healthGateStatus,
      healthGateWarning: rentalGate.healthGateWarning,
      manualReviewRequired: rentalGate.manualReviewRequired,
    } as Booking & {
      healthGateStatus?: string;
      healthGateWarning?: string | null;
      manualReviewRequired?: boolean;
    };
  }

  async findAll(orgId: string, params?: ListBookingsQueryDto) {
    const page = Math.max(1, params?.page || 1);
    const limit = Math.min(500, Math.max(1, params?.limit || 100));
    const skip = (page - 1) * limit;
    const take = limit;

    const andClauses: Prisma.BookingWhereInput[] = [{ organizationId: orgId }];

    if (params?.status) {
      const statuses = Array.isArray(params.status) ? params.status : [params.status];
      andClauses.push({ status: { in: statuses } });
    }
    if (params?.vehicleId) andClauses.push({ vehicleId: params.vehicleId });
    if (params?.customerId) andClauses.push({ customerId: params.customerId });
    if (params?.stationId) {
      andClauses.push({
        OR: [
          { pickupStationId: params.stationId },
          { returnStationId: params.stationId },
        ],
      });
    }
    if (params?.from || params?.to) {
      const from = params.from ? new Date(params.from) : null;
      const to = params.to ? new Date(params.to) : null;
      if (from && !isNaN(+from) && to && !isNaN(+to)) {
        andClauses.push({ startDate: { lt: to } }, { endDate: { gt: from } });
      } else if (from && !isNaN(+from)) {
        andClauses.push({ endDate: { gt: from } });
      } else if (to && !isNaN(+to)) {
        andClauses.push({ startDate: { lt: to } });
      }
    }
    if (params?.search?.trim()) {
      const q = params.search.trim();
      andClauses.push({
        OR: [
          { id: { contains: q, mode: 'insensitive' } },
          { notes: { contains: q, mode: 'insensitive' } },
          { customer: { firstName: { contains: q, mode: 'insensitive' } } },
          { customer: { lastName: { contains: q, mode: 'insensitive' } } },
          { customer: { email: { contains: q, mode: 'insensitive' } } },
          { vehicle: { licensePlate: { contains: q, mode: 'insensitive' } } },
          { vehicle: { make: { contains: q, mode: 'insensitive' } } },
          { vehicle: { model: { contains: q, mode: 'insensitive' } } },
        ],
      });
    }

    const where: Prisma.BookingWhereInput =
      andClauses.length === 1 ? andClauses[0] : { AND: andClauses };

    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip,
        take,
        orderBy: { startDate: 'desc' },
        include: { customer: true, vehicle: true },
      }),
      this.prisma.booking.count({ where }),
    ]);

    const stationIds = [
      ...new Set(
        data.flatMap((b) =>
          [b.pickupStationId, b.returnStationId].filter(Boolean) as string[],
        ),
      ),
    ];

    const stations =
      stationIds.length > 0
        ? await this.prisma.station.findMany({ where: { id: { in: stationIds } } })
        : [];
    const stationMap = new Map(stations.map((s) => [s.id, s.name]));

    // V4.6.75 — Attach handover protocols so the UI can render pickup /
    // return panels (odometer, fuel, signatures, noted damages) without a
    // second roundtrip. Single batched query via bookingId IN (...).
    const protocolsMap = await this.loadProtocolsMap(
      orgId,
      data.map((b) => b.id),
    );

    const mapped = data.map((b) => {
      const protocols = protocolsMap.get(b.id) ?? [];
      const pickup = protocols.find((p) => p.kind === 'PICKUP') ?? null;
      const ret = protocols.find((p) => p.kind === 'RETURN') ?? null;
      return this.mapBookingListRow(b, stationMap, pickup, ret);
    });

    return buildPaginatedResult(mapped, total, { page, limit });
  }

  private mapBookingListRow(
    b: Booking & { customer: { firstName: string; lastName: string }; vehicle: { vehicleName?: string | null; make: string; model: string; licensePlate?: string | null } },
    stationMap: Map<string, string>,
    pickup: HandoverProtocolDto | null,
    ret: HandoverProtocolDto | null,
  ) {
    const pickupStationName = b.pickupStationId ? stationMap.get(b.pickupStationId) || '' : '';
    const returnStationName = b.returnStationId ? stationMap.get(b.returnStationId) || '' : '';
    return {
      id: b.id,
      vehicleId: b.vehicleId,
      customerId: b.customerId,
      pickupStationId: b.pickupStationId,
      returnStationId: b.returnStationId,
      customerName: `${b.customer.firstName} ${b.customer.lastName}`.trim(),
      vehicleName: b.vehicle.vehicleName || `${b.vehicle.make} ${b.vehicle.model}`.trim(),
      vehicleLicense: b.vehicle.licensePlate || '',
      station: pickupStationName,
      pickupStationName,
      returnStationName,
      startDate: b.startDate.toISOString(),
      endDate: b.endDate.toISOString(),
      status: BOOKING_STATUS_DISPLAY[b.status] || b.status,
      statusEnum: b.status,
      dailyRate: (b.dailyRateCents || 0) / 100,
      dailyRateCents: b.dailyRateCents,
      totalPrice: (b.totalPriceCents || 0) / 100,
      totalPriceCents: b.totalPriceCents,
      currency: b.currency,
      kmIncluded: b.kmIncluded || 0,
      kmDriven: b.kmDriven || 0,
      notes: b.notes,
      insuranceOptions: Array.isArray(b.insuranceOptions) ? b.insuranceOptions : [],
      extras: Array.isArray(b.extrasJson) ? b.extrasJson : [],
      pickupProtocol: pickup,
      returnProtocol: ret,
      isOneWayRental: b.isOneWayRental ?? false,
      actualPickupStationId: b.actualPickupStationId ?? null,
      actualReturnStationId: b.actualReturnStationId ?? null,
    };
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
        code: 'VEHICLE_BOOKING_OVERLAP',
        conflictingBookingId: overlapping.id,
        conflictRange: {
          startDate: overlapping.startDate.toISOString(),
          endDate: overlapping.endDate.toISOString(),
          status: overlapping.status,
        },
      });
    }
  }

  private mapStationContext(station: Station): BookingStationContext {
    return {
      stationId: station.id,
      name: station.name,
      code: station.code,
      address: formatStationAddress(station),
      phone: station.phone,
      email: station.email,
      openingHours: station.openingHours,
      handoverInstructions: station.handoverInstructions,
      returnInstructions: station.returnInstructions,
      status: station.status,
      pickupEnabled: station.pickupEnabled,
      returnEnabled: station.returnEnabled,
      latitude: station.latitude,
      longitude: station.longitude,
    };
  }

  private async applyBookingStationDefaults(
    orgId: string,
    input: Record<string, unknown>,
    vehicleId?: string,
  ): Promise<Record<string, unknown>> {
    const next = { ...input };
    const pickupOverride =
      typeof input.pickupAddressOverride === 'string' && input.pickupAddressOverride.trim();
    const returnOverride =
      typeof input.returnAddressOverride === 'string' && input.returnAddressOverride.trim();

    let pickupStationId =
      (input.pickupStationId as string | null | undefined) ??
      (input.pickupStation as { connect?: { id?: string } } | undefined)?.connect?.id ??
      null;
    let returnStationId =
      (input.returnStationId as string | null | undefined) ??
      (input.returnStation as { connect?: { id?: string } } | undefined)?.connect?.id ??
      null;

    if (!pickupStationId && !pickupOverride) {
      let homeId: string | null = null;
      if (vehicleId) {
        const vehicle = await this.prisma.vehicle.findFirst({
          where: { id: vehicleId, organizationId: orgId },
          select: { homeStationId: true },
        });
        homeId = vehicle?.homeStationId ?? null;
      }
      const primary = await this.prisma.station.findFirst({
        where: { organizationId: orgId, isPrimary: true, status: 'ACTIVE' },
        select: { id: true },
      });
      pickupStationId = homeId ?? primary?.id ?? null;
    }

    if (!returnStationId && !returnOverride) {
      returnStationId = pickupStationId;
      if (!returnStationId) {
        const primary = await this.prisma.station.findFirst({
          where: { organizationId: orgId, isPrimary: true, status: 'ACTIVE' },
          select: { id: true },
        });
        returnStationId = primary?.id ?? null;
      }
    }

    if (!pickupStationId && !pickupOverride) {
      throw new BadRequestException(
        'pickupStationId is required unless pickupAddressOverride is provided',
      );
    }
    if (!returnStationId && !returnOverride) {
      throw new BadRequestException(
        'returnStationId is required unless returnAddressOverride is provided',
      );
    }

    if (pickupStationId) next.pickupStationId = pickupStationId;
    if (returnStationId) next.returnStationId = returnStationId;
    return next;
  }

  private async resolveBookingStationFields(
    orgId: string,
    input: Record<string, unknown>,
  ): Promise<{
    pickupStationId?: string | null;
    returnStationId?: string | null;
    actualPickupStationId?: string | null;
    actualReturnStationId?: string | null;
    pickupAddressOverride?: string | null;
    returnAddressOverride?: string | null;
    isOneWayRental?: boolean;
    stationTransferFeeCents?: number | null;
  }> {
    const pickupStationId =
      (input.pickupStationId as string | null | undefined) ??
      (input.pickupStation as { connect?: { id?: string } } | undefined)?.connect?.id ??
      null;
    const returnStationId =
      (input.returnStationId as string | null | undefined) ??
      (input.returnStation as { connect?: { id?: string } } | undefined)?.connect?.id ??
      null;

    const validated = await this.stationValidation.validateBookingStations(orgId, {
      pickupStationId,
      returnStationId,
      actualPickupStationId: input.actualPickupStationId as string | null | undefined,
      actualReturnStationId: input.actualReturnStationId as string | null | undefined,
      pickupAddressOverride: input.pickupAddressOverride as string | null | undefined,
      returnAddressOverride: input.returnAddressOverride as string | null | undefined,
      isOneWayRental: input.isOneWayRental as boolean | undefined,
      stationTransferFeeCents: input.stationTransferFeeCents as number | null | undefined,
    });

    return {
      pickupStationId: validated.pickupStationId,
      returnStationId: validated.returnStationId,
      actualPickupStationId: (input.actualPickupStationId as string | null | undefined) ?? null,
      actualReturnStationId: (input.actualReturnStationId as string | null | undefined) ?? null,
      pickupAddressOverride: (input.pickupAddressOverride as string | null | undefined) ?? null,
      returnAddressOverride: (input.returnAddressOverride as string | null | undefined) ?? null,
      isOneWayRental: validated.isOneWayRental,
      stationTransferFeeCents: (input.stationTransferFeeCents as number | null | undefined) ?? null,
    };
  }

  private stationFieldsToPrismaInput(fields: {
    pickupStationId?: string | null;
    returnStationId?: string | null;
    actualPickupStationId?: string | null;
    actualReturnStationId?: string | null;
    pickupAddressOverride?: string | null;
    returnAddressOverride?: string | null;
    isOneWayRental?: boolean;
    stationTransferFeeCents?: number | null;
  }): Prisma.BookingUpdateInput {
    const input: Prisma.BookingUpdateInput = {
      pickupAddressOverride: fields.pickupAddressOverride ?? undefined,
      returnAddressOverride: fields.returnAddressOverride ?? undefined,
      isOneWayRental: fields.isOneWayRental,
      stationTransferFeeCents: fields.stationTransferFeeCents ?? undefined,
    };
    if (fields.pickupStationId) {
      input.pickupStation = { connect: { id: fields.pickupStationId } };
    } else if (fields.pickupStationId === null) {
      input.pickupStation = { disconnect: true };
    }
    if (fields.returnStationId) {
      input.returnStation = { connect: { id: fields.returnStationId } };
    } else if (fields.returnStationId === null) {
      input.returnStation = { disconnect: true };
    }
    if (fields.actualPickupStationId) {
      input.actualPickupStation = { connect: { id: fields.actualPickupStationId } };
    } else if (fields.actualPickupStationId === null) {
      input.actualPickupStation = { disconnect: true };
    }
    if (fields.actualReturnStationId) {
      input.actualReturnStation = { connect: { id: fields.actualReturnStationId } };
    } else if (fields.actualReturnStationId === null) {
      input.actualReturnStation = { disconnect: true };
    }
    return input;
  }

  private stripBookingStationScalars(data: Record<string, unknown>): Record<string, unknown> {
    const {
      pickupStationId: _p,
      returnStationId: _r,
      actualPickupStationId: _ap,
      actualReturnStationId: _ar,
      pickupStation: _ps,
      returnStation: _rs,
      actualPickupStation: _aps,
      actualReturnStation: _ars,
      ...rest
    } = data;
    return rest;
  }

  private async loadProtocolsMap(
    orgId: string,
    bookingIds: string[],
  ): Promise<Map<string, HandoverProtocolDto[]>> {
    if (bookingIds.length === 0) return new Map();
    const rows = await this.prisma.bookingHandoverProtocol.findMany({
      where: { organizationId: orgId, bookingId: { in: bookingIds } },
      orderBy: { performedAt: 'asc' },
    });
    const map = new Map<string, HandoverProtocolDto[]>();
    for (const r of rows) {
      const dto: HandoverProtocolDto = {
        id: r.id,
        bookingId: r.bookingId,
        vehicleId: r.vehicleId,
        kind: r.kind,
        performedAt: r.performedAt.toISOString(),
        performedByUserId: r.performedByUserId,
        performedByName: r.performedByName,
        odometerKm: r.odometerKm,
        fuelPercent: r.fuelPercent,
        fuelFull: r.fuelFull,
        exteriorClean: r.exteriorClean,
        interiorClean: r.interiorClean,
        tiresSeasonOk: r.tiresSeasonOk,
        warningLightsOn: r.warningLightsOn,
        warningLightsNotes: r.warningLightsNotes,
        notes: r.notes,
        customerSignatureName: r.customerSignatureName,
        customerSignatureDataUrl: r.customerSignatureDataUrl,
        staffSignatureName: r.staffSignatureName,
        staffSignatureDataUrl: r.staffSignatureDataUrl,
        documentsAcknowledged: r.documentsAcknowledged,
        damageIds: Array.isArray(r.damageIds)
          ? (r.damageIds as unknown[]).filter(
              (x): x is string => typeof x === 'string',
            )
          : [],
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
      const list = map.get(dto.bookingId) ?? [];
      list.push(dto);
      map.set(dto.bookingId, list);
    }
    return map;
  }

  async findById(orgId: string, id: string) {
    const b = await this.prisma.booking.findFirst({
      where: { id, organizationId: orgId },
      include: { customer: true, vehicle: true },
    });

    if (!b) return null;

    let stationName = '';
    if (b.pickupStationId) {
      const station = await this.prisma.station.findUnique({
        where: { id: b.pickupStationId },
      });
      stationName = station?.name || '';
    }

    // V4.6.75 — Include handover protocols for the detail view.
    const protocolsMap = await this.loadProtocolsMap(orgId, [b.id]);
    const protocols = protocolsMap.get(b.id) ?? [];
    const pickup = protocols.find((p) => p.kind === 'PICKUP') ?? null;
    const ret = protocols.find((p) => p.kind === 'RETURN') ?? null;

    let returnStationName = '';
    if (b.returnStationId) {
      const returnStation = await this.prisma.station.findUnique({
        where: { id: b.returnStationId },
      });
      returnStationName = returnStation?.name || '';
    }

    return {
      id: b.id,
      vehicleId: b.vehicleId,
      customerId: b.customerId,
      pickupStationId: b.pickupStationId,
      returnStationId: b.returnStationId,
      customerName: `${(b as any).customer.firstName} ${(b as any).customer.lastName}`,
      vehicleName:
        (b as any).vehicle.vehicleName ||
        `${(b as any).vehicle.make} ${(b as any).vehicle.model}`,
      vehicleLicense: (b as any).vehicle.licensePlate || '',
      station: stationName,
      pickupStationName: stationName,
      returnStationName,
      startDate: b.startDate.toISOString(),
      endDate: b.endDate.toISOString(),
      status: BOOKING_STATUS_DISPLAY[b.status] || b.status,
      statusEnum: b.status,
      dailyRate: (b.dailyRateCents || 0) / 100,
      dailyRateCents: b.dailyRateCents,
      totalPrice: (b.totalPriceCents || 0) / 100,
      totalPriceCents: b.totalPriceCents,
      currency: b.currency,
      kmIncluded: b.kmIncluded || 0,
      kmDriven: b.kmDriven || 0,
      notes: b.notes,
      insuranceOptions: Array.isArray(b.insuranceOptions) ? b.insuranceOptions : [],
      extras: Array.isArray(b.extrasJson) ? b.extrasJson : [],
      pickupProtocol: pickup,
      returnProtocol: ret,
    };
  }

  async findDetail(orgId: string, id: string): Promise<BookingDetailDto | null> {
    const b = await this.prisma.booking.findFirst({
      where: { id, organizationId: orgId },
      include: { customer: true, vehicle: true },
    });
    if (!b) return null;

    const customer = b.customer as {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      status: string | null;
      idVerificationStatus: string | null;
      licenseVerificationStatus: string | null;
      riskLevel: string | null;
    };
    const vehicle = b.vehicle as {
      id: string;
      licensePlate: string | null;
      vin: string | null;
      make: string | null;
      model: string | null;
      year: number | null;
      status: string | null;
      vehicleName: string | null;
      mileageKm: number | null;
    };

    const stationIds = [
      b.pickupStationId,
      b.returnStationId,
      b.actualPickupStationId,
      b.actualReturnStationId,
    ].filter(Boolean) as string[];
    const stationRows =
      stationIds.length > 0
        ? await this.prisma.station.findMany({ where: { id: { in: stationIds } } })
        : [];
    const stationById = new Map(stationRows.map((s) => [s.id, s]));
    const stationMap = new Map(stationRows.map((s) => [s.id, s.name]));

    const protocolsMap = await this.loadProtocolsMap(orgId, [b.id]);
    const protocols = protocolsMap.get(b.id) ?? [];
    const pickupProto = protocols.find((p) => p.kind === 'PICKUP') ?? null;
    const returnProto = protocols.find((p) => p.kind === 'RETURN') ?? null;

    const mapHandover = (p: HandoverProtocolDto): HandoverSideSummary => ({
      protocolId: p.id,
      status: 'completed',
      completedAt: p.performedAt,
      odometerKm: p.odometerKm,
      fuelPercent: p.fuelPercent,
      fuelFull: p.fuelFull,
      damageCount: p.damageIds.length,
      signatureComplete: Boolean(p.customerSignatureName && p.staffSignatureName),
      performedByName: p.performedByName,
    });

    const [deposit, priceSnapshot, invoices, tasks, misuseCount, analysis, activityRows, noShowCount, openInvoices, openFines] =
      await Promise.all([
        this.prisma.bookingDeposit.findFirst({
          where: { organizationId: orgId, bookingId: id },
        }),
        this.prisma.bookingPriceSnapshot.findUnique({
          where: { bookingId: id },
          select: { depositAmountCents: true },
        }),
        this.prisma.orgInvoice.findMany({
          where: { organizationId: orgId, bookingId: id },
          orderBy: { invoiceDate: 'desc' },
        }),
        this.prisma.orgTask.findMany({
          where: { organizationId: orgId, bookingId: id },
          orderBy: { dueDate: 'asc' },
          take: 50,
        }),
        this.prisma.misuseCase.count({
          where: { organizationId: orgId, bookingId: id },
        }),
        this.prisma.rentalDrivingAnalysis.findUnique({
          where: { bookingId: id },
        }),
        this.prisma.activityLog.findMany({
          where: { organizationId: orgId, entity: 'BOOKING', entityId: id },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
        this.prisma.booking.count({
          where: { organizationId: orgId, customerId: b.customerId, status: 'NO_SHOW' },
        }),
        this.prisma.orgInvoice.count({
          where: {
            organizationId: orgId,
            customerId: b.customerId,
            status: { notIn: ['PAID', 'CANCELLED'] },
          },
        }),
        this.prisma.fine.count({
          where: {
            organizationId: orgId,
            customerId: b.customerId,
            status: { notIn: ['RESOLVED', 'CLOSED'] },
          },
        }),
      ]);

    let bundleView: Awaited<ReturnType<BookingDocumentBundleService['getBundleView']>> | null =
      null;
    try {
      bundleView = await this.bookingDocumentBundleService.getBundleView(orgId, id);
    } catch {
      bundleView = null;
    }

    const docByType = new Map<string, { id: string; status: string; createdAt: string }>();
    for (const d of bundleView?.documents ?? []) {
      if (d.status === 'VOID') continue;
      docByType.set(d.documentType, {
        id: d.id,
        status: d.status,
        createdAt: d.createdAt,
      });
    }

    const DOC_SLOTS: { type: string; required: boolean }[] = [
      { type: DOCUMENT_TYPE.BOOKING_INVOICE, required: true },
      { type: DOCUMENT_TYPE.DEPOSIT_RECEIPT, required: true },
      { type: DOCUMENT_TYPE.RENTAL_CONTRACT, required: true },
      { type: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, required: true },
      { type: DOCUMENT_TYPE.WITHDRAWAL_INFORMATION, required: true },
      { type: DOCUMENT_TYPE.HANDOVER_PICKUP, required: false },
      { type: DOCUMENT_TYPE.HANDOVER_RETURN, required: false },
      { type: DOCUMENT_TYPE.FINAL_INVOICE, required: false },
    ];

    const documentSlots = DOC_SLOTS.map(({ type, required }) => {
      const row = docByType.get(type);
      if (!row) {
        const isLegal =
          type === DOCUMENT_TYPE.TERMS_AND_CONDITIONS ||
          type === DOCUMENT_TYPE.WITHDRAWAL_INFORMATION;
        return {
          documentType: type,
          status: 'missing' as const,
          required,
          available: false,
          generatedAt: null,
          signedAt: null,
          documentId: null,
          missingReason: isLegal
            ? 'In Administration hinterlegen'
            : required
              ? 'Noch nicht erstellt'
              : null,
        };
      }
      const status =
        row.status === 'SIGNED'
          ? ('signed' as const)
          : row.status === 'GENERATED'
            ? ('generated' as const)
            : ('generated' as const);
      return {
        documentType: type,
        status,
        required,
        available: true,
        generatedAt: row.createdAt,
        signedAt: row.status === 'SIGNED' ? row.createdAt : null,
        documentId: row.id,
        missingReason: null,
      };
    });

    let rentalHealth: Awaited<ReturnType<RentalHealthService['getVehicleHealth']>> | null = null;
    try {
      rentalHealth = await this.rentalHealthService.getVehicleHealth(orgId, b.vehicleId);
    } catch {
      rentalHealth = null;
    }

    let eligibility: BookingDetailDto['eligibility'] = null;
    try {
      const evalResult = await this.customerEligibilityService.evaluateForBooking(
        orgId,
        b.customerId,
        { startDate: b.startDate, endDate: b.endDate, requestedStatus: b.status },
      );
      eligibility = {
        canCreatePendingBooking: evalResult.canCreatePendingBooking,
        canConfirmBooking: evalResult.canConfirmBooking,
        canStartRental: evalResult.canStartRental,
        blockingReasons: evalResult.blockingReasons,
        warnings: evalResult.warnings,
        requiredActions: evalResult.requiredActions,
      };
    } catch {
      eligibility = null;
    }

    const now = Date.now();
    const taskItems = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueAt: t.dueDate ? t.dueDate.toISOString() : null,
      overdue:
        t.dueDate != null &&
        t.dueDate.getTime() < now &&
        !['DONE', 'CANCELLED'].includes(t.status),
    }));

    const extras = Array.isArray(b.extrasJson) ? (b.extrasJson as unknown[]) : [];
    let extrasPriceCents = 0;
    for (const ex of extras) {
      if (ex && typeof ex === 'object' && 'price' in ex) {
        const p = Number((ex as { price?: number }).price);
        if (Number.isFinite(p)) extrasPriceCents += Math.round(p * 100);
      }
    }

    const grossAmountCents = b.totalPriceCents ?? null;
    const paidInvoices = invoices.filter((i) => i.status === 'PAID');
    const paidAmountCents = paidInvoices.reduce((s, i) => s + (i.totalCents || 0), 0);
    const openAmountCents =
      grossAmountCents != null ? Math.max(0, grossAmountCents - paidAmountCents) : null;

    let paymentStatus: string | null = null;
    if (invoices.length === 0 && grossAmountCents == null) {
      paymentStatus = null;
    } else if (invoices.some((i) => i.status === 'OVERDUE')) {
      paymentStatus = 'OVERDUE';
    } else if (openAmountCents === 0 && grossAmountCents != null) {
      paymentStatus = 'PAID';
    } else if (paidAmountCents > 0) {
      paymentStatus = 'PARTIAL';
    } else {
      paymentStatus = 'OPEN';
    }

    const finalInvoice = invoices.find((i) => i.type === 'OUTGOING_BOOKING' && i.title?.includes('Schluss'));
    const payload = (analysis?.payload ?? {}) as Record<string, unknown>;
    const eventSummary = (payload.eventSummary ?? {}) as Record<string, unknown>;

    const criticalWarnings: string[] = [];
    const warningWarnings: string[] = [];
    if (rentalHealth?.rental_blocked) {
      criticalWarnings.push(...(rentalHealth.blocking_reasons ?? []));
    }
    for (const mod of ['battery', 'tires', 'brakes', 'error_codes'] as const) {
      const m = rentalHealth?.modules?.[mod];
      if (!m) continue;
      if (m.state === 'critical') criticalWarnings.push(m.reason || mod);
      else if (m.state === 'warning') warningWarnings.push(m.reason || mod);
    }

    return {
      core: {
        bookingId: b.id,
        bookingNumber: `BK-${b.id.slice(-6).toUpperCase()}`,
        organizationId: orgId,
        status: BOOKING_STATUS_DISPLAY[b.status] || b.status,
        statusEnum: b.status,
        startDate: b.startDate.toISOString(),
        endDate: b.endDate.toISOString(),
        pickupStationId: b.pickupStationId,
        returnStationId: b.returnStationId,
        pickupStationName: b.pickupStationId ? stationMap.get(b.pickupStationId) ?? null : null,
        returnStationName: b.returnStationId ? stationMap.get(b.returnStationId) ?? null : null,
        isOneWayRental: b.isOneWayRental ?? false,
        pickupAddressOverride: b.pickupAddressOverride,
        returnAddressOverride: b.returnAddressOverride,
        notes: b.notes,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
        cancelledAt: b.cancelledAt ? b.cancelledAt.toISOString() : null,
        completedAt: b.completedAt ? b.completedAt.toISOString() : null,
        kmIncluded: b.kmIncluded,
        kmDriven: b.kmDriven,
        insuranceOptions: Array.isArray(b.insuranceOptions)
          ? (b.insuranceOptions as string[])
          : [],
        extras,
        currency: b.currency,
      },
      stations: {
        pickup: b.pickupStationId && stationById.get(b.pickupStationId)
          ? this.mapStationContext(stationById.get(b.pickupStationId)!)
          : null,
        return: b.returnStationId && stationById.get(b.returnStationId)
          ? this.mapStationContext(stationById.get(b.returnStationId)!)
          : null,
        actualPickup:
          b.actualPickupStationId && stationById.get(b.actualPickupStationId)
            ? this.mapStationContext(stationById.get(b.actualPickupStationId)!)
            : null,
        actualReturn:
          b.actualReturnStationId && stationById.get(b.actualReturnStationId)
            ? this.mapStationContext(stationById.get(b.actualReturnStationId)!)
            : null,
        isOneWayRental: b.isOneWayRental ?? false,
        hasPickupDeviation: Boolean(
          b.pickupStationId &&
            b.actualPickupStationId &&
            b.pickupStationId !== b.actualPickupStationId,
        ),
        hasReturnDeviation: Boolean(
          b.returnStationId &&
            b.actualReturnStationId &&
            b.returnStationId !== b.actualReturnStationId,
        ),
      },
      customer: {
        customerId: customer.id,
        fullName: `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim(),
        email: customer.email,
        phone: customer.phone,
        customerStatus: customer.status,
        identityStatus: customer.idVerificationStatus,
        licenseStatus: customer.licenseVerificationStatus,
        riskLevel: customer.riskLevel,
        openInvoiceCount: openInvoices,
        openFineCount: openFines,
        noShowCount,
      },
      vehicle: {
        vehicleId: vehicle.id,
        displayName:
          vehicle.vehicleName ||
          `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() ||
          vehicle.model ||
          'Fahrzeug',
        licensePlate: vehicle.licensePlate || '',
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        vehicleStatus: vehicle.status,
        rentalBlocked: rentalHealth?.rental_blocked ?? false,
        blockingReasons: rentalHealth?.blocking_reasons ?? [],
        odometerKm: vehicle.mileageKm,
        fuelPercent: null,
        evSoc: null,
      },
      finance: {
        basePriceCents: b.dailyRateCents != null && b.totalPriceCents != null
          ? Math.max(0, b.totalPriceCents - extrasPriceCents)
          : b.totalPriceCents,
        extrasPriceCents: extrasPriceCents || null,
        discountAmountCents: null,
        depositAmountCents: deposit?.amountCents ?? priceSnapshot?.depositAmountCents ?? null,
        depositStatus: deposit?.status ?? null,
        taxRate: null,
        taxAmountCents: null,
        grossAmountCents,
        paidAmountCents: paidAmountCents || null,
        openAmountCents,
        paymentStatus,
        invoiceStatus: invoices[0]?.status ?? null,
        finalInvoiceStatus: finalInvoice?.status ?? null,
        additionalChargesCents: null,
        refundAmountCents: deposit?.refundAmountCents ?? null,
        retainedDepositAmountCents: deposit?.retainedAmountCents ?? null,
        computed: grossAmountCents != null,
      },
      documents: {
        bundleStatus: bundleView?.bundle.status ?? null,
        legalTermsAttached: bundleView?.legal.termsAttached ?? false,
        legalWithdrawalAttached: bundleView?.legal.withdrawalAttached ?? false,
        legalMissing: bundleView?.legal.missing ?? [],
        warnings: bundleView?.warnings ?? [],
        slots: documentSlots,
      },
      handover: {
        pickup: pickupProto ? mapHandover(pickupProto) : null,
        return: returnProto ? mapHandover(returnProto) : null,
      },
      tasks: {
        openCount: taskItems.filter((t) => !['DONE', 'CANCELLED'].includes(t.status)).length,
        overdueCount: taskItems.filter((t) => t.overdue).length,
        completedCount: taskItems.filter((t) => t.status === 'DONE').length,
        nextDueAt: taskItems.find((t) => !['DONE', 'CANCELLED'].includes(t.status))?.dueAt ?? null,
        items: taskItems,
      },
      health: {
        rentalBlocked: rentalHealth?.rental_blocked ?? false,
        blockingReasons: rentalHealth?.blocking_reasons ?? [],
        overallState: rentalHealth?.overall_state ?? null,
        criticalWarnings,
        warningWarnings,
      },
      usage: {
        drivingStressScore: analysis?.drivingScore ?? null,
        stressLevel: null,
        drivingEventsCount: Number(eventSummary.drivingEventsCount ?? analysis?.drivingEventsCount) || null,
        abuseDetectionCount: Number(eventSummary.abuseDetectionCount ?? analysis?.abuseDetectionCount) || null,
        misuseCaseCount: misuseCount,
        hasAnalysis: Boolean(analysis),
      },
      eligibility,
      activity: activityRows.map((a) => ({
        id: a.id,
        action: a.action,
        description: a.description,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }

  async findTodaysPickups(orgId: string) {
    // V4.6.81 — "Pick Up Today" must also surface overdue pickups so the
    // operator still sees them on the dashboard. Previously the window
    // was strictly `startDate ∈ [today_start, today_end]`, which hid
    // yesterday's missed pickups entirely until someone drilled into
    // the bookings list. We now extend the lookup backward by 7 days
    // for CONFIRMED bookings that never received a pickup handover
    // protocol — the same 7-day window PickupOverdueDetector uses — and
    // stamp each row with `isOverdue` + `minutesOverdue` so the UI can
    // badge them distinctly. Future pickups within today's calendar
    // day still come through the original branch (PENDING or
    // CONFIRMED, no protocol constraint needed because they cannot be
    // handed over yet).
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const overdueLookbackStart = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000,
    );

    const data = await this.prisma.booking.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['PENDING', 'CONFIRMED'] as BookingStatus[] },
        OR: [
          { startDate: { gte: todayStart, lte: todayEnd } },
          // Overdue branch: CONFIRMED bookings whose start has passed
          // but still sit without a pickup handover protocol. We widen
          // by 7 days to keep the list bounded — anything older is
          // operationally stale and should flow through the bookings
          // archive, not the dashboard tile.
          {
            status: 'CONFIRMED' as BookingStatus,
            startDate: { gte: overdueLookbackStart, lt: todayStart },
            handoverProtocols: { none: { kind: 'PICKUP' } },
          },
        ],
      },
      include: { customer: true, vehicle: true },
      orderBy: { startDate: 'asc' },
    });

    const stationIds = [
      ...new Set(
        data
          .flatMap((b) => [b.pickupStationId, b.returnStationId])
          .filter(Boolean) as string[],
      ),
    ];
    const stations =
      stationIds.length > 0
        ? await this.prisma.station.findMany({ where: { id: { in: stationIds } } })
        : [];
    const stationMap = new Map(stations.map((s) => [s.id, s.name]));

    // V4.6.75 — Attach protocols so tiles / side lists know if the pickup
    // has already been handled.
    const protocolsMap = await this.loadProtocolsMap(
      orgId,
      data.map((b) => b.id),
    );

    return data.map((b) => {
      const protocols = protocolsMap.get(b.id) ?? [];
      const pickup = protocols.find((p) => p.kind === 'PICKUP') ?? null;
      const ret = protocols.find((p) => p.kind === 'RETURN') ?? null;
      const isOverdue =
        !pickup &&
        b.status === 'CONFIRMED' &&
        b.startDate.getTime() < now.getTime();
      const minutesOverdue = isOverdue
        ? Math.max(
            0,
            Math.round((now.getTime() - b.startDate.getTime()) / 60_000),
          )
        : 0;
      const pickupStationName = b.pickupStationId
        ? stationMap.get(b.pickupStationId) || ''
        : '';
      return {
        id: b.id,
        vehicleId: b.vehicleId,
        customerId: b.customerId,
        customerName: `${(b as any).customer.firstName} ${(b as any).customer.lastName}`,
        vehicleName:
          (b as any).vehicle.vehicleName ||
          `${(b as any).vehicle.make} ${(b as any).vehicle.model}`,
        vehicleLicense: (b as any).vehicle.licensePlate || '',
        pickupStationId: b.pickupStationId ?? null,
        pickupStationName,
        station: pickupStationName,
        stationLabel: pickupStationName,
        startDate: b.startDate.toISOString(),
        endDate: b.endDate.toISOString(),
        status: BOOKING_STATUS_DISPLAY[b.status] || b.status,
        dailyRate: (b.dailyRateCents || 0) / 100,
        totalPrice: (b.totalPriceCents || 0) / 100,
        pickupProtocol: pickup,
        returnProtocol: ret,
        // V4.6.81 — Pickup-overdue surfaces on dashboard tiles.
        isOverdue,
        minutesOverdue,
      };
    });
  }

  private buildTodayReturnSignals(
    booking: {
      endDate: Date;
      status: BookingStatus;
      kmIncluded: number | null;
      kmDriven: number | null;
    },
    pickup: HandoverProtocolDto | null,
    ret: HandoverProtocolDto | null,
    now: Date,
    liveOdometerKm: number | null,
  ) {
    const warnings: string[] = [];
    const isOverdue =
      !ret && booking.endDate.getTime() < now.getTime() ? true : ret ? false : null;

    const kmIncluded =
      typeof booking.kmIncluded === 'number' && booking.kmIncluded > 0
        ? booking.kmIncluded
        : null;

    let kmDriven: number | null =
      typeof booking.kmDriven === 'number' ? booking.kmDriven : null;
    if (kmDriven == null && pickup && liveOdometerKm != null) {
      kmDriven = Math.max(0, Math.floor(liveOdometerKm - pickup.odometerKm));
    }

    let extraKm: number | null = null;
    let kmExceeded: boolean | null = null;
    if (kmIncluded != null && kmDriven != null) {
      extraKm = Math.max(0, kmDriven - kmIncluded);
      kmExceeded = extraKm > 0;
    }

    let returnProtocolStatus: string | null = null;
    if (ret) returnProtocolStatus = 'COMPLETED';
    else if (booking.status === 'ACTIVE') returnProtocolStatus = 'PENDING';

    let hasError: boolean | null = null;
    if (ret) {
      const protocolIssue =
        ret.warningLightsOn || (Array.isArray(ret.damageIds) && ret.damageIds.length > 0);
      hasError = protocolIssue ? true : false;
      if (ret.warningLightsOn) warnings.push('warning_lights');
      if (Array.isArray(ret.damageIds) && ret.damageIds.length > 0) {
        warnings.push('damages_reported');
      }
    }

    if (isOverdue) warnings.push('overdue');
    if (kmExceeded) warnings.push('km_exceeded');

    const hasReturnIssues =
      warnings.length > 0
        ? true
        : ret || isOverdue === false
          ? false
          : null;

    const issueSummary =
      warnings.length > 0
        ? warnings.join(', ')
        : null;

    return {
      kmIncluded,
      kmDriven,
      extraKm,
      kmExceeded,
      isOverdue,
      returnProtocolStatus,
      hasReturnIssues,
      hasError,
      warnings,
      issueSummary,
    };
  }

  async findTodaysReturns(orgId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const data = await this.prisma.booking.findMany({
      where: {
        organizationId: orgId,
        endDate: { gte: todayStart, lte: todayEnd },
        status: { in: ['ACTIVE', 'CONFIRMED'] as BookingStatus[] },
      },
      include: { customer: true, vehicle: true },
      orderBy: { endDate: 'asc' },
    });

    const stationIds = [
      ...new Set(
        data
          .flatMap((b) => [b.pickupStationId, b.returnStationId])
          .filter(Boolean) as string[],
      ),
    ];
    const stations =
      stationIds.length > 0
        ? await this.prisma.station.findMany({ where: { id: { in: stationIds } } })
        : [];
    const stationMap = new Map(stations.map((s) => [s.id, s.name]));

    const protocolsMap = await this.loadProtocolsMap(
      orgId,
      data.map((b) => b.id),
    );

    const vehicleIds = [...new Set(data.map((b) => b.vehicleId))];
    const odometerRows =
      vehicleIds.length > 0
        ? await this.prisma.vehicleLatestState
            .findMany({
              where: { vehicleId: { in: vehicleIds } },
              select: { vehicleId: true, odometerKm: true },
            })
            .catch(() => [] as Array<{ vehicleId: string; odometerKm: number | null }>)
        : [];
    const odometerByVehicle = new Map(
      odometerRows.map((r) => [
        r.vehicleId,
        typeof r.odometerKm === 'number' ? r.odometerKm : null,
      ]),
    );

    return data.map((b) => {
      const protocols = protocolsMap.get(b.id) ?? [];
      const pickup = protocols.find((p) => p.kind === 'PICKUP') ?? null;
      const ret = protocols.find((p) => p.kind === 'RETURN') ?? null;
      const returnStationName = b.returnStationId
        ? stationMap.get(b.returnStationId) || ''
        : '';
      const pickupStationName = b.pickupStationId
        ? stationMap.get(b.pickupStationId) || ''
        : '';
      const signals = this.buildTodayReturnSignals(
        {
          endDate: b.endDate,
          status: b.status,
          kmIncluded: b.kmIncluded,
          kmDriven: b.kmDriven,
        },
        pickup,
        ret,
        new Date(),
        odometerByVehicle.get(b.vehicleId) ?? null,
      );
      return {
        id: b.id,
        vehicleId: b.vehicleId,
        customerId: b.customerId,
        customerName: `${(b as any).customer.firstName} ${(b as any).customer.lastName}`,
        vehicleName:
          (b as any).vehicle.vehicleName ||
          `${(b as any).vehicle.make} ${(b as any).vehicle.model}`,
        vehicleLicense: (b as any).vehicle.licensePlate || '',
        pickupStationId: b.pickupStationId ?? null,
        pickupStationName,
        returnStationId: b.returnStationId ?? null,
        returnStationName,
        station: returnStationName,
        stationLabel: returnStationName,
        startDate: b.startDate.toISOString(),
        endDate: b.endDate.toISOString(),
        status: BOOKING_STATUS_DISPLAY[b.status] || b.status,
        dailyRate: (b.dailyRateCents || 0) / 100,
        totalPrice: (b.totalPriceCents || 0) / 100,
        pickupProtocol: pickup,
        returnProtocol: ret,
        ...signals,
      };
    });
  }

  async getBookingStats(orgId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [active, pending, completed, completedToday, completedMtd] = await Promise.all([
      this.prisma.booking.count({
        where: { organizationId: orgId, status: 'ACTIVE' },
      }),
      this.prisma.booking.count({
        where: { organizationId: orgId, status: 'PENDING' },
      }),
      this.prisma.booking.count({
        where: { organizationId: orgId, status: 'COMPLETED' },
      }),
      this.prisma.booking.findMany({
        where: {
          organizationId: orgId,
          status: 'COMPLETED',
          completedAt: { gte: todayStart, lte: todayEnd },
        },
        select: { totalPriceCents: true },
      }),
      this.prisma.booking.findMany({
        where: {
          organizationId: orgId,
          status: 'COMPLETED',
          completedAt: { gte: monthStart, lte: todayEnd },
        },
        select: { totalPriceCents: true },
      }),
    ]);

    const revenueToday =
      completedToday.reduce((sum, b) => sum + (b.totalPriceCents || 0), 0) / 100;
    const revenueMtd =
      completedMtd.reduce((sum, b) => sum + (b.totalPriceCents || 0), 0) / 100;

    return { active, pending, completed, revenueToday, revenueMtd };
  }

  async update(
    orgId: string,
    id: string,
    data: Prisma.BookingUpdateInput,
  ): Promise<Booking> {
    const existing = await this.prisma.booking.findFirstOrThrow({
      where: { id, organizationId: orgId },
    });

    const anyData = data as Record<string, unknown>;
    const nextVehicleId =
      (anyData.vehicleId as string | undefined) ??
      (anyData.vehicle as { connect?: { id?: string } } | undefined)?.connect?.id ??
      existing.vehicleId;
    const nextCustomerId =
      (anyData.customerId as string | undefined) ??
      (anyData.customer as { connect?: { id?: string } } | undefined)?.connect
        ?.id ??
      existing.customerId;
    const nextStart =
      anyData.startDate instanceof Date
        ? anyData.startDate
        : anyData.startDate
          ? new Date(anyData.startDate as string)
          : existing.startDate;
    const nextEnd =
      anyData.endDate instanceof Date
        ? anyData.endDate
        : anyData.endDate
          ? new Date(anyData.endDate as string)
          : existing.endDate;
    const nextStatus = (anyData.status as BookingStatus | undefined) ?? existing.status;

    const terminalStatuses: BookingStatus[] = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
    if (terminalStatuses.includes(existing.status)) {
      const onlyNotes =
        Object.keys(anyData).length === 1 && anyData.notes !== undefined;
      if (!onlyNotes) {
        throw new BadRequestException(
          `Buchungen mit Status ${existing.status} können nur Notizen ergänzt werden.`,
        );
      }
    }

    try {
      assertValidBookingWindow(nextStart, nextEnd);
    } catch (e) {
      if ((e as Error).message === 'END_BEFORE_START') {
        throw new BadRequestException('endDate must be after startDate');
      }
      throw new BadRequestException('Invalid booking dates');
    }

    const vehicleOrDatesChanged =
      nextVehicleId !== existing.vehicleId ||
      nextStart.getTime() !== existing.startDate.getTime() ||
      nextEnd.getTime() !== existing.endDate.getTime();
    const customerOrDatesChanged =
      nextCustomerId !== existing.customerId ||
      nextStart.getTime() !== existing.startDate.getTime() ||
      nextEnd.getTime() !== existing.endDate.getTime();
    const statusChanged = nextStatus !== existing.status;

    if (vehicleOrDatesChanged && !terminalStatuses.includes(nextStatus)) {
      await this.assertNoVehicleOverlap({
        organizationId: orgId,
        vehicleId: nextVehicleId,
        startDate: nextStart,
        endDate: nextEnd,
        excludeBookingId: id,
      });
    }

    if (vehicleOrDatesChanged) {
      const rentalGate = await this.rentalHealthService.isRentalBlocked(
        orgId,
        nextVehicleId,
      );
      this.enforceRentalHealthGate(rentalGate, nextVehicleId);
    }

    if (customerOrDatesChanged || statusChanged) {
      await this.assertCustomerBookingEligibility(
        orgId,
        nextCustomerId,
        nextStatus,
        nextStart,
      );
    }

    const pricingInput = this.pricingService.extractPricingInputFromBookingData(anyData);
    const pricingRelevant =
      (vehicleOrDatesChanged ||
        pricingInput !== undefined ||
        anyData.extrasJson !== undefined ||
        anyData.insuranceOptions !== undefined) &&
      !terminalStatuses.includes(existing.status);

    if (pricingRelevant) {
      const simulation = await this.pricingService.simulateBookingPrice(orgId, {
        vehicleId: nextVehicleId,
        pickupAt: nextStart.toISOString(),
        returnAt: nextEnd.toISOString(),
        selectedMileagePackageId: pricingInput?.selectedMileagePackageId,
        selectedInsuranceOptionIds: pricingInput?.selectedInsuranceOptionIds,
        selectedExtraOptionIds: pricingInput?.selectedExtraOptionIds,
        manualDiscountCents: pricingInput?.manualDiscountCents,
        manualAdjustmentCents: pricingInput?.manualAdjustmentCents,
      });
      const pricedFields = this.pricingService.legacyBookingFieldsFromSimulation(simulation);
      Object.assign(data, pricedFields);
    }

    const stationTouched =
      anyData.pickupStationId !== undefined ||
      anyData.returnStationId !== undefined ||
      anyData.pickupStation !== undefined ||
      anyData.returnStation !== undefined ||
      anyData.actualPickupStationId !== undefined ||
      anyData.actualReturnStationId !== undefined ||
      anyData.isOneWayRental !== undefined;
    if (stationTouched) {
      const merged = {
        pickupStationId:
          (anyData.pickupStationId as string | undefined) ??
          (anyData.pickupStation as { connect?: { id?: string } } | undefined)?.connect?.id ??
          existing.pickupStationId,
        returnStationId:
          (anyData.returnStationId as string | undefined) ??
          (anyData.returnStation as { connect?: { id?: string } } | undefined)?.connect?.id ??
          existing.returnStationId,
        actualPickupStationId:
          (anyData.actualPickupStationId as string | undefined) ?? existing.actualPickupStationId,
        actualReturnStationId:
          (anyData.actualReturnStationId as string | undefined) ?? existing.actualReturnStationId,
        pickupAddressOverride:
          (anyData.pickupAddressOverride as string | undefined) ?? existing.pickupAddressOverride,
        returnAddressOverride:
          (anyData.returnAddressOverride as string | undefined) ?? existing.returnAddressOverride,
        isOneWayRental: (anyData.isOneWayRental as boolean | undefined) ?? existing.isOneWayRental,
        stationTransferFeeCents:
          (anyData.stationTransferFeeCents as number | undefined) ??
          existing.stationTransferFeeCents,
      };
      Object.assign(data, this.stationFieldsToPrismaInput(await this.resolveBookingStationFields(orgId, merged)));
    }

    const updated = await this.prisma.booking.update({ where: { id }, data });

    if (pricingRelevant) {
      await this.pricingService.createBookingPriceSnapshot(orgId, id, {
        vehicleId: updated.vehicleId,
        pickupAt: updated.startDate,
        returnAt: updated.endDate,
        pricing: pricingInput,
      });
    }
    if (updated.status === 'COMPLETED') {
      this.rentalDrivingAnalysisService.generateForBooking(orgId, id).catch(() => {});
    }
    // Generate the initial document bundle when a booking transitions INTO
    // CONFIRMED via update. Idempotent + fire-and-forget.
    if (updated.status === 'CONFIRMED' && existing.status !== 'CONFIRMED') {
      void this.bookingDocumentBundleService
        .generateInitialBundle(orgId, id)
        .then(() =>
          this.bookingDocumentEmailService.maybeAutoSendBookingDocuments(orgId, id, null),
        )
        .catch(() => {});
    }
    // Materialize booking lifecycle tasks on any status transition. The
    // automation service is idempotent (dedup per generatedKey), so calling it
    // on every update is safe and only adds tasks when the status warrants it.
    if (updated.status !== existing.status) {
      void this.taskAutomationService
        .ensureBookingLifecycleTasks({
          id: updated.id,
          organizationId: orgId,
          vehicleId: updated.vehicleId,
          customerId: updated.customerId,
          status: updated.status,
        })
        .catch(() => {});
    }
    return updated;
  }

  async cancel(orgId: string, id: string): Promise<Booking> {
    const booking = await this.prisma.booking.findFirstOrThrow({
      where: { id, organizationId: orgId },
      include: { vehicle: true },
    });

    await this.generatedDocumentsService.voidAllForBooking(orgId, id).catch(() => {});

    const [updated] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id },
        data: {
          status: 'CANCELLED' as BookingStatus,
          cancelledAt: new Date(),
        },
      }),
      // Release the car for a replacement booking — but NEVER overwrite a
      // maintenance / out-of-service state (same invariant the handover
      // service enforces). `updateMany` + notIn applies the AVAILABLE flip
      // only when the vehicle is not IN_SERVICE / OUT_OF_SERVICE.
      this.prisma.vehicle.updateMany({
        where: {
          id: booking.vehicleId,
          status: {
            notIn: [VehicleStatus.IN_SERVICE, VehicleStatus.OUT_OF_SERVICE],
          },
        },
        data: { status: VehicleStatus.AVAILABLE },
      }),
    ]);

    return updated;
  }

  // V4.6.81 — No-show transition. Distinct from a regular cancel because
  // a no-show means the customer failed to appear after the pickup
  // window opened, not that the booking was called off in advance. We
  // reuse `cancelledAt` as the operational timestamp (same contract the
  // invoice / revenue pipeline already reads) and keep the bookkeeping
  // single-field rather than introducing a parallel `noShowAt` column:
  // callers can always discriminate via `status === 'NO_SHOW'`.
  //
  // Guardrails:
  //   • status must be CONFIRMED (PENDING / ACTIVE / COMPLETED / already
  //     CANCELLED cannot become a no-show).
  //   • `startDate` must be in the past — a future no-show is
  //     nonsensical and usually indicates a mis-click on the wrong row.
  //
  // The vehicle is flipped back to AVAILABLE the same way cancel does,
  // so the fleet tile and any rental_blocked gate immediately reopen
  // the car for a replacement booking. A corresponding `NO_SHOW`
  // transition on the insight feed is handled separately by
  // PickupOverdueDetector auto-expiring once the booking flips.
  async markNoShow(
    orgId: string,
    id: string,
    reason?: string | null,
  ): Promise<Booking> {
    const booking = await this.prisma.booking.findFirstOrThrow({
      where: { id, organizationId: orgId },
      include: { vehicle: true },
    });

    if (booking.status !== 'CONFIRMED') {
      throw new ConflictException({
        message: `Buchung kann nicht als No-Show markiert werden: Status ist ${booking.status}, erwartet wird CONFIRMED.`,
        code: 'BOOKING_NO_SHOW_WRONG_STATUS',
        currentStatus: booking.status,
      });
    }

    if (booking.startDate.getTime() > Date.now()) {
      throw new BadRequestException({
        message:
          'Buchung kann erst nach dem geplanten Pickup-Zeitpunkt als No-Show markiert werden.',
        code: 'BOOKING_NO_SHOW_TOO_EARLY',
        scheduledStart: booking.startDate.toISOString(),
      });
    }

    // Append reason to the existing booking notes instead of dropping
    // it — `Booking.notes` is already the free-text column ops uses for
    // manual context, and we do not want to add a one-off column for
    // an optional audit string.
    const notesAddendum = reason
      ? `[No-Show ${new Date().toISOString()}] ${reason.trim()}`
      : null;
    const nextNotes = notesAddendum
      ? (booking.notes ? `${booking.notes}\n${notesAddendum}` : notesAddendum)
      : booking.notes;

    const [updated] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id },
        data: {
          status: 'NO_SHOW' as BookingStatus,
          cancelledAt: new Date(),
          notes: nextNotes,
        },
      }),
      // Reopen the car for a replacement booking without clobbering a
      // maintenance / out-of-service state (mirrors cancel() + the handover
      // invariant). Only flips to AVAILABLE when not IN_SERVICE/OUT_OF_SERVICE.
      this.prisma.vehicle.updateMany({
        where: {
          id: booking.vehicleId,
          status: {
            notIn: [VehicleStatus.IN_SERVICE, VehicleStatus.OUT_OF_SERVICE],
          },
        },
        data: { status: VehicleStatus.AVAILABLE },
      }),
    ]);

    return updated;
  }

  private async assertCustomerBookingEligibility(
    orgId: string,
    customerId: string,
    requestedStatus: BookingStatus,
    startDate: Date,
  ): Promise<void> {
    const eligibility = await this.customerEligibilityService.evaluateForBooking(
      orgId,
      customerId,
      { requestedStatus, startDate },
    );

    let allowed = true;
    let message = 'Customer is not eligible for this booking';
    let code:
      | 'CUSTOMER_BOOKING_BLOCKED'
      | 'CUSTOMER_CONFIRMATION_BLOCKED'
      | 'CUSTOMER_PICKUP_BLOCKED' = 'CUSTOMER_BOOKING_BLOCKED';

    if (requestedStatus === 'PENDING') {
      allowed = eligibility.canCreatePendingBooking;
      message = 'Customer is not eligible for a new booking';
      code = 'CUSTOMER_BOOKING_BLOCKED';
    } else if (requestedStatus === 'CONFIRMED') {
      allowed = eligibility.canConfirmBooking;
      message = 'Customer is not eligible for a confirmed booking';
      code = 'CUSTOMER_CONFIRMATION_BLOCKED';
    } else if (requestedStatus === 'ACTIVE') {
      allowed = eligibility.canStartRental;
      message = 'Customer is not eligible for rental pickup';
      code = 'CUSTOMER_PICKUP_BLOCKED';
    } else {
      return;
    }

    if (!allowed) {
      const stageBlockingReasons =
        requestedStatus === 'PENDING'
          ? eligibility.stages.createBooking.blockingReasons
          : requestedStatus === 'CONFIRMED'
            ? eligibility.stages.confirmBooking.blockingReasons
            : eligibility.stages.startPickup.blockingReasons;

      throw new ConflictException({
        code,
        message,
        blockingReasons: stageBlockingReasons,
        warnings: eligibility.warnings,
        requiredActions: eligibility.requiredActions,
        customerId,
      });
    }
  }
}

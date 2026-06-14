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

const BOOKING_STATUS_DISPLAY: Record<string, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'Cancelled',
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
    // V4.8.3 Task Action Layer — materializes booking lifecycle tasks
    // (preparation / pickup / return / invoice). Idempotent + fire-and-forget;
    // never blocks/breaks booking writes.
    private readonly taskAutomationService: TaskAutomationService,
  ) {}

  async create(orgId: string, data: Omit<Prisma.BookingCreateInput, 'organization'>): Promise<Booking> {
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
    if (endDate <= startDate) {
      throw new BadRequestException('endDate must be after startDate');
    }

    const BLOCKING_STATUSES: BookingStatus[] = [
      'PENDING',
      'CONFIRMED',
      'ACTIVE',
    ] as BookingStatus[];

    // Overlap predicate: existing.start < new.end AND existing.end > new.start
    const overlapping = await this.prisma.booking.findFirst({
      where: {
        organizationId: orgId,
        vehicleId,
        status: { in: BLOCKING_STATUSES },
        startDate: { lt: endDate },
        endDate: { gt: startDate },
      },
      select: { id: true, startDate: true, endDate: true, status: true },
    });
    if (overlapping) {
      throw new ConflictException({
        message:
          'Dieses Fahrzeug ist im gewählten Zeitraum bereits gebucht.',
        code: 'VEHICLE_BOOKING_OVERLAP',
        conflictingBookingId: overlapping.id,
        conflictRange: {
          startDate: overlapping.startDate.toISOString(),
          endDate: overlapping.endDate.toISOString(),
          status: overlapping.status,
        },
      });
    }

    // V4.6.76 Rental Health V1 — rental_blocked hard-gate. A vehicle
    // with lapsed TÜV/BOKraft, critical tires/brakes, active Limp Mode,
    // safety-relevant DTC, low oil, or an open safety-impact complaint
    // must never accept a new booking. We fail OPEN (i.e. allow the
    // create to proceed) if the health pipeline errors out — see
    // RentalHealthService.isRentalBlocked — so a transient health-stack
    // incident never freezes the whole bookings flow.
    const rentalGate = await this.rentalHealthService.isRentalBlocked(
      orgId,
      vehicleId,
    );
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

    const booking = await this.prisma.booking.create({
      data: { ...data, organization: { connect: { id: orgId } } },
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

    // Generate the initial document bundle once the booking is CONFIRMED.
    // Sequenced AFTER the invoice attempt so the bundle reuses that invoice
    // instead of creating a duplicate. Fully fire-and-forget — booking creation
    // is never blocked or failed by document generation.
    if (booking.status === 'CONFIRMED') {
      void invoicePromise
        .then(() => this.bookingDocumentBundleService.generateInitialBundle(orgId, booking.id))
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

    return booking;
  }

  async findAll(orgId: string, params?: PaginationParams) {
    const { skip, take } = parsePagination(params || {});
    const where = { organizationId: orgId };
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
      return {
        id: b.id,
        // V4.6.74 — `vehicleId` and `customerId` are REQUIRED on the client
        // (e.g. NewBookingView's calendar must filter blocked days by the
        // selected vehicle, BookingsView filters per-vehicle, etc.). They
        // were previously omitted, which caused the new-booking calendar
        // to treat EVERY org booking as a blocker for EVERY vehicle.
        vehicleId: b.vehicleId,
        customerId: b.customerId,
        customerName: `${(b as any).customer.firstName} ${(b as any).customer.lastName}`,
        vehicleName:
          (b as any).vehicle.vehicleName ||
          `${(b as any).vehicle.make} ${(b as any).vehicle.model}`,
        vehicleLicense: (b as any).vehicle.licensePlate || '',
        station: b.pickupStationId ? stationMap.get(b.pickupStationId) || '' : '',
        startDate: b.startDate.toISOString(),
        endDate: b.endDate.toISOString(),
        status: BOOKING_STATUS_DISPLAY[b.status] || b.status,
        dailyRate: (b.dailyRateCents || 0) / 100,
        totalPrice: (b.totalPriceCents || 0) / 100,
        kmIncluded: b.kmIncluded || 0,
        kmDriven: b.kmDriven || 0,
        insuranceOptions: Array.isArray(b.insuranceOptions) ? b.insuranceOptions : [],
        extras: Array.isArray(b.extrasJson) ? b.extrasJson : [],
        pickupProtocol: pickup,
        returnProtocol: ret,
      };
    });

    return buildPaginatedResult(mapped, total, params || {});
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

    return {
      id: b.id,
      vehicleId: b.vehicleId,
      customerId: b.customerId,
      customerName: `${(b as any).customer.firstName} ${(b as any).customer.lastName}`,
      vehicleName:
        (b as any).vehicle.vehicleName ||
        `${(b as any).vehicle.make} ${(b as any).vehicle.model}`,
      vehicleLicense: (b as any).vehicle.licensePlate || '',
      station: stationName,
      startDate: b.startDate.toISOString(),
      endDate: b.endDate.toISOString(),
      status: BOOKING_STATUS_DISPLAY[b.status] || b.status,
      dailyRate: (b.dailyRateCents || 0) / 100,
      totalPrice: (b.totalPriceCents || 0) / 100,
      kmIncluded: b.kmIncluded || 0,
      kmDriven: b.kmDriven || 0,
      insuranceOptions: Array.isArray(b.insuranceOptions) ? b.insuranceOptions : [],
      extras: Array.isArray(b.extrasJson) ? b.extrasJson : [],
      pickupProtocol: pickup,
      returnProtocol: ret,
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
      ...new Set(data.map((b) => b.pickupStationId).filter(Boolean) as string[]),
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
      return {
        id: b.id,
        vehicleId: b.vehicleId,
        customerId: b.customerId,
        customerName: `${(b as any).customer.firstName} ${(b as any).customer.lastName}`,
        vehicleName:
          (b as any).vehicle.vehicleName ||
          `${(b as any).vehicle.make} ${(b as any).vehicle.model}`,
        vehicleLicense: (b as any).vehicle.licensePlate || '',
        station: b.pickupStationId ? stationMap.get(b.pickupStationId) || '' : '',
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
      ...new Set(data.map((b) => b.returnStationId).filter(Boolean) as string[]),
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

    return data.map((b) => {
      const protocols = protocolsMap.get(b.id) ?? [];
      const pickup = protocols.find((p) => p.kind === 'PICKUP') ?? null;
      const ret = protocols.find((p) => p.kind === 'RETURN') ?? null;
      return {
        id: b.id,
        vehicleId: b.vehicleId,
        customerId: b.customerId,
        customerName: `${(b as any).customer.firstName} ${(b as any).customer.lastName}`,
        vehicleName:
          (b as any).vehicle.vehicleName ||
          `${(b as any).vehicle.make} ${(b as any).vehicle.model}`,
        vehicleLicense: (b as any).vehicle.licensePlate || '',
        station: b.returnStationId ? stationMap.get(b.returnStationId) || '' : '',
        startDate: b.startDate.toISOString(),
        endDate: b.endDate.toISOString(),
        status: BOOKING_STATUS_DISPLAY[b.status] || b.status,
        dailyRate: (b.dailyRateCents || 0) / 100,
        totalPrice: (b.totalPriceCents || 0) / 100,
        pickupProtocol: pickup,
        returnProtocol: ret,
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
    const updated = await this.prisma.booking.update({ where: { id }, data });
    if (updated.status === 'COMPLETED') {
      this.rentalDrivingAnalysisService.generateForBooking(orgId, id).catch(() => {});
    }
    // Generate the initial document bundle when a booking transitions INTO
    // CONFIRMED via update. Idempotent + fire-and-forget.
    if (updated.status === 'CONFIRMED' && existing.status !== 'CONFIRMED') {
      this.bookingDocumentBundleService.generateInitialBundle(orgId, id).catch(() => {});
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

    const [updated] = await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id },
        data: {
          status: 'CANCELLED' as BookingStatus,
          cancelledAt: new Date(),
        },
      }),
      this.prisma.vehicle.update({
        where: { id: booking.vehicleId },
        data: { status: 'AVAILABLE' as VehicleStatus },
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
      this.prisma.vehicle.update({
        where: { id: booking.vehicleId },
        data: { status: 'AVAILABLE' as VehicleStatus },
      }),
    ]);

    return updated;
  }
}

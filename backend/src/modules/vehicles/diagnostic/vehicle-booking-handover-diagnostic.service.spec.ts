import { VehicleBookingHandoverDiagnosticService } from './vehicle-booking-handover-diagnostic.service';

const NOW = new Date('2026-06-24T10:00:00.000Z');

function vehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'veh-1',
    organizationId: 'org-1',
    licensePlate: 'KS-FS 123',
    status: 'AVAILABLE',
    tankCapacityLiters: 50,
    ...overrides,
  };
}

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bk-1',
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    status: 'CONFIRMED',
    startDate: new Date('2026-06-25T08:00:00.000Z'),
    endDate: new Date('2026-06-26T08:00:00.000Z'),
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-06-20T08:00:00.000Z'),
    ...overrides,
  };
}

describe('VehicleBookingHandoverDiagnosticService', () => {
  const prisma = {
    organization: { findMany: jest.fn() },
    vehicle: { findMany: jest.fn() },
    booking: { findMany: jest.fn() },
    bookingHandoverProtocol: { findMany: jest.fn() },
  };

  const fleetStatusDerivation = {
    deriveFleetStatusContext: jest.fn(),
  };

  let service: VehicleBookingHandoverDiagnosticService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.organization.findMany.mockResolvedValue([{ id: 'org-1', timezone: 'Europe/Berlin' }]);
    prisma.vehicle.findMany.mockResolvedValue([vehicle()]);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.bookingHandoverProtocol.findMany.mockResolvedValue([]);
    fleetStatusDerivation.deriveFleetStatusContext.mockReturnValue({
      status: 'Available',
      maintenanceCtx: {},
      bookingDto: {},
      liveKmDriven: null,
      odometerKm: null,
      fuelPercent: null,
      evSoc: null,
    });
    service = new VehicleBookingHandoverDiagnosticService(
      prisma as any,
      fleetStatusDerivation as any,
    );
  });

  it('flags raw RESERVED without reservation window', async () => {
    prisma.vehicle.findMany.mockResolvedValue([vehicle({ status: 'RESERVED' })]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.raw_reserved_without_window).toBe(1);
  });

  it('flags raw RENTED without ACTIVE booking', async () => {
    prisma.vehicle.findMany.mockResolvedValue([vehicle({ status: 'RENTED' })]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.raw_rented_without_active_booking).toBe(1);
  });

  it('flags ACTIVE booking with raw AVAILABLE vehicle', async () => {
    prisma.vehicle.findMany.mockResolvedValue([vehicle({ status: 'AVAILABLE' })]);
    prisma.booking.findMany.mockResolvedValue([
      booking({ status: 'ACTIVE', startDate: new Date('2026-06-20T08:00:00.000Z') }),
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.active_booking_raw_available).toBe(1);
  });

  it('flags pickup completed but booking not ACTIVE', async () => {
    prisma.booking.findMany.mockResolvedValue([booking({ status: 'CONFIRMED' })]);
    prisma.bookingHandoverProtocol.findMany.mockResolvedValue([
      {
        id: 'hp-1',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        vehicleId: 'veh-1',
        kind: 'PICKUP',
        performedAt: NOW,
      },
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.pickup_completed_booking_not_active).toBe(1);
  });

  it('flags return completed but booking still ACTIVE', async () => {
    prisma.booking.findMany.mockResolvedValue([booking({ status: 'ACTIVE' })]);
    prisma.bookingHandoverProtocol.findMany.mockResolvedValue([
      {
        id: 'hp-2',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        vehicleId: 'veh-1',
        kind: 'RETURN',
        performedAt: NOW,
      },
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.return_completed_booking_still_active).toBe(1);
  });

  it('flags multiple ACTIVE bookings per vehicle', async () => {
    prisma.booking.findMany.mockResolvedValue([
      booking({ id: 'bk-a', status: 'ACTIVE' }),
      booking({ id: 'bk-b', status: 'ACTIVE' }),
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.multiple_active_bookings_per_vehicle).toBe(2);
  });

  it('flags multiple bookings in reservation window', async () => {
    prisma.booking.findMany.mockResolvedValue([
      booking({ id: 'bk-a', status: 'CONFIRMED' }),
      booking({ id: 'bk-b', status: 'PENDING' }),
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.multiple_reservation_window_bookings).toBe(2);
  });

  it('flags future booking that legacy logic would reserve', async () => {
    prisma.booking.findMany.mockResolvedValue([
      booking({
        status: 'CONFIRMED',
        startDate: new Date('2026-07-10T08:00:00.000Z'),
        endDate: new Date('2026-07-12T08:00:00.000Z'),
      }),
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.future_booking_legacy_reserved_trigger).toBe(1);
  });

  it('flags canonical derivation divergence', async () => {
    prisma.vehicle.findMany.mockResolvedValue([vehicle({ status: 'RENTED' })]);
    fleetStatusDerivation.deriveFleetStatusContext.mockReturnValue({
      status: 'Available',
      maintenanceCtx: {},
      bookingDto: {},
      liveKmDriven: null,
      odometerKm: null,
      fuelPercent: null,
      evSoc: null,
    });

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.endpoint_canonical_derivation_divergence).toBe(1);
  });

  it('flags booking date inconsistencies', async () => {
    prisma.booking.findMany.mockResolvedValue([
      booking({
        startDate: new Date('2026-06-26T08:00:00.000Z'),
        endDate: new Date('2026-06-25T08:00:00.000Z'),
      }),
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.booking_date_inconsistency).toBe(1);
  });

  it('flags missing organization timezone', async () => {
    prisma.organization.findMany.mockResolvedValue([{ id: 'org-1', timezone: null }]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
    });

    expect(report.summary.byCheck.organization_timezone_missing_or_invalid).toBe(1);
  });

  it('masks sample ids in report output', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      vehicle({
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        status: 'RESERVED',
      }),
    ]);

    const report = await service.runDiagnostic({
      organizationId: 'org-1',
      referenceNow: NOW,
      sampleLimit: 5,
    });

    const check = report.checks.find((c) => c.checkId === 'raw_reserved_without_window');
    expect(check?.sampleVehicleIds[0]).toMatch(/^aaaa…eeee$/);
  });
});

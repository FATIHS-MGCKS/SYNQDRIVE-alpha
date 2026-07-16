import { VehicleStatus } from '@prisma/client';
import { VehicleBookingHandoverDiagnosticService } from './vehicle-booking-handover-diagnostic.service';
import { VehicleBookingHandoverRepairService } from './vehicle-booking-handover-repair.service';

const NOW = new Date('2026-06-24T10:00:00.000Z');

function emptyDiagnosticReport() {
  return {
    mode: 'diagnostic' as const,
    dryRun: true as const,
    readOnly: true as const,
    generatedAt: NOW.toISOString(),
    referenceNow: NOW.toISOString(),
    organizationId: 'org-1',
    organizationCount: 1,
    vehiclesScanned: 0,
    bookingsScanned: 0,
    handoversScanned: 0,
    summary: {
      totalFindings: 0,
      errors: 0,
      warnings: 0,
      infos: 0,
      byCategory: {
        vehicle_raw_status: 0,
        booking_status: 0,
        handover_integrity: 0,
        reservation_window: 0,
        cross_org: 0,
        timing: 0,
        derivation: 0,
        organization_config: 0,
      },
      byCheck: {},
    },
    byOrganization: [],
    checks: [],
  };
}

describe('VehicleBookingHandoverRepairService', () => {
  const prisma = {
    organization: { findMany: jest.fn() },
    vehicle: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    booking: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn() },
    bookingHandoverProtocol: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const diagnostic = { runDiagnostic: jest.fn() };
  const activityLog = { log: jest.fn() };

  let service: VehicleBookingHandoverRepairService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'veh-1', organizationId: 'org-1', licensePlate: 'KS-FS 123', status: VehicleStatus.RESERVED },
    ]);
    prisma.booking.findMany.mockResolvedValue([]);
    prisma.bookingHandoverProtocol.findMany.mockResolvedValue([]);
    diagnostic.runDiagnostic.mockResolvedValue(emptyDiagnosticReport());
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma));
    service = new VehicleBookingHandoverRepairService(
      prisma as any,
      diagnostic as unknown as VehicleBookingHandoverDiagnosticService,
      activityLog as any,
    );
  });

  it('plans clear_stale_reserved_vehicle_status in dry-run', async () => {
    const report = await service.runRepair({ organizationId: 'org-1', referenceNow: NOW });

    expect(report.dryRun).toBe(true);
    expect(report.summary.planned).toBe(1);
    expect(report.actions[0]?.actionId).toBe('clear_stale_reserved_vehicle_status');
    expect(report.actions[0]?.applied).toBe(false);
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('applies clear_stale_reserved_vehicle_status with --apply semantics', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-1',
      status: VehicleStatus.RESERVED,
    });
    prisma.vehicle.update.mockResolvedValue({});

    const report = await service.runRepair({
      organizationId: 'org-1',
      apply: true,
      referenceNow: NOW,
    });

    expect(report.summary.applied).toBe(1);
    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'veh-1' },
      data: { status: VehicleStatus.AVAILABLE },
    });
    expect(activityLog.log).toHaveBeenCalled();
    expect(diagnostic.runDiagnostic).toHaveBeenCalledTimes(2);
  });

  it('plans complete_booking_after_return_protocol for ACTIVE + RETURN', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'veh-1', organizationId: 'org-1', licensePlate: 'KS-FS 123', status: VehicleStatus.RENTED },
    ]);
    prisma.booking.findMany.mockResolvedValue([
      {
        id: 'bk-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        status: 'ACTIVE',
        startDate: new Date('2026-06-20T08:00:00.000Z'),
        endDate: new Date('2026-06-26T08:00:00.000Z'),
        completedAt: null,
        notes: null,
      },
    ]);
    prisma.bookingHandoverProtocol.findMany.mockResolvedValue([
      {
        id: 'hp-1',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        vehicleId: 'veh-1',
        kind: 'PICKUP',
        performedAt: NOW,
        odometerKm: 1000,
      },
      {
        id: 'hp-2',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        vehicleId: 'veh-1',
        kind: 'RETURN',
        performedAt: NOW,
        odometerKm: 1200,
      },
    ]);

    const report = await service.runRepair({ organizationId: 'org-1', referenceNow: NOW });
    const action = report.actions.find((a) => a.actionId === 'complete_booking_after_return_protocol');
    expect(action).toBeDefined();
  });

  it('skips idempotent apply when booking already COMPLETED', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'veh-1', organizationId: 'org-1', licensePlate: 'KS-FS 123', status: VehicleStatus.RENTED },
    ]);
    prisma.booking.findMany.mockResolvedValue([
      {
        id: 'bk-1',
        organizationId: 'org-1',
        vehicleId: 'veh-1',
        status: 'ACTIVE',
        startDate: new Date('2026-06-20T08:00:00.000Z'),
        endDate: new Date('2026-06-26T08:00:00.000Z'),
        completedAt: null,
        notes: null,
      },
    ]);
    prisma.bookingHandoverProtocol.findMany.mockResolvedValue([
      {
        id: 'hp-1',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        vehicleId: 'veh-1',
        kind: 'PICKUP',
        performedAt: NOW,
        odometerKm: 1000,
      },
      {
        id: 'hp-2',
        organizationId: 'org-1',
        bookingId: 'bk-1',
        vehicleId: 'veh-1',
        kind: 'RETURN',
        performedAt: NOW,
        odometerKm: 1200,
      },
    ]);
    prisma.booking.findFirst.mockResolvedValue({
      id: 'bk-1',
      vehicleId: 'veh-1',
      status: 'COMPLETED',
      completedAt: NOW,
      notes: null,
    });

    const report = await service.runRepair({
      organizationId: 'org-1',
      apply: true,
      referenceNow: NOW,
    });

    expect(report.summary.skipped).toBeGreaterThanOrEqual(1);
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });

  it('reports unresolved RENTED without completed return evidence', async () => {
    prisma.vehicle.findMany.mockResolvedValue([
      { id: 'veh-1', organizationId: 'org-1', licensePlate: 'KS-FS 123', status: VehicleStatus.RENTED },
    ]);

    const report = await service.runRepair({ organizationId: 'org-1', referenceNow: NOW });

    expect(report.unresolved.some((u) => u.ruleId === 'raw_rented_after_completed_return')).toBe(true);
    expect(report.actions.some((a) => a.actionId === 'clear_stale_rented_after_return')).toBe(false);
  });
});

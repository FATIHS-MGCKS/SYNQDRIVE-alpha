import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OperatorTireMeasureService } from './operator-tire-measure.service';
import { OperatorTireMeasureAuditService } from './operator-tire-measure-audit.service';

describe('OperatorTireMeasureService', () => {
  const orgA = 'org-a';
  const orgB = 'org-b';
  const vehicleId = 'veh-1';
  const setupId = 'setup-1';

  const prisma = {
    vehicle: { findFirst: jest.fn() },
    vehicleTireSetup: { findFirst: jest.fn() },
    booking: { findFirst: jest.fn() },
    bookingHandoverSession: { findFirst: jest.fn() },
    station: { findFirst: jest.fn() },
    operatorTireMeasurementIdempotency: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    vehicleTireTreadMeasurement: { findUnique: jest.fn() },
  };

  const tireLifecycle = { recordMeasurement: jest.fn() };
  const audit = { log: jest.fn() };

  const svc = new OperatorTireMeasureService(
    prisma as any,
    tireLifecycle as any,
    audit as any,
  );

  const baseDto = {
    captureKey: 'cap-key-1',
    confirmed: true,
    tireSetupId: setupId,
    frontLeftMm: 5.5,
    frontRightMm: 5.4,
    rearLeftMm: 4.2,
    rearRightMm: 4.1,
    measuredAt: '2026-07-25T10:00:00.000Z',
    odometerKm: 120_000,
    source: 'manual' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.vehicle.findFirst.mockResolvedValue({ id: vehicleId });
    prisma.vehicleTireSetup.findFirst.mockResolvedValue({
      id: setupId,
      tireSeason: 'SUMMER',
    });
    prisma.operatorTireMeasurementIdempotency.findUnique.mockResolvedValue(null);
    tireLifecycle.recordMeasurement.mockResolvedValue({
      measurement: {
        id: 'meas-1',
        tireSetupId: setupId,
        frontLeftMm: 5.5,
        frontRightMm: 5.4,
        rearLeftMm: 4.2,
        rearRightMm: 4.1,
      },
    });
    prisma.operatorTireMeasurementIdempotency.create.mockResolvedValue({});
  });

  it('captures valid measurement and triggers tire health pipeline', async () => {
    const result = await svc.capture(orgA, vehicleId, baseDto, { userId: 'user-1' });
    expect(result.measurementId).toBe('meas-1');
    expect(result.idempotentReplay).toBe(false);
    expect(tireLifecycle.recordMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId,
        tireSetupId: setupId,
        frontLeftMm: 5.5,
        userId: 'user-1',
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'OPERATOR_TIRE_MEASUREMENT_CAPTURED' }),
    );
  });

  it('rejects negative tread values', async () => {
    await expect(
      svc.capture(orgA, vehicleId, { ...baseDto, frontLeftMm: -1 }, { userId: 'user-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tireLifecycle.recordMeasurement).not.toHaveBeenCalled();
  });

  it('rejects unrealistic tread above 20 mm', async () => {
    await expect(
      svc.capture(orgA, vehicleId, { ...baseDto, rearRightMm: 22 }, { userId: 'user-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires manual confirmation', async () => {
    await expect(
      svc.capture(orgA, vehicleId, { ...baseDto, confirmed: false }, { userId: 'user-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('replays idempotent capture without duplicate measurement', async () => {
    prisma.operatorTireMeasurementIdempotency.findUnique.mockResolvedValue({
      measurementId: 'meas-existing',
      measurement: {
        id: 'meas-existing',
        tireSetupId: setupId,
        frontLeftMm: 5.5,
        frontRightMm: 5.4,
        rearLeftMm: 4.2,
        rearRightMm: 4.1,
      },
    });
    const result = await svc.capture(orgA, vehicleId, baseDto, { userId: 'user-1' });
    expect(result.idempotentReplay).toBe(true);
    expect(tireLifecycle.recordMeasurement).not.toHaveBeenCalled();
  });

  it('rejects vehicle from foreign organization', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(
      svc.capture(orgB, vehicleId, baseDto, { userId: 'user-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('links handover booking context when provided', async () => {
    prisma.booking.findFirst.mockResolvedValue({ id: 'book-1' });
    await svc.capture(
      orgA,
      vehicleId,
      { ...baseDto, bookingId: 'book-1' },
      { userId: 'user-1' },
    );
    expect(tireLifecycle.recordMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'book-1' }),
    );
  });
});

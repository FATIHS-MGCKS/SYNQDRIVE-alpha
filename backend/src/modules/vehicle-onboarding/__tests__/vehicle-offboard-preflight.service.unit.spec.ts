import { VehicleOffboardPreflightService } from '../offboarding/vehicle-offboard-preflight.service';

describe('VehicleOffboardPreflightService', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-1';

  function build(prisma: Record<string, unknown>) {
    return new VehicleOffboardPreflightService(prisma as any);
  }

  it('blocks ACTIVE_RENTAL when booking is ACTIVE', async () => {
    const prisma = {
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: vehicleId, status: 'AVAILABLE' }) },
      booking: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'b1' })
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
      },
      vehicleTrip: { findFirst: jest.fn().mockResolvedValue(null) },
      bookingHandoverDraft: { findFirst: jest.fn().mockResolvedValue(null) },
      vehicleDamage: { findFirst: jest.fn().mockResolvedValue(null) },
      serviceCase: { findFirst: jest.fn().mockResolvedValue(null) },
      orgInvoice: { findFirst: jest.fn().mockResolvedValue(null) },
      orgTask: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const svc = build(prisma);
    const result = await svc.assess({ organizationId, vehicleId });
    expect(result.allowed).toBe(false);
    expect(result.blockingReasons).toContain('ACTIVE_RENTAL');
  });

  it('allows offboard with OPEN_DAMAGE_WARNING only', async () => {
    const prisma = {
      vehicle: { findFirst: jest.fn().mockResolvedValue({ id: vehicleId, status: 'AVAILABLE' }) },
      booking: { findFirst: jest.fn().mockResolvedValue(null) },
      vehicleTrip: { findFirst: jest.fn().mockResolvedValue(null) },
      bookingHandoverDraft: { findFirst: jest.fn().mockResolvedValue(null) },
      vehicleDamage: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'OPEN',
          repairedAt: null,
          repairStartedAt: null,
        }),
      },
      serviceCase: { findFirst: jest.fn().mockResolvedValue(null) },
      orgInvoice: { findFirst: jest.fn().mockResolvedValue(null) },
      orgTask: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const svc = build(prisma);
    const result = await svc.assess({ organizationId, vehicleId });
    expect(result.allowed).toBe(true);
    expect(result.warnings).toContain('OPEN_DAMAGE_WARNING');
  });
});

import { BrakeRentalHealthReviewService } from './brake-rental-health-review.service';

describe('BrakeRentalHealthReviewService', () => {
  const prisma = {
    brakeRentalHealthReviewOverride: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    vehicle: { findFirst: jest.fn() },
  };
  const audit = { record: jest.fn() };

  const svc = new BrakeRentalHealthReviewService(
    prisma as any,
    audit as any,
    { invalidate: jest.fn() } as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects cross-tenant vehicle access', () => {
    expect(() => svc.assertOrgAccess('org-a', 'org-b')).toThrow(/Cross-tenant/);
  });

  it('creates override scoped to organization and vehicle', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.brakeRentalHealthReviewOverride.updateMany.mockResolvedValue({ count: 0 });
    prisma.brakeRentalHealthReviewOverride.create.mockResolvedValue({
      id: 'ov-1',
      expiresAt: new Date(Date.now() + 86400000),
    });

    await svc.createOverride({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      reason: 'Freigabe nach Werkstattprüfung dokumentiert',
      grantedByUserId: 'user-1',
      expiresAt: new Date(Date.now() + 86400000),
    });

    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
      where: { id: 'veh-1', organizationId: 'org-1' },
      select: { id: true },
    });
    expect(audit.record).toHaveBeenCalled();
  });
});

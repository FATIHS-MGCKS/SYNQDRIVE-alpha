import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrganizationStatus } from '@prisma/client';
import { VehicleOwnershipGuard } from './vehicle-ownership.guard';
import { ORGANIZATION_LIFECYCLE_DENIED_CODE } from './organization-lifecycle-access.policy';

function buildContext(input: {
  vehicleId?: string;
  user?: Record<string, unknown>;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        params: input.vehicleId ? { vehicleId: input.vehicleId } : {},
        user: input.user,
      }),
    }),
  } as ExecutionContext;
}

describe('VehicleOwnershipGuard — organization lifecycle + membership', () => {
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
    vehicle: { findFirst: jest.fn() },
  };
  let guard: VehicleOwnershipGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new VehicleOwnershipGuard(prisma as never);
  });

  const tenant = { id: 'u-1', platformRole: 'USER', organizationId: 'org-a' };

  it('allows ACTIVE org with ACTIVE membership', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm-1' });
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-1',
      organization: { status: OrganizationStatus.ACTIVE },
    });
    await expect(
      guard.canActivate(buildContext({ vehicleId: 'veh-1', user: tenant })),
    ).resolves.toBe(true);
  });

  it('denies SUSPENDED org after membership check', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm-1' });
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-1',
      organization: { status: OrganizationStatus.SUSPENDED },
    });
    await expect(
      guard.canActivate(buildContext({ vehicleId: 'veh-1', user: tenant })),
    ).rejects.toMatchObject({
      response: { code: ORGANIZATION_LIFECYCLE_DENIED_CODE },
    });
  });

  it('denies without ACTIVE membership', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);
    await expect(
      guard.canActivate(buildContext({ vehicleId: 'veh-1', user: tenant })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.vehicle.findFirst).not.toHaveBeenCalled();
  });

  it('MASTER_ADMIN bypasses lifecycle', async () => {
    await expect(
      guard.canActivate(
        buildContext({
          vehicleId: 'veh-1',
          user: { id: 'ma', platformRole: 'MASTER_ADMIN' },
        }),
      ),
    ).resolves.toBe(true);
    expect(prisma.vehicle.findFirst).not.toHaveBeenCalled();
  });

  it('foreign vehicle is not found', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'm-1' });
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(
      guard.canActivate(buildContext({ vehicleId: 'veh-x', user: tenant })),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
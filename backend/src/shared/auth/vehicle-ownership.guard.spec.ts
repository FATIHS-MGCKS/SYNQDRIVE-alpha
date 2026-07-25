import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { VehicleOwnershipGuard } from './vehicle-ownership.guard';

function buildContext(input: {
  vehicleId?: string;
  user?: {
    id: string;
    platformRole?: string;
    organizationId?: string;
  };
}) {
  const request: Record<string, unknown> = {
    params: input.vehicleId ? { vehicleId: input.vehicleId } : {},
    user: input.user,
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

describe('VehicleOwnershipGuard', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn(), findUnique: jest.fn() },
    organizationMembership: { findFirst: jest.fn() },
  };

  let guard: VehicleOwnershipGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new VehicleOwnershipGuard(prisma as never);
  });

  it('rejects foreign vehicle for tenant JWT org (404)', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        buildContext({
          vehicleId: 'veh-foreign',
          user: { id: 'user-1', organizationId: 'org-a' },
        }) as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects tenant user without active membership (403)', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        buildContext({
          vehicleId: 'veh-1',
          user: { id: 'user-1', organizationId: 'org-a' },
        }) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows tenant user with active membership and stamps tenantId', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
    prisma.organizationMembership.findFirst.mockResolvedValue({ id: 'mem-1' });

    const ctx = buildContext({
      vehicleId: 'veh-1',
      user: { id: 'user-1', organizationId: 'org-a' },
    });
    const request = ctx.switchToHttp().getRequest();

    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
    expect(request.tenantId).toBe('org-a');
  });

  it('allows MASTER_ADMIN without membership lookup', async () => {
    prisma.vehicle.findUnique.mockResolvedValue({ organizationId: 'org-b' });

    const ctx = buildContext({
      vehicleId: 'veh-1',
      user: { id: 'admin-1', platformRole: 'MASTER_ADMIN' },
    });

    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
    expect(ctx.switchToHttp().getRequest().tenantId).toBe('org-b');
  });
});

import { ConflictException } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service';
import {
  PLATFORM_PRUNE_DISABLED_ACTION,
  PLATFORM_PRUNE_DISABLED_CODE,
  platformPruneDisabledException,
} from './platform-prune.errors';

describe('VO5C-P2B4-0 PlatformAdminService.pruneMasterData fail-closed', () => {
  function serviceWithMocks() {
    const prisma = {
      booking: { deleteMany: jest.fn() },
      customer: { deleteMany: jest.fn() },
      prospect: { updateMany: jest.fn(), deleteMany: jest.fn() },
      vehicle: { deleteMany: jest.fn() },
      organization: { deleteMany: jest.fn() },
      user: { deleteMany: jest.fn() },
      $transaction: jest.fn(),
      $executeRaw: jest.fn(),
    };
    const service = Object.create(PlatformAdminService.prototype) as PlatformAdminService;
    Object.assign(service, { prisma });
    return { service, prisma };
  }

  it('stable 409 prune retirement contract', () => {
    const err = platformPruneDisabledException();
    expect(err.getResponse()).toMatchObject({
      code: PLATFORM_PRUNE_DISABLED_CODE,
      action: PLATFORM_PRUNE_DISABLED_ACTION,
    });
  });

  it('never touches prisma', async () => {
    const { service, prisma } = serviceWithMocks();
    await expect(service.pruneMasterData()).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.booking.deleteMany).not.toHaveBeenCalled();
    expect(prisma.vehicle.deleteMany).not.toHaveBeenCalled();
    expect(prisma.organization.deleteMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});

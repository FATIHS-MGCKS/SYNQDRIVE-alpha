import { NotFoundException } from '@nestjs/common';
import { MisuseAttributionScope, TripAssignmentStatus } from '@prisma/client';
import { MisuseCasesService } from './misuse-cases.service';

describe('MisuseCasesService', () => {
  const prisma = {
    misuseCase: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const service = new MisuseCasesService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('lists only org-scoped cases', async () => {
    prisma.misuseCase.findMany.mockResolvedValue([]);
    prisma.misuseCase.count.mockResolvedValue(0);

    await service.list('org-a', { vehicleId: 'veh-1' });

    expect(prisma.misuseCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-a',
          vehicleId: 'veh-1',
        }),
      }),
    );
  });

  it('customer filter restricts to BOOKING_CUSTOMER attribution', async () => {
    prisma.misuseCase.findMany.mockResolvedValue([]);
    prisma.misuseCase.count.mockResolvedValue(0);

    await service.list('org-a', { customerId: 'cust-1' });

    expect(prisma.misuseCase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-a',
          customerId: 'cust-1',
          attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
          assignmentStatusSnapshot: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
          isPrivateTripSnapshot: false,
        },
      }),
    );
  });

  it('getById throws when case is outside org', async () => {
    prisma.misuseCase.findFirst.mockResolvedValue(null);
    await expect(service.getById('org-a', 'case-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MisuseCasesController routes', () => {
  it('has no write endpoints in controller metadata', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, 'misuse-cases.controller.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/@(Post|Put|Patch|Delete)\(/);
  });
});

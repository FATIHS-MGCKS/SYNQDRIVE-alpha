import { ConflictException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PrismaService } from '@shared/database/prisma.service';
import { DriverScoreService } from '../vehicle-intelligence/trips/driver-score.service';
import { CustomerTimelineService } from './customer-timeline.service';
import { CustomerEligibilityService } from './customer-eligibility.service';

describe('CustomersService', () => {
  const prisma = {
    customer: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    booking: { groupBy: jest.fn() },
    orgInvoice: { groupBy: jest.fn() },
    fine: { groupBy: jest.fn() },
  } as unknown as PrismaService;

  const driverScoreService = {
    getScoresForSubjects: jest.fn().mockResolvedValue(new Map()),
  } as unknown as DriverScoreService;

  const timeline = {
    addEvent: jest.fn().mockResolvedValue({}),
  } as unknown as CustomerTimelineService;

  const eligibility = {} as CustomerEligibilityService;

  const service = new CustomersService(
    prisma,
    driverScoreService,
    timeline,
    eligibility,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates customer with NOT_ASSESSED risk by default', async () => {
    (prisma.customer.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.customer.create as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ id: 'c1', ...data }),
    );

    const result = await service.create('org1', {
      firstName: 'Max',
      lastName: 'Mustermann',
      email: 'max@example.com',
    });

    expect(prisma.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          riskLevel: 'NOT_ASSESSED',
          riskSource: 'NONE',
          emailNormalized: 'max@example.com',
        }),
      }),
    );
    expect(result.riskLevel).toBe('NOT_ASSESSED');
  });

  it('rejects hard duplicate email without override', async () => {
    (prisma.customer.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'existing',
        firstName: 'Anna',
        lastName: 'Test',
        email: 'max@example.com',
      },
    ]);

    await expect(
      service.create('org1', {
        firstName: 'Max',
        lastName: 'Mustermann',
        email: 'max@example.com',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

import { ConflictException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PrismaService } from '@shared/database/prisma.service';
import { DriverScoreService } from '../vehicle-intelligence/trips/driver-score.service';
import { CustomerTimelineService } from './customer-timeline.service';
import { CustomerEligibilityService } from './customer-eligibility.service';
import { CustomerVerificationService } from '@modules/customer-verification/customer-verification.service';

describe('CustomersService', () => {
  const prisma = {
    customer: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findFirstOrThrow: jest.fn(),
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

  const customerVerification = {
    applyVerificationPlanFromCreate: jest.fn().mockResolvedValue({ checks: [] }),
  } as unknown as CustomerVerificationService;

  const service = new CustomersService(
    prisma,
    driverScoreService,
    timeline,
    eligibility,
    customerVerification,
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
    expect(customerVerification.applyVerificationPlanFromCreate).toHaveBeenCalled();
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

  it('updateStatus changes status within org scope', async () => {
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      organizationId: 'org1',
      status: 'ACTIVE',
    });
    (prisma.customer.update as jest.Mock).mockResolvedValue({
      id: 'c1',
      status: 'SUSPENDED',
    });

    const result = await service.updateStatus('org1', 'c1', { status: 'SUSPENDED', reason: 'test' }, 'u1');

    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'SUSPENDED' },
    });
    expect(timeline.addEvent).toHaveBeenCalled();
    expect(result.status).toBe('SUSPENDED');
  });

  it('updateRisk sets manual risk within org scope', async () => {
    (prisma.customer.findFirstOrThrow as jest.Mock).mockResolvedValue({
      id: 'c1',
      organizationId: 'org1',
    });
    (prisma.customer.update as jest.Mock).mockResolvedValue({
      id: 'c1',
      riskLevel: 'HIGH',
    });

    const result = await service.updateRisk(
      'org1',
      'c1',
      { riskLevel: 'HIGH', riskReason: 'incidents' },
      'u1',
    );

    expect(prisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ riskLevel: 'HIGH' }),
      }),
    );
    expect(timeline.addEvent).toHaveBeenCalled();
    expect(result.riskLevel).toBe('HIGH');
  });
});

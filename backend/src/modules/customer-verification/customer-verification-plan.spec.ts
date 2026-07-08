import {
  CustomerVerificationCheckKind,
  CustomerVerificationProvider,
} from '@prisma/client';
import { CustomerVerificationPlanDto } from '@modules/customers/dto/verification-plan.dto';
import { CustomerVerificationService } from './customer-verification.service';
import { PrismaService } from '@shared/database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CustomerVerificationReadModelService } from './customer-verification-read-model.service';
import { DiditService } from './providers/didit/didit.service';

describe('CustomerVerificationService.applyVerificationPlanFromCreate', () => {
  const prisma = {
    customer: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    customerEligibilityPolicy: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    customerVerificationCheck: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    customerTimelineEvent: { create: jest.fn() },
    customerDocument: { findMany: jest.fn() },
  } as unknown as PrismaService;

  const diditService = {} as DiditService;
  const configService = { get: jest.fn().mockReturnValue(90) } as unknown as ConfigService;
  const readModelHelper = {
    isTerminalStatus: jest.fn().mockReturnValue(false),
  } as unknown as CustomerVerificationReadModelService;

  const service = new CustomerVerificationService(
    prisma,
    diditService,
    configService,
    readModelHelper,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.customer.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' });
    (prisma.customerEligibilityPolicy.findUnique as jest.Mock).mockResolvedValue({
      organizationId: 'org1',
      requireVerifiedIdForConfirmedBooking: false,
      requireVerifiedLicenseForConfirmedBooking: false,
      requireVerifiedIdForPickup: true,
      requireVerifiedLicenseForPickup: true,
    });
    (prisma.customerVerificationCheck.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.customerVerificationCheck.create as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ id: `chk-${data.kind}`, ...data }),
    );
    (prisma.customerDocument.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.customer.update as jest.Mock).mockResolvedValue({});
    (prisma.customerTimelineEvent.create as jest.Mock).mockResolvedValue({});
    jest.spyOn(service, 'syncCustomerReadModel').mockResolvedValue(undefined);
  });

  it('creates planned checks without setting verified read model fields', async () => {
    const result = await service.applyVerificationPlanFromCreate({
      organizationId: 'org1',
      customerId: 'c1',
      userId: 'u1',
      plan: {
        idDocument: { method: 'MANUAL' },
        drivingLicense: { method: 'PICKUP' },
        proofOfAddress: { method: 'NOT_REQUIRED' },
      } as CustomerVerificationPlanDto,
    });

    expect(result.checks).toHaveLength(2);
    expect(prisma.customerVerificationCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'ID_DOCUMENT',
          provider: CustomerVerificationProvider.MANUAL,
          status: 'NOT_STARTED',
        }),
      }),
    );
    expect(prisma.customerVerificationCheck.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'DRIVING_LICENSE',
          provider: CustomerVerificationProvider.MANUAL,
          status: 'NOT_STARTED',
          decisionJson: expect.objectContaining({ method: 'PICKUP', plannedFor: 'PICKUP' }),
        }),
      }),
    );
    expect(prisma.customerTimelineEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Verifikationsweg festgelegt',
        }),
      }),
    );
  });

  it('skips proof of address when not required', async () => {
    await service.applyVerificationPlanFromCreate({
      organizationId: 'org1',
      customerId: 'c1',
      plan: {
        proofOfAddress: { method: 'NOT_REQUIRED' },
        idDocument: { method: 'DEFERRED' },
        drivingLicense: { method: 'DEFERRED' },
      } as CustomerVerificationPlanDto,
    });

    const createCalls = (prisma.customerVerificationCheck.create as jest.Mock).mock.calls;
    const kinds = createCalls.map((call) => call[0].data.kind as CustomerVerificationCheckKind);
    expect(kinds).not.toContain('PROOF_OF_ADDRESS');
  });
});

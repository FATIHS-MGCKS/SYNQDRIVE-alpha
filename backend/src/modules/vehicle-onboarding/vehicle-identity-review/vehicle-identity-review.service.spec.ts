import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VehicleIdentityReviewService } from './vehicle-identity-review.service';

describe('VehicleIdentityReviewService', () => {
  const prisma = {
    vehicle: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    vehicleLatestState: { findUnique: jest.fn() },
    vehicleMotionPhysicsReference: { findFirst: jest.fn() },
    vehicleDataSourceLink: { findFirst: jest.fn() },
    vehicleDocumentExtraction: { findFirst: jest.fn() },
  };

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'vehicleIdentityP2') return { enabled: true };
      if (key === 'documentExtraction') {
        return { zb1RegistrationCertificateExtractionEnabled: false };
      }
      return undefined;
    }),
  };

  let service: VehicleIdentityReviewService;

  beforeEach(() => {
    jest.clearAllMocks();
    (config.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'vehicleIdentityP2') return { enabled: true };
      if (key === 'documentExtraction') {
        return { zb1RegistrationCertificateExtractionEnabled: false };
      }
      return undefined;
    });
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-1',
      vin: 'VIN1',
      make: 'VW',
      model: 'Golf',
      year: 2020,
      fuelType: 'Diesel',
    });
    prisma.vehicleLatestState.findUnique.mockResolvedValue({ dimoTokenId: 42 });
    prisma.vehicleMotionPhysicsReference.findFirst.mockResolvedValue(null);
    prisma.vehicleDataSourceLink.findFirst.mockResolvedValue(null);
    prisma.vehicle.update.mockResolvedValue({});
    service = new VehicleIdentityReviewService(
      prisma as never,
      config as unknown as ConfigService,
    );
  });

  it('throws when P2 flag is off', async () => {
    (config.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'vehicleIdentityP2') return { enabled: false };
      return undefined;
    });
    await expect(
      service.getReviewSnapshot('org-1', 'veh-1', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces tenant isolation on vehicle lookup', async () => {
    prisma.vehicle.findFirst.mockResolvedValue(null);
    await expect(
      service.getReviewSnapshot('org-other', 'veh-1', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validate-confirmations is review-only (no persistence writes)', async () => {
    const result = await service.validateConfirmations('org-1', 'veh-1', {
      confirmations: [{ fieldCode: 'manualPowerKind', confirmed: true }],
    });
    expect(result.persisted).toBe(false);
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
    expect(prisma.vehicleMotionPhysicsReference.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          vehicleId: 'veh-1',
        }),
      }),
    );
  });
});

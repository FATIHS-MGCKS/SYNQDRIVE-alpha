import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { assertHmOnlyCanonicalProviderRecord } from './hm-only-canonical-registration-resume';

describe('assertHmOnlyCanonicalProviderRecord error contract (main parity)', () => {
  const input = {
    dto: { hmVehicleId: 'hm-1', organizationId: 'org-a' },
    access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: 'u1' },
  };

  it('NotFoundException when HM mirror missing', async () => {
    const prisma = {
      highMobilityVehicle: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    await expect(assertHmOnlyCanonicalProviderRecord(prisma as never, input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('BadRequestException clearance message preserves current status', async () => {
    const prisma = {
      highMobilityVehicle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'hm-1',
          organizationId: 'org-a',
          vin: 'VIN1',
          clearanceStatus: 'PENDING',
          sourceMode: 'HM_ONLY',
          synqdriveVehicleId: null,
          registrationState: 'NOT_REGISTERED',
        }),
      },
      organization: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    };
    await expect(assertHmOnlyCanonicalProviderRecord(prisma as never, input)).rejects.toThrow(
      /clearance is not APPROVED \(current: PENDING\)/,
    );
  });

  it('VehicleOnboardingError SOURCE_ALREADY_REGISTERED for offboarded VIN', async () => {
    const prisma = {
      highMobilityVehicle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'hm-1',
          organizationId: 'org-a',
          vin: 'VIN1',
          clearanceStatus: 'APPROVED',
          sourceMode: 'HM_ONLY',
          synqdriveVehicleId: null,
          registrationState: 'NOT_REGISTERED',
        }),
      },
      organization: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'veh-off',
          organizationId: 'org-a',
          registryLifecycle: 'OFFBOARDED',
        }),
      },
    };
    await expect(assertHmOnlyCanonicalProviderRecord(prisma as never, input)).rejects.toMatchObject({
      code: 'SOURCE_ALREADY_REGISTERED',
    });
    await expect(assertHmOnlyCanonicalProviderRecord(prisma as never, input)).rejects.toBeInstanceOf(
      VehicleOnboardingError,
    );
  });

  it('ConflictException duplicate VIN wording', async () => {
    const prisma = {
      highMobilityVehicle: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'hm-1',
          organizationId: 'org-a',
          vin: 'VIN1',
          clearanceStatus: 'APPROVED',
          sourceMode: 'HM_ONLY',
          synqdriveVehicleId: null,
          registrationState: 'NOT_REGISTERED',
        }),
      },
      organization: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'veh-other',
          organizationId: 'org-a',
          registryLifecycle: 'ACTIVE',
        }),
      },
    };
    await expect(assertHmOnlyCanonicalProviderRecord(prisma as never, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(assertHmOnlyCanonicalProviderRecord(prisma as never, input)).rejects.toThrow(
      /already exists in organization org-a/,
    );
  });
});
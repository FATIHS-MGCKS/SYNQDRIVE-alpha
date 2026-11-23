import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { tryResumeHmOnlyCanonicalRegistration } from './hm-only-canonical-registration-resume';

describe('tryResumeHmOnlyCanonicalRegistration', () => {
  const input = {
    dto: { hmVehicleId: 'hm-1', organizationId: 'org-a' },
    access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: 'user-1' },
  };

  it('replays completed canonical case', async () => {
    const prisma = {
      vehicleOnboardingCase: {
        findFirst: jest.fn().mockResolvedValue({ id: 'case-done', vehicleId: 'veh-1' }),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'veh-1',
          vin: 'VIN001',
          organizationId: 'org-a',
          registryLifecycle: 'ACTIVE',
        }),
      },
    };
    const out = await tryResumeHmOnlyCanonicalRegistration(
      prisma as never,
      input,
      { id: 'hm-1', vin: 'VIN001', synqdriveVehicleId: 'veh-1', registrationState: 'REGISTERED' },
    );
    expect(out.kind).toBe('IDEMPOTENT_SUCCESS');
    if (out.kind === 'IDEMPOTENT_SUCCESS') {
      expect(out.result.synqdriveVehicleId).toBe('veh-1');
    }
  });

  it('blocks legacy inline registration without completed canonical case', async () => {
    const prisma = {
      vehicleOnboardingCase: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'veh-legacy',
          vin: 'VIN001',
          organizationId: 'org-a',
          registryLifecycle: 'ACTIVE',
        }),
      },
    };
    await expect(
      tryResumeHmOnlyCanonicalRegistration(
        prisma as never,
        input,
        {
          id: 'hm-1',
          vin: 'VIN001',
          synqdriveVehicleId: 'veh-legacy',
          registrationState: 'REGISTERED',
        },
      ),
    ).rejects.toMatchObject({ code: 'HM_LEGACY_REGISTRATION_BLOCKING_CANONICAL' });
  });

  it('returns NOT_RESUMABLE for in-progress onboarding', async () => {
    const prisma = {
      vehicleOnboardingCase: { findFirst: jest.fn().mockResolvedValue(null) },
      vehicle: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const out = await tryResumeHmOnlyCanonicalRegistration(
      prisma as never,
      input,
      { id: 'hm-1', vin: 'VIN001', synqdriveVehicleId: null, registrationState: 'NOT_REGISTERED' },
    );
    expect(out.kind).toBe('NOT_RESUMABLE');
  });
});
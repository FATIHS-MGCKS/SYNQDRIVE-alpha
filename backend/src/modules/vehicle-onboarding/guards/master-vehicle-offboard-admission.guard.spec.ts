import { ExecutionContext } from '@nestjs/common';
import { UserPlatformRole } from '@prisma/client';
import { MasterVehicleOffboardAdmissionGuard } from './master-vehicle-offboard-admission.guard';
import {
  MASTER_VEHICLE_OFFBOARD_ADMISSION_DISABLED_CODE,
  MASTER_VEHICLE_OFFBOARD_PLATFORM_MASTER_ADMIN_REQUIRED_CODE,
} from '../policy/master-vehicle-offboard-admission.errors';

function mockContext(user: Record<string, unknown> | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as ExecutionContext;
}

describe('MasterVehicleOffboardAdmissionGuard', () => {
  const guard = new MasterVehicleOffboardAdmissionGuard();
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('denies membership-only MASTER_ADMIN cross-claim (platform USER)', () => {
    expect(() =>
      guard.canActivate(
        mockContext({
          id: 'cross-claim-1',
          platformRole: UserPlatformRole.USER,
          membershipRole: 'MASTER_ADMIN',
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: MASTER_VEHICLE_OFFBOARD_PLATFORM_MASTER_ADMIN_REQUIRED_CODE,
        }),
      }),
    );
  });

  it('denies missing platformRole even when membership claims MASTER_ADMIN', () => {
    expect(() =>
      guard.canActivate(
        mockContext({
          id: 'no-platform-role',
          membershipRole: 'MASTER_ADMIN',
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: MASTER_VEHICLE_OFFBOARD_PLATFORM_MASTER_ADMIN_REQUIRED_CODE,
        }),
      }),
    );
  });

  it('evaluates admission for platform MASTER_ADMIN and rejects when OFF', () => {
    process.env = { ...originalEnv };
    delete process.env.SYNQDRIVE_MASTER_VEHICLE_OFFBOARD_HTTP_ADMISSION_ENABLED;
    expect(() =>
      guard.canActivate(
        mockContext({
          id: 'ma-1',
          platformRole: UserPlatformRole.MASTER_ADMIN,
        }),
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: MASTER_VEHICLE_OFFBOARD_ADMISSION_DISABLED_CODE,
          blockReason: 'ADMISSION_DISABLED',
        }),
      }),
    );
  });
});

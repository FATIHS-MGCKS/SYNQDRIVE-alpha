import { ExecutionContext } from '@nestjs/common';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ADMITTED_REQUEST_KEY } from '../policy/master-vehicle-offboard-admission.request';
import { MasterVehicleOffboardMfaGuard } from './master-vehicle-offboard-mfa.guard';

function mockContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('MasterVehicleOffboardMfaGuard', () => {
  it('skips MFA when owner exception admission flag is set', async () => {
    const delegate = { canActivate: jest.fn().mockResolvedValue(false) } as unknown as MasterAdminMfaGuard;
    const guard = new MasterVehicleOffboardMfaGuard(delegate);
    const request = { [MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ADMITTED_REQUEST_KEY]: true };
    await expect(guard.canActivate(mockContext(request))).resolves.toBe(true);
    expect(delegate.canActivate).not.toHaveBeenCalled();
  });

  it('delegates to MasterAdminMfaGuard otherwise', async () => {
    const delegate = { canActivate: jest.fn().mockResolvedValue(true) } as unknown as MasterAdminMfaGuard;
    const guard = new MasterVehicleOffboardMfaGuard(delegate);
    const ctx = mockContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(delegate.canActivate).toHaveBeenCalledWith(ctx);
  });
});

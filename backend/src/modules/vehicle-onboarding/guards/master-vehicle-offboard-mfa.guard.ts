import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ADMITTED_REQUEST_KEY } from '../policy/master-vehicle-offboard-admission.request';

/**
 * Route-scoped MFA guard for canonical offboard HTTP only.
 * Delegates to MasterAdminMfaGuard unless admission admitted via temporary owner MFA exception.
 */
@Injectable()
export class MasterVehicleOffboardMfaGuard implements CanActivate {
  constructor(private readonly masterAdminMfaGuard: MasterAdminMfaGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    if (request[MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ADMITTED_REQUEST_KEY] === true) {
      return true;
    }
    return this.masterAdminMfaGuard.canActivate(context);
  }
}

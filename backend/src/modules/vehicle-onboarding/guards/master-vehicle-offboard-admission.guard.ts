import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UserPlatformRole } from '@prisma/client';
import { resolveIamMfaMasterAdminEnabled } from '@modules/iam-mfa/iam-mfa-feature-flags.resolver';
import {
  evaluateMasterVehicleOffboardHttpAdmission,
  MasterVehicleOffboardAdmissionBlockReason,
} from '../policy/master-vehicle-offboard-admission.config';
import { masterVehicleOffboardAdmissionDisabledException } from '../policy/master-vehicle-offboard-admission.errors';

@Injectable()
export class MasterVehicleOffboardAdmissionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { platformRole?: string } | undefined;

    if (user?.platformRole !== UserPlatformRole.MASTER_ADMIN) {
      return true;
    }

    const evaluation = evaluateMasterVehicleOffboardHttpAdmission({
      mfaMasterAdminEnabled: resolveIamMfaMasterAdminEnabled(),
    });

    if (evaluation.admitted) {
      return true;
    }

    throw masterVehicleOffboardAdmissionDisabledException(
      evaluation.blockReason ?? ('ADMISSION_DISABLED' satisfies MasterVehicleOffboardAdmissionBlockReason),
    );
  }
}

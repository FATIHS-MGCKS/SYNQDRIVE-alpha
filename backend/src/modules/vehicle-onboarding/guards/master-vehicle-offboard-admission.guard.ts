import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UserPlatformRole } from '@prisma/client';
import { resolveIamMfaMasterAdminEnabled } from '@modules/iam-mfa/iam-mfa-feature-flags.resolver';
import {
  evaluateMasterVehicleOffboardHttpAdmission,
  MasterVehicleOffboardAdmissionBlockReason,
} from '../policy/master-vehicle-offboard-admission.config';
import { MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ADMITTED_REQUEST_KEY } from '../policy/master-vehicle-offboard-admission.request';
import {
  masterVehicleOffboardAdmissionDisabledException,
  masterVehicleOffboardPlatformMasterAdminRequiredException,
} from '../policy/master-vehicle-offboard-admission.errors';

function resolveActorUserId(user: { id?: string; sub?: string } | undefined): string | null {
  const id = user?.id ?? user?.sub;
  return id ?? null;
}

@Injectable()
export class MasterVehicleOffboardAdmissionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { platformRole?: string; id?: string; sub?: string } | undefined;

    if (user?.platformRole !== UserPlatformRole.MASTER_ADMIN) {
      throw masterVehicleOffboardPlatformMasterAdminRequiredException();
    }

    const evaluation = evaluateMasterVehicleOffboardHttpAdmission({
      mfaMasterAdminEnabled: resolveIamMfaMasterAdminEnabled(),
      actorUserId: resolveActorUserId(user),
    });

    if (evaluation.admitted) {
      if (evaluation.admissionPath === 'OWNER_MFA_EXCEPTION') {
        request[MASTER_VEHICLE_OFFBOARD_OWNER_MFA_EXCEPTION_ADMITTED_REQUEST_KEY] = true;
      }
      return true;
    }

    throw masterVehicleOffboardAdmissionDisabledException(
      evaluation.blockReason ?? ('ADMISSION_DISABLED' satisfies MasterVehicleOffboardAdmissionBlockReason),
    );
  }
}

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EVALUATIONS_PERMISSION_KEY } from './require-evaluations-permission.decorator';
import {
  isEvaluationsPermissionAction,
  type EvaluationsPermissionAction,
} from './evaluations-permission.constants';
import { EvaluationsAccessService } from './evaluations-access.service';

/**
 * Enforces granular Auswertungen capabilities after org scoping.
 * UI hiding is never sufficient — this guard is authoritative.
 */
@Injectable()
export class EvaluationsPermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly evaluationsAccess: EvaluationsAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<EvaluationsPermissionAction>(
      EVALUATIONS_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!action) return true;

    if (!isEvaluationsPermissionAction(action)) {
      throw new ForbiddenException(`Unknown evaluations permission action: ${action}`);
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const { organizationId } =
      await this.evaluationsAccess.assertEvaluationsPermissionFromRequest(
        request,
        user,
        action,
      );

    const stationId = this.evaluationsAccess.extractStationId(request);
    const stationAccess = await this.evaluationsAccess.assertReadableStation(
      user?.id,
      organizationId,
      stationId,
    );
    request.evaluationsStationAccess = stationAccess;

    return true;
  }
}

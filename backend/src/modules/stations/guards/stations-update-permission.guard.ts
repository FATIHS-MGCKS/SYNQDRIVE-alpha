import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { StationsAccessService } from '../stations-access.service';
import { resolveUpdateStationPermissions } from '../stations-mutation-permission.util';
import type { UpdateStationDto } from '../dto/update-station.dto';
import {
  evaluateStationUpdatePayload,
  StationUpdateValidationCode,
  type StationUpdatePayload,
} from '../station-update-validation.util';

@Injectable()
export class StationsUpdatePermissionGuard implements CanActivate {
  constructor(private readonly stationsAccess: StationsAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const body = request.body as UpdateStationDto | undefined;
    const evaluation = evaluateStationUpdatePayload((body ?? {}) as StationUpdatePayload);

    if (evaluation.violations.length > 0) {
      throw new BadRequestException({
        message: evaluation.violations[0]?.message ?? 'Forbidden station update fields',
        code: evaluation.violations[0]?.code ?? StationUpdateValidationCode.FORBIDDEN_PATCH_FIELD,
        violations: evaluation.violations,
      });
    }

    if (evaluation.allowedFields.length === 0) {
      throw new BadRequestException({
        message: 'No supported station fields provided for update',
        code: StationUpdateValidationCode.EMPTY_PATCH,
      });
    }

    const actions = resolveUpdateStationPermissions(body);

    await this.stationsAccess.assertStationsAccessForActions(request, request.user, actions);
    return true;
  }
}

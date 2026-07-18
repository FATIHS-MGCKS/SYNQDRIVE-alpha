import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { StationsV2FeatureFlagKey } from '@shared/stations/stations-v2-feature-flags.contract';
import { STATIONS_V2_FEATURE_FLAG_KEY } from '../decorators/require-stations-v2-feature.decorator';
import { StationsV2ConfigService } from '../stations-v2-config.service';

@Injectable()
export class StationsV2FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly stationsV2Config: StationsV2ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const flag = this.reflector.getAllAndOverride<StationsV2FeatureFlagKey | undefined>(
      STATIONS_V2_FEATURE_FLAG_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!flag) return true;

    const request = context.switchToHttp().getRequest<{ params?: { orgId?: string } }>();
    const orgId = request.params?.orgId;
    if (!orgId) return true;

    this.stationsV2Config.assertEnabled(orgId, flag);
    return true;
  }
}

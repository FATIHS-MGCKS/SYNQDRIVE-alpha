import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE } from './core-app-m2m-auth.constants';
import { CoreAppM2mJwtVerifyService } from './core-app-m2m-jwt-verify.service';
import { CoreAppM2mResourceAuthorizationService } from './core-app-m2m-resource-authorization.service';
import { CORE_APP_M2M_SCOPE_VEHICLE_READ } from './core-app-m2m.constants';
import {
  CORE_APP_M2M_REQUEST_AUTH_KEY,
  type CoreAppM2mVerifiedToken,
} from './core-app-m2m-verified-token.types';

type CoreAppM2mRequest = Request & {
  [CORE_APP_M2M_REQUEST_AUTH_KEY]?: CoreAppM2mVerifiedToken;
};

@Injectable()
export class CoreAppM2mJwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtVerify: CoreAppM2mJwtVerifyService,
    private readonly resourceAuth: CoreAppM2mResourceAuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CoreAppM2mRequest>();
    const routeOrgId = request.params?.orgId;
    if (typeof routeOrgId !== 'string' || !routeOrgId.trim()) {
      throw new UnauthorizedException(CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE);
    }

    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException(CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE);
    }

    const verified = this.jwtVerify.verifyBearerToken(token, CORE_APP_M2M_SCOPE_VEHICLE_READ);
    const authorized = await this.resourceAuth.authorizeForOrganizationRoute(
      verified,
      routeOrgId.trim(),
    );
    request[CORE_APP_M2M_REQUEST_AUTH_KEY] = authorized;
    return true;
  }
}

function extractBearerToken(request: Request): string | null {
  const [type, value] = request.headers.authorization?.split(' ') ?? [];
  return type === 'Bearer' && value?.trim() ? value.trim() : null;
}
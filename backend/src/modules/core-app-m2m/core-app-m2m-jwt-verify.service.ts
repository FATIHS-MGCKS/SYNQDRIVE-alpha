import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ProductSlug } from '@prisma/client';
import {
  isCoreAppM2mEnabled,
  isCoreAppM2mResourceJwtVerificationAllowed,
} from './core-app-m2m.config';
import { CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE } from './core-app-m2m-auth.constants';
import {
  CORE_APP_M2M_TOKEN_TYPE,
  resolveCoreAppM2mJwtAudience,
  resolveCoreAppM2mJwtIssuer,
  resolveCoreAppM2mJwtSigningSecret,
} from './core-app-m2m-jwt.config';
import { CORE_APP_M2M_SCOPE_VEHICLE_READ } from './core-app-m2m.constants';
import type { CoreAppM2mVerifiedToken } from './core-app-m2m-verified-token.types';
import { isEligibleServiceClientProductSlug } from './core-app-service-registry.policy';

@Injectable()
export class CoreAppM2mJwtVerifyService {
  verifyBearerToken(
    rawToken: string,
    requiredScope: string = CORE_APP_M2M_SCOPE_VEHICLE_READ,
  ): CoreAppM2mVerifiedToken {
    if (!isCoreAppM2mEnabled()) {
      this.fail();
    }

    if (!isCoreAppM2mResourceJwtVerificationAllowed()) {
      this.fail();
    }

    const secret = resolveCoreAppM2mJwtSigningSecret();
    if (!secret) {
      this.fail();
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(rawToken, secret, {
        algorithms: ['HS256'],
        issuer: resolveCoreAppM2mJwtIssuer(),
        audience: resolveCoreAppM2mJwtAudience(),
      }) as jwt.JwtPayload;
    } catch {
      this.fail();
    }

    if (payload.token_type !== CORE_APP_M2M_TOKEN_TYPE) {
      this.fail();
    }

    const exp = payload.exp;
    if (typeof exp !== 'number' || !Number.isFinite(exp) || !Number.isInteger(exp) || exp <= 0) {
      this.fail();
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (exp <= nowSeconds) {
      this.fail();
    }

    const clientId = typeof payload.sub === 'string' ? payload.sub.trim() : '';
    const organizationId =
      typeof payload.organizationId === 'string' ? payload.organizationId.trim() : '';
    const productSlug = payload.productSlug as ProductSlug;
    const scopes = Array.isArray(payload.scopes)
      ? payload.scopes.filter((s): s is string => typeof s === 'string')
      : [];

    if (!clientId || !organizationId || !productSlug) {
      this.fail();
    }

    if (!isEligibleServiceClientProductSlug(productSlug)) {
      this.fail();
    }

    if (!scopes.includes(requiredScope)) {
      this.fail();
    }

    const credentialVersion = Number(payload.credentialVersion);
    const grantVersion = Number(payload.grantVersion);
    if (!Number.isInteger(credentialVersion) || !Number.isInteger(grantVersion)) {
      this.fail();
    }

    return {
      clientId,
      organizationId,
      productSlug,
      scopes,
      credentialVersion,
      grantVersion,
    };
  }

  private fail(): never {
    throw new UnauthorizedException(CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE);
  }
}
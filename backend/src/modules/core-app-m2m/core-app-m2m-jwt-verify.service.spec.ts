import * as jwt from 'jsonwebtoken';
import { UnauthorizedException } from '@nestjs/common';
import { ProductSlug } from '@prisma/client';
import { CoreAppM2mJwtVerifyService } from './core-app-m2m-jwt-verify.service';
import {
  CORE_APP_M2M_JWT_AUDIENCE_DEFAULT,
  CORE_APP_M2M_JWT_ISSUER_DEFAULT,
  CORE_APP_M2M_TOKEN_TYPE,
} from './core-app-m2m-jwt.config';
import { CORE_APP_M2M_SCOPE_VEHICLE_READ } from './core-app-m2m.constants';

describe('CoreAppM2mJwtVerifyService', () => {
  const envBackup = { ...process.env };
  const service = new CoreAppM2mJwtVerifyService();
  const secret = 'verify-service-test-m2m-secret';

  beforeEach(() => {
    process.env.CORE_APP_M2M_ENABLED = 'true';
    process.env.CORE_APP_M2M_JWT_SECRET = secret;
    process.env.JWT_SECRET = 'user-secret';
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  function sign(claims: Record<string, unknown>, opts?: jwt.SignOptions) {
    return jwt.sign(claims, secret, {
      issuer: CORE_APP_M2M_JWT_ISSUER_DEFAULT,
      audience: CORE_APP_M2M_JWT_AUDIENCE_DEFAULT,
      expiresIn: 300,
      ...opts,
    });
  }

  it('accepts valid service token with vehicle read scope', () => {
    const token = sign({
      sub: 'fleet-client',
      token_type: CORE_APP_M2M_TOKEN_TYPE,
      organizationId: '11111111-1111-4111-8111-111111111111',
      productSlug: ProductSlug.FLEET,
      scopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
      credentialVersion: 1,
      grantVersion: 2,
    });
    const verified = service.verifyBearerToken(token);
    expect(verified.clientId).toBe('fleet-client');
    expect(verified.grantVersion).toBe(2);
  });

  it('rejects user JWT signed with user secret', () => {
    const userJwt = jwt.sign({ sub: 'user' }, process.env.JWT_SECRET!, { expiresIn: 300 });
    expect(() => service.verifyBearerToken(userJwt)).toThrow(UnauthorizedException);
  });

  it('rejects wrong token type and missing scope', () => {
    const badType = sign({
      sub: 'c',
      token_type: 'user',
      organizationId: '11111111-1111-4111-8111-111111111111',
      productSlug: ProductSlug.FLEET,
      scopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
      credentialVersion: 1,
      grantVersion: 1,
    });
    expect(() => service.verifyBearerToken(badType)).toThrow(UnauthorizedException);

    const missingScope = sign({
      sub: 'c',
      token_type: CORE_APP_M2M_TOKEN_TYPE,
      organizationId: '11111111-1111-4111-8111-111111111111',
      productSlug: ProductSlug.FLEET,
      scopes: ['core:entitlements:read'],
      credentialVersion: 1,
      grantVersion: 1,
    });
    expect(() => service.verifyBearerToken(missingScope)).toThrow(UnauthorizedException);
  });
});
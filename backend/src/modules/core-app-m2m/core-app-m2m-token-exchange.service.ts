import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  CoreAppServiceClientStatus,
  CoreAppServiceGrantStatus,
  ProductSlug,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '@shared/database/prisma.service';
import { isOrganizationProductOperationallyEntitled } from '@modules/products/entitlements/entitlements-policy';
import { isCoreAppM2mEnabled } from './core-app-m2m.config';
import { CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE } from './core-app-m2m-auth.constants';
import {
  resolveCoreAppM2mJwtAudience,
  resolveCoreAppM2mJwtIssuer,
  resolveCoreAppM2mJwtSigningSecret,
  resolveCoreAppM2mTokenTtlSeconds,
  CORE_APP_M2M_TOKEN_CONTRACT_VERSION,
  CORE_APP_M2M_TOKEN_TYPE,
} from './core-app-m2m-jwt.config';
import type { CoreAppM2mTokenExchangeRequestDto } from './dto/core-app-m2m-token-exchange.dto';
import {
  isEligibleServiceClientProductSlug,
  normalizeClientId,
  validateCoreAppM2mScopeDefinitions,
} from './core-app-service-registry.policy';
import type { CoreAppM2mTokenExchangeResponse } from './core-app-m2m-token.types';

/** Precomputed bcrypt hash used when client record is missing (mitigate user enumeration via timing). */
const DUMMY_CREDENTIAL_HASH =
  '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

@Injectable()
export class CoreAppM2mTokenExchangeService {
  constructor(private readonly prisma: PrismaService) {}

  async exchangeToken(
    input: CoreAppM2mTokenExchangeRequestDto,
  ): Promise<CoreAppM2mTokenExchangeResponse> {
    if (!isCoreAppM2mEnabled()) {
      this.failClosed();
    }

    const signingSecret = resolveCoreAppM2mJwtSigningSecret();
    if (!signingSecret) {
      this.failClosed();
    }

    const clientId = normalizeClientId(input.clientId);
    const client = await this.prisma.coreAppServiceClient.findUnique({
      where: { clientId },
      include: {
        orgGrants: {
          where: { organizationId: input.organizationId },
          take: 1,
        },
      },
    });

    const credentialHash = client?.credentialHash ?? DUMMY_CREDENTIAL_HASH;
    const credentialOk = await bcrypt.compare(input.clientSecret, credentialHash);
    if (!client || !credentialOk) {
      this.failClosed();
    }

    if (!isEligibleServiceClientProductSlug(client.productSlug)) {
      this.failClosed();
    }

    if (client.productSlug === ProductSlug.TAXI) {
      this.failClosed();
    }

    const invalidScopeDefs = validateCoreAppM2mScopeDefinitions(input.scopes);
    if (invalidScopeDefs.length > 0) {
      this.failClosed();
    }

    const allowed = new Set(client.allowedScopes);
    if (
      input.scopes.length === 0 ||
      input.scopes.some((scope) => !allowed.has(scope))
    ) {
      this.failClosed();
    }

    if (client.status !== CoreAppServiceClientStatus.ACTIVE) {
      this.failClosed();
    }

    const grant = client.orgGrants[0];
    if (!grant || grant.status !== CoreAppServiceGrantStatus.ACTIVE) {
      this.failClosed();
    }

    if (grant.organizationId !== input.organizationId) {
      this.failClosed();
    }

    const orgProduct = await this.prisma.organizationProduct.findFirst({
      where: {
        organizationId: input.organizationId,
        product: { slug: client.productSlug },
      },
      select: { status: true },
    });

    if (!isOrganizationProductOperationallyEntitled(orgProduct?.status)) {
      this.failClosed();
    }

    const ttl = resolveCoreAppM2mTokenTtlSeconds();
    const issuer = resolveCoreAppM2mJwtIssuer();
    const audience = resolveCoreAppM2mJwtAudience();
    const issuedAt = Math.floor(Date.now() / 1000);

    const scopes = [...input.scopes].sort();
    const claims = {
      sub: client.clientId,
      token_type: CORE_APP_M2M_TOKEN_TYPE,
      organizationId: grant.organizationId,
      productSlug: client.productSlug,
      scopes,
      credentialVersion: client.credentialVersion,
      grantVersion: grant.grantVersion,
    };

    const accessToken = jwt.sign(claims, signingSecret, {
      algorithm: 'HS256',
      expiresIn: ttl,
      issuer,
      audience,
    });

    return {
      contractVersion: CORE_APP_M2M_TOKEN_CONTRACT_VERSION,
      accessToken,
      tokenType: 'Bearer',
      expiresIn: ttl,
      scope: scopes.join(' '),
      issuedAt: new Date(issuedAt * 1000).toISOString(),
    };
  }

  private failClosed(): never {
    throw new UnauthorizedException(CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE);
  }
}
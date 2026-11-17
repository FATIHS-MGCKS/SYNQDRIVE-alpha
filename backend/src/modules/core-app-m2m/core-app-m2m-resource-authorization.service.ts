import { Injectable, UnauthorizedException } from '@nestjs/common';
import { CoreAppServiceGrantStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isOrganizationProductOperationallyEntitled } from '@modules/products/entitlements/entitlements-policy';
import { CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE } from './core-app-m2m-auth.constants';
import { validateCoreAppM2mScopeDefinitions } from './core-app-service-registry.policy';
import { CoreAppServiceRegistryService } from './core-app-service-registry.service';
import type { CoreAppM2mVerifiedToken } from './core-app-m2m-verified-token.types';

export type CoreAppM2mAuthorizedResourceContext = CoreAppM2mVerifiedToken & {
  productSlug: CoreAppM2mVerifiedToken['productSlug'];
};

@Injectable()
export class CoreAppM2mResourceAuthorizationService {
  constructor(
    private readonly registry: CoreAppServiceRegistryService,
    private readonly prisma: PrismaService,
  ) {}

  async authorizeForOrganizationRoute(
    token: CoreAppM2mVerifiedToken,
    routeOrganizationId: string,
  ): Promise<CoreAppM2mAuthorizedResourceContext> {
    if (token.organizationId !== routeOrganizationId) {
      this.fail();
    }

    const binding = await this.registry.validateClientOrgBinding({
      clientId: token.clientId,
      organizationId: routeOrganizationId,
    });
    if (!binding.ok) {
      this.fail();
    }

    if (binding.productSlug !== token.productSlug) {
      this.fail();
    }

    const client = await this.prisma.coreAppServiceClient.findUnique({
      where: { clientId: token.clientId },
      select: { id: true, credentialVersion: true, productSlug: true, allowedScopes: true },
    });
    const grant = client
      ? await this.prisma.coreAppServiceOrgGrant.findFirst({
          where: {
            serviceClientId: client.id,
            organizationId: routeOrganizationId,
            status: CoreAppServiceGrantStatus.ACTIVE,
          },
          select: { grantVersion: true },
        })
      : null;

    if (!client || !grant) {
      this.fail();
    }

    if (client.productSlug !== binding.productSlug) {
      this.fail();
    }

    if (
      client.credentialVersion !== token.credentialVersion ||
      grant.grantVersion !== token.grantVersion
    ) {
      this.fail();
    }

    const storedScopes = Array.isArray(client.allowedScopes) ? client.allowedScopes : [];
    if (validateCoreAppM2mScopeDefinitions(storedScopes).length > 0) {
      this.fail();
    }
    for (const scope of token.scopes) {
      if (!storedScopes.includes(scope)) {
        this.fail();
      }
    }

    const orgProduct = await this.prisma.organizationProduct.findFirst({
      where: {
        organizationId: routeOrganizationId,
        product: { slug: binding.productSlug },
      },
      select: { status: true },
    });

    if (!isOrganizationProductOperationallyEntitled(orgProduct?.status)) {
      this.fail();
    }

    return {
      ...token,
      productSlug: binding.productSlug,
    };
  }

  private fail(): never {
    throw new UnauthorizedException(CORE_APP_M2M_AUTHENTICATION_FAILED_MESSAGE);
  }
}
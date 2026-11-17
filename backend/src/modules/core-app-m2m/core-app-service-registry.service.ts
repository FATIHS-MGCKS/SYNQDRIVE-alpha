import { Injectable } from '@nestjs/common';
import {
  CoreAppServiceClientStatus,
  CoreAppServiceGrantStatus,
  ProductSlug,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isCoreAppM2mEnabled } from './core-app-m2m.config';
import {
  isEligibleExternalAppProductSlug,
  normalizeClientId,
  validateCoreAppM2mScopeDefinitions,
} from './core-app-service-registry.policy';
import {
  CoreAppServiceRegistryFailureCode,
  type CoreAppServiceRegistryValidationResult,
} from './core-app-service-registry.types';

@Injectable()
export class CoreAppServiceRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Internal validation only (no token issuance). Fail-closed when M2M runtime is disabled.
   */
  async validateClientOrgBinding(input: {
    clientId: string;
    organizationId: string;
  }): Promise<CoreAppServiceRegistryValidationResult> {
    if (!isCoreAppM2mEnabled()) {
      return {
        ok: false,
        code: CoreAppServiceRegistryFailureCode.RUNTIME_DISABLED,
        message: 'Core app M2M runtime is disabled',
      };
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

    if (!client) {
      return {
        ok: false,
        code: CoreAppServiceRegistryFailureCode.CLIENT_NOT_FOUND,
        message: 'Service client not found',
      };
    }

    if (!isEligibleExternalAppProductSlug(client.productSlug)) {
      if (client.productSlug === ProductSlug.TAXI) {
        return {
          ok: false,
          code: CoreAppServiceRegistryFailureCode.PRODUCT_SLUG_RETIRED,
          message: 'Product slug is retired for external applications',
        };
      }
      return {
        ok: false,
        code: CoreAppServiceRegistryFailureCode.PRODUCT_SLUG_UNSUPPORTED,
        message: 'Product slug is not supported for external applications',
      };
    }

    const invalidScopes = validateCoreAppM2mScopeDefinitions(client.allowedScopes);
    if (invalidScopes.length > 0) {
      return {
        ok: false,
        code: CoreAppServiceRegistryFailureCode.INVALID_SCOPE,
        message: `Invalid scope definition: ${invalidScopes.join(', ')}`,
      };
    }

    if (client.status !== CoreAppServiceClientStatus.ACTIVE) {
      return {
        ok: false,
        code: CoreAppServiceRegistryFailureCode.CLIENT_DISABLED,
        message: 'Service client is disabled',
      };
    }

    const grant = client.orgGrants[0];
    if (!grant) {
      return {
        ok: false,
        code: CoreAppServiceRegistryFailureCode.ORG_GRANT_NOT_FOUND,
        message: 'Organization grant not found for service client',
      };
    }

    if (grant.organizationId !== input.organizationId) {
      return {
        ok: false,
        code: CoreAppServiceRegistryFailureCode.ORG_GRANT_ORG_MISMATCH,
        message: 'Organization grant tenant mismatch',
      };
    }

    if (grant.status !== CoreAppServiceGrantStatus.ACTIVE) {
      return {
        ok: false,
        code: CoreAppServiceRegistryFailureCode.ORG_GRANT_REVOKED,
        message: 'Organization grant is revoked',
      };
    }

    return {
      ok: true,
      clientId: client.clientId,
      productSlug: client.productSlug,
      organizationId: grant.organizationId,
      clientStatus: client.status,
      grantStatus: grant.status,
      allowedScopes: [...client.allowedScopes],
    };
  }
}
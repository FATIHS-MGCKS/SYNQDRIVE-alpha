import { UnauthorizedException } from '@nestjs/common';
import {
  CoreAppServiceGrantStatus,
  OrgProductStatus,
  ProductSlug,
} from '@prisma/client';
import { CORE_APP_M2M_SCOPE_VEHICLE_READ } from './core-app-m2m.constants';
import { CoreAppM2mResourceAuthorizationService } from './core-app-m2m-resource-authorization.service';

describe('CoreAppM2mResourceAuthorizationService', () => {
  const registry = {
    validateClientOrgBinding: jest.fn(),
  };
  const prisma = {
    coreAppServiceClient: { findUnique: jest.fn() },
    coreAppServiceOrgGrant: { findFirst: jest.fn() },
    organizationProduct: { findFirst: jest.fn() },
  };

  const service = new CoreAppM2mResourceAuthorizationService(registry as never, prisma as never);
  const orgId = '11111111-1111-4111-8111-111111111111';

  const token = {
    clientId: 'fleet-client',
    organizationId: orgId,
    productSlug: ProductSlug.FLEET,
    scopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
    credentialVersion: 1,
    grantVersion: 2,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    registry.validateClientOrgBinding.mockResolvedValue({
      ok: true,
      productSlug: ProductSlug.FLEET,
    });
    prisma.coreAppServiceClient.findUnique.mockResolvedValue({
      id: 'client-uuid',
      credentialVersion: 1,
      productSlug: ProductSlug.FLEET,
      allowedScopes: [CORE_APP_M2M_SCOPE_VEHICLE_READ],
    });
    prisma.coreAppServiceOrgGrant.findFirst.mockResolvedValue({ grantVersion: 2 });
    prisma.organizationProduct.findFirst.mockResolvedValue({ status: OrgProductStatus.ACTIVE });
  });

  it('authorizes when stored allowedScopes include all JWT scopes', async () => {
    const ctx = await service.authorizeForOrganizationRoute(token, orgId);
    expect(ctx.productSlug).toBe(ProductSlug.FLEET);
  });

  it('rejects when stored allowedScopes no longer include a JWT scope', async () => {
    prisma.coreAppServiceClient.findUnique.mockResolvedValue({
      id: 'client-uuid',
      credentialVersion: 1,
      productSlug: ProductSlug.FLEET,
      allowedScopes: [],
    });
    await expect(service.authorizeForOrganizationRoute(token, orgId)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
import {
  CoreAppServiceClientStatus,
  CoreAppServiceGrantStatus,
  ProductSlug,
} from '@prisma/client';
import { CoreAppServiceRegistryFailureCode } from './core-app-service-registry.types';
import { CoreAppServiceRegistryService } from './core-app-service-registry.service';

describe('CoreAppServiceRegistryService', () => {
  const prisma = {
    coreAppServiceClient: { findUnique: jest.fn() },
  };
  let service: CoreAppServiceRegistryService;
  const envBackup = process.env.CORE_APP_M2M_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CORE_APP_M2M_ENABLED = 'true';
    service = new CoreAppServiceRegistryService(prisma as never);
  });

  afterEach(() => {
    if (envBackup === undefined) {
      delete process.env.CORE_APP_M2M_ENABLED;
    } else {
      process.env.CORE_APP_M2M_ENABLED = envBackup;
    }
  });

  it('fail-closes when runtime disabled', async () => {
    process.env.CORE_APP_M2M_ENABLED = 'false';
    const result = await service.validateClientOrgBinding({
      clientId: 'c1',
      organizationId: 'org-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(CoreAppServiceRegistryFailureCode.RUNTIME_DISABLED);
    }
    expect(prisma.coreAppServiceClient.findUnique).not.toHaveBeenCalled();
  });

  it('rejects disabled client', async () => {
    prisma.coreAppServiceClient.findUnique.mockResolvedValue({
      clientId: 'c1',
      productSlug: ProductSlug.RENTAL,
      status: CoreAppServiceClientStatus.DISABLED,
      allowedScopes: ['core:entitlements:read'],
      orgGrants: [],
    });
    const result = await service.validateClientOrgBinding({
      clientId: 'c1',
      organizationId: 'org-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(CoreAppServiceRegistryFailureCode.CLIENT_DISABLED);
    }
  });

  it('rejects TAXI product slug', async () => {
    prisma.coreAppServiceClient.findUnique.mockResolvedValue({
      clientId: 'taxi',
      productSlug: ProductSlug.TAXI,
      status: CoreAppServiceClientStatus.ACTIVE,
      allowedScopes: [],
      orgGrants: [{ organizationId: 'org-1', status: CoreAppServiceGrantStatus.ACTIVE }],
    });
    const result = await service.validateClientOrgBinding({
      clientId: 'taxi',
      organizationId: 'org-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(CoreAppServiceRegistryFailureCode.PRODUCT_SLUG_RETIRED);
    }
  });

  it('accepts ACTIVE client and grant', async () => {
    prisma.coreAppServiceClient.findUnique.mockResolvedValue({
      clientId: 'c1',
      productSlug: ProductSlug.VYMOD,
      status: CoreAppServiceClientStatus.ACTIVE,
      allowedScopes: ['core:entitlements:read'],
      orgGrants: [
        { organizationId: 'org-1', status: CoreAppServiceGrantStatus.ACTIVE },
      ],
    });
    const result = await service.validateClientOrgBinding({
      clientId: 'c1',
      organizationId: 'org-1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.productSlug).toBe(ProductSlug.VYMOD);
    }
  });
});
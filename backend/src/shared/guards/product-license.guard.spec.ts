import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgProductStatus, ProductSlug } from '@prisma/client';
import { ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES } from '@modules/products/entitlements/entitlements-policy';
import { ProductLicenseGuard, PRODUCT_KEY } from './product-license.guard';

describe('ProductLicenseGuard — entitlement status parity', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const prisma = { organizationProduct: { findFirst: jest.fn() } };
  let guard: ProductLicenseGuard;

  const ctx = (orgId: string): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ params: { orgId }, user: { organizationId: orgId } }),
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new ProductLicenseGuard(reflector as unknown as Reflector, prisma as never);
    reflector.getAllAndOverride.mockReturnValue(ProductSlug.RENTAL);
  });

  it('queries operational entitlement statuses from central policy (ACTIVE only)', async () => {
    prisma.organizationProduct.findFirst.mockResolvedValue({ id: 'op-1' });
    await expect(guard.canActivate(ctx('org-1'))).resolves.toBe(true);
    expect(prisma.organizationProduct.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        product: { slug: ProductSlug.RENTAL },
        status: { in: [...ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES] },
      },
    });
  });

  it.each([OrgProductStatus.TRIAL, OrgProductStatus.SUSPENDED, OrgProductStatus.CANCELLED])(
    'denies when no operational row matches (%s fail-closed)',
    async (status) => {
      prisma.organizationProduct.findFirst.mockImplementation(async (args: { where: { status?: { in: OrgProductStatus[] } } }) => {
        const allowed = args.where.status?.in ?? [];
        expect(allowed).toEqual([...ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES]);
        return allowed.includes(status) ? { id: 'op-1' } : null;
      });
      await expect(guard.canActivate(ctx('org-1'))).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('passes when reflector has no product key', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    await expect(guard.canActivate(ctx('org-1'))).resolves.toBe(true);
    expect(prisma.organizationProduct.findFirst).not.toHaveBeenCalled();
  });

  it('denies missing organization context', async () => {
    const emptyCtx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ params: {}, user: {} }) }),
    } as ExecutionContext;
    await expect(guard.canActivate(emptyCtx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
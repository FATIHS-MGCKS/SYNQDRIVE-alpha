import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { MasterBillingGuard } from '@shared/auth/master-billing.guard';
import {
  MASTER_BILLING_KEY,
  MASTER_BILLING_PLATFORM_PERMISSION,
} from '@shared/decorators/require-master-billing.decorator';
import { MasterAdminMfaGuard } from '@shared/auth/master-admin-mfa.guard';
import { MasterBillingDelegateMfaGuard } from '@shared/auth/master-billing-delegate-mfa.guard';
import { MasterSubscriptionController } from './master-subscription.controller';

describe('MasterSubscriptionController security characterization', () => {
  const subscriptionAdmin = {
    getContract: jest.fn(),
    getChangeHistory: jest.fn(),
    previewChanges: jest.fn(),
    createDraft: jest.fn(),
    pause: jest.fn(),
  };
  const subscriptionOverview = { getOverview: jest.fn() };

  let controller: MasterSubscriptionController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new MasterSubscriptionController(
      subscriptionAdmin as never,
      subscriptionOverview as never,
    );
  });

  it('applies billing auth and MFA guards', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, MasterSubscriptionController) ?? [];
    expect(guards).toEqual(
      expect.arrayContaining([
        RolesGuard,
        PermissionsGuard,
        MasterBillingGuard,
        MasterAdminMfaGuard,
        MasterBillingDelegateMfaGuard,
      ]),
    );
  });

  it('requires master billing metadata on controller class', () => {
    expect(Reflect.getMetadata(MASTER_BILLING_KEY, MasterSubscriptionController)).toBe(true);
  });

  it('scopes mutations to path orgId and passes actor from auth', async () => {
    subscriptionAdmin.createDraft.mockResolvedValue({ created: true, replayed: false, result: {} });

    await controller.createDraft(
      'org-target',
      { currency: 'EUR', lockVersion: 2 },
      'idem-1',
      { user: { id: 'master-1' } },
    );

    expect(subscriptionAdmin.createDraft).toHaveBeenCalledWith(
      'org-target',
      expect.objectContaining({
        actorUserId: 'master-1',
        idempotencyKey: 'idem-1',
        lockVersion: 2,
      }),
      'EUR',
    );
  });

  it('preview delegates without idempotency key', async () => {
    subscriptionAdmin.previewChanges.mockResolvedValue({ mutating: false });

    await controller.preview('org-1', {
      productKey: 'RENTAL',
      priceVersionId: 'ver-1',
      effectiveAt: '2026-08-01T00:00:00.000Z',
    });

    expect(subscriptionAdmin.previewChanges).toHaveBeenCalledWith('org-1', {
      productKey: 'RENTAL',
      priceVersionId: 'ver-1',
      effectiveAt: new Date('2026-08-01T00:00:00.000Z'),
      anchorDay: undefined,
    });
  });
});

describe('MasterSubscriptionController access control', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as import('@nestjs/core').Reflector;
  const platformPermissions = {
    hasActiveMasterBillingGrant: jest.fn(),
  };
  let guard: MasterBillingGuard;

  const ctx = (user?: Record<string, unknown>) => ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => MasterSubscriptionController,
  });

  beforeEach(() => {
    guard = new MasterBillingGuard(reflector, platformPermissions as never);
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    (platformPermissions.hasActiveMasterBillingGrant as jest.Mock).mockResolvedValue(false);
  });

  it('allows master admin', async () => {
    await expect(
      guard.canActivate(ctx({ id: 'ma', platformRole: 'MASTER_ADMIN' }) as never),
    ).resolves.toBe(true);
  });

  it('allows master billing platform permission', async () => {
    (platformPermissions.hasActiveMasterBillingGrant as jest.Mock).mockResolvedValue(true);
    await expect(
      guard.canActivate(
        ctx({
          id: 'delegate',
          platformRole: 'USER',
          platformPermissions: [MASTER_BILLING_PLATFORM_PERMISSION],
        }) as never,
      ),
    ).resolves.toBe(true);
  });

  it('rejects org admin tenant users', async () => {
    await expect(
      guard.canActivate(
        ctx({
          id: 'oa',
          platformRole: 'USER',
          membershipRole: 'ORG_ADMIN',
          organizationId: 'org-a',
        }) as never,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects workers', async () => {
    await expect(
      guard.canActivate(
        ctx({
          id: 'w',
          platformRole: 'USER',
          membershipRole: 'WORKER',
          organizationId: 'org-a',
        }) as never,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('MasterSubscriptionController — delegated billing MFA step-up (characterization)', () => {
  it('master-billing delegate bypasses MasterAdminMfaGuard; delegate guard handles billing MFA', async () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue('MASTER_SUBSCRIPTION'),
    } as unknown as import('@nestjs/core').Reflector;
    const mfaGuard = new MasterAdminMfaGuard(
      reflector,
      { userMfaFactor: { findFirst: jest.fn() } } as never,
      { validateGrant: jest.fn() } as never,
    );
    const context = {
      getHandler: () => ({}),
      getClass: () => MasterSubscriptionController,
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          user: {
            id: 'billing-delegate-1',
            platformRole: 'USER',
            platformPermissions: ['master-billing'],
          },
          headers: {},
        }),
      }),
    } as never;

    await expect(mfaGuard.canActivate(context)).resolves.toBe(true);
  });
});

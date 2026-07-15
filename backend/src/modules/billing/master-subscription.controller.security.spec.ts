import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { MasterBillingGuard } from '@shared/auth/master-billing.guard';
import {
  MASTER_BILLING_KEY,
  MASTER_BILLING_PLATFORM_PERMISSION,
} from '@shared/decorators/require-master-billing.decorator';
import { MasterSubscriptionController } from './master-subscription.controller';

describe('MasterSubscriptionController security characterization', () => {
  const subscriptionAdmin = {
    getContract: jest.fn(),
    getChangeHistory: jest.fn(),
    previewChanges: jest.fn(),
    createDraft: jest.fn(),
    pause: jest.fn(),
  };

  let controller: MasterSubscriptionController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new MasterSubscriptionController(subscriptionAdmin as never);
  });

  it('applies RolesGuard, PermissionsGuard and MasterBillingGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, MasterSubscriptionController) ?? [];
    expect(guards).toEqual(
      expect.arrayContaining([RolesGuard, PermissionsGuard, MasterBillingGuard]),
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
      {
        actorUserId: 'master-1',
        idempotencyKey: 'idem-1',
        lockVersion: 2,
      },
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
  let guard: MasterBillingGuard;

  const ctx = (user?: Record<string, unknown>) => ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => MasterSubscriptionController,
  });

  beforeEach(() => {
    guard = new MasterBillingGuard(reflector);
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
  });

  it('allows master admin', () => {
    expect(guard.canActivate(ctx({ platformRole: 'MASTER_ADMIN' }) as never)).toBe(true);
  });

  it('allows master billing platform permission', () => {
    expect(
      guard.canActivate(
        ctx({
          platformRole: 'USER',
          platformPermissions: [MASTER_BILLING_PLATFORM_PERMISSION],
        }) as never,
      ),
    ).toBe(true);
  });

  it('rejects org admin tenant users', () => {
    expect(() =>
      guard.canActivate(
        ctx({
          platformRole: 'USER',
          membershipRole: 'ORG_ADMIN',
          organizationId: 'org-a',
        }) as never,
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects workers', () => {
    expect(() =>
      guard.canActivate(
        ctx({
          platformRole: 'USER',
          membershipRole: 'WORKER',
          organizationId: 'org-a',
        }) as never,
      ),
    ).toThrow(ForbiddenException);
  });
});

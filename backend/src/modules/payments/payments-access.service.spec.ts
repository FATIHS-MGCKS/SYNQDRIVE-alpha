import { ForbiddenException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import {
  PaymentsAccessService,
  PaymentsFeatureDisabledError,
} from './payments-access.service';
import { PaymentsFeatureGuard } from './guards/payments-feature.guard';
import { PaymentsPermissionGuard } from './guards/payments-permission.guard';

describe('PaymentsAccessService', () => {
  const prisma = {
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    organizationMembership: {
      findFirst: jest.fn(),
    },
  };

  let service: PaymentsAccessService;

  beforeEach(() => {
    service = new PaymentsAccessService(prisma as never);
    jest.clearAllMocks();
  });

  describe('feature flag', () => {
    it('defaults to disabled for organizations', async () => {
      prisma.organization.findUnique.mockResolvedValue({ paymentsEnabled: false });
      await expect(service.isPaymentsEnabled('org-1')).resolves.toBe(false);
    });

    it('blocks tenant users when payments feature is disabled', async () => {
      prisma.organization.findUnique.mockResolvedValue({ paymentsEnabled: false });
      await expect(
        service.assertPaymentsFeatureEnabled('org-1', {
          id: 'u1',
          platformRole: 'USER',
          organizationId: 'org-1',
        }),
      ).rejects.toBeInstanceOf(PaymentsFeatureDisabledError);
    });

    it('allows MASTER_ADMIN when feature is disabled (platform rollout)', async () => {
      await expect(
        service.assertPaymentsFeatureEnabled('org-1', {
          id: 'admin',
          platformRole: 'MASTER_ADMIN',
        }),
      ).resolves.toBeUndefined();
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    });

    it('enables feature only via setPaymentsEnabled', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
      prisma.organization.update.mockResolvedValue({ paymentsEnabled: true });
      await expect(service.setPaymentsEnabled('org-1', true)).resolves.toEqual({
        paymentsEnabled: true,
      });
    });
  });

  describe('payment permissions', () => {
    const orgAdminActor = { id: 'admin', platformRole: 'USER', organizationId: 'org-1' };
    const workerActor = { id: 'w1', platformRole: 'USER', organizationId: 'org-1' };

    it('allows ORG_ADMIN without explicit JSON permissions', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue({
        role: MembershipRole.ORG_ADMIN,
        permissions: null,
      });
      await expect(
        service.assertPaymentPermission(orgAdminActor.organizationId!, orgAdminActor, 'payments.refund'),
      ).resolves.toBeUndefined();
    });

    it('denies worker without payments.read', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue({
        role: MembershipRole.WORKER,
        permissions: { dashboard: { read: true, write: false } },
      });
      await expect(
        service.assertPaymentPermission('org-1', workerActor, 'payments.read'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows worker with payments.read but denies payments.create', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue({
        role: MembershipRole.WORKER,
        permissions: { payments: { read: true, write: false } },
      });
      await expect(
        service.assertPaymentPermission('org-1', workerActor, 'payments.read'),
      ).resolves.toBeUndefined();
      await expect(
        service.assertPaymentPermission('org-1', workerActor, 'payments.create'),
      ).rejects.toThrow('Missing permission: payments.create');
    });

    it('requires separate permission for refunds — not billing.write', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue({
        role: MembershipRole.WORKER,
        permissions: {
          billing: { read: true, write: true },
          payments: { read: true, write: true },
        },
      });
      await expect(
        service.assertPaymentPermission('org-1', workerActor, 'payments.refund'),
      ).rejects.toThrow('Missing permission: payments.refund');
    });

    it('allows accounting worker with payments-refund write', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue({
        role: MembershipRole.SUB_ADMIN,
        permissions: {
          payments: { read: true, write: true },
          'payments-refund': { read: true, write: true },
        },
      });
      await expect(
        service.assertPaymentPermission('org-1', workerActor, 'payments.refund'),
      ).resolves.toBeUndefined();
    });

    it('denies cross-org access via membership lookup', async () => {
      prisma.organizationMembership.findFirst.mockResolvedValue(null);
      await expect(
        service.assertPaymentPermission('org-b', workerActor, 'payments.read'),
      ).rejects.toThrow('You do not have access to this organization');
    });

    it('allows MASTER_ADMIN without membership', async () => {
      await expect(
        service.assertPaymentPermission('org-b', { platformRole: 'MASTER_ADMIN' }, 'payments.connect.manage'),
      ).resolves.toBeUndefined();
      expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('evaluatePaymentPermission', () => {
    it('maps connect.manage to payments-connect.manage level', () => {
      const perms = normalizeMembershipPermissions({
        'payments-connect': { read: false, write: false, manage: true },
      });
      expect(service.evaluatePaymentPermission(perms, 'payments.connect.manage')).toBe(true);
      expect(service.evaluatePaymentPermission(perms, 'payments.connect.read')).toBe(true);
    });
  });
});

describe('PaymentsFeatureGuard', () => {
  const paymentsAccess = {
    resolveOrgId: jest.fn(),
    assertPaymentsFeatureEnabled: jest.fn(),
  };
  const guard = new PaymentsFeatureGuard(paymentsAccess as never);

  beforeEach(() => jest.clearAllMocks());

  it('denies unauthenticated access', async () => {
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: null, params: { orgId: 'org-1' } }) }),
    };
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('delegates to access service with resolved org', async () => {
    paymentsAccess.resolveOrgId.mockReturnValue('org-1');
    paymentsAccess.assertPaymentsFeatureEnabled.mockResolvedValue(undefined);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'u1', organizationId: 'org-1' }, params: { orgId: 'org-1' } }),
      }),
    };
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
    expect(paymentsAccess.assertPaymentsFeatureEnabled).toHaveBeenCalledWith('org-1', expect.any(Object));
  });
});

describe('PaymentsPermissionGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  const paymentsAccess = { assertPaymentAccess: jest.fn() };
  const guard = new PaymentsPermissionGuard(reflector as never, paymentsAccess as never);

  beforeEach(() => jest.clearAllMocks());

  it('passes through when no payment permission metadata', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = { switchToHttp: () => ({ getRequest: () => ({}) }), getHandler: () => ({}), getClass: () => ({}) };
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
  });

  it('enforces declared payment permission action', async () => {
    reflector.getAllAndOverride.mockReturnValue('payments.read');
    paymentsAccess.assertPaymentAccess.mockResolvedValue('org-1');
    const request = { user: { id: 'u1' }, params: { orgId: 'org-1' } };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
    expect(paymentsAccess.assertPaymentAccess).toHaveBeenCalledWith(request, request.user, 'payments.read');
  });
});

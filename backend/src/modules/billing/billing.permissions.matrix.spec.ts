import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { MasterBillingGuard } from '@shared/auth/master-billing.guard';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
  resolvePermissionOrgId,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';
import { PAYMENT_PERMISSION_REQUIREMENTS } from '@modules/payments/payment-permission.constants';
import { resolveOrgScope } from './billing-scope.util';

type TenantCapability =
  | 'saas_subscription_read'
  | 'saas_invoices_read'
  | 'payment_method_read'
  | 'payment_method_manage'
  | 'customer_portal'
  | 'customer_invoices_read'
  | 'customer_invoices_write'
  | 'customer_payments_manage'
  | 'stripe_connect_manage';

function capabilityGranted(
  permissions: MembershipPermissionsMap | null,
  capability: TenantCapability,
): boolean {
  switch (capability) {
    case 'saas_subscription_read':
    case 'saas_invoices_read':
    case 'payment_method_read':
      return evaluateModulePermission(permissions, 'billing', 'read');
    case 'payment_method_manage':
    case 'customer_portal':
      return evaluateModulePermission(permissions, 'billing', 'write');
    case 'customer_invoices_read':
      return evaluateModulePermission(permissions, 'invoices', 'read');
    case 'customer_invoices_write':
      return evaluateModulePermission(permissions, 'invoices', 'write');
    case 'customer_payments_manage':
      return evaluateModulePermission(permissions, 'payments', 'write');
    case 'stripe_connect_manage':
      return evaluateModulePermission(permissions, 'payments-connect', 'manage');
    default:
      return false;
  }
}

const templateByKey = (systemKey: string) =>
  DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((template) => template.systemKey === systemKey)!;

describe('Billing permissions matrix — tenant role templates', () => {
  const cases: Array<{
    label: string;
    systemKey: string;
    expected: Record<TenantCapability, boolean>;
  }> = [
    {
      label: 'Org Admin',
      systemKey: 'org_admin',
      expected: {
        saas_subscription_read: true,
        saas_invoices_read: true,
        payment_method_read: true,
        payment_method_manage: true,
        customer_portal: true,
        customer_invoices_read: true,
        customer_invoices_write: true,
        customer_payments_manage: true,
        stripe_connect_manage: true,
      },
    },
    {
      label: 'Sub Admin (default template)',
      systemKey: 'sub_admin',
      expected: {
        saas_subscription_read: true,
        saas_invoices_read: true,
        payment_method_read: true,
        payment_method_manage: false,
        customer_portal: false,
        customer_invoices_read: true,
        customer_invoices_write: true,
        customer_payments_manage: false,
        stripe_connect_manage: false,
      },
    },
    {
      label: 'Accounting',
      systemKey: 'accounting',
      expected: {
        saas_subscription_read: false,
        saas_invoices_read: false,
        payment_method_read: false,
        payment_method_manage: false,
        customer_portal: false,
        customer_invoices_read: true,
        customer_invoices_write: true,
        customer_payments_manage: true,
        stripe_connect_manage: false,
      },
    },
    {
      label: 'Worker / Employee',
      systemKey: 'employee',
      expected: {
        saas_subscription_read: false,
        saas_invoices_read: false,
        payment_method_read: false,
        payment_method_manage: false,
        customer_portal: false,
        customer_invoices_read: false,
        customer_invoices_write: false,
        customer_payments_manage: false,
        stripe_connect_manage: false,
      },
    },
    {
      label: 'Driver',
      systemKey: 'driver',
      expected: {
        saas_subscription_read: false,
        saas_invoices_read: false,
        payment_method_read: false,
        payment_method_manage: false,
        customer_portal: false,
        customer_invoices_read: false,
        customer_invoices_write: false,
        customer_payments_manage: false,
        stripe_connect_manage: false,
      },
    },
  ];

  it.each(cases)('$label capability matrix matches template defaults', ({ systemKey, expected }) => {
    const permissions = normalizeMembershipPermissions(templateByKey(systemKey).permissions);
    for (const [capability, allowed] of Object.entries(expected) as Array<
      [TenantCapability, boolean]
    >) {
      expect(capabilityGranted(permissions, capability)).toBe(allowed);
    }
  });

  it('Sub Admin with explicit billing.write override can manage payment methods and portal', () => {
    const base = normalizeMembershipPermissions(templateByKey('sub_admin').permissions)!;
    const overridden: MembershipPermissionsMap = {
      ...base,
      billing: { read: true, write: true, manage: false },
    };

    expect(capabilityGranted(overridden, 'payment_method_manage')).toBe(true);
    expect(capabilityGranted(overridden, 'customer_portal')).toBe(true);
    expect(capabilityGranted(overridden, 'stripe_connect_manage')).toBe(false);
  });

  it('Sub Admin without billing.write cannot open customer portal even if UI were tampered', () => {
    const permissions = normalizeMembershipPermissions(templateByKey('sub_admin').permissions);
    expect(capabilityGranted(permissions, 'customer_portal')).toBe(false);
  });
});

describe('Billing permissions matrix — direct API enforcement (hidden UI bypass)', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = { organizationMembership: { findFirst: jest.fn() } };
  let guard: PermissionsGuard;

  const buildCtx = (
    user: Record<string, unknown>,
    orgId = 'org-a',
    required: { module: string; level: 'read' | 'write' | 'manage' } = {
      module: 'billing',
      level: 'write',
    },
  ) => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(required);
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { orgId },
          query: {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
  };

  beforeEach(() => {
    guard = new PermissionsGuard(reflector, prisma as never);
    jest.clearAllMocks();
  });

  it('denies worker direct POST to billing.write routes without permission', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions(templateByKey('employee').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx(
          { id: 'worker-1', organizationId: 'org-a' },
          'org-a',
          { module: 'billing', level: 'write' },
        ) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies worker direct GET to customer invoices without invoices.read', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions(templateByKey('employee').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx(
          { id: 'worker-1', organizationId: 'org-a' },
          'org-a',
          { module: 'invoices', level: 'read' },
        ) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies driver direct GET to billing.read routes', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'DRIVER',
      permissions: normalizeMembershipPermissions(templateByKey('driver').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx(
          { id: 'driver-1', organizationId: 'org-a' },
          'org-a',
          { module: 'billing', level: 'read' },
        ) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies worker direct customer invoice write without invoices.write', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions(templateByKey('employee').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx(
          { id: 'worker-1', organizationId: 'org-a' },
          'org-a',
          { module: 'invoices', level: 'write' },
        ) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows accounting sub-admin customer invoice write without SaaS billing', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('accounting').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx(
          { id: 'acct-1', organizationId: 'org-a' },
          'org-a',
          { module: 'invoices', level: 'write' },
        ) as never,
      ),
    ).resolves.toBe(true);

    await expect(
      guard.canActivate(
        buildCtx(
          { id: 'acct-1', organizationId: 'org-a' },
          'org-a',
          { module: 'billing', level: 'read' },
        ) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies unauthenticated customer-style access', async () => {
    await expect(
      guard.canActivate(
        buildCtx(undefined as never, 'org-a', { module: 'billing', level: 'read' }) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies tenant user without active membership (customer never receives org membership)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        buildCtx({ id: 'external-1', organizationId: 'org-a' }, 'org-a', {
          module: 'invoices',
          level: 'read',
        }) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Billing permissions matrix — organization boundary hardening', () => {
  it('rejects tenant spoofing orgId in billing scope resolver', () => {
    expect(() =>
      resolveOrgScope({ platformRole: 'USER', organizationId: 'org-a' }, 'org-b'),
    ).toThrow(ForbiddenException);
  });

  it('rejects tenant spoofing orgId in permission org resolver', () => {
    expect(() =>
      resolvePermissionOrgId(
        { params: { orgId: 'org-b' }, query: {} },
        { platformRole: 'USER', organizationId: 'org-a' },
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows master admin cross-org lookup with explicit orgId', () => {
    expect(
      resolveOrgScope({ platformRole: 'MASTER_ADMIN' }, 'org-b'),
    ).toBe('org-b');
    expect(
      resolvePermissionOrgId(
        { params: { orgId: 'org-b' }, query: {} },
        { platformRole: 'MASTER_ADMIN' },
      ),
    ).toBe('org-b');
  });

  it('scopes tenant billing to JWT org when orgId omitted', () => {
    expect(
      resolveOrgScope({ platformRole: 'USER', organizationId: 'org-a' }, undefined),
    ).toBe('org-a');
  });
});

describe('Billing permissions matrix — master platform operators', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  let guard: MasterBillingGuard;

  const ctx = (user?: Record<string, unknown>) => ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  });

  beforeEach(() => {
    guard = new MasterBillingGuard(reflector);
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
  });

  const masterCapabilities = [
    'contracts_read_write',
    'pricing_manage',
    'discounts_manage',
    'invoices_read',
    'manual_payment',
    'system_status',
    'webhook_retry',
    'email_retry',
    'reconciliation',
  ] as const;

  it.each(masterCapabilities)(
    'MASTER_ADMIN may access master billing mutations (%s)',
    () => {
      expect(guard.canActivate(ctx({ platformRole: 'MASTER_ADMIN' }) as never)).toBe(true);
    },
  );

  it('delegated master-billing operator may access mutations without MASTER_ADMIN role', () => {
    expect(
      guard.canActivate(
        ctx({ platformRole: 'USER', platformPermissions: ['master-billing'] }) as never,
      ),
    ).toBe(true);
  });

  it('tenant ORG_ADMIN cannot access master billing mutations', () => {
    expect(() =>
      guard.canActivate(
        ctx({ platformRole: 'USER', membershipRole: 'ORG_ADMIN', organizationId: 'org-a' }) as never,
      ),
    ).toThrow(ForbiddenException);
  });

  it('tenant worker cannot access master billing mutations', () => {
    expect(() =>
      guard.canActivate(ctx({ platformRole: 'USER', organizationId: 'org-a' }) as never),
    ).toThrow(ForbiddenException);
  });
});

describe('Billing permissions matrix — payment action mapping', () => {
  it('maps customer payment management to payments.write not billing.write', () => {
    expect(PAYMENT_PERMISSION_REQUIREMENTS['payments.create']).toEqual({
      module: 'payments',
      level: 'write',
    });
    expect(PAYMENT_PERMISSION_REQUIREMENTS['payments.connect.manage']).toEqual({
      module: 'payments-connect',
      level: 'manage',
    });
  });

  it('keeps SaaS billing separate from end-customer payment modules in org_admin template', () => {
    const permissions = normalizeMembershipPermissions(templateByKey('org_admin').permissions);
    expect(evaluateModulePermission(permissions, 'billing', 'write')).toBe(true);
    expect(evaluateModulePermission(permissions, 'payments', 'write')).toBe(true);
    expect(evaluateModulePermission(permissions, 'payments-connect', 'manage')).toBe(true);
  });
});

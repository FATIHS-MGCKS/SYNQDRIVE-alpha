import { ForbiddenException } from '@nestjs/common';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import {
  normalizeMembershipPermissions,
  resolvePermissionOrgId,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';
import { EVALUATIONS_PERMISSION_ACTIONS } from './evaluations-permission.constants';
import { EvaluationsAccessService } from './evaluations-access.service';
import type { EvaluationsPermissionAction } from './evaluations-permission.constants';

const templateByKey = (systemKey: string) =>
  DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((template) => template.systemKey === systemKey)!;

describe('Evaluations permissions matrix — tenant role templates', () => {
  const access = new EvaluationsAccessService({} as never, {} as never);

  const evaluate = (
    permissions: MembershipPermissionsMap | null,
    action: EvaluationsPermissionAction,
    membershipRole?: string,
  ) =>
    access.evaluateEvaluationsPermission(permissions, action, {
      membershipRole,
    });

  const cases: Array<{
    label: string;
    systemKey: string;
    expected: Record<EvaluationsPermissionAction, boolean>;
  }> = [
    {
      label: 'Org Admin',
      systemKey: 'org_admin',
      expected: {
        'evaluations.executive.read': true,
        'evaluations.finance.read': true,
        'evaluations.receivables.read': true,
        'evaluations.customer_pii.read': true,
        'evaluations.driver.read': true,
        'evaluations.costs.read': true,
        'evaluations.forecasts.read': true,
        'evaluations.data_quality.read': true,
        'evaluations.recommendations.write': true,
        'evaluations.assignees.write': true,
        'evaluations.export.write': true,
        'evaluations.admin.manage': true,
      },
    },
    {
      label: 'Sub Admin',
      systemKey: 'sub_admin',
      expected: {
        'evaluations.executive.read': true,
        'evaluations.finance.read': true,
        'evaluations.receivables.read': true,
        'evaluations.customer_pii.read': true,
        'evaluations.driver.read': true,
        'evaluations.costs.read': true,
        'evaluations.forecasts.read': true,
        'evaluations.data_quality.read': true,
        'evaluations.recommendations.write': true,
        'evaluations.assignees.write': true,
        'evaluations.export.write': false,
        'evaluations.admin.manage': false,
      },
    },
    {
      label: 'Accounting',
      systemKey: 'accounting',
      expected: {
        'evaluations.executive.read': true,
        'evaluations.finance.read': true,
        'evaluations.receivables.read': true,
        'evaluations.customer_pii.read': true,
        'evaluations.driver.read': false,
        'evaluations.costs.read': true,
        'evaluations.forecasts.read': true,
        'evaluations.data_quality.read': false,
        'evaluations.recommendations.write': false,
        'evaluations.assignees.write': false,
        'evaluations.export.write': true,
        'evaluations.admin.manage': false,
      },
    },
    {
      label: 'Station Manager',
      systemKey: 'station_manager',
      expected: {
        'evaluations.executive.read': true,
        'evaluations.finance.read': false,
        'evaluations.receivables.read': false,
        'evaluations.customer_pii.read': false,
        'evaluations.driver.read': false,
        'evaluations.costs.read': false,
        'evaluations.forecasts.read': true,
        'evaluations.data_quality.read': false,
        'evaluations.recommendations.write': true,
        'evaluations.assignees.write': true,
        'evaluations.export.write': false,
        'evaluations.admin.manage': false,
      },
    },
    {
      label: 'Disposition',
      systemKey: 'disposition',
      expected: {
        'evaluations.executive.read': true,
        'evaluations.finance.read': false,
        'evaluations.receivables.read': false,
        'evaluations.customer_pii.read': false,
        'evaluations.driver.read': false,
        'evaluations.costs.read': false,
        'evaluations.forecasts.read': false,
        'evaluations.data_quality.read': false,
        'evaluations.recommendations.write': false,
        'evaluations.assignees.write': false,
        'evaluations.export.write': false,
        'evaluations.admin.manage': false,
      },
    },
    {
      label: 'Service / Workshop',
      systemKey: 'service',
      expected: {
        'evaluations.executive.read': true,
        'evaluations.finance.read': false,
        'evaluations.receivables.read': false,
        'evaluations.customer_pii.read': false,
        'evaluations.driver.read': true,
        'evaluations.costs.read': false,
        'evaluations.forecasts.read': true,
        'evaluations.data_quality.read': false,
        'evaluations.recommendations.write': false,
        'evaluations.assignees.write': false,
        'evaluations.export.write': false,
        'evaluations.admin.manage': false,
      },
    },
    {
      label: 'Read-only analytics',
      systemKey: 'read_only',
      expected: {
        'evaluations.executive.read': true,
        'evaluations.finance.read': true,
        'evaluations.receivables.read': true,
        'evaluations.customer_pii.read': false,
        'evaluations.driver.read': false,
        'evaluations.costs.read': true,
        'evaluations.forecasts.read': true,
        'evaluations.data_quality.read': true,
        'evaluations.recommendations.write': false,
        'evaluations.assignees.write': false,
        'evaluations.export.write': false,
        'evaluations.admin.manage': false,
      },
    },
    {
      label: 'Employee',
      systemKey: 'employee',
      expected: Object.fromEntries(
        EVALUATIONS_PERMISSION_ACTIONS.map((action) => [action, false]),
      ) as Record<EvaluationsPermissionAction, boolean>,
    },
    {
      label: 'Driver',
      systemKey: 'driver',
      expected: Object.fromEntries(
        EVALUATIONS_PERMISSION_ACTIONS.map((action) => [action, false]),
      ) as Record<EvaluationsPermissionAction, boolean>,
    },
    {
      label: 'Field Agent',
      systemKey: 'field_agent',
      expected: {
        ...Object.fromEntries(
          EVALUATIONS_PERMISSION_ACTIONS.map((action) => [action, false]),
        ),
        'evaluations.assignees.write': true,
      } as Record<EvaluationsPermissionAction, boolean>,
    },
  ];

  it.each(cases)('$label capability matrix matches template defaults', ({ systemKey, expected }) => {
    const template = templateByKey(systemKey);
    const permissions = normalizeMembershipPermissions(template.permissions);

    for (const action of EVALUATIONS_PERMISSION_ACTIONS) {
      expect(evaluate(permissions, action, template.membershipRole)).toBe(expected[action]);
    }
  });

  it('legacy invoices.read grants executive and finance aggregates but not export', () => {
    const legacyOnly: MembershipPermissionsMap = {
      invoices: { read: true, write: false, manage: false },
    };

    expect(evaluate(legacyOnly, 'evaluations.executive.read')).toBe(true);
    expect(evaluate(legacyOnly, 'evaluations.finance.read')).toBe(true);
    expect(evaluate(legacyOnly, 'evaluations.receivables.read')).toBe(true);
    expect(evaluate(legacyOnly, 'evaluations.costs.read')).toBe(true);
    expect(evaluate(legacyOnly, 'evaluations.export.write')).toBe(false);
    expect(evaluate(legacyOnly, 'evaluations.admin.manage')).toBe(false);
  });

  it('legacy data-analyse.read grants forecasts and data quality but not finance PII', () => {
    const legacyOnly: MembershipPermissionsMap = {
      'data-analyse': { read: true, write: false, manage: false },
    };

    expect(evaluate(legacyOnly, 'evaluations.forecasts.read')).toBe(true);
    expect(evaluate(legacyOnly, 'evaluations.data_quality.read')).toBe(true);
    expect(evaluate(legacyOnly, 'evaluations.finance.read')).toBe(false);
    expect(evaluate(legacyOnly, 'evaluations.customer_pii.read')).toBe(false);
  });

  it('legacy fleet-condition.read grants driver analysis only', () => {
    const legacyOnly: MembershipPermissionsMap = {
      'fleet-condition': { read: true, write: false, manage: false },
    };

    expect(evaluate(legacyOnly, 'evaluations.driver.read')).toBe(true);
    expect(evaluate(legacyOnly, 'evaluations.executive.read')).toBe(false);
  });

  it('customer PII requires explicit module or invoices+customers legacy pair', () => {
    const invoicesOnly: MembershipPermissionsMap = {
      invoices: { read: true, write: false, manage: false },
    };
    const customersOnly: MembershipPermissionsMap = {
      customers: { read: true, write: false, manage: false },
    };
    const both: MembershipPermissionsMap = {
      invoices: { read: true, write: false, manage: false },
      customers: { read: true, write: false, manage: false },
    };

    expect(evaluate(invoicesOnly, 'evaluations.customer_pii.read')).toBe(false);
    expect(evaluate(customersOnly, 'evaluations.customer_pii.read')).toBe(false);
    expect(evaluate(both, 'evaluations.customer_pii.read')).toBe(true);
  });

  it('assignees.write falls back to tasks.write', () => {
    const tasksWriter: MembershipPermissionsMap = {
      tasks: { read: true, write: true, manage: false },
    };

    expect(evaluate(tasksWriter, 'evaluations.assignees.write')).toBe(true);
    expect(evaluate(tasksWriter, 'evaluations.recommendations.write')).toBe(false);
  });

  it('separates aggregate finance from customer PII for read-only analytics template', () => {
    const permissions = normalizeMembershipPermissions(templateByKey('read_only').permissions);

    expect(evaluate(permissions, 'evaluations.finance.read')).toBe(true);
    expect(evaluate(permissions, 'evaluations.customer_pii.read')).toBe(false);
  });
});

describe('Evaluations permissions matrix — organization boundary hardening', () => {
  const prisma = {
    organizationMembership: {
      findFirst: jest.fn(),
    },
  };
  const stationAccess = {
    resolve: jest.fn(),
    assertStationReadable: jest.fn(),
  };
  const access = new EvaluationsAccessService(prisma as never, stationAccess as never);

  beforeEach(() => {
    jest.clearAllMocks();
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
      resolvePermissionOrgId(
        { params: { orgId: 'org-b' }, query: {} },
        { platformRole: 'MASTER_ADMIN' },
      ),
    ).toBe('org-b');
  });

  it('denies membership from another organization even with finance permissions', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue(null);

    await expect(
      access.assertEvaluationsPermission('org-b', { id: 'user-a', platformRole: 'USER' }, 'evaluations.finance.read'),
    ).rejects.toMatchObject({
      response: { message: 'You do not have access to this organization', statusCode: 403 },
    });
  });

  it('denies employee export even when invoices.read is present via manipulated JSON', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions({
        invoices: { read: true, write: false },
        evaluations: { read: true, write: false },
      }),
    });

    await expect(
      access.assertEvaluationsPermission('org-a', { id: 'worker-1', platformRole: 'USER' }, 'evaluations.export.write'),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: evaluations.export.write', statusCode: 403 },
    });
  });

  it('allows accounting export with explicit evaluations-export.write module', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('accounting').permissions),
    });

    await expect(
      access.assertEvaluationsPermission('org-a', { id: 'acct-1', platformRole: 'USER' }, 'evaluations.export.write'),
    ).resolves.toBeTruthy();
  });
});

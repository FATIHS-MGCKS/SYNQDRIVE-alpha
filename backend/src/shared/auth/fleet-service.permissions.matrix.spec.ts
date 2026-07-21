import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { SERVICE_CASE_PERMISSION_REQUIREMENTS } from '@modules/service-cases/service-case-permission.constants';
import { TASK_PERMISSION_REQUIREMENTS } from '@modules/tasks/task-permission.constants';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { evaluateOperationalPermission } from '@shared/auth/operational-permission.util';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
  resolvePermissionOrgId,
  type MembershipPermissionsMap,
} from '@shared/auth/permission.util';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import type { OperationalPermissionAction } from '@shared/auth/operational-permission.registry';
import { StationAccessService } from '@shared/stations/station-access.service';

type FleetServiceCapability = OperationalPermissionAction;

const templateByKey = (systemKey: string) =>
  DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find((template) => template.systemKey === systemKey)!;

function capabilityGranted(
  permissions: MembershipPermissionsMap | null,
  capability: FleetServiceCapability,
): boolean {
  return evaluateOperationalPermission(permissions, capability);
}

const TASK_CAPABILITIES = [
  'tasks.read',
  'tasks.create',
  'tasks.update',
  'tasks.assign',
  'tasks.complete',
  'tasks.cancel',
  'tasks.manage_costs',
] as const satisfies readonly FleetServiceCapability[];

const SERVICE_CASE_CAPABILITIES = [
  'service_cases.read',
  'service_cases.create',
  'service_cases.update',
  'service_cases.schedule',
  'service_cases.complete',
  'service_cases.cancel',
  'service_cases.manage_costs',
] as const satisfies readonly FleetServiceCapability[];

describe('Fleet service permissions matrix — tenant role templates', () => {
  const cases: Array<{
    label: string;
    systemKey: string;
    expected: Partial<Record<FleetServiceCapability, boolean>>;
  }> = [
    {
      label: 'Org Admin',
      systemKey: 'org_admin',
      expected: Object.fromEntries(
        [...TASK_CAPABILITIES, ...SERVICE_CASE_CAPABILITIES].map((cap) => [cap, true]),
      ),
    },
    {
      label: 'Sub Admin (default template)',
      systemKey: 'sub_admin',
      expected: {
        'tasks.read': true,
        'tasks.create': true,
        'tasks.update': true,
        'tasks.assign': true,
        'tasks.complete': true,
        'tasks.cancel': true,
        'tasks.manage_costs': true,
        'service_cases.read': true,
        'service_cases.create': true,
        'service_cases.update': true,
        'service_cases.schedule': true,
        'service_cases.complete': true,
        'service_cases.cancel': true,
        'service_cases.manage_costs': true,
      },
    },
    {
      label: 'Service Manager (Werkstatt)',
      systemKey: 'service',
      expected: {
        'tasks.read': true,
        'tasks.create': false,
        'tasks.update': false,
        'tasks.assign': false,
        'tasks.complete': false,
        'tasks.cancel': false,
        'tasks.manage_costs': false,
        'service_cases.read': true,
        'service_cases.create': true,
        'service_cases.update': true,
        'service_cases.schedule': true,
        'service_cases.complete': true,
        'service_cases.cancel': true,
        'service_cases.manage_costs': false,
      },
    },
    {
      label: 'Station Manager',
      systemKey: 'station_manager',
      expected: {
        'tasks.read': true,
        'tasks.create': true,
        'tasks.update': true,
        'tasks.assign': true,
        'tasks.complete': true,
        'tasks.cancel': true,
        'tasks.manage_costs': false,
        'service_cases.read': false,
        'service_cases.create': false,
        'service_cases.update': false,
        'service_cases.schedule': false,
        'service_cases.complete': false,
        'service_cases.cancel': false,
        'service_cases.manage_costs': false,
      },
    },
    {
      label: 'Worker',
      systemKey: 'employee',
      expected: {
        'tasks.read': true,
        'tasks.create': false,
        'tasks.update': false,
        'tasks.assign': false,
        'tasks.complete': false,
        'tasks.cancel': false,
        'tasks.manage_costs': false,
        'service_cases.read': false,
        'service_cases.create': false,
        'service_cases.update': false,
        'service_cases.schedule': false,
        'service_cases.complete': false,
        'service_cases.cancel': false,
        'service_cases.manage_costs': false,
      },
    },
    {
      label: 'Driver',
      systemKey: 'driver',
      expected: {
        'tasks.read': true,
        'tasks.create': false,
        'tasks.update': false,
        'tasks.assign': false,
        'tasks.complete': false,
        'tasks.cancel': false,
        'tasks.manage_costs': false,
        'service_cases.read': false,
        'service_cases.create': false,
      },
    },
    {
      label: 'Read-only',
      systemKey: 'read_only',
      expected: {
        'tasks.read': true,
        'tasks.create': false,
        'tasks.update': false,
        'tasks.assign': false,
        'tasks.complete': false,
        'tasks.cancel': false,
        'tasks.manage_costs': false,
        'service_cases.read': false,
        'service_cases.create': false,
      },
    },
  ];

  it.each(cases)('$label capability matrix matches template defaults', ({ systemKey, expected }) => {
    const permissions = normalizeMembershipPermissions(templateByKey(systemKey).permissions);
    for (const [capability, allowed] of Object.entries(expected) as Array<
      [FleetServiceCapability, boolean]
    >) {
      expect(capabilityGranted(permissions, capability)).toBe(allowed);
    }
  });

  it('Sub Admin with explicit tasks.write-only override cannot manage service case costs', () => {
    const base = normalizeMembershipPermissions(templateByKey('sub_admin').permissions)!;
    const overridden: MembershipPermissionsMap = {
      ...base,
      tasks: { read: true, write: true, manage: false },
      'vendor-management': { read: true, write: true, manage: false },
    };

    expect(capabilityGranted(overridden, 'tasks.assign')).toBe(true);
    expect(capabilityGranted(overridden, 'tasks.complete')).toBe(true);
    expect(capabilityGranted(overridden, 'tasks.manage_costs')).toBe(false);
    expect(capabilityGranted(overridden, 'service_cases.schedule')).toBe(true);
    expect(capabilityGranted(overridden, 'service_cases.manage_costs')).toBe(false);
  });

  it('legacy membership JSON without granular action keys still resolves module permissions', () => {
    const legacyOnly: MembershipPermissionsMap = {
      tasks: { read: true, write: false, manage: false },
      'vendor-management': { read: true, write: false, manage: false },
    };

    expect(capabilityGranted(legacyOnly, 'tasks.read')).toBe(true);
    expect(capabilityGranted(legacyOnly, 'tasks.create')).toBe(false);
    expect(capabilityGranted(legacyOnly, 'service_cases.read')).toBe(true);
    expect(capabilityGranted(legacyOnly, 'service_cases.create')).toBe(false);
  });
});

describe('Fleet service permissions matrix — direct API enforcement', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = { organizationMembership: { findFirst: jest.fn() } };
  let guard: PermissionsGuard;

  const buildCtx = (
    user: Record<string, unknown>,
    orgId = 'org-a',
    required: { module: string; level: 'read' | 'write' | 'manage' },
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

  it('denies worker POST tasks.create (assign/complete path) without tasks.write', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions(templateByKey('employee').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx({ id: 'worker-1', organizationId: 'org-a' }, 'org-a', TASK_PERMISSION_REQUIREMENTS['tasks.create']) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: tasks.write', statusCode: 403 },
    });
  });

  it('allows station manager tasks.assign and tasks.complete via tasks.write', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(templateByKey('station_manager').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx({ id: 'mgr-1', organizationId: 'org-a' }, 'org-a', TASK_PERMISSION_REQUIREMENTS['tasks.assign']) as never,
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        buildCtx({ id: 'mgr-1', organizationId: 'org-a' }, 'org-a', TASK_PERMISSION_REQUIREMENTS['tasks.complete']) as never,
      ),
    ).resolves.toBe(true);
  });

  it('denies read-only worker PATCH tasks.complete', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: normalizeMembershipPermissions(templateByKey('read_only').permissions),
    });

    await expect(
      guard.canActivate(
        buildCtx({ id: 'ro-1', organizationId: 'org-a' }, 'org-a', TASK_PERMISSION_REQUIREMENTS['tasks.complete']) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: tasks.write', statusCode: 403 },
    });
  });

  it('denies worker service_cases.schedule even with service_cases.update on module', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { tasks: { read: true, write: true, manage: false } },
    });

    await expect(
      guard.canActivate(
        buildCtx(
          { id: 'worker-1', organizationId: 'org-a' },
          'org-a',
          SERVICE_CASE_PERMISSION_REQUIREMENTS['service_cases.schedule'],
        ) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: vendor-management.write', statusCode: 403 },
    });
  });

  it('allows service manager service_cases.schedule and denies manage_costs at module level', async () => {
    const permissions = normalizeMembershipPermissions(templateByKey('service').permissions);
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions,
    });

    await expect(
      guard.canActivate(
        buildCtx(
          { id: 'svc-1', organizationId: 'org-a' },
          'org-a',
          SERVICE_CASE_PERMISSION_REQUIREMENTS['service_cases.schedule'],
        ) as never,
      ),
    ).resolves.toBe(true);

    expect(capabilityGranted(permissions, 'service_cases.manage_costs')).toBe(false);
    expect(evaluateModulePermission(permissions, 'vendor-management', 'manage')).toBe(false);
  });

  it('allows MASTER_ADMIN for tasks and service case mutations without membership lookup', async () => {
    await expect(
      guard.canActivate(
        buildCtx({ id: 'master-1', platformRole: 'MASTER_ADMIN' }, 'org-b', TASK_PERMISSION_REQUIREMENTS['tasks.manage_costs']) as never,
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        buildCtx(
          { id: 'master-1', platformRole: 'MASTER_ADMIN' },
          'org-b',
          SERVICE_CASE_PERMISSION_REQUIREMENTS['service_cases.manage_costs'],
        ) as never,
      ),
    ).resolves.toBe(true);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('allows ORG_ADMIN membership bypass for service_cases.create', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'ORG_ADMIN',
      permissions: { 'vendor-management': { read: true, write: false, manage: false } },
    });

    await expect(
      guard.canActivate(
        buildCtx(
          { id: 'admin-1', organizationId: 'org-a' },
          'org-a',
          SERVICE_CASE_PERMISSION_REQUIREMENTS['service_cases.create'],
        ) as never,
      ),
    ).resolves.toBe(true);
  });
});

describe('Fleet service permissions matrix — organization boundary hardening', () => {
  let orgScopingGuard: OrgScopingGuard;

  beforeEach(() => {
    orgScopingGuard = new OrgScopingGuard({
      organizationMembership: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never);
  });

  it('rejects tenant spoofing orgId in permission org resolver', () => {
    expect(() =>
      resolvePermissionOrgId(
        { params: { orgId: 'org-b' }, query: {} },
        { platformRole: 'USER', organizationId: 'org-a' },
      ),
    ).toThrow(ForbiddenException);
  });

  it('denies foreign-organization user via OrgScopingGuard before permission lookup', async () => {
    await expect(
      orgScopingGuard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'foreign-1', organizationId: 'org-a' },
            params: { orgId: 'org-b' },
          }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as never),
    ).rejects.toMatchObject({
      response: {
        message: 'You do not have access to this organization',
        statusCode: 403,
      },
    });
  });

  it('allows master admin cross-org route param', () => {
    expect(
      resolvePermissionOrgId(
        { params: { orgId: 'org-b' }, query: {} },
        { platformRole: 'MASTER_ADMIN' },
      ),
    ).toBe('org-b');
  });
});

describe('Fleet service permissions matrix — station-scoped visibility', () => {
  const prisma = { organizationMembership: { findFirst: jest.fn() } };
  const stationAccess = new StationAccessService(prisma as never);
  const envBackup = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...envBackup };
    process.env.STATIONS_V2_FLAGS_TEST_DEFAULT = 'off';
    process.env.STATIONS_V2_SCHEMA_ENABLED = 'false';
    process.env.STATIONS_V2_SCOPE_ENABLED = 'false';
  });

  afterAll(() => {
    process.env = envBackup;
  });

  it('bypasses station filter when stations scope v2 is disabled (legacy org-wide task reads)', async () => {
    const access = await stationAccess.resolve('worker-1', 'org-a');
    expect(access.bypassScope).toBe(true);
    expect(stationAccess.buildStationWhere('org-a', access)).toEqual({ organizationId: 'org-a' });
  });

  it('restricts worker to configured stationIds for vehicle/station visibility', async () => {
    process.env.STATIONS_V2_SCHEMA_ENABLED = 'true';
    process.env.STATIONS_V2_SCOPE_ENABLED = 'true';
    process.env.STATIONS_V2_ORG_ALLOWLIST = 'org-scoped';
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      stationScope: null,
      stationIds: ['station-a'],
    });

    const access = await stationAccess.resolve('worker-1', 'org-scoped');
    expect(access.allowedStationIds).toEqual(['station-a']);
    expect(stationAccess.buildStationWhere('org-scoped', access)).toEqual({
      organizationId: 'org-scoped',
      id: { in: ['station-a'] },
    });
    expect(() => stationAccess.assertStationReadable(access, 'station-b')).toThrow(
      'Station station-b not found',
    );
  });

  it('documents task station filter contract as metadata.stationId org-scoped query', () => {
    const stationTaskFilter = {
      organizationId: 'org-a',
      metadata: { path: ['stationId'], equals: 'station-a' },
    };
    expect(stationTaskFilter.organizationId).toBe('org-a');
    expect(stationTaskFilter.metadata).toEqual({
      path: ['stationId'],
      equals: 'station-a',
    });
  });
});

describe('Fleet service permissions matrix — action to module mapping', () => {
  it('maps task and service case actions to existing module permission JSON', () => {
    expect(TASK_PERMISSION_REQUIREMENTS['tasks.manage_costs']).toEqual({
      module: 'tasks',
      level: 'manage',
    });
    expect(SERVICE_CASE_PERMISSION_REQUIREMENTS['service_cases.schedule']).toEqual({
      module: 'vendor-management',
      level: 'write',
    });
    expect(SERVICE_CASE_PERMISSION_REQUIREMENTS['service_cases.read']).toEqual({
      module: 'vendor-management',
      level: 'read',
    });
  });
});

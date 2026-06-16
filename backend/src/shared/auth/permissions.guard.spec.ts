import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
} from './permission.util';

describe('permission.util', () => {
  it('normalizes and drops unknown permission modules', () => {
    const result = normalizeMembershipPermissions({
      bookings: { read: true, write: false },
      'evil-module': { read: true, write: true },
    });
    expect(result).toEqual({ bookings: { read: true, write: false, manage: false } });
  });

  it('evaluateModulePermission denies manage without explicit manage flag', () => {
    const perms = normalizeMembershipPermissions({
      'users-roles': { read: true, write: true },
    });
    expect(evaluateModulePermission(perms, 'users-roles', 'read')).toBe(true);
    expect(evaluateModulePermission(perms, 'users-roles', 'write')).toBe(true);
    expect(evaluateModulePermission(perms, 'users-roles', 'manage')).toBe(false);
  });

  it('evaluateModulePermission allows manage to satisfy write and read', () => {
    const perms = normalizeMembershipPermissions({
      'users-roles': { read: false, write: false, manage: true },
    });
    expect(evaluateModulePermission(perms, 'users-roles', 'read')).toBe(true);
    expect(evaluateModulePermission(perms, 'users-roles', 'write')).toBe(true);
    expect(evaluateModulePermission(perms, 'users-roles', 'manage')).toBe(true);
  });

  it('evaluateModulePermission allows manage when manage flag set', () => {
    const perms = normalizeMembershipPermissions({
      'users-roles': { read: true, write: false, manage: true },
    });
    expect(evaluateModulePermission(perms, 'users-roles', 'manage')).toBe(true);
  });
});

describe('PermissionsGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };
  let guard: PermissionsGuard;

  beforeEach(() => {
    guard = new PermissionsGuard(reflector, prisma as never);
    jest.clearAllMocks();
  });

  it('passes when no permission metadata', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'u1' }, params: { orgId: 'org-1' } }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
  });

  it('denies unauthenticated requests when permission required', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'users-roles',
      level: 'read',
    });
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ params: { orgId: 'org-1' } }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows ORG_ADMIN via active membership in database', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'users-roles',
      level: 'manage',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'ORG_ADMIN',
      permissions: null,
    });
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'u1', membershipRole: 'WORKER' },
          params: { orgId: 'org-1' },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    await expect(guard.canActivate(ctx as never)).resolves.toBe(true);
    expect(prisma.organizationMembership.findFirst).toHaveBeenCalled();
  });

  it('denies worker without users-roles.read', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue({
      module: 'users-roles',
      level: 'read',
    });
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { dashboard: { read: true, write: false } },
    });
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'u1', membershipRole: 'WORKER' },
          params: { orgId: 'org-1' },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    await expect(guard.canActivate(ctx as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

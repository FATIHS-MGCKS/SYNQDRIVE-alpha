import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS } from './legal-document-permission.constants';

describe('Legal documents permission enforcement', () => {
  const orgId = 'org-a';
  const userId = 'user-1';

  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };

  let permissionsGuard: PermissionsGuard;
  let orgScopingGuard: OrgScopingGuard;

  const viewRequirement = LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS['legal_documents.view'];
  const uploadRequirement = LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS['legal_documents.upload'];
  const approveRequirement = LEGAL_DOCUMENT_PERMISSION_REQUIREMENTS['legal_documents.approve'];

  function permissionsContext(
    user: Record<string, unknown> | undefined,
    routeOrgId = orgId,
    requirement = viewRequirement,
  ) {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(requirement);
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { orgId: routeOrgId },
          query: {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
  }

  beforeEach(() => {
    permissionsGuard = new PermissionsGuard(reflector, prisma as never);
    orgScopingGuard = new OrgScopingGuard(prisma as never);
    jest.clearAllMocks();
  });

  it('denies worker without legal-documents.read (403)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { dashboard: { read: true, write: false } },
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: legal-documents.read', statusCode: 403 },
    });
  });

  it('allows worker with legal-documents.read for list/detail/download', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { 'legal-documents': { read: true, write: false } },
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }) as never,
      ),
    ).resolves.toBe(true);
  });

  it('denies uploader role without write on upload mutation', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { 'legal-documents': { read: true, write: false } },
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, uploadRequirement) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows editor with write but denies approve without manage', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { 'legal-documents': { read: true, write: true, manage: false } },
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, uploadRequirement) as never,
      ),
    ).resolves.toBe(true);

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, approveRequirement) as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: legal-documents.manage' },
    });
  });

  it('allows ORG_ADMIN via DB membership bypass', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'ORG_ADMIN',
      permissions: null,
    });

    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, orgId, approveRequirement) as never,
      ),
    ).resolves.toBe(true);
  });

  it('allows MASTER_ADMIN without membership lookup', async () => {
    await expect(
      permissionsGuard.canActivate(
        permissionsContext({ id: userId, platformRole: 'MASTER_ADMIN' }, orgId, approveRequirement) as never,
      ),
    ).resolves.toBe(true);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('denies cross-tenant org access via OrgScopingGuard', async () => {
    await expect(
      orgScopingGuard.canActivate(
        permissionsContext({ id: userId, organizationId: orgId }, 'org-other') as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'You do not have access to this organization', statusCode: 403 },
    });
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });
});

import { MembershipRole, MembershipStatus, RefreshTokenScope, UserStatus } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { UserAccessAuditService } from './user-access-audit.service';
import { UsersService } from './users.service';
import { OrganizationInviteService } from './organization-invite.service';
import { InviteAcceptService } from './invite-accept.service';
import { OrganizationRoleService } from './organization-role.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamSessionPolicyService } from '@modules/auth/iam-session-policy.service';
import { ConfigService } from '@nestjs/config';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import type { RefreshTokenUserContext } from '@modules/auth/refresh-token.service';

export const IAM_REGRESSION_IDS = {
  orgA: 'org-regression-a',
  orgB: 'org-regression-b',
  adminA: 'user-admin-a',
  multiOrgUser: 'user-multi-org',
  workerB: 'user-worker-b',
  roleCustomAdmin: 'role-custom-admin-equiv',
  roleWorker: 'role-worker',
  membershipA: 'membership-a',
  membershipB: 'membership-b',
  invitePending: 'invite-pending-1',
} as const;

export function createUsersServiceHarness() {
  const prisma: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    organizationMembership: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    station: { count: jest.Mock };
    organizationRole: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  } = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    organizationMembership: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    station: { count: jest.fn().mockResolvedValue(0) },
    organizationRole: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma),
  );
  const userAudit: { record: jest.Mock } = { record: jest.fn().mockResolvedValue(undefined) };
  const sessionPolicy: {
    enqueueInTransaction: jest.Mock;
    processIntents: jest.Mock;
  } = {
    enqueueInTransaction: jest.fn().mockResolvedValue({ intentIds: [], scopes: [] }),
    processIntents: jest.fn().mockResolvedValue([]),
  };
  const passwordReset = {
    requestAdminReset: jest.fn().mockResolvedValue({
      status: 'accepted',
      message:
        'If an account exists for this request, password reset instructions will be sent to the verified email address.',
    }),
  };
  const iamAudit = {
    enqueueInTransaction: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    processOutboxIds: jest.fn().mockResolvedValue(undefined),
  };
  const lifecycle = {
    remove: jest.fn().mockResolvedValue({ removed: true }),
    reactivate: jest.fn().mockResolvedValue({ reactivated: true }),
    suspend: jest.fn().mockResolvedValue({ suspended: true }),
    updateAccess: jest.fn().mockResolvedValue({ updated: true }),
  };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    iamAudit as unknown as import('./iam-audit.service').IamAuditService,
    lifecycle as unknown as import('./iam-membership-lifecycle.service').IamMembershipLifecycleService,
    passwordReset as unknown as import('@modules/auth/password-reset.service').PasswordResetService,
    sessionPolicy as unknown as import('@modules/auth/iam-session-policy.service').IamSessionPolicyService,
  );
  return { prisma, iamAudit, lifecycle, passwordReset, userAudit, sessionPolicy, service };
}

export function createInviteAcceptServiceHarness() {
  const prisma: {
    organizationUserInvite: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: { findUnique: jest.Mock; create: jest.Mock };
    organizationMembership: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  } = {
    organizationUserInvite: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn(), create: jest.fn() },
    organizationMembership: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma),
  );
  const lifecycle = {
    join: jest.fn().mockResolvedValue({ membershipId: 'mem-1', idempotent: false }),
    reactivate: jest.fn().mockResolvedValue({ membershipId: 'mem-1', idempotent: false }),
    applyJoinInTransaction: jest.fn(),
  };
  const iamAudit = {
    enqueueInTransaction: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    processOutboxIds: jest.fn().mockResolvedValue(undefined),
  };
  const { PasswordPolicyService } = require('@shared/auth/password-policy.service') as typeof import('@shared/auth/password-policy.service');
  const service = new InviteAcceptService(
    prisma as unknown as PrismaService,
    lifecycle as unknown as import('./iam-membership-lifecycle.service').IamMembershipLifecycleService,
    iamAudit as unknown as import('./iam-audit.service').IamAuditService,
    new PasswordPolicyService(),
  );
  return { prisma, lifecycle, iamAudit, service };
}

export function createInviteServiceHarness() {
  const prisma: {
    organization: { findUnique: jest.Mock };
    organizationUserInvite: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findMany: jest.Mock;
    };
    user: { findUnique: jest.Mock; create: jest.Mock };
    organizationMembership: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  } = {
    organization: {
      findUnique: jest.fn().mockResolvedValue({ companyName: 'Org A' }),
    },
    organizationUserInvite: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    user: { findUnique: jest.fn(), create: jest.fn() },
    organizationMembership: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma),
  );
  const roleService = {
    ensureDefaultRoles: jest.fn().mockResolvedValue(undefined),
    resolveRoleForInvite: jest.fn(),
    inviteExpiryDays: 7,
  };
  const mail = { sendOrganizationInvite: jest.fn().mockResolvedValue(undefined) };
  const userAudit = { record: jest.fn().mockResolvedValue(undefined) };
  const iamAudit = {
    enqueueInTransaction: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
    processOutboxIds: jest.fn().mockResolvedValue(undefined),
  };
  const inviteRateLimit = {
    assertWithinLimits: jest.fn().mockResolvedValue(undefined),
  };
  const inviteDelivery = {
    enqueueInviteEmail: jest.fn().mockResolvedValue({ deliveryStatus: 'queued' }),
  };
  const inviteOutbox = {
    createPending: jest.fn().mockResolvedValue({ id: 'outbox-invite-1' }),
  };
  const service = new OrganizationInviteService(
    prisma as unknown as PrismaService,
    roleService as unknown as OrganizationRoleService,
    iamAudit as unknown as import('./iam-audit.service').IamAuditService,
    inviteRateLimit as unknown as import('./invite-rate-limit.service').InviteRateLimitService,
    inviteDelivery as unknown as import('./invite-email-delivery.service').InviteEmailDeliveryService,
    inviteOutbox as unknown as import('./invite-email-outbox.repository').InviteEmailOutboxRepository,
  );
  return { prisma, roleService, mail, userAudit, iamAudit, inviteRateLimit, inviteDelivery, inviteOutbox, service };
}

export function createRoleServiceHarness() {
  const prisma: {
    organizationRole: {
      count: jest.Mock;
      upsert: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    organizationMembership: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    organizationRoleVersion: {
      count: jest.Mock;
    };
  } = {
    organizationRole: {
      count: jest.fn(),
      upsert: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organizationMembership: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    organizationRoleVersion: {
      count: jest.fn().mockResolvedValue(1),
    },
  };
  const userAudit = { record: jest.fn().mockResolvedValue(undefined) };
  const roleVersionService = {
    createInitialVersionForRole: jest.fn().mockResolvedValue({ id: 'ver-1' }),
    maybeCreateVersionOnRoleUpdate: jest.fn().mockResolvedValue(null),
    assignRoleToMembership: jest.fn().mockResolvedValue({
      assignment: { id: 'assign-1', assignmentMode: 'FOLLOW_LATEST_APPROVED_VERSION' },
      membership: { organizationRoleId: 'role-1' },
    }),
  };
  const service = new OrganizationRoleService(
    prisma as unknown as PrismaService,
    userAudit as unknown as UserAccessAuditService,
    roleVersionService as never,
  );
  return { prisma, userAudit, roleVersionService, service };
}

export function createRefreshTokenHarness() {
  const registeredUsers = new Map<
    string,
    {
      email: string;
      name?: string | null;
      platformRole: string;
      sessionVersion: number;
      securityVersion: number;
      status: UserStatus;
    }
  >();

  const prisma: {
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    user: { findUnique: jest.Mock };
    refreshToken: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    organization: { findUnique: jest.Mock };
    organizationMembership: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  } = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    user: {
      findUnique: jest.fn(async (args: { where: { id: string } }) => {
        const row = registeredUsers.get(args.where.id);
        if (!row) return null;
        return {
          id: args.where.id,
          email: row.email,
          name: row.name ?? null,
          status: row.status,
          platformRole: row.platformRole,
          sessionVersion: row.sessionVersion,
          securityVersion: row.securityVersion,
        };
      }),
    },
    refreshToken: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    organization: {
      findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
    },
    organizationMembership: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn(prisma),
  );

  const activeRefreshFamilies = new Set<string>();

  prisma.refreshToken.findFirst.mockImplementation(
    async (query: {
      where: {
        userId?: string;
        family?: string;
        revokedAt?: null;
        replacedBy?: null;
      };
    }) => {
      const w = query.where;
      if (
        w.userId &&
        w.family &&
        Object.prototype.hasOwnProperty.call(w, 'revokedAt') &&
        w.revokedAt === null &&
        activeRefreshFamilies.has(`${w.userId}:${w.family}`)
      ) {
        return {
          id: `rt-${w.family.slice(0, 8)}`,
          family: w.family,
          scope: RefreshTokenScope.LEGACY_UNSCOPED,
          organizationId: null,
          membershipId: null,
          sessionVersion: 0,
          membershipVersion: null,
        };
      }
      return null;
    },
  );

  prisma.refreshToken.create.mockImplementation(
    async (args: { data: { userId: string; family: string } }) => {
      const { userId, family } = args.data;
      activeRefreshFamilies.add(`${userId}:${family}`);
      const id = `rt-${family.slice(0, 8)}`;
      return { id, ...args.data };
    },
  );
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'app.jwtSecret') return 'test-jwt-secret';
      if (key === 'app.jwtExpiresIn') return '15m';
      if (key === 'iam.enableOrgBoundRefreshSessions') return true;
      if (key === 'iam.enableLegacyUnscopedRefreshGrace') return false;
      return fallback;
    }),
  };
  const sessionPolicy = {
    recordAndExecute: jest.fn().mockResolvedValue({ revokedTokenCount: 0 }),
  };
  const platformPermissions = {
    resolveJwtPermissions: jest.fn().mockResolvedValue([]),
    hasActiveMasterBillingGrant: jest.fn().mockResolvedValue(false),
  };
  const service = new RefreshTokenService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    sessionPolicy as never,
    platformPermissions as never,
  );

  const accessAuthority = new UserAccessAuthorityService(
    prisma as unknown as PrismaService,
    platformPermissions as never,
  );

  function registerRefreshHarnessUser(user: RefreshTokenUserContext): void {
    registeredUsers.set(user.id, {
      email: user.email,
      name: user.name,
      platformRole: user.platformRole,
      sessionVersion: user.sessionVersion ?? 0,
      securityVersion: user.securityVersion ?? user.sessionVersion ?? 0,
      status: UserStatus.ACTIVE,
    });
  }

  function revokeHarnessRefreshFamily(userId: string, family: string): void {
    activeRefreshFamilies.delete(`${userId}:${family}`);
  }

  function bumpHarnessUserSessionVersion(userId: string, sessionVersion: number): void {
    const row = registeredUsers.get(userId);
    if (row) row.sessionVersion = sessionVersion;
  }

  function bumpHarnessUserSecurityVersion(userId: string, securityVersion: number): void {
    const row = registeredUsers.get(userId);
    if (row) row.securityVersion = securityVersion;
  }

  function setHarnessUserInactive(userId: string): void {
    const row = registeredUsers.get(userId);
    if (row) row.status = UserStatus.INACTIVE;
  }

  return {
    prisma,
    config,
    sessionPolicy,
    platformPermissions,
    service,
    accessAuthority,
    registerRefreshHarnessUser,
    revokeHarnessRefreshFamily,
    bumpHarnessUserSessionVersion,
    bumpHarnessUserSecurityVersion,
    setHarnessUserInactive,
  };
}

export function multiOrgUserFixture() {
  return {
    id: IAM_REGRESSION_IDS.multiOrgUser,
    email: 'multi@regression.test',
    name: 'Multi Org',
    platformRole: 'USER',
    status: UserStatus.ACTIVE,
    passwordHash: '$2b$10$existinghash',
    memberships: [
      {
        id: IAM_REGRESSION_IDS.membershipA,
        organizationId: IAM_REGRESSION_IDS.orgA,
        role: MembershipRole.WORKER,
        status: MembershipStatus.ACTIVE,
        permissions: { bookings: { read: true, write: false } },
        organization: { companyName: 'Org A', logoUrl: null },
        createdAt: new Date('2026-01-01'),
      },
      {
        id: IAM_REGRESSION_IDS.membershipB,
        organizationId: IAM_REGRESSION_IDS.orgB,
        role: MembershipRole.ORG_ADMIN,
        status: MembershipStatus.ACTIVE,
        permissions: null,
        organization: { companyName: 'Org B', logoUrl: null },
        createdAt: new Date('2026-06-01'),
      },
    ],
  };
}

export type RefreshTokenHarness = ReturnType<typeof createRefreshTokenHarness>;

export type UsersServiceHarness = ReturnType<typeof createUsersServiceHarness>;

export function mockOrgAdminActorMembership(
  prisma: UsersServiceHarness['prisma'],
  targetMembership: Record<string, unknown>,
) {
  prisma.organizationMembership.findFirst.mockImplementation(
    async (args: { where?: { userId?: string; organizationId?: string } }) => {
      const userId = args?.where?.userId;
      if (userId === IAM_REGRESSION_IDS.adminA) {
        return { role: MembershipRole.ORG_ADMIN, permissions: null };
      }
      if (userId === IAM_REGRESSION_IDS.multiOrgUser) {
        return targetMembership;
      }
      return null;
    },
  );
}

import { MembershipRole, MembershipStatus, UserStatus } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { UserAccessAuditService } from './user-access-audit.service';
import { UsersService } from './users.service';
import { OrganizationInviteService } from './organization-invite.service';
import { OrganizationRoleService } from './organization-role.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { IamSessionPolicyService } from '@modules/auth/iam-session-policy.service';
import { ConfigService } from '@nestjs/config';

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
  );
  return { prisma, iamAudit, lifecycle, passwordReset, service };
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
  const prisma = {
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    organizationMembership: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
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
  const service = new RefreshTokenService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
    sessionPolicy as never,
  );
  return { prisma, config, sessionPolicy, service };
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

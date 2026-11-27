/**
 * USR-P2E E1 — organization offboarding lifecycle vs session binding (disposable PostgreSQL).
 */
import { randomUUID } from 'node:crypto';
import {
  BusinessType,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { IamLegalHoldService } from '@modules/iam-data-retention/iam-legal-hold.service';
import { VehicleOffboardPreflightService } from '@modules/vehicle-onboarding/offboarding/vehicle-offboard-preflight.service';
import { VehicleOnboardingOffboardService } from '@modules/vehicle-onboarding/services/vehicle-onboarding-offboard.service';
import { createVehicleOffboardingServiceForTests } from '@modules/vehicle-onboarding/testing/vehicle-offboarding-test.harness';
import { PrismaService } from '@shared/database/prisma.service';
import { OrganizationOffboardPreflightService } from '@modules/organizations/offboarding/organization-offboard-preflight.service';
import { OrganizationOffboardingExecutionService } from '@modules/organizations/offboarding/organization-offboarding-execution.service';
import { OrganizationOffboardingProviderDisconnectService } from '@modules/organizations/offboarding/organization-offboarding-provider-disconnect.service';
import { OrganizationOffboardingService } from '@modules/organizations/offboarding/organization-offboarding.service';
import { OFFBOARDING_EXECUTION_CONFIRM_VALUE } from '@modules/organizations/offboarding/organization-offboarding-execution.policy';
import { createUsrP2PgIamStack } from '@modules/users/testing/usr-p2-pg-iam-stack.helper';
import * as jwt from 'jsonwebtoken';
import { organizationOffboardingExecuteLockKey } from '@shared/database/pg-advisory-lock.util';
import {
  pgBackendPid,
  waitUntilBackendBlocked,
} from '@modules/users/testing/usr-p2-deterministic-concurrency.helper';

const OPT_IN = 'USR_P2E_E1_ORG_LIFECYCLE_PG';
const JWT_SECRET = 'usr-p2e-e1-org-lifecycle-secret';
const run = process.env[OPT_IN] === '1';

function assertDisposableDb(): void {
  if (process.env[OPT_IN] !== '1') throw new Error(`${OPT_IN}=1 required`);
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url) || !/usr/i.test(url)) {
    throw new Error('DATABASE_URL must target disposable localhost usr_p2 database');
  }
}

function execReq(idempotencyKey: string) {
  return {
    idempotencyKey,
    confirmExecution: OFFBOARDING_EXECUTION_CONFIRM_VALUE as typeof OFFBOARDING_EXECUTION_CONFIRM_VALUE,
  };
}

(run ? describe : describe.skip)('USR-P2E E1 organization lifecycle (PostgreSQL)', () => {
  jest.setTimeout(300_000);
  let prisma: PrismaClient;
  let prismaB: PrismaClient;
  let stack: ReturnType<typeof createUsrP2PgIamStack>;
  let stackB: ReturnType<typeof createUsrP2PgIamStack>;
  let prepare: OrganizationOffboardingService;
  let execution: OrganizationOffboardingExecutionService;

  beforeAll(() => {
    assertDisposableDb();
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.ORGANIZATION_OFFBOARDING_EXECUTION_ENABLED = '1';
    process.env.ORGANIZATION_OFFBOARDING_EXECUTION_LEASE_MS = '30000';
    prisma = new PrismaClient();
    prismaB = new PrismaClient();
    stack = createUsrP2PgIamStack(prisma, JWT_SECRET, { legacyUnscopedGrace: true });
    stackB = createUsrP2PgIamStack(prismaB, JWT_SECRET, { legacyUnscopedGrace: true });
    const prismaService = prisma as unknown as PrismaService;
    const legalHold = { isBlocked: jest.fn().mockResolvedValue(false) } as unknown as IamLegalHoldService;
    const vehiclePreflight = new VehicleOffboardPreflightService(prismaService);
    const preflight = new OrganizationOffboardPreflightService(
      prismaService,
      legalHold,
      vehiclePreflight,
    );
    const masterAudit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as MasterAdminAuditService;
    const vehicleOffboarding = createVehicleOffboardingServiceForTests(prisma);
    const vehicleOffboard = new VehicleOnboardingOffboardService(vehiclePreflight, vehicleOffboarding);
    prepare = new OrganizationOffboardingService(prismaService, preflight, masterAudit);
    const providerDisconnect = new OrganizationOffboardingProviderDisconnectService(prismaService);
    execution = new OrganizationOffboardingExecutionService(
      prismaService,
      preflight,
      stack.refresh,
      vehicleOffboard,
      masterAudit,
      providerDisconnect,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await prismaB?.$disconnect();
  });

  async function issueBound(
    userId: string,
    email: string,
    organizationId: string,
    membershipId: string,
    role = 'WORKER',
  ) {
    const live = await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionVersion: true, securityVersion: true },
    });
    return stack.refresh.issueTokenPair(
      {
        id: userId,
        email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: live?.sessionVersion ?? 0,
        securityVersion: live?.securityVersion ?? 0,
      },
      {
        organizationId,
        membershipId,
        role,
        membershipVersion: 0,
      },
    );
  }

  it('E1_C02 offboarding execution suspends org and revokes org-bound sessions; unrelated org preserved', async () => {
    const userId = randomUUID();
    const email = `e1c02-${userId}@example.test`;
    const orgA = randomUUID();
    const orgB = randomUUID();
    const memA = randomUUID();
    const memB = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.ACTIVE,
        lastSelectedOrganizationId: orgA,
      },
    });
    await prisma.organization.createMany({
      data: [
        {
          id: orgA,
          companyName: 'Org A offboard',
          businessType: BusinessType.RENTAL,
          status: OrganizationStatus.ACTIVE,
        },
        {
          id: orgB,
          companyName: 'Org B control',
          businessType: BusinessType.RENTAL,
          status: OrganizationStatus.ACTIVE,
        },
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        {
          id: memA,
          userId,
          organizationId: orgA,
          role: 'WORKER',
          status: MembershipStatus.ACTIVE,
        },
        {
          id: memB,
          userId,
          organizationId: orgB,
          role: 'WORKER',
          status: MembershipStatus.ACTIVE,
        },
      ],
    });

    const boundA = await issueBound(userId, email, orgA, memA);
    const boundB = await issueBound(userId, email, orgB, memB);
    const legacy = await stack.refresh.issueTokenPair(
      {
        id: userId,
        email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );

    await prepare.prepare(orgA, { idempotencyKey: `e1c02-prep-${orgA}` }, 'ma-e1');
    const execResult = await execution.execute(orgA, execReq(`e1c02-exec-${orgA}`), 'ma-e1');

    expect(execResult.executionProgress.phasesCompleted).toEqual(
      expect.arrayContaining(['REVALIDATE', 'SUSPEND', 'REVOKE_ORG_SESSIONS']),
    );
    const orgRow = await prisma.organization.findUniqueOrThrow({ where: { id: orgA } });
    expect(orgRow.status).toBe(OrganizationStatus.SUSPENDED);
    const orgBRow = await prisma.organization.findUniqueOrThrow({ where: { id: orgB } });
    expect(orgBRow.status).toBe(OrganizationStatus.ACTIVE);

    await expect(stack.refresh.rotate(boundA.refreshToken)).rejects.toThrow();
    const rotatedB = await stack.refresh.rotate(boundB.refreshToken);
    expect(rotatedB.accessToken).toBeTruthy();
    await expect(stack.refresh.rotate(legacy.refreshToken)).rejects.toThrow();
  });

  async function waitUntilHashtextAdvisoryLockHeld(
    observer: PrismaClient,
    lockKey: string,
    options?: { timeoutMs?: number },
  ): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? 45_000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const rows = await observer.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM pg_locks
        WHERE locktype = 'advisory'
          AND granted = true
          AND classid = 0
          AND objid = hashtext(${lockKey}::text)
      `;
      if (Number(rows[0]?.count ?? 0n) > 0) {
        return;
      }
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`hashtext advisory lock not held: ${lockKey}`);
  }

  function assertNotInfrastructureRejection(reason: unknown): void {
    const text =
      reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason ?? '');
    expect(text).not.toMatch(
      /hashtext advisory lock not held|deadlock|timeout|ECONNRESET|connection terminated/i,
    );
  }

  async function assertOrgCredentialsDenied(issued: { accessToken: string; refreshToken: string }) {
    const decoded = jwt.verify(issued.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await expect(stack.authority.validateAccessJwt(decoded as never)).rejects.toThrow();
    await expect(stack.refresh.rotate(issued.refreshToken)).rejects.toThrow();
  }

  async function seedDualOrgUser() {
    const userId = randomUUID();
    const email = `c02-${userId}@example.test`;
    const orgA = randomUUID();
    const orgB = randomUUID();
    const memA = randomUUID();
    const memB = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.ACTIVE,
        lastSelectedOrganizationId: orgA,
      },
    });
    await prisma.organization.createMany({
      data: [
        {
          id: orgA,
          companyName: 'Org A',
          businessType: BusinessType.RENTAL,
          status: OrganizationStatus.ACTIVE,
        },
        {
          id: orgB,
          companyName: 'Org B',
          businessType: BusinessType.RENTAL,
          status: OrganizationStatus.ACTIVE,
        },
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        {
          id: memA,
          userId,
          organizationId: orgA,
          role: 'WORKER',
          status: MembershipStatus.ACTIVE,
        },
        {
          id: memB,
          userId,
          organizationId: orgB,
          role: 'WORKER',
          status: MembershipStatus.ACTIVE,
        },
      ],
    });
    return { userId, email, orgA, orgB, memA, memB };
  }

  it('C02-A concurrent offboarding vs bound issuance observes execute advisory lock', async () => {
    const { userId, email, orgA, orgB, memA, memB } = await seedDualOrgUser();
    const execLock = organizationOffboardingExecuteLockKey(orgA);
    await prepare.prepare(orgA, { idempotencyKey: `c02a-prep-${orgA}` }, 'ma-c02');
    const execP = execution.execute(orgA, execReq(`c02a-exec-${orgA}`), 'ma-c02');
    const issueP = (async () => {
      await waitUntilHashtextAdvisoryLockHeld(prismaB, execLock);
      const pid = await pgBackendPid(prismaB);
      const live = await prismaB.user.findUniqueOrThrow({
        where: { id: userId },
        select: { sessionVersion: true, securityVersion: true },
      });
      const pending = stackB.refresh.issueTokenPair(
        {
          id: userId,
          email,
          platformRole: UserPlatformRole.USER,
          sessionVersion: live.sessionVersion,
          securityVersion: live.securityVersion,
        },
        { organizationId: orgA, membershipId: memA, role: 'WORKER', membershipVersion: 0 },
      );
      await waitUntilBackendBlocked(prisma, pid);
      return pending;
    })();
    const [execOutcome, issueOutcome] = await Promise.allSettled([execP, issueP]);
    expect(execOutcome.status).toBe('fulfilled');
    const orgRow = await prisma.organization.findUniqueOrThrow({ where: { id: orgA } });
    expect(orgRow.status).toBe(OrganizationStatus.SUSPENDED);
    if (issueOutcome.status === 'fulfilled') {
      await assertOrgCredentialsDenied(issueOutcome.value);
    } else {
      assertNotInfrastructureRejection(issueOutcome.reason);
    }
    const boundB = await issueBound(userId, email, orgB, memB);
    expect((await stack.refresh.rotate(boundB.refreshToken)).accessToken).toBeTruthy();
  });

  it('C02-B concurrent offboarding vs refresh rotation on org-bound family', async () => {
    const { userId, email, orgA, orgB, memA, memB } = await seedDualOrgUser();
    await prepare.prepare(orgA, { idempotencyKey: `c02b-prep-${orgA}` }, 'ma-c02');
    const boundA = await issueBound(userId, email, orgA, memA);
    const [execOutcome, rotateOutcome] = await Promise.allSettled([
      execution.execute(orgA, execReq(`c02b-exec-${orgA}`), 'ma-c02'),
      stackB.refresh.rotate(boundA.refreshToken),
    ]);
    expect(execOutcome.status).toBe('fulfilled');
    const orgRow = await prisma.organization.findUniqueOrThrow({ where: { id: orgA } });
    expect(orgRow.status).toBe(OrganizationStatus.SUSPENDED);
    if (rotateOutcome.status === 'fulfilled') {
      await assertOrgCredentialsDenied(rotateOutcome.value);
    } else {
      assertNotInfrastructureRejection(rotateOutcome.reason);
      await assertOrgCredentialsDenied(boundA);
    }
    const boundB = await issueBound(userId, email, orgB, memB);
    expect((await stack.refresh.rotate(boundB.refreshToken)).accessToken).toBeTruthy();
  });

  it('C02-C offboarding vs legacy unscoped upgrade attempt during execute', async () => {
    const { userId, email, orgA, orgB, memA, memB } = await seedDualOrgUser();
    const legacy = await stack.refresh.issueTokenPair(
      {
        id: userId,
        email,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 0,
        securityVersion: 0,
      },
      null,
    );
    await prepare.prepare(orgA, { idempotencyKey: `c02c-prep-${orgA}` }, 'ma-c02');
    const [execOutcome, legacyOutcome] = await Promise.allSettled([
      execution.execute(orgA, execReq(`c02c-exec-${orgA}`), 'ma-c02'),
      stackB.refresh.rotate(legacy.refreshToken),
    ]);
    expect(execOutcome.status).toBe('fulfilled');
    const orgRow = await prisma.organization.findUniqueOrThrow({ where: { id: orgA } });
    expect(orgRow.status).toBe(OrganizationStatus.SUSPENDED);
    if (legacyOutcome.status === 'fulfilled') {
      await assertOrgCredentialsDenied(legacyOutcome.value);
    } else {
      assertNotInfrastructureRejection(legacyOutcome.reason);
      await expect(stack.refresh.rotate(legacy.refreshToken)).rejects.toThrow();
    }
    const boundB = await issueBound(userId, email, orgB, memB);
    await expect(stack.refresh.rotate(boundB.refreshToken)).resolves.toBeDefined();
  });
});
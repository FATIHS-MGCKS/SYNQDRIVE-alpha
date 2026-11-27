/**
 * USR-P2E E4 — release compatibility (disposable PostgreSQL).
 * USR_P2E_E4_RELEASE_PG=1
 */
import { randomUUID } from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import {
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import { IamMfaStepUpService } from '@modules/iam-mfa/iam-mfa-step-up.service';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';
import { hashStepUpToken } from '@modules/iam-mfa/iam-mfa-crypto.util';
import { createUsrP2PgIamStack } from '@modules/users/testing/usr-p2-pg-iam-stack.helper';
import { UserAccessAuthorityService } from '@shared/auth/user-access-authority.service';
import { ACCESS_AUTHORITY_FAILURE_CODES } from '@shared/auth/user-access-authority.types';
import { buildMfaClaims } from '@shared/auth/auth-session-claims.types';
import type {
  StepUpGrantBinding,
  StepUpGrantValidationContext,
} from '@modules/iam-mfa/iam-mfa-step-up-binding.types';

const OPT_IN = 'USR_P2E_E4_RELEASE_PG';
const JWT_SECRET = 'usr-p2e-e4-release-secret';
const run = process.env[OPT_IN] === '1';

function assertDisposableDb(): void {
  if (process.env[OPT_IN] !== '1') throw new Error(`${OPT_IN}=1 required`);
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url) || !/usr/i.test(url)) {
    throw new Error('DATABASE_URL must target disposable localhost usr_* test DB');
  }
}

const STEP_UP_GRANT_COLUMNS = [
  'token_family',
  'organization_id',
  'membership_id',
  'session_version',
  'security_version',
  'membership_version',
] as const;

(run ? describe : describe.skip)('USR-P2E E4 release compatibility (PostgreSQL)', () => {
  jest.setTimeout(240_000);
  let prisma: PrismaClient;
  let prismaB: PrismaClient;
  let stackA: ReturnType<typeof createUsrP2PgIamStack>;
  let stackB: ReturnType<typeof createUsrP2PgIamStack>;
  let stepUp: IamMfaStepUpService;

  beforeAll(() => {
    assertDisposableDb();
    prisma = new PrismaClient();
    prismaB = new PrismaClient();
    stackA = createUsrP2PgIamStack(prisma, JWT_SECRET);
    stackB = createUsrP2PgIamStack(prismaB, JWT_SECRET);
    stepUp = new IamMfaStepUpService(prisma as never);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await prismaB?.$disconnect();
  });

  async function seedMasterUser() {
    const userId = randomUUID();
    const email = `e4-${userId}@example.test`;
    await prisma.$executeRaw`
      INSERT INTO users (
        id, email, platform_role, status, created_at, updated_at, session_version, security_version
      ) VALUES (
        ${userId}::uuid, ${email}, ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole",
        ${UserStatus.ACTIVE}::"UserStatus", NOW(), NOW(), 0, 0
      )
    `;
    return { userId, email };
  }

  async function issuePlatformSession(userId: string, email: string) {
    const pair = await stackA.refresh.issueTokenPair(
      { id: userId, email, platformRole: 'MASTER_ADMIN', sessionVersion: 0, securityVersion: 0 },
      null,
    );
    const decoded = jwt.verify(pair.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const binding: StepUpGrantBinding = {
      tokenFamily: decoded.tokenFamily as string,
      organizationId: null,
      membershipId: null,
      sessionVersion: 0,
      securityVersion: 0,
      membershipVersion: null,
    };
    return { pair, binding };
  }

  function grantValidationContext(binding: StepUpGrantBinding): StepUpGrantValidationContext {
    return {
      tokenFamily: binding.tokenFamily,
      organizationId: binding.organizationId,
      membershipId: binding.membershipId,
      sessionVersion: binding.sessionVersion ?? 0,
      membershipVersion: binding.membershipVersion,
    };
  }

  it('E4 migration-derived step-up grant binding columns exist', async () => {
    const rows = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_mfa_step_up_grants'
    `;
    const present = new Set(rows.map((r) => r.column_name));
    for (const col of STEP_UP_GRANT_COLUMNS) {
      expect(present.has(col)).toBe(true);
    }
    const idx = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'user_mfa_step_up_grants'
        AND indexname = 'user_mfa_step_up_grants_user_id_token_family_idx'
    `;
    expect(idx.length).toBe(1);
  });

  it('E4 legacy unbound step-up grant rows fail closed at validation', async () => {
    const { userId } = await seedMasterUser();
    const rawToken = `legacy-grant-${randomUUID()}`;
    const now = new Date();
    await prisma.userMfaStepUpGrant.create({
      data: {
        userId,
        tokenHash: hashStepUpToken(rawToken),
        actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
        assuranceLevel: 2,
        authMethods: [],
        authenticatedAt: now,
        mfaAuthenticatedAt: now,
        expiresAt: new Date(now.getTime() + 600_000),
        tokenFamily: null,
      },
    });
    expect(
      await stepUp.validateGrant(userId, rawToken, STEP_UP_ACTION.MASTER_ORGANIZATION, {
        tokenFamily: 'fam-1',
        organizationId: null,
        membershipId: null,
        sessionVersion: 0,
        membershipVersion: null,
      }),
    ).toBe(false);
  });

  it('E4 F01 legacy access JWT without family binding is denied', async () => {
    const { userId } = await seedMasterUser();
    const legacyPayload = {
      sub: userId,
      email: 'e4f01@test.example',
      sessionVersion: 0,
      securityVersion: 0,
      platformRole: 'MASTER_ADMIN',
    };
    await expect(stackA.authority.validateAccessJwt(legacyPayload as never)).rejects.toMatchObject({
      response: { code: ACCESS_AUTHORITY_FAILURE_CODES.SESSION_BINDING_REQUIRED },
    });
  });

  it('E4 cross-replica session-bound step-up grant denied after family revoke on B', async () => {
    const { userId, email } = await seedMasterUser();
    const { binding } = await issuePlatformSession(userId, email);
    const grant = await stepUp.createGrant({
      userId,
      actionScope: STEP_UP_ACTION.MASTER_ORGANIZATION,
      claims: buildMfaClaims({ securityVersion: 0 }),
      binding,
    });
    const ctx = grantValidationContext(binding);
    await stackB.refresh.revokeAllActiveForUser(userId);
    expect(
      await stepUp.validateGrant(userId, grant.stepUpToken, STEP_UP_ACTION.MASTER_ORGANIZATION, ctx),
    ).toBe(false);
    const fresh = await stackB.refresh.issueTokenPair(
      { id: userId, email, platformRole: 'MASTER_ADMIN', sessionVersion: 0, securityVersion: 0 },
      null,
    );
    const decoded = jwt.verify(fresh.accessToken, JWT_SECRET) as jwt.JwtPayload;
    await stackA.authority.validateAccessJwt(decoded as never);
  });

  it('E4 representative authority latency sample for platform JWT', async () => {
    const { userId, email } = await seedMasterUser();
    const { pair } = await issuePlatformSession(userId, email);
    const decoded = jwt.verify(pair.accessToken, JWT_SECRET) as jwt.JwtPayload;
    const samples = 5;
    const latencies: number[] = [];
    for (let i = 0; i < samples; i += 1) {
      const started = performance.now();
      await stackA.authority.validateAccessJwt(decoded as never);
      latencies.push(performance.now() - started);
    }
    const avgMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    process.env.USR_P2E_E4_AUTHORITY_LATENCY_MS = String(avgMs);
    process.env.USR_P2E_E4_AUTHORITY_SAMPLE_COUNT = String(samples);
    expect(avgMs).toBeLessThan(2000);
  });
});
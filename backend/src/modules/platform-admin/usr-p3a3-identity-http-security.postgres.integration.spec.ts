/**
 * USR-P3A.3 — real HTTP authorization for central + legacy identity mutations (disposable PostgreSQL).
 *
 * RUN: USR_P3A3_IDENTITY_HTTP_PG=1 DATABASE_URL=postgresql://...@127.0.0.1:5432/usr_p2_... \
 *   npx jest usr-p3a3-identity-http-security.postgres.integration.spec --runInBand
 */
import { randomUUID } from 'node:crypto';
import { authenticator } from 'otplib';
import {
  ActivityAction,
  MasterAdminAuditOutboxStatus,
  PrismaClient,
  UserPlatformRole,
} from '@prisma/client';
import * as request from 'supertest';
import { MasterGlobalIdentityService } from '@modules/users/master-global-identity.service';
import { MFA_ERROR } from '@modules/iam-mfa/iam-mfa.policy';
import { hashStepUpToken } from '@modules/iam-mfa/iam-mfa-crypto.util';
import {
  assertUsrP3a3HttpDisposableDb,
  canonicalCreatePath,
  canonicalPatchPath,
  createUsrP3a3IdentityHttpApp,
  issueMasterPrivilegedHttpSession,
  legacyCreatePath,
  legacyPatchPath,
  seedBillingOnlySession,
  seedMasterAdminWithTotp,
  seedOrgAdminSession,
  USR_P3A3_HTTP_JWT_SECRET,
  USR_P3A3_HTTP_MFA_ENV,
  type UsrP3a3HttpPgContext,
} from './testing/usr-p3a3-identity-http-pg.harness';

const OPT_IN = 'USR_P3A3_IDENTITY_HTTP_PG';
const run = process.env[OPT_IN] === '1';

(run ? describe : describe.skip)('USR-P3A.3 identity HTTP authorization (PostgreSQL)', () => {
  jest.setTimeout(300_000);
  let ctx: UsrP3a3HttpPgContext;
  let prisma: PrismaClient;
  const envBackup = { ...process.env };

  beforeAll(async () => {
    assertUsrP3a3HttpDisposableDb(OPT_IN);
    Object.assign(process.env, USR_P3A3_HTTP_MFA_ENV);
    process.env.JWT_SECRET = USR_P3A3_HTTP_JWT_SECRET;
    prisma = new PrismaClient();
    ctx = await createUsrP3a3IdentityHttpApp(prisma);
  });

  afterAll(async () => {
    await ctx?.app?.close();
    await prisma?.$disconnect();
    process.env = envBackup;
  });

  async function snapshotCounts() {
    return {
      users: await prisma.user.count(),
      outbox: await prisma.masterAdminAuditOutbox.count({
        where: { status: { not: MasterAdminAuditOutboxStatus.PROCESSED } },
      }),
      activity: await prisma.activityLog.count(),
    };
  }

  it('H01 / A01 — authorized master with MFA + step-up creates identity', async () => {
    const master = await seedMasterAdminWithTotp(prisma);
    const session = await issueMasterPrivilegedHttpSession(ctx, master);
    const email = `h01-${randomUUID()}@example.test`;
    const res = await request(ctx.app.getHttpServer())
      .post(canonicalCreatePath())
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('x-step-up-token', session.stepUpToken)
      .send({ email, firstName: 'Http', lastName: 'Authorized' })
      .expect(201);
    expect(res.body.user.email).toBe(email);
    const row = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(row.id).toBe(res.body.user.id);
    const logs = await prisma.activityLog.count({
      where: { entityId: row.id, action: ActivityAction.CREATE },
    });
    expect(logs).toBeGreaterThanOrEqual(1);
  });

  it('H02 / A02 — unauthenticated POST and PATCH denied', async () => {
    const before = await snapshotCounts();
    await request(ctx.app.getHttpServer())
      .post(canonicalCreatePath())
      .send({ email: `h02-${randomUUID()}@example.test`, firstName: 'X', lastName: 'Y' })
      .expect(401);
    await request(ctx.app.getHttpServer())
      .patch(canonicalPatchPath(randomUUID()))
      .send({ firstName: 'Nope' })
      .expect(401);
    const after = await snapshotCounts();
    expect(after.users).toBe(before.users);
    expect(after.activity).toBe(before.activity);
  });

  it('H03 / A03 — organization administrator denied', async () => {
    const orgAdmin = await seedOrgAdminSession(prisma, ctx.refresh);
    const email = `h03-${randomUUID()}@example.test`;
    const res = await request(ctx.app.getHttpServer())
      .post(canonicalCreatePath())
      .set('Authorization', `Bearer ${orgAdmin.accessToken}`)
      .send({ email, firstName: 'Org', lastName: 'Admin' });
    expect([401, 403]).toContain(res.status);
    expect(res.status).not.toBe(500);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('H04 / A04 — billing-only delegate denied', async () => {
    const billing = await seedBillingOnlySession(prisma, ctx.refresh, ctx.platformPermissions);
    const email = `h04-${randomUUID()}@example.test`;
    const res = await request(ctx.app.getHttpServer())
      .post(canonicalCreatePath())
      .set('Authorization', `Bearer ${billing.accessToken}`)
      .send({ email, firstName: 'Bill', lastName: 'Only' });
    expect([401, 403]).toContain(res.status);
    expect(res.status).not.toBe(500);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('H05 / A05 — revoked access JWT denied', async () => {
    const master = await seedMasterAdminWithTotp(prisma);
    const session = await issueMasterPrivilegedHttpSession(ctx, master);
    await ctx.refresh.revokeAllActiveForUser(master.userId);
    const res = await request(ctx.app.getHttpServer())
      .post(canonicalCreatePath())
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('x-step-up-token', session.stepUpToken)
      .send({ email: `h05-${randomUUID()}@example.test`, firstName: 'Revoked', lastName: 'Jwt' });
    expect([401, 403]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });

  describe('H06 / A06 — MFA and step-up enforcement', () => {
    it('missing MFA enrollment denied', async () => {
      const userId = randomUUID();
      const email = `h06-nomfa-${userId}@example.test`;
      await prisma.user.create({
        data: {
          id: userId,
          email,
          platformRole: UserPlatformRole.MASTER_ADMIN,
          status: 'ACTIVE',
        },
      });
      const pair = await ctx.refresh.issueTokenPair(
        {
          id: userId,
          email,
          platformRole: UserPlatformRole.MASTER_ADMIN,
          sessionVersion: 0,
          securityVersion: 0,
        },
        null,
      );
      const res = await request(ctx.app.getHttpServer())
        .post(canonicalCreatePath())
        .set('Authorization', `Bearer ${pair.accessToken}`)
        .send({ email: `h06a-${randomUUID()}@example.test`, firstName: 'No', lastName: 'Mfa' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(MFA_ERROR.ENROLLMENT_REQUIRED);
    });

    it('missing step-up token denied', async () => {
      const master = await seedMasterAdminWithTotp(prisma);
      const session = await issueMasterPrivilegedHttpSession(ctx, master);
      const res = await request(ctx.app.getHttpServer())
        .post(canonicalCreatePath())
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ email: `h06b-${randomUUID()}@example.test`, firstName: 'No', lastName: 'Step' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(MFA_ERROR.STEP_UP_REQUIRED);
    });

    it('invalid step-up token denied', async () => {
      const master = await seedMasterAdminWithTotp(prisma);
      const session = await issueMasterPrivilegedHttpSession(ctx, master);
      const res = await request(ctx.app.getHttpServer())
        .post(canonicalCreatePath())
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('x-step-up-token', 'not-a-valid-grant')
        .send({ email: `h06c-${randomUUID()}@example.test`, firstName: 'Bad', lastName: 'Step' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(MFA_ERROR.STEP_UP_EXPIRED);
    });

    it('clock-expired issued grant denied (same family)', async () => {
      const master = await seedMasterAdminWithTotp(prisma);
      const session = await issueMasterPrivilegedHttpSession(ctx, master);
      const tokenHash = hashStepUpToken(session.stepUpToken);
      await prisma.userMfaStepUpGrant.updateMany({
        where: { userId: master.userId, tokenHash },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      const email = `h06c2-${randomUUID()}@example.test`;
      const res = await request(ctx.app.getHttpServer())
        .post(canonicalCreatePath())
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('x-step-up-token', session.stepUpToken)
        .send({ email, firstName: 'Expired', lastName: 'Grant' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe(MFA_ERROR.STEP_UP_EXPIRED);
      expect(await prisma.user.findFirst({ where: { email } })).toBeNull();
    });

    it('wrong session-family grant denied', async () => {
      const masterA = await seedMasterAdminWithTotp(prisma);
      const masterB = await seedMasterAdminWithTotp(prisma);
      const sessionA = await issueMasterPrivilegedHttpSession(ctx, masterA);
      const sessionB = await issueMasterPrivilegedHttpSession(ctx, masterB);
      const res = await request(ctx.app.getHttpServer())
        .post(canonicalCreatePath())
        .set('Authorization', `Bearer ${sessionB.accessToken}`)
        .set('x-step-up-token', sessionA.stepUpToken)
        .send({ email: `h06d-${randomUUID()}@example.test`, firstName: 'Wrong', lastName: 'Family' });
      expect(res.status).toBe(403);
    });

    it('bound step-up succeeds', async () => {
      const master = await seedMasterAdminWithTotp(prisma);
      const session = await issueMasterPrivilegedHttpSession(ctx, master);
      await request(ctx.app.getHttpServer())
        .post(canonicalCreatePath())
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('x-step-up-token', session.stepUpToken)
        .send({ email: `h06e-${randomUUID()}@example.test`, firstName: 'Good', lastName: 'Step' })
        .expect(201);
    });
  });

  it('H07 / A07 — unknown DTO fields rejected', async () => {
    const master = await seedMasterAdminWithTotp(prisma);
    const session = await issueMasterPrivilegedHttpSession(ctx, master);
    const res = await request(ctx.app.getHttpServer())
      .post(canonicalCreatePath())
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('x-step-up-token', session.stepUpToken)
      .send({
        email: `h07-${randomUUID()}@example.test`,
        firstName: 'Dto',
        lastName: 'Guard',
        platformRole: 'MASTER_ADMIN',
        password: 'secret',
      });
    expect(res.status).toBe(400);
  });

  it('H08 / A17 — authorized profile update persists', async () => {
    const master = await seedMasterAdminWithTotp(prisma);
    const session = await issueMasterPrivilegedHttpSession(ctx, master);
    const email = `h08-${randomUUID()}@example.test`;
    const created = await request(ctx.app.getHttpServer())
      .post(canonicalCreatePath())
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('x-step-up-token', session.stepUpToken)
      .send({ email, firstName: 'Before', lastName: 'Patch' })
      .expect(201);
    const stepUp2 = await issueMasterPrivilegedHttpSession(ctx, master);
    await request(ctx.app.getHttpServer())
      .patch(canonicalPatchPath(created.body.user.id))
      .set('Authorization', `Bearer ${stepUp2.accessToken}`)
      .set('x-step-up-token', stepUp2.stepUpToken)
      .send({ language: 'en', idempotencyKey: `h08-${randomUUID()}` })
      .expect(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.body.user.id } });
    expect(row.language).toBe('en');
  });

  it('H09 / A18 — forbidden patch fields rejected', async () => {
    const master = await seedMasterAdminWithTotp(prisma);
    const session = await issueMasterPrivilegedHttpSession(ctx, master);
    const email = `h09-${randomUUID()}@example.test`;
    const created = await request(ctx.app.getHttpServer())
      .post(canonicalCreatePath())
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('x-step-up-token', session.stepUpToken)
      .send({ email, firstName: 'Guard', lastName: 'Fields' })
      .expect(201);
    const stepUp2 = await issueMasterPrivilegedHttpSession(ctx, master);
    const res = await request(ctx.app.getHttpServer())
      .patch(canonicalPatchPath(created.body.user.id))
      .set('Authorization', `Bearer ${stepUp2.accessToken}`)
      .set('x-step-up-token', stepUp2.stepUpToken)
      .send({ platformRole: 'MASTER_ADMIN', passwordHash: 'x', status: 'SUSPENDED', sessionVersion: 9 });
    expect(res.status).toBe(400);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: created.body.user.id } });
    expect(row.platformRole).toBe(UserPlatformRole.USER);
    expect(row.sessionVersion).toBe(0);
  });

  it('H10 / A19 — legacy admin routes enforce master authorization', async () => {
    const orgAdmin = await seedOrgAdminSession(prisma, ctx.refresh);
    const denied = await request(ctx.app.getHttpServer())
      .post(legacyCreatePath())
      .set('Authorization', `Bearer ${orgAdmin.accessToken}`)
      .send({ email: `h10-deny-${randomUUID()}@example.test`, name: 'Legacy Deny' });
    expect([401, 403]).toContain(denied.status);

    const master = await seedMasterAdminWithTotp(prisma);
    const session = await issueMasterPrivilegedHttpSession(ctx, master);
    const email = `h10-${randomUUID()}@example.test`;
    const created = await request(ctx.app.getHttpServer())
      .post(legacyCreatePath())
      .set('Authorization', `Bearer ${session.accessToken}`)
      .set('x-step-up-token', session.stepUpToken)
      .send({ email, name: 'Legacy Ok' })
      .expect(201);
    expect(created.body.email).toBe(email);
    const stepUp2 = await issueMasterPrivilegedHttpSession(ctx, master);
    await request(ctx.app.getHttpServer())
      .patch(legacyPatchPath(created.body.id))
      .set('Authorization', `Bearer ${stepUp2.accessToken}`)
      .set('x-step-up-token', stepUp2.stepUpToken)
      .send({ name: 'Legacy Updated' })
      .expect(200);
  });

  it('FULL_NEST_BOOT — identity HTTP app resolves MasterGlobalIdentityService and liveness', async () => {
    expect(ctx.app.get(MasterGlobalIdentityService)).toBeInstanceOf(MasterGlobalIdentityService);
    await request(ctx.app.getHttpServer()).get('/api/v1/health').expect(200);
    const pg = await prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1::int AS ok`;
    expect(pg[0]?.ok).toBe(1);
  });
});
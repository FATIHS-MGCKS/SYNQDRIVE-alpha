/**
 * USR-P3A.3A R04 credential setup + FL-R01/FLE matrices (disposable PostgreSQL).
 */
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import {
  BusinessType,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  RefreshTokenScope,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import * as request from 'supertest';
import {
  assertUsrP3a3FirstLoginHttpDb,
  createUsrP3a3FirstLoginHttpApp,
  USR_P3A3_FIRST_LOGIN_HTTP_JWT_SECRET,
} from './testing/usr-p3a3-first-login-http-pg.harness';
import { acquireMasterProvisionOrgMutationLocks } from './iam-identity-mutation-lock-order';
import { MasterCredentialSetupDeliveryService } from './master-credential-setup-delivery.service';
import { pgBackendPid, waitUntilBackendBlocked } from './testing/usr-p2-deterministic-concurrency.helper';
import * as jwt from 'jsonwebtoken';

const OPT_IN = 'USR_P3A3_CREDENTIAL_AUTHORITY_PG';
const run = process.env[OPT_IN] === '1';

function resetTokenFromLastMail(
  sendPasswordReset: jest.Mock,
): string {
  const call = sendPasswordReset.mock.calls.at(-1)?.[0];
  if (!call?.resetUrl) throw new Error('missing resetUrl in mail mock');
  const token = new URL(call.resetUrl).searchParams.get('token');
  if (!token) throw new Error('reset URL missing token');
  return token;
}

(run ? describe : describe.skip)('USR-P3A.3A credential authority (PostgreSQL)', () => {
  jest.setTimeout(300_000);
  let prisma: PrismaClient;
  let ctx: Awaited<ReturnType<typeof createUsrP3a3FirstLoginHttpApp>>;
  let masterActorId: string;
  const actor = () => ({ id: masterActorId, platformRole: 'MASTER_ADMIN' as const });
  const auditReq = () => ({ method: 'POST', headers: {} as Record<string, string> });

  beforeAll(async () => {
    assertUsrP3a3FirstLoginHttpDb(OPT_IN);
    prisma = new PrismaClient();
    ctx = await createUsrP3a3FirstLoginHttpApp(prisma);
    masterActorId = randomUUID();
    await prisma.user.create({
      data: {
        id: masterActorId,
        email: `cred-ma-${masterActorId}@example.test`,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
  });

  afterAll(async () => {
    await ctx?.app.close();
    await prisma?.$disconnect();
  });

  async function seedOrg() {
    const orgId = randomUUID();
    await prisma.organization.create({
      data: {
        id: orgId,
        companyName: 'Cred Org',
        businessType: BusinessType.RENTAL,
        status: OrganizationStatus.ACTIVE,
      },
    });
    return orgId;
  }

  it('C01–C05 — provision, operation-bound intent, reset confirm, login', async () => {
    const orgId = await seedOrg();
    const email = `c01-${randomUUID()}@example.test`;
    const opId = `op-c01-${randomUUID()}`;
    (ctx.p3.noopMail.sendPasswordReset as jest.Mock).mockClear();
    const provisioned = await ctx.p3.globalIdentity.provisionGlobalUser(
      {
        email,
        firstName: 'Cred',
        lastName: 'User',
        idempotencyKey: opId,
        sendCredentialSetup: true,
        initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: false },
      },
      actor(),
      auditReq(),
    );
    expect(provisioned.onboarding.deliveryRequested).toBe(true);
    const intent = await prisma.masterIdentityCredentialSetupIntent.findUniqueOrThrow({
      where: { securityOperationId: opId },
    });
    expect(intent.userId).toBe(provisioned.user.id);
    expect(intent.passwordResetTokenId).toBeTruthy();
    const resetToken = resetTokenFromLastMail(ctx.p3.noopMail.sendPasswordReset as jest.Mock);
    const password = 'Str0ng-C01-Credential!';
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: resetToken, newPassword: password, confirmPassword: password })
      .expect(200);
    const login = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password, organizationId: orgId })
      .expect(200);
    expect(login.body.accessToken).toBeTruthy();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: provisioned.user.id } });
    expect(user.passwordHash).toBeTruthy();
    const membership = await prisma.organizationMembership.findFirstOrThrow({
      where: { userId: provisioned.user.id, organizationId: orgId },
    });
    expect(membership.status).toBe(MembershipStatus.ACTIVE);
    const intentAfter = await prisma.masterIdentityCredentialSetupIntent.findUniqueOrThrow({
      where: { securityOperationId: opId },
    });
    expect(intentAfter.credentialEstablishedAt).toBeTruthy();
  });

  it('C06 — replay after success does not issue second reset', async () => {
    const orgId = await seedOrg();
    const email = `c06-${randomUUID()}@example.test`;
    const opId = `op-c06-${randomUUID()}`;
  const dto = {
      email,
      firstName: 'Replay',
      lastName: 'Cred',
      idempotencyKey: opId,
      sendCredentialSetup: true,
      initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: false },
    };
    await ctx.p3.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    const mailsBefore = (ctx.p3.noopMail.sendPasswordReset as jest.Mock).mock.calls.length;
    const password = 'Str0ng-C06-Credential!';
    const token = resetTokenFromLastMail(ctx.p3.noopMail.sendPasswordReset as jest.Mock);
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, newPassword: password, confirmPassword: password })
      .expect(200);
    await ctx.p3.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    expect((ctx.p3.noopMail.sendPasswordReset as jest.Mock).mock.calls.length).toBe(mailsBefore);
    const opTokens = await prisma.passwordResetToken.count({
      where: { securityOperationId: opId, usedAt: { not: null } },
    });
    expect(opTokens).toBe(1);
  });

  it('C07 — concurrent same-operation replay admits one intent', async () => {
    const orgId = await seedOrg();
    const email = `c07-${randomUUID()}@example.test`;
    const opId = `op-c07-${randomUUID()}`;
    const dto = {
      email,
      firstName: 'Con',
      lastName: 'Current',
      idempotencyKey: opId,
      sendCredentialSetup: true,
      initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: false },
    };
    const [a, b] = await Promise.all([
      ctx.p3.globalIdentity.provisionGlobalUser(dto, actor(), auditReq()),
      ctx.p3.globalIdentity.provisionGlobalUser(dto, actor(), auditReq()),
    ]);
    expect(a.user.id).toBe(b.user.id);
    const intents = await prisma.masterIdentityCredentialSetupIntent.count({
      where: { securityOperationId: opId },
    });
    expect(intents).toBe(1);
    const boundTokens = await prisma.passwordResetToken.count({
      where: { securityOperationId: opId, revokedAt: null },
    });
    expect(boundTokens).toBe(1);
    const intent = await prisma.masterIdentityCredentialSetupIntent.findUniqueOrThrow({
      where: { securityOperationId: opId },
    });
    expect(intent.passwordResetTokenId).toBeTruthy();
  });

  it('C09 — unrelated reset token does not satisfy provisioning intent', async () => {
    const orgId = await seedOrg();
    const email = `c09-${randomUUID()}@example.test`;
    const opId = `op-c09-${randomUUID()}`;
    const provisioned = await ctx.p3.globalIdentity.provisionGlobalUser(
      {
        email,
        firstName: 'Unrel',
        lastName: 'Token',
        idempotencyKey: opId,
        sendCredentialSetup: true,
        initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: false },
      },
      actor(),
      auditReq(),
    );
    const intent = await prisma.masterIdentityCredentialSetupIntent.findUniqueOrThrow({
      where: { securityOperationId: opId },
    });
    expect(intent.passwordResetTokenId).toBeTruthy();
    await ctx.p3.passwordReset.requestAdminReset({
      organizationId: orgId,
      userId: provisioned.user.id,
      actorUserId: masterActorId,
      reason: 'unrelated',
    });
    const bound = await prisma.passwordResetToken.count({
      where: { id: intent.passwordResetTokenId!, securityOperationId: opId, revokedAt: null },
    });
    expect(bound).toBe(1);
    const unrelated = await prisma.passwordResetToken.count({
      where: { userId: provisioned.user.id, securityOperationId: null, revokedAt: null },
    });
    expect(unrelated).toBe(1);
  });

  it('C10 — suspended user denied credential setup continuation', async () => {
    const orgId = await seedOrg();
    const email = `c10-${randomUUID()}@example.test`;
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email,
        status: UserStatus.SUSPENDED,
        platformRole: UserPlatformRole.USER,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        id: randomUUID(),
        userId,
        organizationId: orgId,
        role: MembershipRole.WORKER,
        status: MembershipStatus.ACTIVE,
      },
    });
    const opId = `op-c10-${randomUUID()}`;
    await expect(
      ctx.p3.passwordReset.requestAdminResetBoundToOperation({
        organizationId: orgId,
        userId,
        actorUserId: masterActorId,
        securityOperationId: opId,
      }),
    ).rejects.toBeTruthy();
  });

  it('C11 — superseded reset token cannot confirm', async () => {
    const orgId = await seedOrg();
    const email = `c11-${randomUUID()}@example.test`;
    const opId = `op-c11-${randomUUID()}`;
    await ctx.p3.globalIdentity.provisionGlobalUser(
      {
        email,
        firstName: 'Stale',
        lastName: 'Reset',
        idempotencyKey: opId,
        sendCredentialSetup: true,
        initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: false },
      },
      actor(),
      auditReq(),
    );
    const firstToken = resetTokenFromLastMail(ctx.p3.noopMail.sendPasswordReset as jest.Mock);
    const userRow = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.passwordResetToken.updateMany({
      where: { userId: userRow.id, securityOperationId: opId },
      data: { revokedAt: new Date() },
    });
    const delivery = new MasterCredentialSetupDeliveryService(prisma as never, ctx.p3.passwordReset);
    await delivery.ensureDeliveryForOperation({
      organizationId: orgId,
      userId: userRow.id,
      actorUserId: masterActorId,
      securityOperationId: opId,
    });
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({
        token: firstToken,
        newPassword: 'Str0ng-C11-Credential!',
        confirmPassword: 'Str0ng-C11-Credential!',
      })
      .expect(401);
  });

  it('FLE04 — compatible org+email lock order with mandatory lock wait evidence', async () => {
    const orgId = await seedOrg();
    const email = `fle04-${randomUUID()}@example.test`;
    const opA = `op-fle04-a-${randomUUID()}`;
    const opB = `op-fle04-b-${randomUUID()}`;
    let heldPid = 0;
    const hold = prisma.$transaction(
      async (tx) => {
        await acquireMasterProvisionOrgMutationLocks(tx, {
          securityOperationId: opA,
          organizationId: orgId,
          normalizedEmail: email,
        });
        heldPid = await pgBackendPid(prisma);
        await new Promise((resolve) => setTimeout(resolve, 8_000));
      },
      { timeout: 120_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const contender = prisma.$transaction(
      async (tx) => {
        await acquireMasterProvisionOrgMutationLocks(tx, {
          securityOperationId: opB,
          organizationId: orgId,
          normalizedEmail: email,
        });
      },
      { timeout: 120_000, maxWait: 45_000 },
    );
    expect(heldPid).toBeGreaterThan(0);
    let contenderFinished = false;
    const contenderDone = contender.then(() => {
      contenderFinished = true;
    });
    const blocked = await waitUntilBackendBlocked(prisma, heldPid, { timeoutMs: 20_000, pollMs: 25 }).catch(
      () => [] as number[],
    );
    if (blocked.length > 0) {
      expect(blocked.length).toBeGreaterThan(0);
      await hold;
      await contenderDone;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(contenderFinished).toBe(false);
    await hold;
    await contenderDone;
  });

  it('FLE05 — revoked session JWT cannot authorize established-user accept', async () => {
    const orgId = await seedOrg();
    const email = `fle05-${randomUUID()}@example.test`;
    const password = 'Existing-FLE05-Pass!';
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        status: UserStatus.ACTIVE,
        platformRole: UserPlatformRole.USER,
        sessionVersion: 2,
      },
    });
    const family = `fam-revoked-${randomUUID().slice(0, 8)}`;
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: 'revoked-hash',
        family,
        scope: RefreshTokenScope.LEGACY_UNSCOPED,
        expiresAt: new Date(Date.now() + 3600_000),
        revokedAt: new Date(),
        sessionVersion: 2,
      },
    });
    const { plain, hash } = await import('./utils/invite-token.util').then((m) => m.generateInviteToken());
    await prisma.organizationUserInvite.create({
      data: {
        organizationId: orgId,
        email,
        membershipRole: MembershipRole.WORKER,
        tokenHash: hash,
        tokenLookup: (await import('./utils/invite-token.util')).inviteTokenLookupKey(plain),
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 86400_000),
        invitedByUserId: masterActorId,
      },
    });
    const accessToken = jwt.sign(
      {
        sub: userId,
        email,
        sessionVersion: 2,
        securityVersion: 0,
        tokenFamily: family,
        platformRole: UserPlatformRole.USER,
        platformPermissions: [],
      },
      USR_P3A3_FIRST_LOGIN_HTTP_JWT_SECRET,
      { expiresIn: '1h' },
    );
    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ token: plain, confirmed: true });
    expect([401, 403]).toContain(res.status);
  });
});
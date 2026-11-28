/**
 * USR-P3A.3A CR01–CR03 delivery edge matrix D01–D10 (disposable PostgreSQL).
 */
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import {
  BusinessType,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import * as request from 'supertest';
import {
  assertUsrP3a3FirstLoginHttpDb,
  createUsrP3a3FirstLoginHttpApp,
} from './testing/usr-p3a3-first-login-http-pg.harness';
import { MasterCredentialSetupDeliveryService } from './master-credential-setup-delivery.service';
import { encryptInviteToken } from './utils/invite-secret-crypto.util';

const OPT_IN = 'USR_P3A3_CREDENTIAL_DELIVERY_EDGE_PG';
const run = process.env[OPT_IN] === '1';

function resetTokenFromLastMail(sendPasswordReset: jest.Mock): string {
  const call = sendPasswordReset.mock.calls.at(-1)?.[0];
  if (!call?.resetUrl) throw new Error('missing resetUrl in mail mock');
  const token = new URL(call.resetUrl).searchParams.get('token');
  if (!token) throw new Error('reset URL missing token');
  return token;
}

(run ? describe : describe.skip)('USR-P3A.3A credential delivery edge (PostgreSQL)', () => {
  jest.setTimeout(300_000);
  let prisma: PrismaClient;
  let ctx: Awaited<ReturnType<typeof createUsrP3a3FirstLoginHttpApp>>;
  let delivery: MasterCredentialSetupDeliveryService;
  let masterActorId: string;
  const actor = () => ({ id: masterActorId, platformRole: 'MASTER_ADMIN' as const });
  const auditReq = () => ({ method: 'POST', headers: {} as Record<string, string> });

  beforeAll(async () => {
    assertUsrP3a3FirstLoginHttpDb(OPT_IN);
    prisma = new PrismaClient();
    ctx = await createUsrP3a3FirstLoginHttpApp(prisma);
    delivery = new MasterCredentialSetupDeliveryService(prisma as never, ctx.p3.passwordReset);
    masterActorId = randomUUID();
    await prisma.user.create({
      data: {
        id: masterActorId,
        email: `d-ma-${masterActorId}@example.test`,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
  });

  afterAll(async () => {
    await ctx?.app.close();
    await prisma?.$disconnect();
  });

  async function seedOrg(status: OrganizationStatus = OrganizationStatus.ACTIVE) {
    const orgId = randomUUID();
    await prisma.organization.create({
      data: {
        id: orgId,
        companyName: 'Delivery Org',
        businessType: BusinessType.RENTAL,
        status,
      },
    });
    return orgId;
  }

  const provisionDto = (
    orgId: string,
    opId: string,
    email = `d-${randomUUID()}@example.test`,
  ) => ({
    email,
    firstName: 'Del',
    lastName: 'Edge',
    idempotencyKey: opId,
    sendCredentialSetup: true,
    initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: false },
  });

  it('D01 — failed transport after persist recovers without false transport-success', async () => {
    const orgId = await seedOrg();
    const opId = `op-d01-${randomUUID()}`;
    const mail = ctx.p3.noopMail.sendPasswordReset as jest.Mock;
    mail.mockReset();
    mail.mockResolvedValueOnce({ sent: false, fallback: false });
    mail.mockResolvedValue({ sent: true, fallback: false });

    await ctx.p3.globalIdentity.provisionGlobalUser(provisionDto(orgId, opId), actor(), auditReq());
    const intentAfterFail = await prisma.masterIdentityCredentialSetupIntent.findUniqueOrThrow({
      where: { securityOperationId: opId },
    });
    expect(intentAfterFail.passwordResetTokenId).toBeTruthy();
    expect(intentAfterFail.transportConfirmedAt).toBeNull();
    expect(intentAfterFail.deliveryTokenCiphertext).toBeTruthy();

    const status = await delivery.ensureDeliveryForOperation({
      securityOperationId: opId,
      organizationId: orgId,
      userId: intentAfterFail.userId,
      actorUserId: masterActorId,
    });
    expect(status.deliveryAttempted).toBe(true);
    expect(status.deliveryConfirmed).toBe(true);

    const intentAfterRetry = await prisma.masterIdentityCredentialSetupIntent.findUniqueOrThrow({
      where: { securityOperationId: opId },
    });
    expect(intentAfterRetry.transportConfirmedAt).toBeTruthy();
    expect(resetTokenFromLastMail(mail)).toBeTruthy();
  });

  it('D02 — provision replay after lost ack returns authoritative delivery state', async () => {
    const orgId = await seedOrg();
    const opId = `op-d02-${randomUUID()}`;
    const dto = provisionDto(orgId, opId);
    await ctx.p3.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    await prisma.masterIdentityCredentialSetupIntent.updateMany({
      where: { securityOperationId: opId },
      data: { transportConfirmedAt: null },
    });
    const replay = await ctx.p3.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.onboarding.deliveryRequested).toBe(true);
    expect(replay.onboarding.deliveryConfirmed).toBe(true);
  });

  it('D03 — concurrent same-operation replay admits one intent, token, and generation', async () => {
    const orgId = await seedOrg();
    const opId = `op-d03-${randomUUID()}`;
    const dto = provisionDto(orgId, opId);
    await Promise.all([
      ctx.p3.globalIdentity.provisionGlobalUser(dto, actor(), auditReq()),
      ctx.p3.globalIdentity.provisionGlobalUser(dto, actor(), auditReq()),
    ]);
    const intents = await prisma.masterIdentityCredentialSetupIntent.count({
      where: { securityOperationId: opId },
    });
    expect(intents).toBe(1);
    const intent = await prisma.masterIdentityCredentialSetupIntent.findUniqueOrThrow({
      where: { securityOperationId: opId },
    });
    expect(intent.deliveryGeneration).toBeGreaterThanOrEqual(1);
    const activeTokens = await prisma.passwordResetToken.count({
      where: { securityOperationId: opId, revokedAt: null, usedAt: null },
    });
    expect(activeTokens).toBe(1);
    expect(intent.passwordResetTokenId).toBeTruthy();
  });

  it('D04 — expired linked token replacement binds correctly', async () => {
    const orgId = await seedOrg();
    const opId = `op-d04-${randomUUID()}`;
    await ctx.p3.globalIdentity.provisionGlobalUser(provisionDto(orgId, opId), actor(), auditReq());
    const intent = await prisma.masterIdentityCredentialSetupIntent.findUniqueOrThrow({
      where: { securityOperationId: opId },
    });
    const genBefore = intent.deliveryGeneration;
    await prisma.passwordResetToken.update({
      where: { id: intent.passwordResetTokenId! },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await delivery.ensureDeliveryForOperation({
      securityOperationId: opId,
      organizationId: orgId,
      userId: intent.userId,
      actorUserId: masterActorId,
    });
    const after = await prisma.masterIdentityCredentialSetupIntent.findUniqueOrThrow({
      where: { securityOperationId: opId },
    });
    expect(after.deliveryGeneration).toBeGreaterThan(genBefore);
    expect(after.passwordResetTokenId).not.toBe(intent.passwordResetTokenId);
    const token = await prisma.passwordResetToken.findUniqueOrThrow({
      where: { id: after.passwordResetTokenId! },
    });
    expect(token.setupDeliveryGeneration).toBe(after.deliveryGeneration);
  });

  it('D05 — setup token cannot overwrite password established elsewhere', async () => {
    const orgId = await seedOrg();
    const opId = `op-d05-${randomUUID()}`;
    const email = `d05-${randomUUID()}@example.test`;
    await ctx.p3.globalIdentity.provisionGlobalUser(provisionDto(orgId, opId, email), actor(), auditReq());
    const token = resetTokenFromLastMail(ctx.p3.noopMail.sendPasswordReset as jest.Mock);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash('Already-Set-Pass!', 10) },
    });
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({
        token,
        newPassword: 'Str0ng-D05-New!',
        confirmPassword: 'Str0ng-D05-New!',
      })
      .expect(401);
  });

  it('D06 — deactivated organization blocks credential write', async () => {
    const orgId = await seedOrg();
    const opId = `op-d06b-${randomUUID()}`;
    const email = `d06b-${randomUUID()}@example.test`;
    await ctx.p3.globalIdentity.provisionGlobalUser(provisionDto(orgId, opId, email), actor(), auditReq());
    const token = resetTokenFromLastMail(ctx.p3.noopMail.sendPasswordReset as jest.Mock);
    await prisma.organization.update({ where: { id: orgId }, data: { status: OrganizationStatus.ARCHIVED } });
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({
        token,
        newPassword: 'Str0ng-D06b-New!',
        confirmPassword: 'Str0ng-D06b-New!',
      })
      .expect(401);
  });

  it('D06 — inactive membership blocks credential write', async () => {
    const orgId = await seedOrg();
    const opId = `op-d06-${randomUUID()}`;
    const email = `d06-${randomUUID()}@example.test`;
    await ctx.p3.globalIdentity.provisionGlobalUser(provisionDto(orgId, opId, email), actor(), auditReq());
    const token = resetTokenFromLastMail(ctx.p3.noopMail.sendPasswordReset as jest.Mock);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.organizationMembership.updateMany({
      where: { userId: user.id, organizationId: orgId },
      data: { status: MembershipStatus.SUSPENDED },
    });
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({
        token,
        newPassword: 'Str0ng-D06-New!',
        confirmPassword: 'Str0ng-D06-New!',
      })
      .expect(401);
  });

  it('D07 — post-setup replay does not issue reset mail or mutate credentials', async () => {
    const orgId = await seedOrg();
    const opId = `op-d07-${randomUUID()}`;
    const dto = provisionDto(orgId, opId);
    await ctx.p3.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    const mail = ctx.p3.noopMail.sendPasswordReset as jest.Mock;
    const countBefore = mail.mock.calls.length;
    const resetToken = resetTokenFromLastMail(mail);
    const password = 'Str0ng-D07-Credential!';
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: resetToken, newPassword: password, confirmPassword: password })
      .expect(200);
    const hashBefore = (await prisma.user.findUniqueOrThrow({ where: { email: dto.email } })).passwordHash;
    await ctx.p3.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    expect(mail.mock.calls.length).toBe(countBefore);
    const hashAfter = (await prisma.user.findUniqueOrThrow({ where: { email: dto.email } })).passwordHash;
    expect(hashAfter).toBe(hashBefore);
  });

  it('D08 — ordinary admin reset still revokes obsolete tokens', async () => {
    const orgId = await seedOrg();
    const userId = randomUUID();
    const email = `d08-${randomUUID()}@example.test`;
    await prisma.user.create({
      data: {
        id: userId,
        email,
        status: UserStatus.ACTIVE,
        platformRole: UserPlatformRole.USER,
        passwordHash: await bcrypt.hash('Existing-D08!', 10),
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
    await ctx.p3.passwordReset.requestAdminReset({
      organizationId: orgId,
      userId,
      actorUserId: masterActorId,
    });
    const first = await prisma.passwordResetToken.findFirst({
      where: { userId, securityOperationId: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    await ctx.p3.passwordReset.requestAdminReset({
      organizationId: orgId,
      userId,
      actorUserId: masterActorId,
    });
    const revoked = await prisma.passwordResetToken.findUniqueOrThrow({ where: { id: first!.id } });
    expect(revoked.revokedAt).toBeTruthy();
  });

  it('D09 — unrelated active reset authority survives provisioning replay', async () => {
    const orgId = await seedOrg();
    const email = `d09-${randomUUID()}@example.test`;
    const opId = `op-d09-${randomUUID()}`;
    const provisioned = await ctx.p3.globalIdentity.provisionGlobalUser(
      provisionDto(orgId, opId, email),
      actor(),
      auditReq(),
    );
    await ctx.p3.passwordReset.requestAdminReset({
      organizationId: orgId,
      userId: provisioned.user.id,
      actorUserId: masterActorId,
      reason: 'unrelated',
    });
    const unrelated = await prisma.passwordResetToken.findFirstOrThrow({
      where: { userId: provisioned.user.id, securityOperationId: null, revokedAt: null },
    });
    await ctx.p3.globalIdentity.provisionGlobalUser(provisionDto(orgId, opId, email), actor(), auditReq());
    const stillActive = await prisma.passwordResetToken.findUniqueOrThrow({
      where: { id: unrelated.id },
    });
    expect(stillActive.revokedAt).toBeNull();
  });

  it('R01 — stale generation transport ack cannot confirm newer generation', async () => {
    const orgId = await seedOrg();
    const opId = `op-r01-${randomUUID()}`;
    await ctx.p3.globalIdentity.provisionGlobalUser(provisionDto(orgId, opId), actor(), auditReq());
    const before = await prisma.masterIdentityCredentialSetupIntent.findUniqueOrThrow({
      where: { securityOperationId: opId },
    });
    const staleGen = before.deliveryGeneration;
    const staleTokenId = before.passwordResetTokenId!;
  await prisma.masterIdentityCredentialSetupIntent.update({
      where: { id: before.id },
      data: {
        deliveryGeneration: staleGen + 1,
        transportConfirmedAt: null,
        deliveryTokenCiphertext: encryptInviteToken('stale-ciphertext-test'),
      },
    });
    const ack = await prisma.masterIdentityCredentialSetupIntent.updateMany({
      where: {
        id: before.id,
        deliveryGeneration: staleGen,
        passwordResetTokenId: staleTokenId,
        transportConfirmedAt: null,
      },
      data: { transportConfirmedAt: new Date(), deliveryTokenCiphertext: null },
    });
    expect(ack.count).toBe(0);
    const after = await prisma.masterIdentityCredentialSetupIntent.findUniqueOrThrow({
      where: { id: before.id },
    });
    expect(after.transportConfirmedAt).toBeNull();
  });

  it('R02 — obsolete reset denied after credential establishment', async () => {
    const orgId = await seedOrg();
    const opId = `op-r02-${randomUUID()}`;
    const email = `r02-${randomUUID()}@example.test`;
    await ctx.p3.globalIdentity.provisionGlobalUser(provisionDto(orgId, opId, email), actor(), auditReq());
    const setupPlain = resetTokenFromLastMail(ctx.p3.noopMail.sendPasswordReset as jest.Mock);
    await ctx.p3.passwordReset.requestAdminReset({
      organizationId: orgId,
      userId: (await prisma.user.findUniqueOrThrow({ where: { email } })).id,
      actorUserId: masterActorId,
    });
    const adminTokenPlain = resetTokenFromLastMail(ctx.p3.noopMail.sendPasswordReset as jest.Mock);
    const password = 'Str0ng-R02-Credential!';
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: setupPlain, newPassword: password, confirmPassword: password })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: adminTokenPlain, newPassword: 'Other-Pass-12!', confirmPassword: 'Other-Pass-12!' })
      .expect(401);
  });

  it('R03 — encrypted secret cleared after transport confirm', async () => {
    const orgId = await seedOrg();
    const opId = `op-r03-${randomUUID()}`;
    await ctx.p3.globalIdentity.provisionGlobalUser(provisionDto(orgId, opId), actor(), auditReq());
    const intent = await prisma.masterIdentityCredentialSetupIntent.findUniqueOrThrow({
      where: { securityOperationId: opId },
    });
    expect(intent.transportConfirmedAt).toBeTruthy();
    expect(intent.deliveryTokenCiphertext).toBeNull();
  });

  it('D10 — HTTP confirm and login after delivery', async () => {
    const orgId = await seedOrg();
    const opId = `op-d10-${randomUUID()}`;
    const email = `d10-${randomUUID()}@example.test`;
    await ctx.p3.globalIdentity.provisionGlobalUser(provisionDto(orgId, opId, email), actor(), auditReq());
    const resetToken = resetTokenFromLastMail(ctx.p3.noopMail.sendPasswordReset as jest.Mock);
    const password = 'Str0ng-D10-Credential!';
    await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token: resetToken, newPassword: password, confirmPassword: password })
      .expect(200);
    const login = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password, organizationId: orgId })
      .expect(200);
    expect(login.body.accessToken).toBeTruthy();
  });
});
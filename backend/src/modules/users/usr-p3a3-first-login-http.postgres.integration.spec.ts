/**
 * USR-P3A.3A — actual first-login via public HTTP (disposable PostgreSQL).
 */
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import {
  BusinessType,
  InviteEmailOutboxStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationInviteStatus,
  OrganizationStatus,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import * as jwt from 'jsonwebtoken';
import * as request from 'supertest';
import type { AccessJwtPayload } from '@shared/auth/user-access-authority.types';
import {
  assertUsrP3a3FirstLoginHttpDb,
  createUsrP3a3FirstLoginHttpApp,
  parseInviteTokenFromUrl,
  USR_P3A3_FIRST_LOGIN_HTTP_JWT_SECRET,
} from './testing/usr-p3a3-first-login-http-pg.harness';
import { generateInviteToken, inviteTokenLookupKey } from './utils/invite-token.util';

const OPT_IN = 'USR_P3A3_FIRST_LOGIN_HTTP_PG';
const run = process.env[OPT_IN] === '1';

(run ? describe : describe.skip)('USR-P3A.3A first login (public HTTP, PostgreSQL)', () => {
  jest.setTimeout(240_000);
  let prisma: PrismaClient;
  let ctx: Awaited<ReturnType<typeof createUsrP3a3FirstLoginHttpApp>>;
  let masterActorId: string;
  let orgId: string;
  const inviteUrls: string[] = [];
  const actor = () => ({ id: masterActorId, platformRole: 'MASTER_ADMIN' as const });
  const auditReq = () => ({ method: 'POST', headers: {} as Record<string, string> });

  beforeAll(async () => {
    assertUsrP3a3FirstLoginHttpDb(OPT_IN);
    prisma = new PrismaClient();
    ctx = await createUsrP3a3FirstLoginHttpApp(prisma);
    masterActorId = randomUUID();
    orgId = randomUUID();
    await prisma.user.create({
      data: {
        id: masterActorId,
        email: `first-login-ma-${masterActorId}@example.test`,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.organization.create({
      data: {
        id: orgId,
        companyName: 'First Login Org',
        businessType: BusinessType.RENTAL,
        status: OrganizationStatus.ACTIVE,
      },
    });
    jest.spyOn(ctx.p3.noopMail, 'sendOrganizationInvite').mockImplementation(async (input) => {
      inviteUrls.push(input.inviteUrl);
      return { sent: true, fallback: false, provider: 'mock' };
    });
  });

  afterAll(async () => {
    await ctx?.app.close();
    await prisma?.$disconnect();
  });

  async function provisionInvitedWorker(email: string) {
    inviteUrls.length = 0;
    return ctx.p3.globalIdentity.provisionGlobalUser(
      {
        email,
        firstName: 'First',
        lastName: 'Login',
        initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: true },
      },
      actor(),
      auditReq(),
    );
  }

  it('L01 — master provision creates credentialless identity with encrypted delivery intent', async () => {
    const email = `l01-${randomUUID()}@example.test`;
    const res = await provisionInvitedWorker(email);
    expect(res.onboarding.invitationPersisted).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toBeNull();
    const invite = await prisma.organizationUserInvite.findFirstOrThrow({ where: { email, organizationId: orgId } });
    const outbox = await prisma.inviteEmailOutbox.findFirstOrThrow({ where: { inviteId: invite.id } });
    expect(outbox.status).toBe(InviteEmailOutboxStatus.COMPLETED);
    expect(outbox.tokenCiphertext).toBeNull();
    expect(inviteUrls.length).toBeGreaterThan(0);
  });

  it('L02 — mail transport exposes invitation URL for test capture', async () => {
    const email = `l02-${randomUUID()}@example.test`;
    await provisionInvitedWorker(email);
    const token = parseInviteTokenFromUrl(inviteUrls[inviteUrls.length - 1]);
    expect(token.length).toBeGreaterThan(20);
  });

  it('L03-L06 — recipient establishes credentials and logs in via HTTP', async () => {
    const email = `l03-${randomUUID()}@example.test`;
    const password = 'Str0ng-L03-Passw0rd!';
    const provision = await provisionInvitedWorker(email);
    const token = parseInviteTokenFromUrl(inviteUrls[inviteUrls.length - 1]);
    const accept = await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token, confirmed: true, password })
      .expect(201);
    expect(accept.body.accepted).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.passwordHash).toBeTruthy();
    expect(await bcrypt.compare(password, user.passwordHash!)).toBe(true);
    const membership = await prisma.organizationMembership.findFirstOrThrow({
      where: { userId: user.id, organizationId: orgId },
    });
    expect(membership.status).toBe(MembershipStatus.ACTIVE);
    expect(membership.role).toBe(MembershipRole.WORKER);
    const login = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password, organizationId: orgId })
      .expect(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.refreshToken).toBeTruthy();
    const decoded = jwt.verify(
      login.body.accessToken,
      USR_P3A3_FIRST_LOGIN_HTTP_JWT_SECRET,
    ) as AccessJwtPayload;
    const validated = await ctx.p2.authority.validateAccessJwt(decoded);
    expect(validated.id).toBe(user.id);
    expect(validated.membershipRole).toBe(MembershipRole.WORKER);
    expect(provision.user.id).toBe(user.id);
  });

  it('L07 — repeat accept is idempotent without duplicate mutation', async () => {
    const email = `l07-${randomUUID()}@example.test`;
    const password = 'Str0ng-L07-Passw0rd!';
    await provisionInvitedWorker(email);
    const token = parseInviteTokenFromUrl(inviteUrls[inviteUrls.length - 1]);
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token, confirmed: true, password })
      .expect(201);
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token, confirmed: true, password })
      .expect(201);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(
      await prisma.organizationMembership.count({ where: { user: { email }, organizationId: orgId } }),
    ).toBe(1);
  });

  it('L08 — established credential requires authentication', async () => {
    const email = `l08-${randomUUID()}@example.test`;
    const password = 'Str0ng-L08-Passw0rd!';
    await prisma.user.create({
      data: {
        email,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.ACTIVE,
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
    const { plain, hash } = generateInviteToken();
    const invite = await prisma.organizationUserInvite.create({
      data: {
        organizationId: orgId,
        email,
        membershipRole: MembershipRole.WORKER,
        tokenHash: hash,
        tokenLookup: inviteTokenLookupKey(plain),
        status: OrganizationInviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedByUserId: masterActorId,
      },
    });
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token: plain, confirmed: true, password: 'OtherPass1!long' })
      .expect(401);
    expect((await prisma.organizationUserInvite.findUniqueOrThrow({ where: { id: invite.id } })).status).toBe(
      OrganizationInviteStatus.PENDING,
    );
  });

  it('L09 — suspended identity cannot complete credentialless onboarding', async () => {
    const email = `l09-${randomUUID()}@example.test`;
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.SUSPENDED,
        passwordHash: null,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        userId,
        organizationId: orgId,
        role: MembershipRole.WORKER,
        status: MembershipStatus.INVITED,
      },
    });
    const { plain, hash } = generateInviteToken();
    await prisma.organizationUserInvite.create({
      data: {
        organizationId: orgId,
        email,
        membershipRole: MembershipRole.WORKER,
        tokenHash: hash,
        tokenLookup: inviteTokenLookupKey(plain),
        status: OrganizationInviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedByUserId: masterActorId,
      },
    });
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token: plain, confirmed: true, password: 'Str0ng-L09-Passw0rd!' })
      .expect(400);
  });

  it('L09b — privileged platform identity cannot use credentialless onboarding', async () => {
    const email = `l09b-${randomUUID()}@example.test`;
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
        passwordHash: null,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        userId,
        organizationId: orgId,
        role: MembershipRole.WORKER,
        status: MembershipStatus.INVITED,
      },
    });
    const { plain, hash } = generateInviteToken();
    await prisma.organizationUserInvite.create({
      data: {
        organizationId: orgId,
        email,
        membershipRole: MembershipRole.WORKER,
        tokenHash: hash,
        tokenLookup: inviteTokenLookupKey(plain),
        status: OrganizationInviteStatus.PENDING,
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedByUserId: masterActorId,
      },
    });
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token: plain, confirmed: true, password: 'Str0ng-L09b-Passw0rd!' })
      .expect(400);
  });

  it('L10 — invalid and revoked tokens cannot establish credentials', async () => {
    const { plain, hash } = generateInviteToken();
    const email = `l10-${randomUUID()}@example.test`;
    const invite = await prisma.organizationUserInvite.create({
      data: {
        organizationId: orgId,
        email,
        membershipRole: MembershipRole.WORKER,
        tokenHash: hash,
        tokenLookup: inviteTokenLookupKey(plain),
        status: OrganizationInviteStatus.REVOKED,
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedByUserId: masterActorId,
      },
    });
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token: plain, confirmed: true, password: 'Str0ng-L10-Passw0rd!' })
      .expect(400);
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token: 'not-a-real-token', confirmed: true, password: 'Str0ng-L10-Passw0rd!' })
      .expect(400);
    expect(invite.status).toBe(OrganizationInviteStatus.REVOKED);
  });

  it('L11 — HTTP accept after recovery rotation rejects stale generation', async () => {
    const email = `l11-${randomUUID()}@example.test`;
    await provisionInvitedWorker(email);
    const staleToken = parseInviteTokenFromUrl(inviteUrls[inviteUrls.length - 1]);
    const invite = await prisma.organizationUserInvite.findFirstOrThrow({ where: { email, organizationId: orgId } });
    await prisma.inviteEmailOutbox.updateMany({
      where: { inviteId: invite.id },
      data: { status: InviteEmailOutboxStatus.DEAD_LETTER },
    });
    let recoveryToken = '';
    const enqueueInTx = ctx.p3.inviteDelivery.enqueueInviteDeliveryInTransaction.bind(ctx.p3.inviteDelivery);
    jest.spyOn(ctx.p3.inviteDelivery, 'enqueueInviteDeliveryInTransaction').mockImplementation(async (tx, input) => {
      recoveryToken = input.plainToken;
      return enqueueInTx(tx, input);
    });
    await ctx.p3.inviteService.ensureInviteDeliveryContinuity(orgId, invite.id, masterActorId);
    jest.restoreAllMocks();
    expect(recoveryToken.length).toBeGreaterThan(10);
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token: staleToken, confirmed: true, password: 'Str0ng-L11-Passw0rd!' })
      .expect(400);
    const password = 'Str0ng-L11-Passw0rd!';
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token: recoveryToken, confirmed: true, password })
      .expect(201);
  });

  it('L12 — accept after revocation fails at HTTP boundary', async () => {
    const email = `l12-${randomUUID()}@example.test`;
    const password = 'Str0ng-L12-Passw0rd!';
    await provisionInvitedWorker(email);
    const token = parseInviteTokenFromUrl(inviteUrls[inviteUrls.length - 1]);
    const invite = await prisma.organizationUserInvite.findFirstOrThrow({ where: { email, organizationId: orgId } });
    await ctx.p3.inviteService.revokeInvite(orgId, invite.id, masterActorId);
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token, confirmed: true, password })
      .expect(400);
  });
});
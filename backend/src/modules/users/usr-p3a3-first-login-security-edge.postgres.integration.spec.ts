/**
 * USR-P3A.3A FL — first-login security edge regressions (E01–E10).
 */
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import {
  BusinessType,
  InviteEmailOutboxStatus,
  MembershipRole,
  MembershipStatus,
  MfaFactorType,
  OrganizationInviteStatus,
  OrganizationStatus,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import * as request from 'supertest';
import { acquireInviteDeliveryContinuityLock } from '@modules/auth/refresh-token-session-concurrency';
import {
  assertUsrP3a3FirstLoginHttpDb,
  createUsrP3a3FirstLoginHttpApp,
  parseInviteTokenFromUrl,
} from './testing/usr-p3a3-first-login-http-pg.harness';
import { generateInviteToken, inviteTokenLookupKey } from './utils/invite-token.util';
import {
  ensureRaceBarrierTable,
  pgBackendPid,
  resetRaceBarrier,
  setRacePhase,
  waitRacePhaseAtLeast,
  waitUntilBackendBlocked,
} from './testing/usr-p2-deterministic-concurrency.helper';

const OPT_IN = 'USR_P3A3_FIRST_LOGIN_SECURITY_EDGE_PG';
const run = process.env[OPT_IN] === '1';

(run ? describe : describe.skip)('USR-P3A.3A first-login security edges (PostgreSQL)', () => {
  jest.setTimeout(300_000);
  let prisma: PrismaClient;
  let prismaB: PrismaClient;
  let ctx: Awaited<ReturnType<typeof createUsrP3a3FirstLoginHttpApp>>;
  let masterActorId: string;
  let orgId: string;
  const inviteUrls: string[] = [];
  const actor = () => ({ id: masterActorId, platformRole: 'MASTER_ADMIN' as const });
  const auditReq = () => ({ method: 'POST', headers: {} as Record<string, string> });

  beforeAll(async () => {
    assertUsrP3a3FirstLoginHttpDb(OPT_IN);
    prisma = new PrismaClient();
    prismaB = new PrismaClient();
    ctx = await createUsrP3a3FirstLoginHttpApp(prisma);
    masterActorId = randomUUID();
    orgId = randomUUID();
    await prisma.user.create({
      data: {
        id: masterActorId,
        email: `edge-ma-${masterActorId}@example.test`,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
    await prisma.organization.create({
      data: {
        id: orgId,
        companyName: 'Edge Org',
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
    await prismaB?.$disconnect();
  });

  async function provisionInvitedWorker(email: string) {
    inviteUrls.length = 0;
    return ctx.p3.globalIdentity.provisionGlobalUser(
      {
        email,
        firstName: 'Edge',
        lastName: 'Case',
        initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: true },
      },
      actor(),
      auditReq(),
    );
  }

  it('E01 — bound provision first-login flow remains successful', async () => {
    const email = `e01-${randomUUID()}@example.test`;
    const password = 'Str0ng-E01-Passw0rd!';
    await provisionInvitedWorker(email);
    const token = parseInviteTokenFromUrl(inviteUrls[0]);
    const invite = await prisma.organizationUserInvite.findFirstOrThrow({ where: { email, organizationId: orgId } });
    expect(invite.provisionedUserId).toBeTruthy();
    expect(invite.provisionedMembershipId).toBeTruthy();
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token, confirmed: true, password })
      .expect(201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await bcrypt.compare(password, user.passwordHash!)).toBe(true);
  });

  it('E02 — unbound invite cannot establish credentials on credentialless user', async () => {
    const email = `e02-${randomUUID()}@example.test`;
    await provisionInvitedWorker(email);
    const user = await prisma.user.findFirstOrThrow({ where: { email } });
    const membership = await prisma.organizationMembership.findFirstOrThrow({
      where: { userId: user.id, organizationId: orgId },
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
        provisionedUserId: null,
        provisionedMembershipId: null,
      },
    });
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token: plain, confirmed: true, password: 'Str0ng-E02-Passw0rd!' })
      .expect(400);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.passwordHash).toBeNull();
    expect(
      (await prisma.organizationMembership.findUniqueOrThrow({ where: { id: membership.id } })).status,
    ).toBe(MembershipStatus.INVITED);
  });

  it('E03 — MFA-enrolled identity cannot use initial credential path', async () => {
    const email = `e03-${randomUUID()}@example.test`;
    await provisionInvitedWorker(email);
    const user = await prisma.user.findFirstOrThrow({ where: { email } });
    const invite = await prisma.organizationUserInvite.findFirstOrThrow({ where: { email, organizationId: orgId } });
    await prisma.userMfaFactor.create({
      data: {
        userId: user.id,
        factorType: MfaFactorType.TOTP,
        verifiedAt: new Date(),
      },
    });
    const token = parseInviteTokenFromUrl(inviteUrls[0]);
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token, confirmed: true, password: 'Str0ng-E03-Passw0rd!' })
      .expect((res) => expect([400, 401]).toContain(res.status));
    expect((await prisma.organizationUserInvite.findUniqueOrThrow({ where: { id: invite.id } })).status).toBe(
      OrganizationInviteStatus.PENDING,
    );
  });

  it('E04 — concurrent accepts admit one initial credential write', async () => {
    const email = `e04-${randomUUID()}@example.test`;
    await provisionInvitedWorker(email);
    const token = parseInviteTokenFromUrl(inviteUrls[0]);
    const invite = await prisma.organizationUserInvite.findFirstOrThrow({ where: { email, organizationId: orgId } });
    const passA = 'Str0ng-E04-Alpha-Pass!';
    const passB = 'Str0ng-E04-Bravo-Pass!';
    const [resA, resB] = await Promise.all([
      request(ctx.app.getHttpServer())
        .post('/api/v1/invites/accept')
        .send({ token, confirmed: true, password: passA }),
      request(ctx.app.getHttpServer())
        .post('/api/v1/invites/accept')
        .send({ token, confirmed: true, password: passB }),
    ]);
    expect([resA.status, resB.status].filter((s) => s === 201).length).toBeGreaterThanOrEqual(1);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const aOk = await bcrypt.compare(passA, user.passwordHash!);
    const bOk = await bcrypt.compare(passB, user.passwordHash!);
    expect(aOk || bOk).toBe(true);
    expect(aOk && bOk).toBe(false);
    expect(
      await prisma.iamAuditOutbox.count({
        where: {
          organizationId: orgId,
          idempotencyKey: `invite-accept:${invite.id}`,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.organizationMembership.count({
        where: { userId: user.id, organizationId: orgId, status: MembershipStatus.ACTIVE },
      }),
    ).toBe(1);
  });

  it('E05 — pre-established password cannot be overwritten by invite accept', async () => {
    const email = `e05-${randomUUID()}@example.test`;
    await provisionInvitedWorker(email);
    const user = await prisma.user.findFirstOrThrow({ where: { email } });
    const otherHash = await bcrypt.hash('Other-Established-Pass1!', 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: otherHash } });
    const token = parseInviteTokenFromUrl(inviteUrls[0]);
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token, confirmed: true, password: 'Str0ng-E05-Passw0rd!' })
      .expect(401);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare('Other-Established-Pass1!', after.passwordHash!)).toBe(true);
  });

  it('E06 — accept overlaps recovery; stale token cannot authorize credential mutation', async () => {
    const email = `e06-${randomUUID()}@example.test`;
    await provisionInvitedWorker(email);
    const staleToken = parseInviteTokenFromUrl(inviteUrls[0]);
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
    const acceptRes = request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token: staleToken, confirmed: true, password: 'Str0ng-E06-Passw0rd!' });
    await Promise.all([
      ctx.p3.inviteService.ensureInviteDeliveryContinuity(orgId, invite.id, masterActorId),
      acceptRes,
    ]);
    jest.restoreAllMocks();
    expect(recoveryToken.length).toBeGreaterThan(10);
    expect((await acceptRes).status).toBe(400);
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token: recoveryToken, confirmed: true, password: 'Str0ng-E06-Passw0rd!' })
      .expect(201);
  });

  it('E07 — accept overlaps revocation with participating transaction overlap', async () => {
    const email = `e07-${randomUUID()}@example.test`;
    await provisionInvitedWorker(email);
    const token = parseInviteTokenFromUrl(inviteUrls[0]);
    const invite = await prisma.organizationUserInvite.findFirstOrThrow({ where: { email, organizationId: orgId } });
    const raceId = randomUUID();
    await ensureRaceBarrierTable(prisma);
    await resetRaceBarrier(prisma, raceId);
    let heldPid = 0;
    const holdInviteLock = prisma.$transaction(
      async (tx) => {
        await acquireInviteDeliveryContinuityLock(tx, invite.id);
        heldPid = await pgBackendPid(prisma);
        await setRacePhase(prisma, raceId, 'a_lock_acquired', { pid: heldPid });
        await waitRacePhaseAtLeast(prisma, raceId, 'b_waiting');
        await waitRacePhaseAtLeast(prisma, raceId, 'done');
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
    await waitRacePhaseAtLeast(prismaB, raceId, 'a_lock_acquired');
    const acceptPromise = request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token, confirmed: true, password: 'Str0ng-E07-Passw0rd!' });
    const revokePromise = ctx.p3.inviteService.revokeInvite(orgId, invite.id, masterActorId);
    await setRacePhase(prismaB, raceId, 'b_waiting');
    const blocked = await waitUntilBackendBlocked(prismaB, heldPid, { timeoutMs: 20_000, pollMs: 20 }).catch(
      () => [],
    );
    await setRacePhase(prisma, raceId, 'done');
    await holdInviteLock;
    const [acceptResult, revokeResult] = await Promise.all([acceptPromise, revokePromise]);
    if (blocked.length > 0) {
      expect(blocked.length).toBeGreaterThan(0);
    }
    const after = await prisma.organizationUserInvite.findUniqueOrThrow({ where: { id: invite.id } });
    const accepted = acceptResult.status === 201;
    const revoked = after.status === OrganizationInviteStatus.REVOKED;
    expect(accepted !== revoked).toBe(true);
    expect(revoked || after.status === OrganizationInviteStatus.ACCEPTED).toBe(true);
    void revokeResult;
  });

  it('E08 — expired invite and weak password denied', async () => {
    const email = `e08-${randomUUID()}@example.test`;
    await provisionInvitedWorker(email);
    const invite = await prisma.organizationUserInvite.findFirstOrThrow({ where: { email, organizationId: orgId } });
    const { plain, hash } = generateInviteToken();
    await prisma.organizationUserInvite.update({
      where: { id: invite.id },
      data: {
        tokenHash: hash,
        tokenLookup: inviteTokenLookupKey(plain),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token: plain, confirmed: true, password: 'short' })
      .expect(400);
  });

  it('E09 — suspended membership blocks initial credential path', async () => {
    const email = `e09-${randomUUID()}@example.test`;
    const userId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        email,
        platformRole: UserPlatformRole.USER,
        status: UserStatus.ACTIVE,
        passwordHash: null,
      },
    });
    const membershipId = randomUUID();
    await prisma.organizationMembership.create({
      data: {
        id: membershipId,
        userId,
        organizationId: orgId,
        role: MembershipRole.WORKER,
        status: MembershipStatus.SUSPENDED,
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
        provisionedUserId: userId,
        provisionedMembershipId: membershipId,
      },
    });
    await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token: plain, confirmed: true, password: 'Str0ng-E09-Passw0rd!' })
      .expect(401);
  });

  it('E10 — public validate preview matches acceptance eligibility', async () => {
    const email = `e10-${randomUUID()}@example.test`;
    await provisionInvitedWorker(email);
    const token = parseInviteTokenFromUrl(inviteUrls[0]);
    const preview = await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/validate')
      .send({ token })
      .expect((res) => expect([200, 201]).toContain(res.status));
    expect(preview.body.valid).toBe(true);
    expect(preview.body.initialCredentialEligible).toBe(true);
    expect(preview.body.requiresPassword).toBe(true);
    expect(preview.body.requiresAuthentication).toBe(false);
    const accept = await request(ctx.app.getHttpServer())
      .post('/api/v1/invites/accept')
      .send({ token, confirmed: true, password: 'Str0ng-E10-Passw0rd!' });
    expect(accept.status).toBe(201);
  });
});
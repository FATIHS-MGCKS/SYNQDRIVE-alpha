/**
 * USR-P3A.3A — transactional provisioning + invitation delivery (disposable PostgreSQL).
 */
import { randomUUID } from 'node:crypto';
import {
  ActivityAction,
  BusinessType,
  InviteEmailOutboxStatus,
  MasterAdminAuditScope,
  MembershipRole,
  OrganizationInviteStatus,
  OrganizationStatus,
  PrismaClient,
  UserPlatformRole,
  UserStatus,
} from '@prisma/client';
import {
  buildMasterIdentityAuditIdempotencyKey,
  readProvisionOperationMetadataFromOutbox,
  readProvisionedUserIdFromOutbox,
} from './policies/master-global-identity-operation.policy';
import { createUsrP3a3IdentityPgStack } from './testing/usr-p3a3-identity-pg-stack.helper';
import { InviteAcceptService } from './invite-accept.service';
import { IamMembershipLifecycleService } from './iam-membership-lifecycle.service';
import { IamMembershipLifecycleNotificationService } from './iam-membership-lifecycle-notification.service';
import { createUsrP2PgIamStack } from './testing/usr-p2-pg-iam-stack.helper';
import {
  MASTER_IDENTITY_OPERATION_DOMAIN,
  buildProvisionPayloadFingerprint,
  outboxMatchesIdentityOperation,
  type MasterIdentityOperationBinding,
} from './policies/master-global-identity-operation.policy';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { generateInviteToken, inviteTokenLookupKey } from './utils/invite-token.util';
import {
  acquireIdentityEmailProvisionLock,
  acquireInviteDeliveryContinuityLock,
} from '@modules/auth/refresh-token-session-concurrency';
import {
  ensureRaceBarrierTable,
  pgBackendPid,
  resetRaceBarrier,
  setRacePhase,
  waitRacePhaseAtLeast,
  waitUntilBackendBlocked,
} from './testing/usr-p2-deterministic-concurrency.helper';

const OPT_IN = 'USR_P3A3_MASTER_IDENTITY_PG';
const run = process.env[OPT_IN] === '1';

function assertDisposableDb(): void {
  const raw = process.env.DATABASE_URL ?? '';
  let host = '';
  try {
    host = new URL(raw.replace(/^postgres:/, 'postgresql:')).hostname;
  } catch {
    throw new Error('DATABASE_URL must be a valid postgres URL');
  }
  const dbName = raw.split('/').pop()?.split('?')[0] ?? '';
  if (!['127.0.0.1', 'localhost'].includes(host) || !/^usr_p2_[a-z0-9_]+$/.test(dbName)) {
    throw new Error('DATABASE_URL must target disposable loopback usr_p2_* test DB');
  }
}

(run ? describe : describe.skip)('USR-P3A.3A transaction + invitation (PostgreSQL)', () => {
  jest.setTimeout(240_000);
  let prisma: PrismaClient;
  let prismaB: PrismaClient;
  let stack: ReturnType<typeof createUsrP3a3IdentityPgStack>;
  let inviteAccept: InviteAcceptService;
  let masterActorId: string;

  const actor = () => ({ id: masterActorId, platformRole: 'MASTER_ADMIN' as const });
  const auditReq = () => ({ method: 'POST', headers: {} as Record<string, string> });

  async function seedActiveOrg(status: OrganizationStatus = OrganizationStatus.ACTIVE) {
    const orgId = randomUUID();
    await prisma.organization.create({
      data: {
        id: orgId,
        companyName: `Tx Org ${orgId.slice(0, 8)}`,
        businessType: BusinessType.RENTAL,
        status,
      },
    });
    return orgId;
  }

  beforeAll(async () => {
    assertDisposableDb();
    prisma = new PrismaClient();
    prismaB = new PrismaClient();
    stack = createUsrP3a3IdentityPgStack(prisma);
    const { sessionPolicy } = createUsrP2PgIamStack(prisma, 'usr-p3a3-tx-secret');
    const lifecycle = new IamMembershipLifecycleService(
      prisma as never,
      stack.iamAudit,
      new IamMembershipLifecycleNotificationService(prisma as never),
      sessionPolicy,
    );
    inviteAccept = new InviteAcceptService(prisma as never, lifecycle, stack.iamAudit);
    masterActorId = randomUUID();
    await prisma.user.create({
      data: {
        id: masterActorId,
        email: `p3a3-tx-${masterActorId}@example.test`,
        platformRole: UserPlatformRole.MASTER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await prismaB?.$disconnect();
  });

  it('T01 — identity-only vs identity-only same email is replay not second user', async () => {
    const opId = `t01-${randomUUID()}`;
    const email = `t01-${randomUUID()}@example.test`;
    const dto = { email, firstName: 'T01', lastName: 'A', idempotencyKey: opId };
    const a = await stack.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    const b = await stack.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    expect(b.idempotentReplay).toBe(true);
    expect(b.user.id).toBe(a.user.id);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it('T02 — org provisioning same-key replay preserves membership and invite binding', async () => {
    const orgId = await seedActiveOrg();
    const opId = `t02-${randomUUID()}`;
    const email = `t02-${randomUUID()}@example.test`;
    const dto = {
      email,
      firstName: 'T02',
      lastName: 'Org',
      idempotencyKey: opId,
      initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: true },
    };
    const first = await stack.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    const outbox = await prisma.masterAdminAuditOutbox.findUniqueOrThrow({
      where: { idempotencyKey: buildMasterIdentityAuditIdempotencyKey(opId) },
    });
    const inviteId = readProvisionOperationMetadataFromOutbox(outbox)?.inviteId;
    const second = await stack.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    expect(second.idempotentReplay).toBe(true);
    expect(second.user.id).toBe(first.user.id);
    expect(readProvisionOperationMetadataFromOutbox(outbox)?.inviteId).toBe(inviteId);
    expect(await prisma.organizationMembership.count({ where: { userId: first.user.id, organizationId: orgId } })).toBe(1);
  });

  it('T03 — identity-only then org provision same email conflicts', async () => {
    const email = `t03-${randomUUID()}@example.test`;
    await stack.globalIdentity.provisionGlobalUser(
      { email, firstName: 'T03', lastName: 'Solo' },
      actor(),
      auditReq(),
    );
    const orgId = await seedActiveOrg();
    await expect(
      stack.globalIdentity.provisionGlobalUser(
        {
          email,
          firstName: 'T03',
          lastName: 'Org',
          initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: true },
        },
        actor(),
        auditReq(),
      ),
    ).rejects.toThrow();
  });

  it('T06 — cross-actor replay binding rejected before mutation', async () => {
    const opId = randomUUID();
    const email = `t06-${randomUUID()}@example.test`;
    const stored: MasterIdentityOperationBinding = {
      domain: MASTER_IDENTITY_OPERATION_DOMAIN,
      action: 'PROVISION_IDENTITY',
      actorUserId: masterActorId,
      organizationId: null,
      normalizedEmail: email,
      payloadFingerprint: buildProvisionPayloadFingerprint(email, { email, firstName: 'X' } as never, false),
      securityOperationId: opId,
      targetUserId: randomUUID(),
    };
    const row = await prisma.masterAdminAuditOutbox.create({
      data: {
        idempotencyKey: buildMasterIdentityAuditIdempotencyKey(opId),
        auditAction: MasterAdminAuditAction.PLATFORM_USER_CREATED,
        occurredAt: new Date(),
        payloadVersion: 1,
        actorUserId: masterActorId,
        subjectUserId: stored.targetUserId!,
        status: 'PENDING',
        nextRetryAt: new Date(),
        auditScope: MasterAdminAuditScope.PLATFORM,
        payload: { masterAdminAuditEnvelope: { metadata: { operationBinding: stored }, entityId: stored.targetUserId } },
      },
    });
    expect(outboxMatchesIdentityOperation(row, { ...stored, actorUserId: randomUUID() })).toBe(false);
    await expect(
      stack.globalIdentity.provisionGlobalUser(
        { email, firstName: 'X', lastName: 'Y', idempotencyKey: opId },
        actor(),
        auditReq(),
      ),
    ).rejects.toThrow();
  });

  it('T04 — concurrent same-key replay admits one semantic row', async () => {
    const opId = `t04-${randomUUID()}`;
    const email = `t04-${randomUUID()}@example.test`;
    const dto = { email, firstName: 'T04', lastName: 'Race', idempotencyKey: opId };
    const [a, b] = await Promise.all([
      stack.globalIdentity.provisionGlobalUser(dto, actor(), auditReq()),
      stack.globalIdentity.provisionGlobalUser(dto, actor(), auditReq()),
    ]);
    const userIds = new Set([a.user.id, b.user.id]);
    expect(userIds.size).toBe(1);
    expect(await prisma.masterAdminAuditOutbox.count({
      where: { idempotencyKey: buildMasterIdentityAuditIdempotencyKey(opId) },
    })).toBe(1);
  });

  it('T05 — commit succeeds, lost immediate ack, identical replay succeeds', async () => {
    const opId = `t05-${randomUUID()}`;
    const email = `t05-${randomUUID()}@example.test`;
    const dto = { email, firstName: 'T05', lastName: 'Ack', idempotencyKey: opId };
    const spy = jest
      .spyOn(stack.auditDelivery, 'attemptImmediateDelivery')
      .mockResolvedValue('FAILED');
    const first = await stack.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    spy.mockRestore();
    const outbox = await prisma.masterAdminAuditOutbox.findUniqueOrThrow({
      where: { idempotencyKey: buildMasterIdentityAuditIdempotencyKey(opId) },
    });
    expect(readProvisionedUserIdFromOutbox(outbox)).toBe(first.user.id);
    const second = await stack.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    expect(second.idempotentReplay).toBe(true);
    expect(second.user.id).toBe(first.user.id);
  });

  it('T08 — invite persistence failure rolls back org provisioning', async () => {
    const orgId = await seedActiveOrg();
    const email = `t08-${randomUUID()}@example.test`;
    jest
      .spyOn(stack.inviteService, 'persistNewInviteInTransaction')
      .mockRejectedValueOnce(new Error('invite persist fail'));
    await expect(
      stack.globalIdentity.provisionGlobalUser(
        {
          email,
          firstName: 'T08',
          lastName: 'Invite',
          initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: true },
        },
        actor(),
        auditReq(),
      ),
    ).rejects.toThrow();
    expect(await prisma.user.count({ where: { email } })).toBe(0);
    jest.restoreAllMocks();
  });

  it('T07 — audit persistence failure rolls back identity provisioning', async () => {
    const email = `t07-${randomUUID()}@example.test`;
    jest
      .spyOn(stack.auditDelivery, 'persistAuthoritativeAuditIntent')
      .mockRejectedValueOnce(new Error('audit tx fail'));
    await expect(
      stack.globalIdentity.provisionGlobalUser(
        { email, firstName: 'T07', lastName: 'Fail' },
        actor(),
        auditReq(),
      ),
    ).rejects.toThrow();
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('T09 — delivery intent failure rolls back org onboarding operation', async () => {
    const orgId = await seedActiveOrg();
    const email = `t09-${randomUUID()}@example.test`;
    jest
      .spyOn(stack.inviteOutbox, 'createEntryIdempotentInTransaction')
      .mockRejectedValueOnce(new Error('delivery intent fail'));
    await expect(
      stack.globalIdentity.provisionGlobalUser(
        {
          email,
          firstName: 'T09',
          lastName: 'Delivery',
          initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: true },
        },
        actor(),
        auditReq(),
      ),
    ).rejects.toThrow();
    expect(await prisma.user.count({ where: { email } })).toBe(0);
    expect(await prisma.organizationUserInvite.count({ where: { email, organizationId: orgId } })).toBe(0);
  });

  it('T10 — concurrent invitation recovery admits one live generation', async () => {
    const orgId = await seedActiveOrg();
    const email = `t10-${randomUUID()}@example.test`;
    const opId = `t10-${randomUUID()}`;
    await stack.globalIdentity.provisionGlobalUser(
      {
        email,
        firstName: 'T10',
        lastName: 'Rec',
        idempotencyKey: opId,
        initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: true },
      },
      actor(),
      auditReq(),
    );
    const audit = await prisma.masterAdminAuditOutbox.findUniqueOrThrow({
      where: { idempotencyKey: buildMasterIdentityAuditIdempotencyKey(opId) },
    });
    const inviteId = readProvisionOperationMetadataFromOutbox(audit)?.inviteId!;
    await prisma.inviteEmailOutbox.updateMany({ where: { inviteId }, data: { status: InviteEmailOutboxStatus.DEAD_LETTER } });
    await Promise.all([
      stack.inviteService.ensureInviteDeliveryContinuity(orgId, inviteId, masterActorId),
      stack.inviteService.ensureInviteDeliveryContinuity(orgId, inviteId, masterActorId),
    ]);
    const live = await prisma.inviteEmailOutbox.findMany({
      where: { inviteId, status: { not: InviteEmailOutboxStatus.DEAD_LETTER } },
    });
    expect(live).toHaveLength(1);
  });

  it('T11 — stale delivery intent suppressed after token rotation', async () => {
    const orgId = await seedActiveOrg();
    const email = `t11-${randomUUID()}@example.test`;
    const { plain, hash } = generateInviteToken();
    const tokenLookup = inviteTokenLookupKey(plain);
    const invite = await prisma.organizationUserInvite.create({
      data: {
        organizationId: orgId,
        email,
        membershipRole: MembershipRole.WORKER,
        status: OrganizationInviteStatus.PENDING,
        tokenHash: hash,
        tokenLookup,
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedByUserId: masterActorId,
      },
    });
    const staleOutbox = await stack.inviteDelivery.enqueueInviteDelivery({
      organizationId: orgId,
      inviteId: invite.id,
      plainToken: plain,
      sentByUserId: masterActorId,
      idempotencyKey: `invite:create:${invite.id}`,
    });
    const rotated = generateInviteToken();
    await prisma.organizationUserInvite.update({
      where: { id: invite.id },
      data: { tokenHash: rotated.hash, tokenLookup: inviteTokenLookupKey(rotated.plain) },
    });
    const pending = await prisma.inviteEmailOutbox.update({
      where: { id: staleOutbox.outboxId! },
      data: { status: InviteEmailOutboxStatus.PENDING },
    });
    const result = await stack.inviteDelivery.processOutboxId(pending.id);
    expect(result).toBe('skipped');
  });

  it('T12 — invite acceptance during recovery uses rotated authoritative token', async () => {
    const orgId = await seedActiveOrg();
    const email = `t12-${randomUUID()}@example.test`;
    const opId = `t12-${randomUUID()}`;
    await stack.globalIdentity.provisionGlobalUser(
      {
        email,
        firstName: 'T12',
        lastName: 'Race',
        idempotencyKey: opId,
        initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: true },
      },
      actor(),
      auditReq(),
    );
    const audit = await prisma.masterAdminAuditOutbox.findUniqueOrThrow({
      where: { idempotencyKey: buildMasterIdentityAuditIdempotencyKey(opId) },
    });
    const inviteId = readProvisionOperationMetadataFromOutbox(audit)?.inviteId!;
    await prisma.inviteEmailOutbox.updateMany({ where: { inviteId }, data: { status: InviteEmailOutboxStatus.DEAD_LETTER } });
    let recoveryPlain = '';
    const enqueueInTx = stack.inviteDelivery.enqueueInviteDeliveryInTransaction.bind(stack.inviteDelivery);
    jest
      .spyOn(stack.inviteDelivery, 'enqueueInviteDeliveryInTransaction')
      .mockImplementation(async (tx, input) => {
        recoveryPlain = input.plainToken;
        return enqueueInTx(tx, input);
      });
    await stack.inviteService.ensureInviteDeliveryContinuity(orgId, inviteId, masterActorId);
    jest.restoreAllMocks();
    expect(recoveryPlain.length).toBeGreaterThan(10);
    const accepted = await inviteAccept.acceptInvite(
      { token: recoveryPlain, confirmed: true, password: 'Str0ng-Passw0rd!t12' },
      null,
    );
    expect(accepted.userId).toBeTruthy();
  });

  it('T13 — revoke pending invite blocks recovery rotation', async () => {
    const orgId = await seedActiveOrg();
    const email = `t13-${randomUUID()}@example.test`;
    const res = await stack.globalIdentity.provisionGlobalUser(
      {
        email,
        firstName: 'T13',
        lastName: 'Rev',
        initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: true },
      },
      actor(),
      auditReq(),
    );
    const invite = await prisma.organizationUserInvite.findFirstOrThrow({ where: { email, organizationId: orgId } });
    await prisma.inviteEmailOutbox.updateMany({ where: { inviteId: invite.id }, data: { status: InviteEmailOutboxStatus.DEAD_LETTER } });
    await stack.inviteService.revokeInvite(orgId, invite.id, masterActorId);
    const continuity = await stack.inviteService.ensureInviteDeliveryContinuity(orgId, invite.id, masterActorId);
    expect(continuity.invitePending).toBe(false);
    expect(
      await prisma.inviteEmailOutbox.count({
        where: { inviteId: invite.id, status: { not: InviteEmailOutboxStatus.DEAD_LETTER } },
      }),
    ).toBe(0);
    expect(res.user.id).toBeTruthy();
  });

  it('T14 — invite acceptance uses authoritative token generation', async () => {
    const orgId = await seedActiveOrg();
    const email = `t14-${randomUUID()}@example.test`;
    let plainAccept = '';
    const enqueueInTx = stack.inviteDelivery.enqueueInviteDeliveryInTransaction.bind(stack.inviteDelivery);
    const spy = jest
      .spyOn(stack.inviteDelivery, 'enqueueInviteDeliveryInTransaction')
      .mockImplementation(async (tx, input) => {
        plainAccept = input.plainToken;
        return enqueueInTx(tx, input);
      });
    await stack.globalIdentity.provisionGlobalUser(
      {
        email,
        firstName: 'T14',
        lastName: 'Accept',
        initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: true },
      },
      actor(),
      auditReq(),
    );
    spy.mockRestore();
    expect(plainAccept.length).toBeGreaterThan(10);
    const invite = await prisma.organizationUserInvite.findFirstOrThrow({ where: { email, organizationId: orgId } });
    const accepted = await inviteAccept.acceptInvite(
      { token: plainAccept, confirmed: true, password: 'Str0ng-Passw0rd!t14' },
      null,
    );
    expect(accepted.userId).toBeTruthy();
    const after = await prisma.organizationUserInvite.findUniqueOrThrow({ where: { id: invite.id } });
    expect(after.status).toBe(OrganizationInviteStatus.ACCEPTED);
  });

  it('T15 — exactly one semantic ActivityLog CREATE per identity provision', async () => {
    const opId = `t15-${randomUUID()}`;
    const email = `t15-${randomUUID()}@example.test`;
    const dto = { email, firstName: 'T15', lastName: 'Audit', idempotencyKey: opId };
    const first = await stack.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    await stack.globalIdentity.provisionGlobalUser(dto, actor(), auditReq());
    const logs = await prisma.activityLog.count({
      where: { entityId: first.user.id, action: ActivityAction.CREATE },
    });
    expect(logs).toBe(1);
  });

  it('T16 — non-active organization rejects provisioning', async () => {
    const orgId = await seedActiveOrg(OrganizationStatus.SUSPENDED);
    const email = `t16-${randomUUID()}@example.test`;
    await expect(
      stack.globalIdentity.provisionGlobalUser(
        {
          email,
          firstName: 'T16',
          lastName: 'Org',
          initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: true },
        },
        actor(),
        auditReq(),
      ),
    ).rejects.toThrow();
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('T17 — provision creates invite with membership role parity', async () => {
    const orgId = await seedActiveOrg();
    const email = `t17-${randomUUID()}@example.test`;
    await stack.globalIdentity.provisionGlobalUser(
      {
        email,
        firstName: 'T17',
        lastName: 'Role',
        initialMembership: { organizationId: orgId, role: MembershipRole.ORG_ADMIN, inviteByEmail: true },
      },
      actor(),
      auditReq(),
    );
    const invite = await prisma.organizationUserInvite.findFirstOrThrow({ where: { email, organizationId: orgId } });
    const membership = await prisma.organizationMembership.findFirstOrThrow({
      where: { organizationId: orgId, user: { email } },
    });
    expect(invite.membershipRole).toBe(MembershipRole.ORG_ADMIN);
    expect(membership.role).toBe(MembershipRole.ORG_ADMIN);
  });

  it('provision path persists delivery intent in same commit as invite', async () => {
    const orgId = await seedActiveOrg();
    const email = `atomic-${randomUUID()}@example.test`;
    await stack.globalIdentity.provisionGlobalUser(
      {
        email,
        firstName: 'Atomic',
        lastName: 'Delivery',
        initialMembership: { organizationId: orgId, role: MembershipRole.WORKER, inviteByEmail: true },
      },
      actor(),
      auditReq(),
    );
    const invite = await prisma.organizationUserInvite.findFirstOrThrow({ where: { email, organizationId: orgId } });
    const outbox = await prisma.inviteEmailOutbox.findFirstOrThrow({
      where: { inviteId: invite.id, idempotencyKey: `invite:create:${invite.id}` },
    });
    expect(outbox.status).toBe(InviteEmailOutboxStatus.COMPLETED);
    expect(outbox.idempotencyKey).toBe(`invite:create:${invite.id}`);
  });

  it('identity email provision lock wait observes participating backend pid', async () => {
    const email = `tx-lock-${randomUUID()}@example.test`;
    const raceId = randomUUID();
    await ensureRaceBarrierTable(prisma);
    await resetRaceBarrier(prisma, raceId);
    let blockedPid = 0;
    const bConn = (async () => {
      await waitRacePhaseAtLeast(prismaB, raceId, 'a_lock_acquired');
      blockedPid = await pgBackendPid(prismaB);
      await setRacePhase(prisma, raceId, 'b_waiting', { pid: blockedPid });
      await prismaB.$transaction(async (txB) => {
        await acquireIdentityEmailProvisionLock(txB, email);
        await setRacePhase(prisma, raceId, 'done');
      });
    })();
    await prisma.$transaction(async (txA) => {
      await acquireIdentityEmailProvisionLock(txA, email);
      await setRacePhase(prisma, raceId, 'a_lock_acquired');
      await waitRacePhaseAtLeast(prisma, raceId, 'b_waiting');
      const blocked = await waitUntilBackendBlocked(prisma, blockedPid, { timeoutMs: 45_000, pollMs: 15 });
      expect(blocked.length).toBeGreaterThan(0);
    });
    await bConn;
  });

  it('invite delivery continuity lock wait observes participating backend pid', async () => {
    const inviteId = randomUUID();
    const raceId = randomUUID();
    await ensureRaceBarrierTable(prisma);
    await resetRaceBarrier(prisma, raceId);
    let blockedPid = 0;
    const bConn = (async () => {
      await waitRacePhaseAtLeast(prismaB, raceId, 'a_lock_acquired');
      blockedPid = await pgBackendPid(prismaB);
      await setRacePhase(prisma, raceId, 'b_waiting', { pid: blockedPid });
      await prismaB.$transaction(async (txB) => {
        await acquireInviteDeliveryContinuityLock(txB, inviteId);
        await setRacePhase(prisma, raceId, 'done');
      });
    })();
    await prisma.$transaction(async (txA) => {
      await acquireInviteDeliveryContinuityLock(txA, inviteId);
      await setRacePhase(prisma, raceId, 'a_lock_acquired');
      await waitRacePhaseAtLeast(prisma, raceId, 'b_waiting');
      const blocked = await waitUntilBackendBlocked(prisma, blockedPid, { timeoutMs: 45_000, pollMs: 15 });
      expect(blocked.length).toBeGreaterThan(0);
    });
    await bConn;
  });
});
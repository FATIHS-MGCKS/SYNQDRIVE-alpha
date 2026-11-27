/**
 * USR-P2E E3 — audit accountability final seal (P2-R24).
 * USR_P2E_E3_AUDIT_PG=1
 */
import { randomUUID } from 'node:crypto';
import { PrismaClient, UserPlatformRole } from '@prisma/client';
import { MasterAdminAuditAction } from './master-admin-audit.contract';
import { MasterAdminAuditDeliveryService } from './master-admin-audit-delivery.service';
import { MasterAdminAuditOutboxRepository } from './master-admin-audit-outbox.repository';
import { MasterAdminAuditOutboxProcessorService } from './master-admin-audit-outbox.processor';
import {
  buildMasterAdminSessionRevocationAuditIdempotencyKey,
  generateMasterAdminSecurityOperationId,
} from './master-admin-audit-delivery.contract';
import { assertMasterAdminAuditDisposablePostgresPreflight } from './testing/master-admin-audit-disposable-postgres-preflight';
import { SecurityGovernanceSessionAuditService } from '@modules/platform-admin/security-governance-session-audit.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';

const OPT_IN = 'USR_P2E_E3_AUDIT_PG';
const run = process.env[OPT_IN] === '1';

(run ? describe : describe.skip)('USR-P2E E3 audit accountability (PostgreSQL)', () => {
  jest.setTimeout(240_000);
  let prisma: PrismaClient;
  let prismaB: PrismaClient;
  let delivery: MasterAdminAuditDeliveryService;
  let sessionAudit: SecurityGovernanceSessionAuditService;
  let refreshTokens: RefreshTokenService;

  const reqStub = (actorId: string) => ({
    method: 'POST',
    originalUrl: '/api/v1/admin/security/users/x/sessions/y/revoke',
    user: { id: actorId, platformRole: 'MASTER_ADMIN', platformPermissions: [] as string[] },
    headers: { 'user-agent': 'e3-audit' },
    requestId: randomUUID(),
  });

  beforeAll(() => {
    assertMasterAdminAuditDisposablePostgresPreflight();
    prisma = new PrismaClient();
    prismaB = new PrismaClient();
    const outboxRepo = new MasterAdminAuditOutboxRepository(prisma as never);
    const processor = new MasterAdminAuditOutboxProcessorService(prisma as never, outboxRepo);
    delivery = new MasterAdminAuditDeliveryService(prisma as never, outboxRepo, processor);
    refreshTokens = new RefreshTokenService(
      prisma as never,
      { get: (k: string) => (k === 'app.jwtSecret' ? 'e3-audit-secret' : '15m') } as never,
      { enforceSessionPolicy: jest.fn() } as never,
      { listGrantsForUser: jest.fn().mockResolvedValue([]) } as never,
    );
    sessionAudit = new SecurityGovernanceSessionAuditService(
      prisma as never,
      delivery,
      refreshTokens,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await prismaB?.$disconnect();
  });

  async function createActor() {
    const id = randomUUID();
    const email = `e3-${id}@example.test`;
    await prisma.$executeRaw`
      INSERT INTO users (
        id, email, platform_role, status, created_at, updated_at, session_version, security_version
      ) VALUES (
        ${id}::uuid, ${email}, ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole",
        'ACTIVE'::"UserStatus", NOW(), NOW(), 0, 0
      )
    `;
    return { id };
  }

  async function createSession(userId: string, family?: string) {
    const id = randomUUID();
    const fam = family ?? randomUUID();
    await prisma.$executeRaw`
      INSERT INTO refresh_tokens (
        id, user_id, token_hash, family, expires_at, created_at, organization_id, scope, privileged_session
      ) VALUES (
        ${id}, ${userId}::uuid, ${`hash-${randomUUID()}`}, ${fam},
        NOW() + interval '1 hour', NOW(), NULL::uuid,
        'LEGACY_UNSCOPED'::"RefreshTokenScope", false
      )
    `;
    return { id, family: fam };
  }

  async function createRotatedFamilySession(userId: string) {
    const family = randomUUID();
    const predecessorId = randomUUID();
    const successorId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO refresh_tokens (
        id, user_id, token_hash, family, expires_at, created_at, organization_id, scope, privileged_session, revoked_at
      ) VALUES (
        ${predecessorId}, ${userId}::uuid, ${`hash-${randomUUID()}`}, ${family},
        NOW() + interval '1 hour', NOW(), NULL::uuid,
        'LEGACY_UNSCOPED'::"RefreshTokenScope", false, NOW()
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO refresh_tokens (
        id, user_id, token_hash, family, expires_at, created_at, organization_id, scope, privileged_session, replaced_by
      ) VALUES (
        ${successorId}, ${userId}::uuid, ${`hash-${randomUUID()}`}, ${family},
        NOW() + interval '1 hour', NOW(), NULL::uuid,
        'LEGACY_UNSCOPED'::"RefreshTokenScope", false, NULL
      )
    `;
    return { predecessorId, successorId, family };
  }

  it('E3-A01 single-session commit with lost ack recovers original SUCCESS', async () => {
    const actor = await createActor();
    const target = await createActor();
    const session = await createSession(target.id);
    const operationId = generateMasterAdminSecurityOperationId();
    const origTx = prisma.$transaction.bind(prisma);
    jest.spyOn(prisma, '$transaction').mockImplementationOnce(async (arg: unknown) => {
      const result = await origTx(arg as never);
      throw new Error('E3_A01_lost_ack');
    });
    const first = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
      securityOperationId: operationId,
    });
    jest.restoreAllMocks();
    expect(first.revoked).toBe(true);
    const retry = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
      securityOperationId: operationId,
    });
    expect(retry.revoked).toBe(true);
    const key = buildMasterAdminSessionRevocationAuditIdempotencyKey(operationId);
    expect(await prisma.masterAdminAuditOutbox.count({ where: { idempotencyKey: key } })).toBe(1);
    await delivery.attemptImmediateDelivery(
      (await prisma.masterAdminAuditOutbox.findUniqueOrThrow({ where: { idempotencyKey: key } })).id,
    );
    const logs = await prisma.activityLog.count({
      where: {
        metaJson: { path: ['securityOperationId'], equals: operationId },
      },
    });
    expect(logs).toBeGreaterThanOrEqual(1);
  });

  it('E3-A02 revoke-all commit with lost ack recovers original count', async () => {
    const actor = await createActor();
    const target = await createActor();
    await createSession(target.id);
    await createSession(target.id);
    const operationId = generateMasterAdminSecurityOperationId();
    const origTx = prisma.$transaction.bind(prisma);
    jest.spyOn(prisma, '$transaction').mockImplementationOnce(async (arg: unknown) => {
      await origTx(arg as never);
      throw new Error('E3_A02_lost_ack');
    });
    const first = await sessionAudit.revokeAllTargetSessionsWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      securityOperationId: operationId,
    });
    jest.restoreAllMocks();
    expect(first.revokedSessionCount).toBe(2);
    const retry = await sessionAudit.revokeAllTargetSessionsWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      securityOperationId: operationId,
    });
    expect(retry.revokedSessionCount).toBe(2);
  });

  it('E3-A03 replay preserves original single-session revoked=true', async () => {
    const actor = await createActor();
    const target = await createActor();
    const session = await createSession(target.id);
    const operationId = generateMasterAdminSecurityOperationId();
    const first = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
      securityOperationId: operationId,
    });
    expect(first.revoked).toBe(true);
    const replay = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
      securityOperationId: operationId,
    });
    expect(replay.revoked).toBe(true);
  });

  it('E3-A04 replay preserves original revoke-all count', async () => {
    const actor = await createActor();
    const target = await createActor();
    await createSession(target.id);
    await createSession(target.id);
    const operationId = generateMasterAdminSecurityOperationId();
    const first = await sessionAudit.revokeAllTargetSessionsWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      securityOperationId: operationId,
    });
    expect(first.revokedSessionCount).toBe(2);
    const replay = await sessionAudit.revokeAllTargetSessionsWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      securityOperationId: operationId,
    });
    expect(replay.revokedSessionCount).toBe(2);
  });

  it('E3-A05 distinct new operation on already revoked session returns NO_OP', async () => {
    const actor = await createActor();
    const target = await createActor();
    const session = await createSession(target.id);
    const firstOp = generateMasterAdminSecurityOperationId();
    await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
      securityOperationId: firstOp,
    });
    const secondOp = generateMasterAdminSecurityOperationId();
    const distinct = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
      securityOperationId: secondOp,
    });
    expect(distinct.revoked).toBe(false);
    expect(
      await prisma.masterAdminAuditOutbox.count({
        where: {
          subjectUserId: target.id,
          auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
        },
      }),
    ).toBe(2);
  });

  it('E3-A06 concurrent first applications admit exactly one authoritative revoke', async () => {
    const actor = await createActor();
    const target = await createActor();
    const session = await createSession(target.id);
    const operationId = generateMasterAdminSecurityOperationId();
    const outboxRepoB = new MasterAdminAuditOutboxRepository(prismaB as never);
    const processorB = new MasterAdminAuditOutboxProcessorService(prismaB as never, outboxRepoB);
    const deliveryB = new MasterAdminAuditDeliveryService(prismaB as never, outboxRepoB, processorB);
    const refreshB = new RefreshTokenService(
      prismaB as never,
      { get: (k: string) => (k === 'app.jwtSecret' ? 'e3-audit-secret' : '15m') } as never,
      { enforceSessionPolicy: jest.fn() } as never,
      { listGrantsForUser: jest.fn().mockResolvedValue([]) } as never,
    );
    const sessionAuditB = new SecurityGovernanceSessionAuditService(
      prismaB as never,
      deliveryB,
      refreshB,
    );
    await Promise.all([
      sessionAudit.revokeTargetSessionWithAtomicAudit({
        req: reqStub(actor.id),
        targetUserId: target.id,
        sessionId: session.id,
        securityOperationId: operationId,
      }),
      sessionAuditB.revokeTargetSessionWithAtomicAudit({
        req: reqStub(actor.id),
        targetUserId: target.id,
        sessionId: session.id,
        securityOperationId: operationId,
      }),
    ]);
    const key = buildMasterAdminSessionRevocationAuditIdempotencyKey(operationId);
    expect(await prisma.masterAdminAuditOutbox.count({ where: { idempotencyKey: key } })).toBe(1);
    const revokedRows = await prisma.refreshToken.count({
      where: { userId: target.id, family: session.family, revokedAt: { not: null } },
    });
    expect(revokedRows).toBeGreaterThanOrEqual(1);
  });

  it('E3-A07 replay does not revoke fresh session created after original revoke-all', async () => {
    const actor = await createActor();
    const target = await createActor();
    await createSession(target.id);
    await createSession(target.id);
    const operationId = generateMasterAdminSecurityOperationId();
    const first = await sessionAudit.revokeAllTargetSessionsWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      securityOperationId: operationId,
    });
    expect(first.revokedSessionCount).toBe(2);
    const fresh = await createSession(target.id);
    const replay = await sessionAudit.revokeAllTargetSessionsWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      securityOperationId: operationId,
    });
    expect(replay.revokedSessionCount).toBe(2);
    const freshRow = await prisma.refreshToken.findUnique({ where: { id: fresh.id } });
    expect(freshRow?.revokedAt).toBeNull();
  });

  it('E3 operation identity mismatch rejects cross-target replay', async () => {
    const actor = await createActor();
    const target = await createActor();
    const sessionA = await createSession(target.id);
    const sessionB = await createSession(target.id);
    const operationId = generateMasterAdminSecurityOperationId();
    await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: sessionA.id,
      securityOperationId: operationId,
    });
    const cross = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: sessionB.id,
      securityOperationId: operationId,
    });
    expect(cross.revoked).toBe(false);
    const rowB = await prisma.refreshToken.findUnique({ where: { id: sessionB.id } });
    expect(rowB?.revokedAt).toBeNull();
  });

  it('E3 fallback revokes rotated family via canonical family revocation', async () => {
    const actor = await createActor();
    const target = await createActor();
    const { predecessorId, successorId } = await createRotatedFamilySession(target.id);
    const intentSpy = jest
      .spyOn(delivery, 'persistAuthoritativeAuditIntent')
      .mockRejectedValueOnce(new Error('E3_fallback_fault'));
    const { revoked } = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: predecessorId,
    });
    intentSpy.mockRestore();
    expect(revoked).toBe(true);
    const succ = await prisma.refreshToken.findUnique({ where: { id: successorId } });
    expect(succ?.revokedAt).not.toBeNull();
    void actor;
  });
});
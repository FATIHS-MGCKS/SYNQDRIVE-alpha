/**
 * USR-P1A PostgreSQL certification — master admin session audit accountability.
 * USR_P1A_SESSION_AUDIT_PG=1 DATABASE_URL=postgresql://127.0.0.1:5432/<disposable> npx jest usr-p1a-session-audit-certification
 */
import { randomUUID } from 'node:crypto';
import {
  BusinessType,
  MasterAdminAuditScope,
  MasterAdminAuditOutboxStatus,
  PrismaClient,
  UserPlatformRole,
} from '@prisma/client';
import { MasterAdminAuditAction } from './master-admin-audit.contract';
import { MasterAdminAuditDeliveryService } from './master-admin-audit-delivery.service';
import { MasterAdminAuditOutboxRepository } from './master-admin-audit-outbox.repository';
import { MasterAdminAuditOutboxProcessorService } from './master-admin-audit-outbox.processor';
import { MasterAdminAuditOutboxSchedulerService } from './master-admin-audit-outbox.scheduler.service';
import {
  buildMasterAdminSessionRevocationAuditIdempotencyKey,
  generateMasterAdminSecurityOperationId,
} from './master-admin-audit-delivery.contract';
import { assertMasterAdminAuditDisposablePostgresPreflight } from './testing/master-admin-audit-disposable-postgres-preflight';
import { MASTER_ADMIN_AUDIT_OUTBOX_EVENT_TYPE } from './master-admin-audit-delivery.contract';
import { MASTER_ADMIN_AUDIT_DOMAIN } from './master-admin-audit.contract';
import { IamAuditOutboxProcessorService } from '@modules/users/iam-audit-outbox.processor';
import { IamAuditOutboxRepository } from '@modules/users/iam-audit-outbox.repository';
import { UserAccessAuditService } from '@modules/users/user-access-audit.service';
import { IamAuditOutboxMetricsService } from '@modules/users/iam-audit-outbox.metrics';
import { SecurityGovernanceSessionAuditService } from '@modules/platform-admin/security-governance-session-audit.service';
import { RefreshTokenService } from '@modules/auth/refresh-token.service';
import { ActivityLogService } from './activity-log.service';
import { ActivityLogExportService } from './activity-log-export.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import * as persistenceUtil from './master-admin-audit-persistence.util';

const OPT_IN = 'USR_P1A_SESSION_AUDIT_PG';

function pgEnvelope(input: {
  correlationId: string;
  actorUserId: string;
  targetUserId: string;
  sessionId?: string;
  organizationId?: string | null;
  auditAction?: (typeof MasterAdminAuditAction)[keyof typeof MasterAdminAuditAction];
  operation?: 'REVOKE_ONE' | 'REVOKE_ALL';
}) {
  const auditAction = input.auditAction ?? MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED;
  return {
    auditAction,
    actorUserId: input.actorUserId,
    actorPlatformRole: 'MASTER_ADMIN',
    correlationId: input.correlationId,
    description: 'pg certification',
    entityId: input.sessionId ?? input.targetUserId,
    targetOrganizationId: input.organizationId ?? null,
    metadata: {
      domain: 'master_user_session',
      operation: input.operation ?? 'REVOKE_ONE',
      outcome: 'SUCCESS',
      targetUserId: input.targetUserId,
      sessionId: input.sessionId,
    },
  };
}

const run = process.env[OPT_IN] === '1';

(run ? describe : describe.skip)('USR-P1A session audit certification (PostgreSQL)', () => {
  jest.setTimeout(180_000);
  let prisma: PrismaClient;
  let delivery: MasterAdminAuditDeliveryService;
  let processor: MasterAdminAuditOutboxProcessorService;
  let scheduler: MasterAdminAuditOutboxSchedulerService;
  let sessionAudit: SecurityGovernanceSessionAuditService;
  let refreshTokens: RefreshTokenService;
  let activityLogService: ActivityLogService;
  let activityLogExport: ActivityLogExportService;
  let iamProcessor: IamAuditOutboxProcessorService;

  const reqStub = (actorId: string) => ({
    method: 'POST',
    originalUrl: '/api/v1/admin/security/users/x/sessions/y/revoke',
    user: { id: actorId, platformRole: 'MASTER_ADMIN', platformPermissions: [] as string[] },
    headers: { 'user-agent': 'pg-cert' },
    requestId: randomUUID(),
  });

  beforeAll(() => {
    assertMasterAdminAuditDisposablePostgresPreflight();
    prisma = new PrismaClient();
    const outboxRepo = new MasterAdminAuditOutboxRepository(prisma as never);
    processor = new MasterAdminAuditOutboxProcessorService(prisma as never, outboxRepo);
    delivery = new MasterAdminAuditDeliveryService(prisma as never, outboxRepo, processor);
    scheduler = new MasterAdminAuditOutboxSchedulerService(processor, {
      shouldRun: () => true,
    } as never);
    refreshTokens = new RefreshTokenService(
      prisma as never,
      { get: (k: string) => (k === 'app.jwtSecret' ? 'pg-test-secret' : '15m') } as never,
      { enforceSessionPolicy: jest.fn() } as never,
      { listGrantsForUser: jest.fn().mockResolvedValue([]) } as never,
    );
    sessionAudit = new SecurityGovernanceSessionAuditService(
      prisma as never,
      delivery,
      refreshTokens,
    );
    activityLogService = new ActivityLogService(prisma as never);
    activityLogExport = new ActivityLogExportService(prisma as never);
    const iamOutbox = new IamAuditOutboxRepository(prisma as never);
    iamProcessor = new IamAuditOutboxProcessorService(
      prisma as never,
      iamOutbox,
      new UserAccessAuditService({ record: jest.fn() } as never),
      new IamAuditOutboxMetricsService(),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function createActor() {
    const id = randomUUID();
    const email = `usr-p1a-${id}@example.test`;
    await prisma.$executeRaw`
      INSERT INTO users (
        id, email, platform_role, status, created_at, updated_at, session_version, security_version
      ) VALUES (
        ${id}::uuid,
        ${email},
        ${UserPlatformRole.MASTER_ADMIN}::"UserPlatformRole",
        'ACTIVE'::"UserStatus",
        NOW(),
        NOW(),
        0,
        0
      )
    `;
    return { id, email };
  }

  async function createOrg() {
    const id = randomUUID();
    const companyName = `usr-p1a-${id}`;
    await prisma.$executeRaw`
      INSERT INTO organizations (id, company_name, business_type, created_at, updated_at)
      VALUES (
        ${id}::uuid,
        ${companyName},
        ${BusinessType.FLEET}::"BusinessType",
        NOW(),
        NOW()
      )
    `;
    return { id, companyName };
  }

  async function createSession(userId: string, organizationId: string | null) {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO refresh_tokens (
        id, user_id, token_hash, family, expires_at, created_at, organization_id, scope, privileged_session
      ) VALUES (
        ${id},
        ${userId}::uuid,
        ${`hash-${randomUUID()}`},
        ${randomUUID()},
        NOW() + interval '1 hour',
        NOW(),
        ${organizationId}::uuid,
        'LEGACY_UNSCOPED'::"RefreshTokenScope",
        false
      )
    `;
    return { id, userId, organizationId };
  }

  const results: Record<string, 'PASS' | 'FAIL' | 'SKIP'> = {};

  const record = (id: string, status: 'PASS' | 'FAIL') => {
    results[id] = status;
  };

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log('USR_P1A_PG_RESULTS', JSON.stringify(results));
  });

  it('PG01 successful direct semantic audit', async () => {
    const actor = await createActor();
    const correlationId = randomUUID();
    const idempotencyKey = `pg01:${correlationId}`;
    const outcome = await delivery.commitAuditIntent(
      pgEnvelope({
        correlationId,
        actorUserId: actor.id,
        targetUserId: randomUUID(),
        sessionId: randomUUID(),
      }),
      { idempotencyKey, organizationContextId: null },
    );
    expect(['DELIVERED', 'INTENT_PERSISTED']).toContain(outcome);
    const logs = await prisma.activityLog.count({
      where: { metaJson: { path: ['correlationId'], equals: correlationId } },
    });
    expect(logs).toBe(1);
    record('PG01', 'PASS');
  });

  it('PG02 session revocation with durable audit intent', async () => {
    const actor = await createActor();
    const target = await createActor();
    const org = await createOrg();
    const session = await createSession(target.id, org.id);
    const before = await prisma.refreshToken.findUnique({ where: { id: session.id } });
    expect(before?.revokedAt).toBeNull();
    const { revoked } = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
    });
    expect(revoked).toBe(true);
    const after = await prisma.refreshToken.findUnique({ where: { id: session.id } });
    expect(after?.revokedAt).not.toBeNull();
    const outbox = await prisma.masterAdminAuditOutbox.findFirst({
      where: { subjectUserId: target.id, auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbox?.status).toBe(MasterAdminAuditOutboxStatus.PROCESSED);
    const logs = await prisma.activityLog.count({
      where: {
        metaJson: { path: ['auditDeliveryIdempotencyKey'], equals: outbox?.idempotencyKey },
      },
    });
    expect(logs).toBe(1);
    record('PG02', 'PASS');
  });

  it('PG04 global session without organization has platform-scoped recoverable intent', async () => {
    const actor = await createActor();
    const target = await createActor();
    const session = await createSession(target.id, null);
    const { revoked } = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
    });
    expect(revoked).toBe(true);
    const outbox = await prisma.masterAdminAuditOutbox.findFirst({
      where: { subjectUserId: target.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbox?.auditScope).toBe(MasterAdminAuditScope.PLATFORM);
    expect(outbox?.organizationContextId).toBeNull();
    record('PG04', 'PASS');
  });

  it('PG05 revoke-all uses platform scope', async () => {
    const actor = await createActor();
    const target = await createActor();
    await createSession(target.id, (await createOrg()).id);
    await createSession(target.id, null);
    const { revokedSessionCount } = await sessionAudit.revokeAllTargetSessionsWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
    });
    expect(revokedSessionCount).toBeGreaterThanOrEqual(1);
    const outbox = await prisma.masterAdminAuditOutbox.findFirst({
      where: { auditAction: MasterAdminAuditAction.MASTER_USER_SESSIONS_REVOKED_ALL },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbox?.auditScope).toBe(MasterAdminAuditScope.PLATFORM);
    record('PG05', 'PASS');
  });

  it('PG06 worker delivery and automatic scheduler retry', async () => {
    const actor = await createActor();
    const correlationId = randomUUID();
    const idempotencyKey = `pg06:${correlationId}`;
    const row = await prisma.masterAdminAuditOutbox.create({
      data: {
        idempotencyKey,
        auditScope: MasterAdminAuditScope.PLATFORM,
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
        occurredAt: new Date('2026-01-15T12:00:00.000Z'),
        payloadVersion: 1,
        actorUserId: actor.id,
        payload: {
          masterAdminAuditEnvelope: pgEnvelope({
            correlationId,
            actorUserId: actor.id,
            targetUserId: randomUUID(),
            sessionId: randomUUID(),
          }),
        },
        status: MasterAdminAuditOutboxStatus.PENDING,
        nextRetryAt: new Date(),
      },
    });
    const persistSpy = jest
      .spyOn(persistenceUtil, 'persistMasterAdminAuditActivityLog')
      .mockRejectedValueOnce(new Error('PG06 transient_fault'));
    expect(await processor.processOutboxId(row.id)).toBe('retry');
    persistSpy.mockRestore();
    const pending = await prisma.masterAdminAuditOutbox.findUnique({ where: { id: row.id } });
    expect(pending?.status).toBe(MasterAdminAuditOutboxStatus.PENDING);
    await prisma.masterAdminAuditOutbox.update({
      where: { id: row.id },
      data: { nextRetryAt: new Date() },
    });
    await scheduler.pollPendingOutbox();
    const log = await prisma.activityLog.findFirst({
      where: { metaJson: { path: ['correlationId'], equals: correlationId } },
    });
    expect(log?.createdAt.toISOString()).toMatch(/^2026-01-15T12:00:00/);
    record('PG06', 'PASS');
  });

  it('PG08 concurrent delivery of undelivered outbox yields one semantic audit', async () => {
    const actor = await createActor();
    const correlationId = randomUUID();
    const idempotencyKey = `pg08:${correlationId}`;
    const envelope = pgEnvelope({
      correlationId,
      actorUserId: actor.id,
      targetUserId: randomUUID(),
      sessionId: randomUUID(),
    });
    const row = await prisma.masterAdminAuditOutbox.create({
      data: {
        idempotencyKey,
        auditScope: MasterAdminAuditScope.PLATFORM,
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
        occurredAt: new Date(),
        actorUserId: actor.id,
        payloadVersion: 1,
        payload: { masterAdminAuditEnvelope: envelope },
        status: MasterAdminAuditOutboxStatus.PENDING,
        nextRetryAt: new Date(),
      },
    });
    const [raceA, raceB] = await Promise.all([
      processor.processOutboxId(row.id),
      processor.processOutboxId(row.id),
    ]);
    expect([raceA, raceB].filter((o) => o === 'processed')).toHaveLength(1);
    expect([raceA, raceB]).not.toEqual(['processed', 'processed']);
    const logs = await prisma.activityLog.count({
      where: { metaJson: { path: ['auditDeliveryIdempotencyKey'], equals: idempotencyKey } },
    });
    expect(logs).toBe(1);
    record('PG08', 'PASS');
  });

  it('PG11 rejects sensitive payload', async () => {
    const actor = await createActor();
    const correlationId = randomUUID();
    const outcome = await delivery.commitAuditIntent(
      {
        ...pgEnvelope({
          correlationId,
          actorUserId: actor.id,
          targetUserId: randomUUID(),
          sessionId: randomUUID(),
        }),
        description: 'password=secret-token',
      },
      { idempotencyKey: `pg11:${correlationId}`, organizationContextId: null },
    );
    expect(outcome).toBe('FAILED');
    record('PG11', 'PASS');
  });

  it('PG12 tenant isolation and authorized master admin visibility', async () => {
    const actor = await createActor();
    const org = await createOrg();
    const target = await createActor();
    const session = await createSession(target.id, org.id);
    const legacyLogId = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO activity_logs (
        id, organization_id, user_id, action, entity, description, created_at
      ) VALUES (
        ${legacyLogId}::uuid,
        ${org.id}::uuid,
        ${actor.id}::uuid,
        ${ActivityAction.UPDATE}::"ActivityAction",
        ${ActivityEntity.USER}::"ActivityEntity",
        ${'legacy tenant activity without auditDomain'},
        NOW()
      )
    `;
    await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
    });
    const orgVisible = await activityLogService.findByOrganization(org.id, { page: 1, limit: 50 });
    const leaked = orgVisible.data.filter(
      (row: { auditDomain?: string | null }) => row.auditDomain === MASTER_ADMIN_AUDIT_DOMAIN,
    );
    expect(leaked).toHaveLength(0);
    const legacyTenantCount = await prisma.activityLog.count({
      where: { id: legacyLogId },
    });
    expect(legacyTenantCount).toBe(1);
    expect(
      orgVisible.data.some((row: { id: string }) => row.id === legacyLogId),
    ).toBe(true);
    const adminOrgScope = await activityLogService.findAll({
      organizationId: org.id,
      auditDomain: MASTER_ADMIN_AUDIT_DOMAIN,
      page: 1,
      limit: 50,
    });
    expect(adminOrgScope.meta.total).toBeGreaterThanOrEqual(1);
    const tenantExport = await activityLogExport.export({ organizationId: org.id });
    expect(
      tenantExport.rows.some(
        (row) => (row.meta as Record<string, unknown>).auditDomain === MASTER_ADMIN_AUDIT_DOMAIN,
      ),
    ).toBe(false);
    const adminExport = await activityLogExport.export({
      organizationId: org.id,
      auditDomain: MASTER_ADMIN_AUDIT_DOMAIN,
    });
    expect(adminExport.rowCount).toBeGreaterThanOrEqual(1);
    record('PG12', 'PASS');
  });

  it('PG03 delivery failure after durable intent leaves recoverable pending outbox', async () => {
    const actor = await createActor();
    const target = await createActor();
    const session = await createSession(target.id, null);
    jest
      .spyOn(delivery, 'attemptImmediateDelivery')
      .mockRejectedValueOnce(new Error('PG03 delivery_fault'));
    const { revoked } = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: { ...reqStub(actor.id), requestId: `pg03-${randomUUID()}` },
      targetUserId: target.id,
      sessionId: session.id,
    });
    expect(revoked).toBe(true);
    const outbox = await prisma.masterAdminAuditOutbox.findFirst({
      where: { subjectUserId: target.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbox?.status).toBe(MasterAdminAuditOutboxStatus.PENDING);
    jest.spyOn(delivery, 'attemptImmediateDelivery').mockRestore();
    expect(await processor.processOutboxId(outbox!.id)).toBe('processed');
    const logs = await prisma.activityLog.count({
      where: {
        metaJson: { path: ['auditDeliveryIdempotencyKey'], equals: outbox?.idempotencyKey },
      },
    });
    expect(logs).toBe(1);
    record('PG03', 'PASS');
  });

  it('PG07 replay after partial state still yields exactly one audit', async () => {
    const actor = await createActor();
    const correlationId = randomUUID();
    const idempotencyKey = `pg07:${correlationId}`;
    const envelope = pgEnvelope({
      correlationId,
      actorUserId: actor.id,
      targetUserId: randomUUID(),
      sessionId: randomUUID(),
    });
    const row = await prisma.masterAdminAuditOutbox.create({
      data: {
        idempotencyKey,
        auditScope: MasterAdminAuditScope.PLATFORM,
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
        occurredAt: new Date('2026-02-01T10:00:00.000Z'),
        actorUserId: actor.id,
        payloadVersion: 1,
        payload: { masterAdminAuditEnvelope: envelope },
        status: MasterAdminAuditOutboxStatus.PROCESSING,
        nextRetryAt: new Date(),
        attempts: 1,
      },
    });
    await processor.deliverAtomic(envelope, idempotencyKey, new Date('2026-02-01T10:00:00.000Z'), row.id);
    await prisma.masterAdminAuditOutbox.update({
      where: { id: row.id },
      data: { status: MasterAdminAuditOutboxStatus.PENDING },
    });
    expect(await processor.processOutboxId(row.id)).toBe('processed');
    const logs = await prisma.activityLog.count({
      where: { metaJson: { path: ['auditDeliveryIdempotencyKey'], equals: idempotencyKey } },
    });
    expect(logs).toBe(1);
    record('PG07', 'PASS');
  });

  it('PG09 wrong-user session revoke does not mutate session', async () => {
    const owner = await createActor();
    const other = await createActor();
    const session = await createSession(owner.id, null);
    const ok = await refreshTokens.revokeSessionById(other.id, session.id);
    expect(ok).toBe(false);
    const stillActive = await prisma.refreshToken.findUnique({ where: { id: session.id } });
    expect(stillActive?.revokedAt).toBeNull();
    record('PG09', 'PASS');
  });

  it('PG10 audit-intent persistence failure with revocation fallback', async () => {
    const actor = await createActor();
    const target = await createActor();
    const session = await createSession(target.id, null);
    const intentSpy = jest
      .spyOn(delivery, 'persistAuthoritativeAuditIntent')
      .mockRejectedValueOnce(new Error('PG10_intent_storage_fault'));
    const { revoked } = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
    });
    intentSpy.mockRestore();
    expect(revoked).toBe(true);
    const token = await prisma.refreshToken.findUnique({ where: { id: session.id } });
    expect(token?.revokedAt).not.toBeNull();
    const degraded = await prisma.activityLog.count({
      where: {
        metaJson: {
          path: ['auditAction'],
          equals: MasterAdminAuditAction.MASTER_PRIVILEGED_AUDIT_DELIVERY_FAILED,
        },
      },
    });
    const pendingOutbox = await prisma.masterAdminAuditOutbox.count({
      where: { subjectUserId: target.id, status: MasterAdminAuditOutboxStatus.PENDING },
    });
    const durableOutbox = await prisma.masterAdminAuditOutbox.count({
      where: { subjectUserId: target.id },
    });
    expect(degraded + pendingOutbox + durableOutbox).toBeGreaterThanOrEqual(1);
    record('PG10', 'PASS');
  });

  it('PG13 deferred delivery after organization and actor deletion', async () => {
    const actor = await createActor();
    const org = await createOrg();
    const target = await createActor();
    const session = await createSession(target.id, org.id);
    const correlationId = randomUUID();
    const idempotencyKey = `pg13:${correlationId}`;
    const row = await prisma.masterAdminAuditOutbox.create({
      data: {
        idempotencyKey,
        auditScope: MasterAdminAuditScope.ORGANIZATION_CONTEXT,
        organizationContextId: org.id,
        actorUserId: actor.id,
        subjectUserId: target.id,
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
        occurredAt: new Date('2026-03-01T09:00:00.000Z'),
        payloadVersion: 1,
        payload: {
          masterAdminAuditEnvelope: pgEnvelope({
            correlationId,
            actorUserId: actor.id,
            targetUserId: target.id,
            sessionId: session.id,
            organizationId: org.id,
          }),
        },
        status: MasterAdminAuditOutboxStatus.PENDING,
        nextRetryAt: new Date(),
      },
    });
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.$executeRaw`DELETE FROM users WHERE id = ${actor.id}`;
    expect(await processor.processOutboxId(row.id)).toBe('processed');
    const log = await prisma.activityLog.findFirst({
      where: { metaJson: { path: ['correlationId'], equals: correlationId } },
    });
    expect(log).toBeTruthy();
    expect(log?.organizationId).toBeNull();
    expect(log?.userId).toBeNull();
    expect(
      (log?.metaJson as { targetOrganizationId?: string })?.targetOrganizationId,
    ).toBe(org.id);
    record('PG13', 'PASS');
  });

  it('PGA distinct revoke-all operations produce separate semantic audits', async () => {
    const actor1 = await createActor();
    const actor2 = await createActor();
    const target = await createActor();
    await createSession(target.id, null);
    await createSession(target.id, null);
    const first = await sessionAudit.revokeAllTargetSessionsWithAtomicAudit({
      req: reqStub(actor1.id),
      targetUserId: target.id,
    });
    expect(first.revokedSessionCount).toBe(2);
    await createSession(target.id, null);
    const second = await sessionAudit.revokeAllTargetSessionsWithAtomicAudit({
      req: reqStub(actor2.id),
      targetUserId: target.id,
    });
    expect(second.revokedSessionCount).toBe(1);
    const outboxes = await prisma.masterAdminAuditOutbox.findMany({
      where: {
        subjectUserId: target.id,
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSIONS_REVOKED_ALL,
      },
      orderBy: { occurredAt: 'asc' },
    });
    expect(outboxes).toHaveLength(2);
    expect(outboxes[0]!.idempotencyKey).not.toBe(outboxes[1]!.idempotencyKey);
    const count0 = (
      outboxes[0]!.payload as { masterAdminAuditEnvelope?: { metadata?: Record<string, unknown> } }
    ).masterAdminAuditEnvelope?.metadata?.revokedSessionCount;
    const count1 = (
      outboxes[1]!.payload as { masterAdminAuditEnvelope?: { metadata?: Record<string, unknown> } }
    ).masterAdminAuditEnvelope?.metadata?.revokedSessionCount;
    expect(count0).toBe(2);
    expect(count1).toBe(1);
    for (const key of outboxes.map((o) => o.idempotencyKey)) {
      const logs = await prisma.activityLog.count({
        where: { metaJson: { path: ['auditDeliveryIdempotencyKey'], equals: key } },
      });
      expect(logs).toBe(1);
    }
    record('PGA', 'PASS');
  });

  it('PGB repeated delivery of one operation yields one semantic audit row', async () => {
    const actor = await createActor();
    const target = await createActor();
    const session = await createSession(target.id, null);
    await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
    });
    const outbox = await prisma.masterAdminAuditOutbox.findFirst({
      where: { subjectUserId: target.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbox).toBeTruthy();
    if (outbox!.status === MasterAdminAuditOutboxStatus.PROCESSED) {
      expect(await processor.processOutboxId(outbox!.id)).toBe('duplicate');
    } else {
      const first = await processor.processOutboxId(outbox!.id);
      const second = await processor.processOutboxId(outbox!.id);
      expect(first).toBe('processed');
      expect(second).toBe('duplicate');
    }
    const logs = await prisma.activityLog.count({
      where: {
        metaJson: { path: ['auditDeliveryIdempotencyKey'], equals: outbox!.idempotencyKey },
      },
    });
    expect(logs).toBe(1);
    record('PGB', 'PASS');
  });

  it('PGC concurrent enqueue for same operation identity is conflict-safe', async () => {
    const actor = await createActor();
    const operationId = generateMasterAdminSecurityOperationId();
    const idempotencyKey = buildMasterAdminSessionRevocationAuditIdempotencyKey(operationId);
    const envelope = pgEnvelope({
      correlationId: randomUUID(),
      actorUserId: actor.id,
      targetUserId: randomUUID(),
      sessionId: randomUUID(),
    });
    const outboxRepo = new MasterAdminAuditOutboxRepository(prisma as never);
    await prisma.$transaction(async (tx) => {
      const [rowA, rowB] = await Promise.all([
        outboxRepo.enqueueInTransaction(tx, {
          idempotencyKey,
          envelope,
          occurredAt: new Date(),
          auditScope: MasterAdminAuditScope.PLATFORM,
        }),
        outboxRepo.enqueueInTransaction(tx, {
          idempotencyKey,
          envelope,
          occurredAt: new Date(),
          auditScope: MasterAdminAuditScope.PLATFORM,
        }),
      ]);
      expect(rowA.id).toBe(rowB.id);
    });
    const rows = await prisma.masterAdminAuditOutbox.count({ where: { idempotencyKey } });
    expect(rows).toBe(1);
    record('PGC', 'PASS');
  });

  it('PGD ambiguous txn failure reconciles from current operation outbox only', async () => {
    const actor = await createActor();
    const target = await createActor();
    const session = await createSession(target.id, null);
    const txnSpy = jest
      .spyOn(prisma, '$transaction')
      .mockRejectedValueOnce(new Error('PGD_ambiguous_commit'));
    const { revoked } = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
    });
    txnSpy.mockRestore();
    expect(revoked).toBe(true);
    const outbox = await prisma.masterAdminAuditOutbox.findFirst({
      where: { subjectUserId: target.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbox?.idempotencyKey).toMatch(/^ma-session-audit:op:/);
    const meta = (
      outbox!.payload as { masterAdminAuditEnvelope?: { metadata?: Record<string, unknown> } }
    ).masterAdminAuditEnvelope?.metadata;
    expect(meta?.securityOperationId).toBeTruthy();
    expect(meta?.outcome).toBe('SUCCESS');
    expect(outbox?.idempotencyKey).toBe(
      buildMasterAdminSessionRevocationAuditIdempotencyKey(String(meta?.securityOperationId)),
    );
    record('PGD', 'PASS');
  });

  it('PGE no-op on already revoked session without fabricated success', async () => {
    const actor = await createActor();
    const target = await createActor();
    const session = await createSession(target.id, null);
    const first = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
    });
    expect(first.revoked).toBe(true);
    const second = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
    });
    expect(second.revoked).toBe(false);
    const noopOutbox = await prisma.masterAdminAuditOutbox.findFirst({
      where: {
        subjectUserId: target.id,
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
      },
      orderBy: { createdAt: 'desc' },
    });
    const noopMeta = (
      noopOutbox?.payload as { masterAdminAuditEnvelope?: { metadata?: Record<string, unknown> } }
    ).masterAdminAuditEnvelope?.metadata;
    expect(noopMeta?.outcome).toBe('NO_OP');
    record('PGE', 'PASS');
  });

  it('PGF revoke-all count excludes historically revoked sessions', async () => {
    const actor = await createActor();
    const target = await createActor();
    const historical = await createSession(target.id, null);
    await prisma.refreshToken.update({
      where: { id: historical.id },
      data: { revokedAt: new Date('2020-01-01T00:00:00.000Z') },
    });
    await createSession(target.id, null);
    await createSession(target.id, null);
    const { revokedSessionCount } = await sessionAudit.revokeAllTargetSessionsWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
    });
    expect(revokedSessionCount).toBe(2);
    const outbox = await prisma.masterAdminAuditOutbox.findFirst({
      where: {
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSIONS_REVOKED_ALL,
        subjectUserId: target.id,
      },
      orderBy: { createdAt: 'desc' },
    });
    const meta = (
      outbox?.payload as { masterAdminAuditEnvelope?: { metadata?: Record<string, unknown> } }
    ).masterAdminAuditEnvelope?.metadata;
    expect(meta?.revokedSessionCount).toBe(2);
    record('PGF', 'PASS');
  });

  it('P1A_A outbox read failure during fallback still revokes session', async () => {
    const actor = await createActor();
    const target = await createActor();
    const session = await createSession(target.id, null);
    const intentSpy = jest
      .spyOn(delivery, 'persistAuthoritativeAuditIntent')
      .mockRejectedValueOnce(new Error('P1A_A_intent_fault'));
    let outboxReadAttempts = 0;
    const findSpy = jest.spyOn(prisma.masterAdminAuditOutbox, 'findUnique');
    (findSpy as jest.Mock).mockImplementationOnce(() => {
      outboxReadAttempts += 1;
      return Promise.reject(new Error('P1A_A_outbox_read_fault'));
    });
    const { revoked } = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
    });
    intentSpy.mockRestore();
    findSpy.mockRestore();
    expect(outboxReadAttempts).toBeGreaterThanOrEqual(1);
    expect(revoked).toBe(true);
    const token = await prisma.refreshToken.findUnique({ where: { id: session.id } });
    expect(token?.revokedAt).not.toBeNull();
    record('P1A_A', 'PASS');
  });

  it('P1A_B single-session committed revocation not duplicated after lost acknowledgement', async () => {
    const actor = await createActor();
    const target = await createActor();
    const session = await createSession(target.id, null);
    const sibling = await createSession(target.id, null);
    const operationId = generateMasterAdminSecurityOperationId();
    const idempotencyKey = buildMasterAdminSessionRevocationAuditIdempotencyKey(operationId);
    const lostAck = jest
      .spyOn(delivery, 'attemptImmediateDelivery')
      .mockRejectedValueOnce(new Error('P1A_B_lost_client_ack'));

    const first = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
      securityOperationId: operationId,
    });
    lostAck.mockRestore();
    expect(first.revoked).toBe(true);

    const revokedRow = await prisma.refreshToken.findUnique({ where: { id: session.id } });
    expect(revokedRow?.revokedAt).not.toBeNull();
    expect(
      await prisma.masterAdminAuditOutbox.count({ where: { idempotencyKey } }),
    ).toBe(1);

    const retry = await sessionAudit.revokeTargetSessionWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      sessionId: session.id,
      securityOperationId: operationId,
    });
    expect(retry.revoked).toBe(false);
    expect(
      await prisma.masterAdminAuditOutbox.count({ where: { idempotencyKey } }),
    ).toBe(1);
    const siblingAfter = await prisma.refreshToken.findUnique({ where: { id: sibling.id } });
    expect(siblingAfter?.revokedAt).toBeNull();
    record('P1A_B', 'PASS');
  });

  it('P1A_B revoke-all committed not duplicated after lost acknowledgement', async () => {
    const actor = await createActor();
    const target = await createActor();
    await createSession(target.id, null);
    await createSession(target.id, null);
    const operationId = generateMasterAdminSecurityOperationId();
    const idempotencyKey = buildMasterAdminSessionRevocationAuditIdempotencyKey(operationId);
    const lostAck = jest
      .spyOn(delivery, 'attemptImmediateDelivery')
      .mockRejectedValueOnce(new Error('P1A_B_lost_ack_revoke_all'));

    const first = await sessionAudit.revokeAllTargetSessionsWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      securityOperationId: operationId,
    });
    lostAck.mockRestore();
    expect(first.revokedSessionCount).toBeGreaterThanOrEqual(2);

    const fresh = await createSession(target.id, null);
    const retry = await sessionAudit.revokeAllTargetSessionsWithAtomicAudit({
      req: reqStub(actor.id),
      targetUserId: target.id,
      securityOperationId: operationId,
    });
    expect(retry.revokedSessionCount).toBe(first.revokedSessionCount);
    expect(
      await prisma.masterAdminAuditOutbox.count({ where: { idempotencyKey } }),
    ).toBe(1);
    const freshRow = await prisma.refreshToken.findUnique({ where: { id: fresh.id } });
    expect(freshRow?.revokedAt).toBeNull();
  });

  it('P1A_C independent transactions contend on outbox identity', async () => {
    const prismaB = new PrismaClient();
    const outboxRepoA = new MasterAdminAuditOutboxRepository(prisma as never);
    const outboxRepoB = new MasterAdminAuditOutboxRepository(prismaB as never);
    const actor = await createActor();
    const operationId = generateMasterAdminSecurityOperationId();
    const idempotencyKey = buildMasterAdminSessionRevocationAuditIdempotencyKey(operationId);
    const envelope = pgEnvelope({
      correlationId: randomUUID(),
      actorUserId: actor.id,
      targetUserId: randomUUID(),
      sessionId: randomUUID(),
    });
    const [rowA, rowB] = await Promise.all([
      prisma.$transaction((tx) =>
        outboxRepoA.enqueueInTransaction(tx, {
          idempotencyKey,
          envelope,
          occurredAt: new Date(),
          auditScope: MasterAdminAuditScope.PLATFORM,
        }),
      ),
      prismaB.$transaction((tx) =>
        outboxRepoB.enqueueInTransaction(tx, {
          idempotencyKey,
          envelope,
          occurredAt: new Date(),
          auditScope: MasterAdminAuditScope.PLATFORM,
        }),
      ),
    ]);
    expect(rowA.id).toBe(rowB.id);
    const rows = await prisma.masterAdminAuditOutbox.count({ where: { idempotencyKey } });
    expect(rows).toBe(1);
    await prismaB.$disconnect();
    record('P1A_C', 'PASS');
  });
});
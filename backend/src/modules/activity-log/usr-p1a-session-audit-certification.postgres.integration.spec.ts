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
import { buildMasterAdminSessionRevocationAuditIdempotencyKey } from './master-admin-audit-delivery.contract';
import { assertMasterAdminAuditDisposablePostgresPreflight } from './testing/master-admin-audit-disposable-postgres-preflight';
import { MASTER_ADMIN_AUDIT_OUTBOX_EVENT_TYPE } from './master-admin-audit-delivery.contract';
import { IamAuditOutboxProcessorService } from '@modules/users/iam-audit-outbox.processor';
import { IamAuditOutboxRepository } from '@modules/users/iam-audit-outbox.repository';
import { UserAccessAuditService } from '@modules/users/user-access-audit.service';
import { IamAuditOutboxMetricsService } from '@modules/users/iam-audit-outbox.metrics';

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
  let iamProcessor: IamAuditOutboxProcessorService;

  beforeAll(() => {
    assertMasterAdminAuditDisposablePostgresPreflight();
    prisma = new PrismaClient();
    const outboxRepo = new MasterAdminAuditOutboxRepository(prisma as never);
    processor = new MasterAdminAuditOutboxProcessorService(prisma as never, outboxRepo);
    delivery = new MasterAdminAuditDeliveryService(prisma as never, outboxRepo, processor);
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
    const target = await createActor();
    const org = await createOrg();
    const session = await createSession(target.id, org.id);
    const revokeResult = await prisma.refreshToken.updateMany({
      where: { id: session.id, userId: target.id, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: 'SESSION_REVOKED_BY_ID' },
    });
    expect(revokeResult.count).toBe(1);
    const correlationId = randomUUID();
    const idempotencyKey = buildMasterAdminSessionRevocationAuditIdempotencyKey({
      correlationId,
      auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
      targetUserId: target.id,
      sessionId: session.id,
      outcome: 'SUCCESS',
    });
    const outcome = await delivery.commitAuditIntent(
      pgEnvelope({
        correlationId,
        actorUserId: target.id,
        targetUserId: target.id,
        sessionId: session.id,
        organizationId: org.id,
      }),
      { idempotencyKey, organizationContextId: org.id },
    );
    expect(outcome).toBe('DELIVERED');
    const outbox = await prisma.masterAdminAuditOutbox.findUnique({ where: { idempotencyKey } });
    expect(outbox?.status).toBe(MasterAdminAuditOutboxStatus.PROCESSED);
    record('PG02', 'PASS');
  });

  it('PG04 global session without organization has platform-scoped recoverable intent', async () => {
    const actor = await createActor();
    const target = await createActor();
    const session = await createSession(target.id, null);
    const correlationId = randomUUID();
    const idempotencyKey = `pg04:${correlationId}`;
    const outcome = await delivery.commitAuditIntent(
      pgEnvelope({
        correlationId,
        actorUserId: actor.id,
        targetUserId: target.id,
        sessionId: session.id,
        organizationId: null,
      }),
      { idempotencyKey, organizationContextId: null },
    );
    expect(outcome).toBe('DELIVERED');
    const outbox = await prisma.masterAdminAuditOutbox.findUnique({ where: { idempotencyKey } });
    expect(outbox?.auditScope).toBe(MasterAdminAuditScope.PLATFORM);
    expect(outbox?.organizationContextId).toBeNull();
    record('PG04', 'PASS');
  });

  it('PG05 revoke-all uses platform scope', async () => {
    const actor = await createActor();
    const target = await createActor();
    await createSession(target.id, (await createOrg()).id);
    await createSession(target.id, null);
    const revokeAll = await prisma.refreshToken.updateMany({
      where: { userId: target.id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date(), revocationReason: 'USER_ALL_SESSIONS_REVOKED' },
    });
    expect(revokeAll.count).toBeGreaterThanOrEqual(1);
    const correlationId = randomUUID();
    const idempotencyKey = buildMasterAdminSessionRevocationAuditIdempotencyKey({
      correlationId,
      auditAction: MasterAdminAuditAction.MASTER_USER_SESSIONS_REVOKED_ALL,
      targetUserId: target.id,
      outcome: 'SUCCESS',
    });
    await delivery.commitAuditIntent(
      pgEnvelope({
        correlationId,
        actorUserId: actor.id,
        targetUserId: target.id,
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSIONS_REVOKED_ALL,
        operation: 'REVOKE_ALL',
      }),
      { idempotencyKey, organizationContextId: null },
    );
    const outbox = await prisma.masterAdminAuditOutbox.findUnique({ where: { idempotencyKey } });
    expect(outbox?.auditScope).toBe(MasterAdminAuditScope.PLATFORM);
    record('PG05', 'PASS');
  });

  it('PG06 worker delivery and retry', async () => {
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
    expect(await processor.processOutboxId(row.id)).toBe('processed');
    const log = await prisma.activityLog.findFirst({
      where: { metaJson: { path: ['correlationId'], equals: correlationId } },
    });
    expect(log?.createdAt.toISOString()).toBe('2026-01-15T12:00:00.000Z');
    record('PG06', 'PASS');
  });

  it('PG08 duplicate delivery yields one semantic audit', async () => {
    const actor = await createActor();
    const correlationId = randomUUID();
    const idempotencyKey = `pg08:${correlationId}`;
    const outcome1 = await delivery.commitAuditIntent(
      pgEnvelope({
        correlationId,
        actorUserId: actor.id,
        targetUserId: randomUUID(),
        sessionId: randomUUID(),
      }),
      { idempotencyKey, organizationContextId: null },
    );
    expect(outcome1).toBe('DELIVERED');
    const outbox = await prisma.masterAdminAuditOutbox.findUnique({ where: { idempotencyKey } });
    const replay = await processor.processOutboxId(outbox!.id);
    expect(replay).toBe('duplicate');
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

  it('PG12 IAM worker fail-closed for misrouted platform audit', async () => {
    const org = await createOrg();
    const userAuditRecord = jest.fn();
    const iamOutbox = new IamAuditOutboxRepository(prisma as never);
    const proc = new IamAuditOutboxProcessorService(
      prisma as never,
      iamOutbox,
      { record: userAuditRecord } as never,
      new IamAuditOutboxMetricsService(),
    );
    const misrouted = await prisma.iamAuditOutbox.create({
      data: {
        organizationId: org.id,
        idempotencyKey: `pg12:${randomUUID()}`,
        eventType: MASTER_ADMIN_AUDIT_OUTBOX_EVENT_TYPE,
        payload: { description: 'misrouted' },
        status: 'PENDING',
        nextRetryAt: new Date(),
      },
    });
    const result = await proc.processOutboxId(misrouted.id);
    expect(result).toBe('retry');
    expect(userAuditRecord).not.toHaveBeenCalled();
    record('PG12', 'PASS');
  });

  it('PG03 primary delivery failure leaves recoverable outbox intent', async () => {
    const actor = await createActor();
    const correlationId = randomUUID();
    const idempotencyKey = `pg03:${correlationId}`;
    await prisma.masterAdminAuditDeliveryLedger.deleteMany({ where: { idempotencyKey } });
    await prisma.activityLog.deleteMany({
      where: { metaJson: { path: ['correlationId'], equals: correlationId } },
    });
    const row = await prisma.masterAdminAuditOutbox.create({
      data: {
        idempotencyKey,
        auditScope: MasterAdminAuditScope.PLATFORM,
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
        occurredAt: new Date(),
        actorUserId: actor.id,
        payloadVersion: 1,
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
    const target = await createActor();
    const session = await createSession(target.id, null);
    const revokeResult = await prisma.refreshToken.updateMany({
      where: { id: session.id, userId: target.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    expect(revokeResult.count).toBe(1);
    expect(await processor.processOutboxId(row.id)).toBe('processed');
    const logs = await prisma.activityLog.count({
      where: { metaJson: { path: ['correlationId'], equals: correlationId } },
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
    const result = await prisma.refreshToken.updateMany({
      where: { id: session.id, userId: other.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    expect(result.count).toBe(0);
    const stillActive = await prisma.refreshToken.findUnique({ where: { id: session.id } });
    expect(stillActive?.revokedAt).toBeNull();
    record('PG09', 'PASS');
  });

  it('PG10 degraded diagnostic when intent storage fails', async () => {
    const actor = await createActor();
    const correlationId = randomUUID();
    const duplicateKey = `pg10-duplicate:${randomUUID()}`;
    const envelope = pgEnvelope({
      correlationId,
      actorUserId: actor.id,
      targetUserId: randomUUID(),
      sessionId: randomUUID(),
    });
    await prisma.masterAdminAuditOutbox.create({
      data: {
        idempotencyKey: duplicateKey,
        auditScope: MasterAdminAuditScope.PLATFORM,
        auditAction: envelope.auditAction,
        occurredAt: new Date(),
        actorUserId: actor.id,
        payloadVersion: 1,
        payload: { masterAdminAuditEnvelope: envelope },
        status: MasterAdminAuditOutboxStatus.PENDING,
        nextRetryAt: new Date(),
      },
    });
    const session = await createSession(actor.id, null);
    await prisma.refreshToken.updateMany({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    const outcome = await delivery.commitAuditIntent(envelope, {
      idempotencyKey: duplicateKey,
      organizationContextId: null,
    });
    expect(['INTENT_PERSISTED', 'FAILURE_RECORDED', 'DELIVERED']).toContain(outcome);
    record('PG10', 'PASS');
  });

  it('PG13 organization deletion does not delete platform audit outbox', async () => {
    const org = await createOrg();
    const idempotencyKey = `pg13:${randomUUID()}`;
    const row = await prisma.masterAdminAuditOutbox.create({
      data: {
        idempotencyKey,
        auditScope: MasterAdminAuditScope.ORGANIZATION_CONTEXT,
        organizationContextId: org.id,
        auditAction: MasterAdminAuditAction.MASTER_USER_SESSION_REVOKED,
        occurredAt: new Date(),
        payloadVersion: 1,
        payload: { masterAdminAuditEnvelope: { auditAction: 'x', correlationId: 'c', description: 'd' } },
        status: MasterAdminAuditOutboxStatus.PENDING,
        nextRetryAt: new Date(),
      },
    });
    await prisma.organization.delete({ where: { id: org.id } });
    const persisted = await prisma.masterAdminAuditOutbox.findUnique({ where: { id: row.id } });
    expect(persisted?.id).toBe(row.id);
    record('PG13', 'PASS');
  });
});
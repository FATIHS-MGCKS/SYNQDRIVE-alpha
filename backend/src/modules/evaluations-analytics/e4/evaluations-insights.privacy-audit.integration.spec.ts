import { randomUUID } from 'node:crypto';
import { BusinessAuditOutboxStatus, PrismaClient } from '@prisma/client';
import { EvaluationsInsightsService } from './evaluations-insights.service';
import { EvaluationsInsightsRepository } from './evaluations-insights.repository';
import { EvaluationsPrivacyResolver } from '../privacy/evaluations-privacy.resolver';
import { pseudonymizePersonRef } from '../privacy/evaluations-privacy.policy';
import { EvaluationsAuditService } from '../audit/evaluations-audit.service';
import { BusinessAuditService } from '@modules/business-audit/business-audit.service';
import { BusinessAuditOutboxRepository } from '@modules/business-audit/business-audit-outbox.repository';
import { BusinessAuditOutboxProcessorService } from '@modules/business-audit/business-audit-outbox.processor';
import { BusinessAuditOutboxMetricsService } from '@modules/business-audit/business-audit-outbox.metrics';
import { AuditService } from '@modules/activity-log/audit.service';
import { BusinessAuditAction } from '@modules/business-audit/business-audit.constants';
import {
  E4_PG_WINDOW,
  cleanupE4TenantFixture,
  createE4TenantFixture,
  probeE4Database,
  type E4TenantFixture,
} from './evaluations-insights.postgres.integration.harness';

/**
 * E5.1B real-PostgreSQL privacy & audit adversarial coverage.
 *
 * Gated behind EVALUATIONS_E4_POSTGRES_INTEGRATION=1 (same harness/env as the E4
 * tenant-integrity suite). Mocks are insufficient for final E5 security claims,
 * so these prove — against a live database — cross-tenant/cross-role person-level
 * gating, keyed pseudonymization, and durable-before-disclosure auditing.
 */
const LIVE = process.env.EVALUATIONS_E4_POSTGRES_INTEGRATION === '1';

const period = {
  periodType: 'MONTH' as const,
  start: '2026-01-01T00:00:00.000Z',
  endExclusive: '2026-02-01T00:00:00.000Z',
  reference: '2026-01-15T00:00:00.000Z',
  timezone: {
    effectiveTimezone: 'UTC',
    source: 'ORGANIZATION' as const,
    reportTimezone: null,
    stationTimezone: null,
    organizationTimezone: 'UTC',
  },
  comparisonBasis: null,
};

const GEN = new Date('2026-01-31T12:00:00.000Z');

(LIVE ? describe : describe.skip)(
  'E5.1B privacy & audit — real PostgreSQL (DATABASE_URL)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let fx: E4TenantFixture;
    let service: EvaluationsInsightsService;
    let resolver: EvaluationsPrivacyResolver;
    const createdUserIds: string[] = [];

    beforeAll(async () => {
      prisma = new PrismaClient();
      dbOk = await probeE4Database(prisma);
      if (!dbOk) return;
      const repo = new EvaluationsInsightsRepository(prisma as never);
      resolver = new EvaluationsPrivacyResolver(prisma as never);
      const outboxRepo = new BusinessAuditOutboxRepository(prisma as never);
      const metrics = new BusinessAuditOutboxMetricsService();
      const activity = new AuditService(prisma as never);
      const processor = new BusinessAuditOutboxProcessorService(
        prisma as never,
        outboxRepo,
        activity,
        metrics,
      );
      const businessAudit = new BusinessAuditService(outboxRepo, processor);
      const evalAudit = new EvaluationsAuditService(businessAudit);
      service = new EvaluationsInsightsService({} as never, repo, resolver, evalAudit);
    }, 60_000);

    beforeEach(async () => {
      if (!dbOk) return;
      fx = await createE4TenantFixture(prisma);
      createdUserIds.length = 0;
    });

    afterEach(async () => {
      if (!dbOk || !fx) return;
      const orgs = [fx.orgAId, fx.orgBId];
      await prisma.activityLog.deleteMany({ where: { organizationId: { in: orgs } } });
      // businessAuditOutbox cascades on org delete, cleaned by the harness.
      await cleanupE4TenantFixture(prisma, fx);
      if (createdUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect().catch(() => undefined);
    });

    async function addMember(
      orgId: string,
      role: string,
      permissions?: Record<string, { read: boolean; write: boolean }>,
    ): Promise<string> {
      const user = await prisma.user.create({
        data: { email: `e5pg-${randomUUID()}@test.local` },
      });
      createdUserIds.push(user.id);
      await prisma.organizationMembership.create({
        data: {
          userId: user.id,
          organizationId: orgId,
          role: role as never,
          status: 'ACTIVE',
          permissions: (permissions ?? null) as never,
        },
      });
      return user.id;
    }

    const scope = (orgId: string) => ({
      organizationId: orgId,
      stationIds: null,
      stationScoped: false,
      period,
    });

    // 1. Cross-tenant: ORG_A membership cannot authorize ORG_B person analytics.
    it('ORG_A membership does not authorize ORG_B person analytics (tier none)', async () => {
      const userId = await addMember(fx.orgAId, 'ORG_ADMIN');
      const tier = await resolver.resolvePiiTier(
        { id: userId, organizationId: fx.orgAId, platformRole: null },
        fx.orgBId,
      );
      expect(tier).toBe('none');
    });

    // 2. Lower role with unrelated permission does NOT gain person analytics.
    it('a WORKER with only invoices.read does not gain person-level analytics (tier none)', async () => {
      const userId = await addMember(fx.orgAId, 'WORKER', {
        invoices: { read: true, write: false },
      });
      const tier = await resolver.resolvePiiTier(
        { id: userId, organizationId: fx.orgAId, platformRole: null },
        fx.orgAId,
      );
      expect(tier).toBe('none');
    });

    // 3. Pseudonymous response contains no original-ID fragment.
    it('pseudonymous tier (evaluations.read) redacts driver refs with no original-ID fragment', async () => {
      const userId = await addMember(fx.orgAId, 'WORKER', {
        evaluations: { read: true, write: false },
      });
      const section = await service.getDriverInfluence(
        scope(fx.orgAId),
        { id: userId, organizationId: fx.orgAId, platformRole: null },
        GEN,
      );
      expect(section.piiTier).toBe('pseudonymous');
      expect(section.factors.length).toBeGreaterThan(0);
      // No original driver id leaks anywhere in the response.
      expect(JSON.stringify(section)).not.toContain(fx.driverAId);
      // The distinctive driver token fragment never appears inside a pseudonym.
      const driverFragment = fx.driverAId.replace('e4pg-', ''); // e.g. driverA-<tag>
      for (const factor of section.factors) {
        expect(factor.driverRef).toMatch(/^person-v1-[0-9a-f]{16}$/);
        expect(factor.driverRef).not.toContain('driver');
        expect(factor.driverRef).not.toContain(driverFragment);
      }
    });

    // 4. Cross-tenant same person-like source id → different pseudonym.
    it('same person id in different tenants yields different pseudonyms', () => {
      const secret = 'integration-secret';
      const a = pseudonymizePersonRef({ organizationId: fx.orgAId, personId: 'shared-person', secret });
      const b = pseudonymizePersonRef({ organizationId: fx.orgBId, personId: 'shared-person', secret });
      expect(a).not.toBe(b);
      expect(a).toMatch(/^person-v1-[0-9a-f]{16}$/);
    });

    // 5 + 7. Successful disclosure produces a durable, tenant-scoped BusinessAudit
    // record; ORG_B cannot read/obtain it.
    it('successful person-level disclosure durably records a tenant-scoped audit (ORG_B sees none)', async () => {
      const userId = await addMember(fx.orgAId, 'ORG_ADMIN');
      const section = await service.getDriverInfluence(
        scope(fx.orgAId),
        { id: userId, organizationId: fx.orgAId, platformRole: null },
        GEN,
      );
      expect(section.factors.length).toBeGreaterThan(0);

      const orgARecords = await prisma.businessAuditOutbox.findMany({
        where: {
          organizationId: fx.orgAId,
          action: BusinessAuditAction.EVALUATIONS_PERSON_ANALYTICS_ACCESSED,
        },
      });
      expect(orgARecords.length).toBe(1);
      // Durable: the critical flush processed it before the data was released.
      expect(orgARecords[0].status).toBe(BusinessAuditOutboxStatus.PROCESSED);
      expect(orgARecords[0].actorUserId).toBe(userId);
      // Non-PII metadata only — no raw driver id in the audit payload.
      expect(JSON.stringify(orgARecords[0].payload)).not.toContain(fx.driverAId);

      const orgBRecords = await prisma.businessAuditOutbox.findMany({
        where: { organizationId: fx.orgBId },
      });
      expect(orgBRecords.length).toBe(0);
    });

    // 6. Audit persistence failure prevents sensitive disclosure (audit-critical).
    it('fails closed (no person data) when the durable audit cannot persist', async () => {
      const repo = new EvaluationsInsightsRepository(prisma as never);
      const failingAudit = {
        recordPersonLevelAccess: async () => undefined,
        recordCriticalPersonLevelDisclosure: async () => {
          throw new Error('BUSINESS_AUDIT_OUTBOX_FLUSH_FAILED');
        },
      };
      const svc = new EvaluationsInsightsService(
        {} as never,
        repo,
        resolver,
        failingAudit as never,
      );
      const userId = await addMember(fx.orgAId, 'ORG_ADMIN');
      const section = await svc.getDriverInfluence(
        scope(fx.orgAId),
        { id: userId, organizationId: fx.orgAId, platformRole: null },
        GEN,
      );
      expect(section.status).toBe('UNAVAILABLE');
      expect(section.reason).toBe('SENSITIVE_AUDIT_UNAVAILABLE');
      expect(section.factors).toEqual([]);
      expect(JSON.stringify(section)).not.toContain(fx.driverAId);
    });

    // 8. Denied access leaks no foreign existence / PII, and is recorded as DENIED.
    it('denied access (no relevant permission) returns no factors or foreign PII', async () => {
      const userId = await addMember(fx.orgAId, 'WORKER'); // no customers/evaluations read
      const section = await service.getDriverInfluence(
        scope(fx.orgAId),
        { id: userId, organizationId: fx.orgAId, platformRole: null },
        GEN,
      );
      expect(section.piiTier).toBe('none');
      expect(section.status).toBe('UNAVAILABLE');
      expect(section.reason).toBe('PERSON_LEVEL_ACCESS_DENIED');
      expect(section.factors).toEqual([]);
      const serialized = JSON.stringify(section);
      expect(serialized).not.toContain(fx.driverAId);
      expect(serialized).not.toContain(fx.driverBId);

      const denied = await prisma.businessAuditOutbox.findMany({
        where: {
          organizationId: fx.orgAId,
          action: BusinessAuditAction.EVALUATIONS_PERSON_ANALYTICS_DENIED,
        },
      });
      expect(denied.length).toBe(1);
      expect(JSON.stringify(denied[0].payload)).not.toContain(fx.driverAId);
    });

    // Actor integrity: audit actor comes from the resolved server context id.
    it('records the authenticated actor id, never a caller-supplied one', async () => {
      const userId = await addMember(fx.orgAId, 'ORG_ADMIN');
      await service.getDriverInfluence(
        scope(fx.orgAId),
        { id: userId, organizationId: fx.orgAId, platformRole: null },
        GEN,
      );
      const rec = await prisma.businessAuditOutbox.findFirst({
        where: {
          organizationId: fx.orgAId,
          action: BusinessAuditAction.EVALUATIONS_PERSON_ANALYTICS_ACCESSED,
        },
      });
      expect(rec?.actorUserId).toBe(userId);
    });
  },
);

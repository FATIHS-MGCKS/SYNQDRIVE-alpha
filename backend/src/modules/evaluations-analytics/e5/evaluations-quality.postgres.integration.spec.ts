import { PrismaClient } from '@prisma/client';
import { EvaluationsQualityRepository } from './evaluations-quality.repository';
import {
  E4_PG_WINDOW,
  cleanupE4TenantFixture,
  createE4TenantFixture,
  probeE4Database,
  type E4TenantFixture,
} from '../e4/evaluations-insights.postgres.integration.harness';

const LIVE = process.env.EVALUATIONS_E4_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'E5 quality freshness — real PostgreSQL tenant isolation (DATABASE_URL)',
  () => {
    let prisma: PrismaClient;
    let repo: EvaluationsQualityRepository;
    let dbOk = false;
    let fx: E4TenantFixture;

    beforeAll(async () => {
      prisma = new PrismaClient();
      dbOk = await probeE4Database(prisma);
      if (!dbOk) return;
      repo = new EvaluationsQualityRepository(prisma as never);
    }, 60_000);

    beforeEach(async () => {
      if (!dbOk) return;
      fx = await createE4TenantFixture(prisma);
    });

    afterEach(async () => {
      if (!dbOk || !fx) return;
      await cleanupE4TenantFixture(prisma, fx);
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect().catch(() => undefined);
    });

    const win = () => ({ start: E4_PG_WINDOW.start, endExclusive: E4_PG_WINDOW.endExclusive });

    it('finance freshness is tenant-scoped: ORG_A never sees ORG_B invoice timestamps', async () => {
      // Give ORG_B a much newer invoice; ORG_A freshness must ignore it.
      await prisma.orgInvoice.update({
        where: { id: fx.orgBInvoiceId },
        data: { invoiceDate: new Date('2026-01-31T00:00:00.000Z') },
      });
      const orgA = await repo.financeFreshness(fx.orgAId, win());
      const orgB = await repo.financeFreshness(fx.orgBId, win());
      // ORG_A newest = its own mid-window invoice; never ORG_B's later invoice.
      expect(orgA.newestMs).toBe(E4_PG_WINDOW.mid.getTime());
      expect(orgB.newestMs).toBe(Date.parse('2026-01-31T00:00:00.000Z'));
      expect(orgA.newestMs).not.toBe(orgB.newestMs);
    });

    it('maintenance/damage freshness only reflects same-tenant rows', async () => {
      const maint = await repo.maintenanceFreshness(fx.orgAId, win());
      // ORG_A has two completed REPAIR service cases at mid-window.
      expect(maint.newestMs).toBe(E4_PG_WINDOW.mid.getTime());
      const orgBMaint = await repo.maintenanceFreshness(fx.orgBId, win());
      expect(orgBMaint.newestMs).toBeNull(); // ORG_B has none
    });

    it('returns null (UNKNOWN upstream) when a tenant has no in-window sources', async () => {
      const bookings = await repo.bookingsFreshness(fx.orgBId, win());
      // ORG_B booking fixtures are cancellations authored under ORG_A; ORG_B has none.
      expect(bookings.newestMs).toBeNull();
    });
  },
);

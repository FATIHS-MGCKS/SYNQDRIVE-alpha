import { PrismaClient } from '@prisma/client';
import { EvaluationsInsightsRepository } from './evaluations-insights.repository';
import { aggregateCostEvents } from './domain/evaluations-cost.domain';
import {
  E4_PG_WINDOW,
  cleanupE4TenantFixture,
  createE4TenantFixture,
  probeE4Database,
  type E4TenantFixture,
} from './evaluations-insights.postgres.integration.harness';

const LIVE = process.env.EVALUATIONS_E4_POSTGRES_INTEGRATION === '1';

(LIVE ? describe : describe.skip)(
  'E4 tenant integrity — real PostgreSQL adversarial (DATABASE_URL)',
  () => {
    let prisma: PrismaClient;
    let repo: EvaluationsInsightsRepository;
    let dbOk = false;
    let fx: E4TenantFixture;

    beforeAll(async () => {
      prisma = new PrismaClient();
      dbOk = await probeE4Database(prisma);
      if (!dbOk) return;
      repo = new EvaluationsInsightsRepository(prisma as never);
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

    it('A. ORG_A booking → ORG_B assigned driver is dropped (no foreign driver leak)', async () => {
      const { observations, unattributedCount } = await repo.loadDriverObservations(fx.orgAId, win());
      const refs = observations.map((o) => o.driverRef);
      // Legitimate ORG_A assigned driver surfaces; ORG_B person never does.
      expect(refs).toContain(fx.driverAId);
      expect(refs).not.toContain(fx.driverBId);
      expect(refs).not.toContain(fx.contractCustomerAId); // customer is not the driver
      // 5 foreign-driver + 3 no-driver cancellations are unattributed, not redistributed.
      expect(unattributedCount).toBe(8);
      const serialized = JSON.stringify(observations);
      expect(serialized).not.toContain(fx.driverBId);
      expect(serialized).not.toContain(fx.contractCustomerAId);
      expect(serialized).not.toContain(fx.orgBId);
    });

    it('no contract-customer fallback: a booking with customer but no assigned driver is unattributed', async () => {
      // Remove all assigned-driver bookings, keep only the 3 customer-only ones by
      // deleting driverA/driverB bookings, leaving customer-only cancellations.
      await prisma.booking.deleteMany({
        where: { organizationId: fx.orgAId, assignedDriverId: { in: [fx.driverAId, fx.driverBId] } },
      });
      const { observations, unattributedCount } = await repo.loadDriverObservations(fx.orgAId, win());
      expect(observations).toEqual([]);
      expect(unattributedCount).toBe(3);
    });

    it('B. ORG_A Task → ORG_B invoice does not suppress or alter ORG_A cost facts', async () => {
      const events = await repo.loadCostEvents(fx.orgAId, win(), 'EUR');
      const serialized = JSON.stringify(events);
      // The foreign ORG_B invoice (and its amount) never enters ORG_A cost.
      expect(serialized).not.toContain(fx.orgBInvoiceId);
      expect(events.some((e) => e.amountMinor === 999999)).toBe(false);
      // The linked ORG_A service case keeps its own economic key (foreign invoice
      // link filtered out) and is therefore still counted.
      expect(
        events.some(
          (e) => e.economicKey === `servicecase:${fx.linkedServiceCaseId}` && e.amountMinor === 5000,
        ),
      ).toBe(true);

      const aggregation = aggregateCostEvents(
        events,
        E4_PG_WINDOW.start.getTime(),
        E4_PG_WINDOW.endExclusive.getTime(),
      );
      const byCategory = Object.fromEntries(
        aggregation.categories.map((c) => [c.category, c.totalsByCurrency]),
      );
      expect(byCategory.OPERATING_EXPENSES).toEqual([{ amountMinor: 3000, currency: 'EUR' }]);
      expect(byCategory.UNPLANNED_MAINTENANCE).toEqual([{ amountMinor: 5000, currency: 'EUR' }]);
      expect(aggregation.totalsByCurrency).toEqual([{ amountMinor: 8000, currency: 'EUR' }]);
    });

    it('same-tenant Task → invoice dedup collapses the linked cost once (invoice wins)', async () => {
      const events = await repo.loadCostEvents(fx.orgAId, win(), 'EUR');
      // The dedup service case shares the ORG_A invoice economic key.
      const dedupEvents = events.filter((e) => e.economicKey === `invoice:${fx.orgAInvoiceId}`);
      expect(dedupEvents.length).toBeGreaterThanOrEqual(2); // operating invoice + linked service case
      const aggregation = aggregateCostEvents(
        events,
        E4_PG_WINDOW.start.getTime(),
        E4_PG_WINDOW.endExclusive.getTime(),
      );
      expect(aggregation.deduplicatedCount).toBeGreaterThanOrEqual(1);
    });

    it('C. ORG_A booking → ORG_B vehicle is excluded from utilization', async () => {
      const facts = await repo.loadUtilizationFacts(fx.orgAId, win());
      const vehicleIds = facts.vehicles.map((v) => v.vehicleId);
      expect(vehicleIds).toContain(fx.vehicleAId);
      expect(vehicleIds).not.toContain(fx.vehicleBId);
      const vehicleA = facts.vehicles.find((v) => v.vehicleId === fx.vehicleAId);
      // The valid ORG_A booking contributes a rented interval; the foreign-vehicle
      // booking contributes nothing.
      expect(vehicleA?.rented.length).toBe(1);
      expect(JSON.stringify(facts)).not.toContain(fx.vehicleBId);
      expect(JSON.stringify(facts)).not.toContain(fx.orgBId);
    });

    it('E. same-tenant valid relations still work end-to-end (no over-blocking)', async () => {
      const { observations } = await repo.loadDriverObservations(fx.orgAId, win());
      expect(observations.filter((o) => o.driverRef === fx.driverAId).length).toBe(5);

      const events = await repo.loadCostEvents(fx.orgAId, win(), 'EUR');
      expect(events.some((e) => e.economicKey === `invoice:${fx.orgAInvoiceId}` && e.amountMinor === 3000)).toBe(true);

      const facts = await repo.loadUtilizationFacts(fx.orgAId, win());
      expect(facts.vehicles.some((v) => v.vehicleId === fx.vehicleAId)).toBe(true);
    });
  },
);

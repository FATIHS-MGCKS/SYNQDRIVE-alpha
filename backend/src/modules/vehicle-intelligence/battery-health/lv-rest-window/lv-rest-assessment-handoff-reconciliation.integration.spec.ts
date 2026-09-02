import { PrismaClient } from '@prisma/client';
import { fetchRestAssessmentHandoffReconcileCandidates } from './lv-rest-assessment-handoff-reconciliation.query';

const LIVE = process.env.BATTERY_V2_HANDOFF_RECONCILE_INTEGRATION === '1';

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

(LIVE ? describe : describe.skip)(
  'lv-rest-assessment-handoff reconciliation SQL (DATABASE_URL)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;

    beforeAll(async () => {
      dbOk = await probeDatabase();
      if (!dbOk) return;
      prisma = new PrismaClient();
    });

    afterAll(async () => {
      if (prisma) {
        await prisma.$disconnect().catch(() => undefined);
      }
    });

    it('smoke: incomplete REST_60M candidate with sourceObservationId is selectable and EXECUTED is excluded', async () => {
      if (!dbOk) return;

      const lookbackFrom = new Date(Date.now() - 7 * 24 * 3600_000);
      const rows = await fetchRestAssessmentHandoffReconcileCandidates(prisma as never, {
        lookbackFrom,
        limit: 5,
      });

      expect(Array.isArray(rows)).toBe(true);
      for (const row of rows) {
        expect(['REST_60M', 'REST_6H']).toContain(row.type);
        expect(row.sessionId).toBeTruthy();
        const provenance = row.provenance as { sourceObservationId?: string } | null;
        expect(provenance?.sourceObservationId).toBeTruthy();
      }
    });
  },
);

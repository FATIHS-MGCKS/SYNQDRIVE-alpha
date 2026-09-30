import { PrismaClient } from '@prisma/client';
import { createGtOrgVehicle } from '../ground-truth/ground-truth-postgres.fixture';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { runM3_3HvH3LongitudinalTrendReport } from './m3-3-hv-h3-trend-report.service';
import { M3_3_HV_H3_LONGITUDINAL_TREND_REPORT_V1 } from './m3-3-hv-h3.constants';

const integrationEnabled = process.env.BATTERY_HV_H3_REPORT_INTEGRATION === '1';

(integrationEnabled ? describe : describe.skip)(
  'M3.3-HV-H3 longitudinal trend report postgres',
  () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      const ok = await probePostgresDatabase();
      if (!ok) throw new Error('DATABASE_URL not reachable');
      prisma = new PrismaClient();
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('chains H2 → H3 read-only with deterministic repeat', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const evaluationAt = new Date('2027-06-01T00:00:00.000Z');
      const input = { organizationId, vehicleId, evaluationAt };

      const a = await runM3_3HvH3LongitudinalTrendReport(prisma, input);
      const b = await runM3_3HvH3LongitudinalTrendReport(prisma, input);

      expect(a.contractVersion).toBe(M3_3_HV_H3_LONGITUDINAL_TREND_REPORT_V1);
      expect(a.degradationConclusion).toBeNull();
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  },
);

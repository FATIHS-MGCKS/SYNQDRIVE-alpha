import { PrismaClient } from '@prisma/client';
import { createGtOrgVehicle } from '../ground-truth/ground-truth-postgres.fixture';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import {
  printM3_3HvH4A3_6R0ScenarioResultV1,
  ratioP50,
  ratioP95,
  runM3_3HvH4A3_6R0ScenarioBenchmarkV1,
  type M3_3HvH4A3_6R0BenchmarkScenarioV1,
} from './m3-3-hv-h4-a3-6-r0-benchmark.harness.v1';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';
const benchmarkEnabled = process.env.M3_3_HV_H4_A3_6_R0_BENCHMARK === '1';

const SCENARIOS: M3_3HvH4A3_6R0BenchmarkScenarioV1[] = [
  { id: 'S1', canonicalSessions: 100, revisionsPerSession: 1 },
  { id: 'S2', canonicalSessions: 500, revisionsPerSession: 2 },
  { id: 'S3', canonicalSessions: 1_000, revisionsPerSession: 2 },
  { id: 'S4', canonicalSessions: 2_500, revisionsPerSession: 2 },
  { id: 'S5', canonicalSessions: 5_000, revisionsPerSession: 1 },
];

const EVAL = new Date('2030-01-01T00:00:00.000Z');

(integrationEnabled && benchmarkEnabled ? describe : describe.skip)(
  'M3.3-HV-H4-A3.6-R0 durable read-path benchmark (postgres, manual)',
  () => {
    let prisma: PrismaClient;

    beforeAll(async () => {
      const probe = await probePostgresDatabase();
      if (!probe) {
        throw new Error('postgres unavailable for A3.6 R0 benchmark');
      }
      prisma = new PrismaClient();
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    for (const scenario of SCENARIOS) {
      it(`benchmark ${scenario.id}`, async () => {
        const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
        const result = await runM3_3HvH4A3_6R0ScenarioBenchmarkV1(prisma, {
          organizationId,
          vehicleId,
          evaluationAt: EVAL,
          scenario,
          warmup: 1,
          iterations: 5,
        });
        printM3_3HvH4A3_6R0ScenarioResultV1(result);
        expect(result.revisionRows).toBe(
          scenario.canonicalSessions * scenario.revisionsPerSession,
        );
      }, 600_000);
    }

    it('optional S6 (5000 x 2) when M3_3_HV_H4_A3_6_R0_BENCHMARK_S6=1', async () => {
      if (process.env.M3_3_HV_H4_A3_6_R0_BENCHMARK_S6 !== '1') {
        return;
      }
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const result = await runM3_3HvH4A3_6R0ScenarioBenchmarkV1(prisma, {
        organizationId,
        vehicleId,
        evaluationAt: EVAL,
        scenario: { id: 'S6', canonicalSessions: 5_000, revisionsPerSession: 2 },
        warmup: 1,
        iterations: 3,
      });
      printM3_3HvH4A3_6R0ScenarioResultV1(result);
      expect(result.revisionRows).toBe(10_000);
    }, 900_000);

    it('prints live vs durable ratio for S3', async () => {
      const { organizationId, vehicleId } = await createGtOrgVehicle(prisma);
      const result = await runM3_3HvH4A3_6R0ScenarioBenchmarkV1(prisma, {
        organizationId,
        vehicleId,
        evaluationAt: EVAL,
        scenario: SCENARIOS[2]!,
        warmup: 1,
        iterations: 5,
      });
      const p50 = ratioP50(result.durableReportMs, result.liveTotalMs);
      const p95 = ratioP95(result.durableReportMs, result.liveTotalMs);
      // eslint-disable-next-line no-console
      console.log(`A3_6_R0_LIVE_VS_DURABLE_RATIO p50=${p50.toFixed(2)} p95=${p95.toFixed(2)}`);
    }, 600_000);
  },
);

describe('M3.3-HV-H4-A3.6-R0 benchmark harness gate', () => {
  it('skips postgres benchmarks unless M3_3_HV_H4_A3_6_R0_BENCHMARK=1', () => {
    expect(process.env.M3_3_HV_H4_A3_6_R0_BENCHMARK === '1').toBe(
      process.env.M3_3_HV_H4_A3_6_R0_BENCHMARK === '1',
    );
  });
});

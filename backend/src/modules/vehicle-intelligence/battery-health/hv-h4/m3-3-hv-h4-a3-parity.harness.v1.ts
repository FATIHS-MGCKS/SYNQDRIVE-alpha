import type { PrismaClient } from '@prisma/client';
import {
  buildM3_3HvH4ChargeThroughputReportV1,
  validateM3_3HvH4ChargeThroughputReportContract,
} from './m3-3-hv-h4-charge-throughput-report.builder';
import {
  buildM3_3HvH4CoverageReportV1,
  validateM3_3HvH4CoverageReportContract,
} from './m3-3-hv-h4-coverage-report.builder';
import { loadM3_3HvH4DataFromDurableRevisionsModeAV1 } from './m3-3-hv-h4-a3-durable-charge-session-loader.v1';
import { loadM3_3HvH4DataV1, type M3_3HvH4ReportInputV1 } from './m3-3-hv-h4-data.loader';
import type { M3_3HvH4ChargeThroughputReportV1 } from './m3-3-hv-h4-charge-throughput.types';
import type { M3_3HvH4CoverageReportV1 } from './m3-3-hv-h4.types';
import type { M3_3HvH4LoadedDataV1 } from './m3-3-hv-h4-loaded-data.types';
import { runM3_3HvH4ReadOnlyTransaction } from './m3-3-hv-h4-readonly-transaction';

export interface M3_3HvH4A2ReportBundleV1 {
  loadedData: M3_3HvH4LoadedDataV1;
  coverage: M3_3HvH4CoverageReportV1;
  throughput: M3_3HvH4ChargeThroughputReportV1;
}

export async function runM3_3HvH4LiveA2ReportBundleV1(
  prisma: PrismaClient,
  input: M3_3HvH4ReportInputV1,
  evaluationAt: Date,
): Promise<M3_3HvH4A2ReportBundleV1> {
  return runM3_3HvH4ReadOnlyTransaction(prisma, async (tx) => {
    const loadedData = await loadM3_3HvH4DataV1(tx, input, evaluationAt);
    const coverage = buildM3_3HvH4CoverageReportV1(loadedData);
    validateM3_3HvH4CoverageReportContract(coverage);
    const throughput = buildM3_3HvH4ChargeThroughputReportV1({ data: loadedData, coverage });
    validateM3_3HvH4ChargeThroughputReportContract(throughput);
    return { loadedData, coverage, throughput };
  });
}

export async function runM3_3HvH4DurableModeAA2ReportBundleV1(
  prisma: PrismaClient,
  input: M3_3HvH4ReportInputV1,
  evaluationAt: Date,
): Promise<M3_3HvH4A2ReportBundleV1> {
  return runM3_3HvH4ReadOnlyTransaction(prisma, async (tx) => {
    const loadedData = await loadM3_3HvH4DataFromDurableRevisionsModeAV1(tx, {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      evaluationAt,
    });
    const coverage = buildM3_3HvH4CoverageReportV1(loadedData);
    validateM3_3HvH4CoverageReportContract(coverage);
    const throughput = buildM3_3HvH4ChargeThroughputReportV1({ data: loadedData, coverage });
    validateM3_3HvH4ChargeThroughputReportContract(throughput);
    return { loadedData, coverage, throughput };
  });
}

export interface M3_3HvH4A2ParityComparisonV1 {
  live: M3_3HvH4A2ReportBundleV1;
  durable: M3_3HvH4A2ReportBundleV1;
}

function assertJsonDeepEqual(actual: unknown, expected: unknown, label: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`M3.3-HV-H4-A3.3 parity mismatch at ${label}`);
  }
}

export function assertM3_3HvH4FullA2ReportParityV1(input: {
  live: M3_3HvH4A2ReportBundleV1;
  durable: M3_3HvH4A2ReportBundleV1;
}): void {
  assertJsonDeepEqual(
    input.live.loadedData.chargeSessionSourceLoad,
    input.durable.loadedData.chargeSessionSourceLoad,
    'chargeSessionSourceLoad',
  );
  assertJsonDeepEqual(input.live.coverage, input.durable.coverage, 'coverage');
  assertJsonDeepEqual(input.live.throughput, input.durable.throughput, 'throughput');
}

export async function runM3_3HvH4LiveDurableModeAParityV1(
  prisma: PrismaClient,
  input: M3_3HvH4ReportInputV1,
  evaluationAt: Date,
): Promise<M3_3HvH4A2ParityComparisonV1> {
  const live = await runM3_3HvH4LiveA2ReportBundleV1(prisma, input, evaluationAt);
  const durable = await runM3_3HvH4DurableModeAA2ReportBundleV1(prisma, input, evaluationAt);
  assertM3_3HvH4FullA2ReportParityV1({ live, durable });
  return { live, durable };
}

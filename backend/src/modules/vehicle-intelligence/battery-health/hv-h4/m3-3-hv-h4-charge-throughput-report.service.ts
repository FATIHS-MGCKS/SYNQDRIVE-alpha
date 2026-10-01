import type { PrismaClient } from '@prisma/client';
import {
  buildM3_3HvH4CoverageReportV1,
  validateM3_3HvH4CoverageReportContract,
} from './m3-3-hv-h4-coverage-report.builder';
import {
  buildM3_3HvH4ChargeThroughputReportV1,
  validateM3_3HvH4ChargeThroughputReportContract,
} from './m3-3-hv-h4-charge-throughput-report.builder';
import { loadM3_3HvH4DataV1, type M3_3HvH4ReportInputV1 } from './m3-3-hv-h4-data.loader';
import type { M3_3HvH4ChargeThroughputReportV1 } from './m3-3-hv-h4-charge-throughput.types';
import { runM3_3HvH4ReadOnlyTransaction } from './m3-3-hv-h4-readonly-transaction';

export type RunM3_3HvH4ChargeThroughputReportInput = M3_3HvH4ReportInputV1;

export async function runM3_3HvH4ChargeThroughputReport(
  prisma: PrismaClient,
  input: RunM3_3HvH4ChargeThroughputReportInput,
): Promise<M3_3HvH4ChargeThroughputReportV1> {
  const evaluationAt = input.evaluationAt ?? new Date();
  if (Number.isNaN(evaluationAt.getTime())) {
    throw new Error('M3.3-HV-H4-A2: invalid evaluationAt');
  }

  return runM3_3HvH4ReadOnlyTransaction(prisma, async (tx) => {
    const data = await loadM3_3HvH4DataV1(tx, input, evaluationAt);
    const coverage = buildM3_3HvH4CoverageReportV1(data);
    validateM3_3HvH4CoverageReportContract(coverage);
    const report = buildM3_3HvH4ChargeThroughputReportV1({ data, coverage });
    validateM3_3HvH4ChargeThroughputReportContract(report);
    return report;
  });
}

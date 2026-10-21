import type { PrismaClient } from '@prisma/client';
import {
  buildM3_3HvH4CoverageReportV1,
  validateM3_3HvH4CoverageReportContract,
} from './m3-3-hv-h4-coverage-report.builder';
import { loadM3_3HvH4DataV1, type M3_3HvH4ReportInputV1 } from './m3-3-hv-h4-data.loader';
import type { M3_3HvH4CoverageReportV1 } from './m3-3-hv-h4.types';
import { runM3_3HvH4ReadOnlyTransaction } from './m3-3-hv-h4-readonly-transaction';

export type RunM3_3HvH4CoverageReportInput = M3_3HvH4ReportInputV1;

export async function runM3_3HvH4CoverageReport(
  prisma: PrismaClient,
  input: RunM3_3HvH4CoverageReportInput,
): Promise<M3_3HvH4CoverageReportV1> {
  const evaluationAt = input.evaluationAt ?? new Date();
  if (Number.isNaN(evaluationAt.getTime())) {
    throw new Error('M3.3-HV-H4: invalid evaluationAt');
  }

  const data = await runM3_3HvH4ReadOnlyTransaction(prisma, (tx) =>
    loadM3_3HvH4DataV1(tx, input, evaluationAt),
  );
  const report = buildM3_3HvH4CoverageReportV1(data);
  validateM3_3HvH4CoverageReportContract(report);
  return report;
}

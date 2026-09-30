import type { PrismaClient } from '@prisma/client';
import { runM3_3HvH2LongitudinalInputReport } from '../hv-h2/m3-3-hv-h2-longitudinal-input-report.service';
import { buildM3_3HvH3LongitudinalTrendReportV1 } from './m3-3-hv-h3-series-builder';
import type { M3_3HvH3LongitudinalTrendReportV1 } from './m3-3-hv-h3.types';

export interface RunM3_3HvH3LongitudinalTrendReportInput {
  organizationId: string;
  vehicleId: string;
  evaluationAt?: Date;
  maxCapacityObservations?: number;
  maxProviderSohRows?: number;
  maxGtRows?: number;
  maxSessions?: number;
  maxPointsPerSeries?: number;
}

export async function runM3_3HvH3LongitudinalTrendReport(
  prisma: PrismaClient,
  input: RunM3_3HvH3LongitudinalTrendReportInput,
): Promise<M3_3HvH3LongitudinalTrendReportV1> {
  const h2Report = await runM3_3HvH2LongitudinalInputReport(prisma, input);
  return buildM3_3HvH3LongitudinalTrendReportV1({
    h2Report,
    maxPointsPerSeries: input.maxPointsPerSeries,
  });
}

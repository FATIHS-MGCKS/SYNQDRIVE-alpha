import { PrismaClient } from '@prisma/client';
import {
  assertTransactionReadOnly,
  runF5NaturalCalibrationReport,
} from './f5-natural-calibration-report.service';
import { F5_PRIMARY_COHORT_V1 } from './f5-natural-calibration-report.constants';
import { F5ReportBoundExceededError } from './f5-natural-calibration-report.types';

const integrationEnabled = process.env.BATTERY_F5_NATURAL_CALIBRATION_REPORT_INTEGRATION === '1';

(integrationEnabled ? describe : describe.skip)('f5-natural-calibration-report postgres', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('enforces transaction_read_only inside report transaction', async () => {
    await prisma.$transaction(async (tx) => {
      await assertTransactionReadOnly(tx as never);
      const rows = await tx.$queryRaw<{ setting: string }[]>`SHOW transaction_read_only`;
      expect(rows[0]?.setting).toBe('on');
    });
  });

  it('produces deterministic report JSON excluding generatedAt', async () => {
    const asOf = new Date('2099-01-01T00:00:00.000Z');
    const fixedGenerated = '2099-01-01T00:00:00.000Z';
    const report = await runF5NaturalCalibrationReport(prisma, {
      asOf,
      cohort: F5_PRIMARY_COHORT_V1,
      maxRevisions: 500,
      timeoutMs: 30_000,
      generatedAt: fixedGenerated,
    });
    expect(report.meta.readOnly).toBe(true);
    expect(report.meta.reportContractVersion).toBe('M3_3F_F5_NATURAL_CALIBRATION_REPORT_V1');
    expect(report.safety.e3RuntimeCalls).toBe(0);
    expect(report.safety.customerEffect).toBe(false);
    expect(report.groundTruth.linkageAvailable).toBe(false);
    const { generatedAt: _g, ...metaRest } = report.meta;
    const stable = { ...report, meta: metaRest };
    const again = await runF5NaturalCalibrationReport(prisma, {
      asOf,
      cohort: F5_PRIMARY_COHORT_V1,
      maxRevisions: 500,
      timeoutMs: 30_000,
      generatedAt: fixedGenerated,
    });
    const { generatedAt: _g2, ...metaRest2 } = again.meta;
    expect(JSON.stringify({ ...again, meta: metaRest2 })).toBe(JSON.stringify(stable));
  });

  it('throws when revision count exceeds maxRevisions bound', async () => {
    const d3Total = await prisma.batteryLongitudinalProfileRevision.count();
    if (d3Total === 0) return;
    await expect(
      runF5NaturalCalibrationReport(prisma, {
        asOf: new Date('2099-01-01T00:00:00.000Z'),
        cohort: F5_PRIMARY_COHORT_V1,
        maxRevisions: Math.max(0, d3Total - 1),
        timeoutMs: 30_000,
        generatedAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(F5ReportBoundExceededError);
  });
});

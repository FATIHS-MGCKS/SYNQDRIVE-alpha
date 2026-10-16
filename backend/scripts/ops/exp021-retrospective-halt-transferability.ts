#!/usr/bin/env ts-node
/**
 * EXP021 v0_2 transferability — offline read-only DB, no provider fetches, no detector changes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { loadP21ForensicContextInReadOnlyTransaction } from '../../src/modules/vehicle-intelligence/driving-intelligence/trip-speed-quality/di-v0-p21-r3-forensic-loader';
import {
  TRANSFERABILITY_RUN_ID,
  analyzeTripWithFrozenV02,
  buildTransferabilitySummaryMarkdown,
  loadManifestBindings,
  teslaReferenceBinding,
} from './exp021-retrospective-halt-transferability.lib';
import { RETROSPECTIVE_HALT_PROTOTYPE_V2_VERSION } from './exp021-retrospective-halt-prototype-v2.lib';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <directory>');
  return path.resolve(argv[i + 1]);
}

function sha256File(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '../../..');
  const observedAtUtc = new Date().toISOString();
  fs.mkdirSync(outDir, { recursive: true });

  const bindings = [teslaReferenceBinding(), ...loadManifestBindings(repoRoot)];
  const prisma = new PrismaClient();
  const reports: ReturnType<typeof analyzeTripWithFrozenV02>[] = [];

  try {
    for (const binding of bindings) {
      const ctx = await loadP21ForensicContextInReadOnlyTransaction(prisma, {
        organizationId: process.env.EXP021_P21_ORG_ID ?? ORG,
        tripId: binding.tripId,
        workItemId: binding.workItemId,
      });
      reports.push(analyzeTripWithFrozenV02(ctx, binding));
    }
  } finally {
    await prisma.$disconnect();
  }

  const byFamily = {
    TESLA_SOFTWARE_DIMO: reports.filter((r) => r.integrationFamily === 'TESLA_SOFTWARE_DIMO'),
    RUPTELA_LTE_R1: reports.filter((r) => r.integrationFamily === 'RUPTELA_LTE_R1'),
    OTHER_LTE_R1: reports.filter((r) => r.integrationFamily === 'OTHER_LTE_R1'),
  };

  const payload = {
    runId: TRANSFERABILITY_RUN_ID,
    observedAtUtc,
    detectorVersion: RETROSPECTIVE_HALT_PROTOTYPE_V2_VERSION,
    policy: {
      productionMutations: 'NONE',
      providerFetches: 'NONE',
      detectorRecalibration: 'NONE',
      hitRateClaimsWithoutVideo: 'FORBIDDEN',
    },
    tripCount: reports.length,
    reports,
    byIntegrationFamily: {
      TESLA_SOFTWARE_DIMO: {
        tripIds: byFamily.TESLA_SOFTWARE_DIMO.map((r) => r.binding.tripId),
        gapEventCount: byFamily.TESLA_SOFTWARE_DIMO.reduce((a, r) => a + r.gapEvents.length, 0),
      },
      RUPTELA_LTE_R1: {
        tripIds: byFamily.RUPTELA_LTE_R1.map((r) => r.binding.tripId),
        gapEventCount: byFamily.RUPTELA_LTE_R1.reduce((a, r) => a + r.gapEvents.length, 0),
      },
      OTHER_LTE_R1: {
        tripIds: byFamily.OTHER_LTE_R1.map((r) => r.binding.tripId),
        gapEventCount: byFamily.OTHER_LTE_R1.reduce((a, r) => a + r.gapEvents.length, 0),
      },
    },
    codeHashes: {
      'exp021-retrospective-halt-prototype-v2.lib.ts': sha256File(
        path.join(__dirname, 'exp021-retrospective-halt-prototype-v2.lib.ts'),
      ),
      'exp021-retrospective-halt-transferability.lib.ts': sha256File(
        path.join(__dirname, 'exp021-retrospective-halt-transferability.lib.ts'),
      ),
    },
  };

  fs.writeFileSync(path.join(outDir, 'TRANSFERABILITY_REPORT.json'), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(outDir, 'TRANSFERABILITY_SUMMARY.md'), buildTransferabilitySummaryMarkdown(reports));
  fs.writeFileSync(
    path.join(outDir, 'PER_TRIP_GAP_EVENTS.json'),
    JSON.stringify(
      reports.map((r) => ({
        tripId: r.binding.tripId,
        integrationFamily: r.integrationFamily,
        independentVideoGroundTruth: r.binding.independentVideoGroundTruth,
        dataCoverage: r.dataCoverage,
        classificationHistogram: r.classificationHistogram,
        gapEvents: r.gapEvents,
        tripLevelNotes: r.tripLevelNotes,
      })),
      null,
      2,
    ),
  );

  console.log(`Wrote ${outDir} (${reports.length} trips)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env npx ts-node
/**
 * DS4 Layer-2 historical export (P1) — read-only persisted assessments.
 * SAFETY: read-only DB; writes export artifacts to --out-dir only.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { DS4_LAYER2_HISTORICAL_EXPORT_RECONSTRUCTION_MODE_V1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-historical-export.v1.contract';
import {
  buildDs4Layer2HistoricalExportArtifactsV1,
  defaultCollectionCutoffUtcForExportV1,
} from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-historical-export.v1';
import { loadPersistedDs4Layer2HistoricalExportRowsV1 } from '../../src/modules/vehicle-intelligence/driving-intelligence/ds4-assessment/export/ds4-layer2-historical-export.loader.v1';

const DEFAULT_DEPLOY_SHA = '7ab55a0d22223ad9de5bc6691b726e169d377517';

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

async function main(): Promise<void> {
  const organizationId = parseArg('--organization-id');
  const outDir = parseArg('--out-dir');
  const deploySha = parseArg('--deploy-sha') ?? DEFAULT_DEPLOY_SHA;
  const collectionCutoff = parseArg('--collection-cutoff-utc') ?? defaultCollectionCutoffUtcForExportV1();

  if (!organizationId) {
    throw new Error('--organization-id is required');
  }
  if (!outDir) {
    throw new Error('--out-dir is required');
  }

  const prisma = new PrismaClient();
  try {
    const rows = await loadPersistedDs4Layer2HistoricalExportRowsV1(prisma, organizationId);
    const exportedAt = new Date();
    const artifacts = buildDs4Layer2HistoricalExportArtifactsV1({
      organizationId,
      deploySha,
      exportedAt,
      collectionCutoffUtc: collectionCutoff,
      sourceCollection: {
        table: 'di_v0_ds4_trip_assessment_v1',
        organizationScope: organizationId,
        reconstructionMode: DS4_LAYER2_HISTORICAL_EXPORT_RECONSTRUCTION_MODE_V1,
      },
      rows,
    });

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(artifacts.manifest, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(outDir, 'assessments.csv'), artifacts.assessmentsCsv, 'utf8');
    fs.writeFileSync(path.join(outDir, 'longitudinal_events.csv'), artifacts.longitudinalEventsCsv, 'utf8');
    fs.writeFileSync(path.join(outDir, 'exclusions.csv'), artifacts.exclusionsCsv, 'utf8');
    fs.writeFileSync(
      path.join(outDir, 'coverage_summary.json'),
      `${JSON.stringify(artifacts.coverageSummary, null, 2)}\n`,
      'utf8',
    );

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          organizationId,
          deploySha,
          assessmentRows: rows.length,
          distinctTrips: new Set(rows.map((r) => r.tripId)).size,
          outDir,
          fileChecksumsSha256: artifacts.fileChecksums,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

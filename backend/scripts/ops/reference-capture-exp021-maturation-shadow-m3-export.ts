#!/usr/bin/env ts-node
/**
 * Read-only EXP-021 Live Maturation Shadow PR-M3 observational export.
 * Requires explicit organizationId + vehicleId scope — no implicit full-history export.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { analyzeExp021MaturationShadowM3 } from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-m3-analyzer.lib';
import {
  serializeM3AnalysisJson,
  serializeM3PairedGeometryCsv,
  serializeM3TransitionsCsv,
} from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-m3-export.lib';
import { loadExp021MaturationShadowFamiliesForM3 } from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-maturation-shadow-m3.repository';

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main(): Promise<void> {
  const organizationId = parseArg('organizationId');
  const vehicleId = parseArg('vehicleId');
  const outputDir = parseArg('outputDir') ?? join(process.cwd(), 'tmp', 'exp021-maturation-shadow-m3');

  if (!organizationId || !vehicleId) {
    console.error('Usage: npm run exp021:maturation-shadow:m3:export -- --organizationId=<uuid> --vehicleId=<uuid> [--outputDir=path]');
    process.exit(1);
  }

  const scope = {
    organizationId,
    vehicleId,
    tokenId: parseArg('tokenId') ? Number(parseArg('tokenId')) : undefined,
    windowFamilyId: parseArg('windowFamilyId'),
    signalLane: parseArg('signalLane') as 'HF_FAST_LOOP' | 'SETTLEMENT_SHADOW' | undefined,
    queryGeometryMs: parseArg('queryGeometryMs') ? Number(parseArg('queryGeometryMs')) as 60_000 | 90_000 : undefined,
    activityClass: parseArg('activityClass') as 'ACTIVE_MOTION' | 'ACTIVE_IDLE' | 'UNKNOWN_ACTIVITY' | undefined,
  };

  const prisma = new PrismaClient();
  try {
    const families = await loadExp021MaturationShadowFamiliesForM3(prisma, scope);
    const analysis = analyzeExp021MaturationShadowM3({ families, scope });
    const deterministicGeneratedAt = '1970-01-01T00:00:00.000Z';

    mkdirSync(outputDir, { recursive: true });
    writeFileSync(join(outputDir, 'exp021-maturation-shadow-m3.json'), serializeM3AnalysisJson(analysis, { deterministicGeneratedAt }));
    writeFileSync(join(outputDir, 'exp021-maturation-shadow-m3-transitions.csv'), serializeM3TransitionsCsv(analysis));
    writeFileSync(join(outputDir, 'exp021-maturation-shadow-m3-paired-geometry.csv'), serializeM3PairedGeometryCsv(analysis));

    console.log(
      JSON.stringify(
        {
          exportSchemaVersion: analysis.exportSchemaVersion,
          outputDir,
          nWindowFamilies: analysis.aggregateCounts.nWindowFamilies,
          nStrata: analysis.aggregateCounts.nStrata,
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
  console.error(error);
  process.exit(1);
});

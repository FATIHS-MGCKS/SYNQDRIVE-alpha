#!/usr/bin/env node
/**
 * R1 read-only repository inventory generator for DIMO Integration authority.
 * Usage: node architecture/dimo-integration/scripts/r1-generate-inventory.mjs
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT_DIR = path.join(ROOT, 'architecture/dimo-integration/evidence');
const sha = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();

function rgFiles(pattern, glob) {
  try {
    const cmd = `rg -l ${JSON.stringify(pattern)} ${ROOT} --glob '${glob}' --glob '!node_modules' --glob '!.git' 2>/dev/null || true`;
    const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((p) => path.relative(ROOT, p));
  } catch {
    return [];
  }
}

const dimoModuleTs = rgFiles('.', 'backend/src/modules/dimo/**/*.ts');
const dimoNamedFiles = execSync(
  `find ${ROOT} -type f \\( -iname '*dimo*' -o -iname '*Dimo*' \\) ! -path '*/node_modules/*' ! -path '*/.git/*' 2>/dev/null | wc -l`,
  { encoding: 'utf8' },
).trim();

const queryBuilders = dimoModuleTs.filter((f) => f.includes('/queries/') && f.endsWith('.query.ts'));
const graphqlRoots = [
  'signalsLatest',
  'signals(',
  'segments(',
  'events(',
  'availableSignals',
  'dataSummary',
  'identity',
];

const rootHits = {};
for (const root of graphqlRoots) {
  rootHits[root] = rgFiles(root, 'backend/**/*.ts').length;
}

const symbols = {
  getVehicleJwt: rgFiles('getVehicleJwt', 'backend/**/*.ts').length,
  DimoTriggersService: rgFiles('DimoTriggersService', 'backend/**/*.ts').length,
  DimoWebhookController: rgFiles('DimoWebhookController', 'backend/**/*.ts').length,
  SnapshotWakeIntakeService: rgFiles('SnapshotWakeIntakeService', 'backend/**/*.ts').length,
  DimoSnapshotScheduler: rgFiles('DimoSnapshotScheduler', 'backend/**/*.ts').length,
  DimoSnapshotProcessor: rgFiles('DimoSnapshotProcessor', 'backend/**/*.ts').length,
};

const inventory = {
  generatedAt: new Date().toISOString(),
  auditHeadSha: sha,
  counts: {
    dimoModuleTypeScriptFiles: dimoModuleTs.length,
    filenameContainsDimo: Number(dimoNamedFiles),
    rgFilesMentioningDimo: rgFiles('dimo|Dimo|DIMO', '*.{ts,tsx,mjs,md,prisma}').length,
    queryBuilderFiles: queryBuilders.length,
  },
  queryBuilderPaths: queryBuilders.sort(),
  graphqlRootReferenceFileCounts: rootHits,
  symbolReferenceFileCounts: symbols,
  entryPoints: [
    'backend/src/modules/dimo/dimo.module.ts',
    'backend/src/modules/dimo/dimo.controller.ts',
    'backend/src/modules/dimo/dimo-webhook.controller.ts',
    'backend/src/workers/schedulers/dimo-snapshot.scheduler.ts',
    'backend/src/workers/processors/dimo-snapshot.processor.ts',
  ],
};

fs.mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, 'R1_REPOSITORY_INVENTORY.json');
fs.writeFileSync(outPath, JSON.stringify(inventory, null, 2) + '\n');
console.log(`Wrote ${path.relative(ROOT, outPath)}`);

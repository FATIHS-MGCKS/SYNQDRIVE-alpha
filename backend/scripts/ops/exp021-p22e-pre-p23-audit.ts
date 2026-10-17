#!/usr/bin/env ts-node
/**
 * EXP021 P22E — Pre-P23 coverage & motion evidence optimization audit (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  buildP22ECompletionLines,
  buildP22EFCompletionLines,
  buildP22EPayload,
  loadFrozenReplay,
  renderOptimizationMd,
  renderPreP23DecisionMd,
  renderP23FieldCaptureReadinessMd,
  renderSlowRollAuditMd,
  buildSlowRollStatePayload,
  loadVideoComparison,
} from './exp021-p22e-pre-p23-audit.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <dir> [--pr 2051]');
  return path.resolve(argv[i + 1]);
}

function parsePr(argv: string[]): number {
  const i = argv.indexOf('--pr');
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : 2051;
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const pr = parsePr(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const payload = buildP22EPayload(repoRoot, headSha, pr);
  const completionLines = buildP22ECompletionLines(payload);

  const rows = loadFrozenReplay(repoRoot);
  const slowRollPayload = buildSlowRollStatePayload(repoRoot, rows, loadVideoComparison(repoRoot));

  fs.writeFileSync(
    path.join(outDir, 'P22E_COVERAGE_RECOVERY_MATRIX.json'),
    JSON.stringify(payload.coverageMatrix, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, 'P22E_TRIP_BOUNDARY_SCENARIOS.json'),
    JSON.stringify(payload.tripBoundaryScenarios, null, 2),
  );
  fs.writeFileSync(path.join(outDir, 'P22E_SLOW_ROLL_STATE_AUDIT.md'), renderSlowRollAuditMd(slowRollPayload));
  fs.writeFileSync(path.join(outDir, 'P22E_OPTIMIZATION_PRIORITIES.md'), renderOptimizationMd(payload.optimizationPriorities));
  fs.writeFileSync(path.join(outDir, 'P22E_PRE_P23_DECISION.md'), renderPreP23DecisionMd());
  fs.writeFileSync(path.join(outDir, 'P22E_FULL_AUDIT.json'), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(outDir, 'P22E_RESULT.txt'), completionLines.join('\n') + '\n');
  fs.writeFileSync(path.join(outDir, 'P22E_F_RESULT.txt'), buildP22EFCompletionLines(payload).join('\n') + '\n');
  fs.writeFileSync(path.join(outDir, 'P23_FIELD_CAPTURE_READINESS.md'), renderP23FieldCaptureReadinessMd());

  console.log(
    JSON.stringify(
      {
        ok: payload.baselineParity.ok,
        p22eResult: payload.p22eResult,
        realNumericRecoverySeconds: payload.coverageMatrix.realNumericRecoverySeconds,
        outDir,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

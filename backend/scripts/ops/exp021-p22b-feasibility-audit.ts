#!/usr/bin/env ts-node
/**
 * EXP021 P22B — emit recovery feasibility artifacts (read-only).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { buildP22BPayload, loadRd003Clips } from './exp021-p22b-feasibility-audit.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <dir> [--pr 2051]');
  return path.resolve(argv[i + 1]);
}

function parsePr(argv: string[]): number {
  const i = argv.indexOf('--pr');
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : 2051;
}

function renderRd003InventoryMd(rd003: ReturnType<typeof loadRd003Clips>): string {
  const lines = [
    '# P22B — RD003 clip inventory (nine clips)',
    '',
    `**Session:** \`${rd003.sessionId}\` · **Vehicle:** \`${rd003.vehicleId}\` · **SynqDrive trip_id:** none in capture authority`,
    `**GT ingestion:** ${rd003.ingestionAuthority} · **GROUND_TRUTH_VALIDATED:** NO`,
    '',
    'Original `IMG_28xx.mp4` files are **not** stored in this git repository (metadata + sparse labels only).',
    '',
    '| Clip | File | Dur (s) | Neg ctrl | Video clock (display) | Candidate UTC start | ±s | Speed samples | 0 km/h labels | Min–Max km/h | Alignment | Match cov | Summary |',
    '|------|------|--------:|----------|----------------------|---------------------|---:|--------------:|--------------:|-------------|-----------|----------:|---------|',
  ];
  for (const c of rd003.clips) {
    lines.push(
      `| ${c.clipId} | ${c.fileName} | ${c.videoDurationSeconds} | ${c.negativeControl ? 'yes' : 'no'} | ${c.videoClockDisplayed ?? '—'} | ${c.candidateStartUtc ?? '—'} | ${c.candidateUtcUncertaintySeconds ?? '—'} | ${c.speedSampleCount} | ${c.tachoZeroLabeledSeconds} | ${c.speedMinKmh ?? '—'}–${c.speedMaxKmh ?? '—'} | ${c.alignmentStatus ?? '—'} | ${c.matchCoverageRatio != null ? (c.matchCoverageRatio * 100).toFixed(0) + '%' : '—'} | ${c.behavioralSummary.slice(0, 48)}… |`,
    );
  }
  lines.push(
    '',
    '**Observation provenance:** each speed point = `EXTERNAL_MANUAL_FRAME_REVIEW_CHATGPT_2026_09_03` at integer `videoTimeSeconds` (not full frame rate).',
    '',
  );
  return lines.join('\n');
}

function renderFeasibilityMd(payload: ReturnType<typeof buildP22BPayload>): string {
  return `# EXP021 P22B — Ground Truth Recovery & Feasibility

**PR #${payload.prNumber}** · **HEAD** \`${payload.headSha}\`  
**Result:** \`${payload.p22bResult}\`

## Trip binding (RD003)

- **SynqDrive trip_id:** none documented (reference-capture **session** \`${payload.rd003.sessionId}\`).
- **Vehicle:** Tiguan \`${payload.rd003.vehicleId}\` (LTE_R1).
- **Unique UTC trip window:** not validated globally (\`GROUND_TRUTH_VALIDATED=NO\`, multi-clock PENDING).

## RD003 vs v0_2 independence

- **v0_2 code path:** ${payload.rd003.independence.usedInRetrospectiveHaltV02Code ? 'USED' : '**NOT USED**'} for parameter selection.
- **EXP021 halt prototype:** Tesla reference = development; RD003 = separate lineage (inventory only in P22A).

## RD004 video ground truth

- **Halt/stop GT for v0_2:** **NO** (\`STOP_TIMING_VALIDATED=NO\`).
- **Late-bucket / watermark:** telemetry capture diagnostics — **not** movement ground truth.

## Recovery matrix

| Case | Class |
|------|--------|
${payload.recoveryMatrix.map((m) => `| ${m.caseType} | **${m.recoveryClass}** |`).join('\n')}

## Independent validation without new video?

**${payload.independentValidationPossibleNow ? 'YES' : 'NO'}** — no trip-aligned P21 pin + validated per-second labels for all five cases.

## v0_2

Parameter hash \`${payload.v0_2.parameterSnapshotHash}\` — unchanged.

## Next safe action

${payload.nextSafeAction}
`;
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const pr = parsePr(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const payload = buildP22BPayload(repoRoot, headSha, pr);
  const rd003 = loadRd003Clips(repoRoot);

  fs.writeFileSync(path.join(outDir, 'P22B_RECOVERY_FEASIBILITY.json'), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(outDir, 'P22B_RD003_CLIP_INVENTORY.md'), renderRd003InventoryMd(rd003));
  fs.writeFileSync(path.join(outDir, 'P22B_FEASIBILITY_REPORT.md'), renderFeasibilityMd(payload));
  fs.writeFileSync(
    path.join(outDir, 'P22B_CAPTURE_PROTOCOLS.md'),
    `# P22B — Minimum capture protocols (independent validation)

Safety: no dangerous maneuvers; camera mounted and started **before** driving; no operation while vehicle is moving.

${payload.minimumNewCapturePlan.cases.map((c) => `## ${c.caseType}\n\n${c.protocol}\n`).join('\n')}`,
  );

  console.log(JSON.stringify({ ok: true, p22bResult: payload.p22bResult, outDir }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

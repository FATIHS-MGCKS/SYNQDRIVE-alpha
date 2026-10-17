#!/usr/bin/env ts-node
/**
 * EXP021 P22A — emit evidence audit artifacts (read-only).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { buildP22AValidationPayload, buildVideoAnchorInventory } from './exp021-p22a-evidence-audit.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    throw new Error('usage: --out-dir <directory> [--pr 2051]');
  }
  return path.resolve(argv[i + 1]);
}

function parsePr(argv: string[]): number {
  const i = argv.indexOf('--pr');
  if (i < 0 || !argv[i + 1]) return 2051;
  return Number(argv[i + 1]);
}

function headSha(repoRoot: string): string {
  return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function renderInventoryMd(anchors: ReturnType<typeof buildVideoAnchorInventory>): string {
  const lines = [
    '# EXP021 P22A — Video Evidence Inventory',
    '',
    '**Purpose:** Independent halt validation anchors — no synthetic labels; UNKNOWN seconds stay UNKNOWN.',
    '',
    '| Case type | Anchor ID | Partition | Trip | UTC window | Video | Coverage | Quality |',
    '|-----------|-----------|-----------|------|------------|-------|----------|---------|',
  ];
  for (const a of anchors) {
    const utc = `${a.utcWindow.from ?? '—'} → ${a.utcWindow.to ?? '—'}`;
    lines.push(
      `| ${a.caseType} | ${a.anchorId} | ${a.datasetPartition} | ${a.tripId ?? '—'} | ${utc} | ${a.videoSource} | ${a.labelCoverage} | ${a.independentEvidenceQuality} |`,
    );
  }
  lines.push('', '## Leakage', '', '- Tesla EV-GT = **development** only.', '- RD003/RD004 = **candidates**, not validated independent halt GT for v0_2 replay.', '');
  return lines.join('\n');
}

function renderGateReport(payload: ReturnType<typeof buildP22AValidationPayload>): string {
  return `# EXP021 P22A — Gate Report

**Result:** \`${payload.p22aResult}\`  
**PR:** #${payload.prNumber} · **HEAD:** \`${payload.headSha}\`  
**v0_2 parameter hash unchanged:** ${payload.v0_2.parameterSnapshotHashVerifiedUnchanged ? 'YES' : 'NO'} (\`${payload.v0_2.parameterSnapshotHash}\`)

## Verdict

Independent per-case halt validation **cannot** be closed on available evidence. RD003/RD004 provide sparse or alignment-focused material without trip-bound P21 replay labels. Tesla kompakt review is development/leakage-contaminated per \`evaluation-protocol.json\`.

## Transferability

Offline v0_2 on ${payload.transferability.offlineTripCount} pinned trips: **${payload.transferability.verdict}** — no hit-rate claim.

## Production

\`${payload.productionMutations}\` · no deploy · no merge required by this audit.

## Next safe action

${payload.nextSafeAction}
`;
}

function renderFailureAnalysis(payload: ReturnType<typeof buildP22AValidationPayload>): string {
  const d = payload.developmentDiagnostics;
  return `# EXP021 P22A — Failure Analysis

**Scope:** Evidence audit only — **no** independent false-positive/false-negative rates.

## Error classes (from development + transferability signals)

| Failure mode | Example signal | Solvable with better evidence? | Needs detector logic change? |
|--------------|----------------|-------------------------------|------------------------------|
| False halt at slow movement | Transferability \`HALT_BUT_BOTH_GAP_EDGE_LEGS_MOVING\` flags on Ruptela trips | Partially — denser position + speed witness | Possibly — edge-leg semantics frozen in v0_2 |
| False movement at true standstill | Tesla ROW_ABSENT during video tacho-0 (stationary evidence surface) | **Yes** — independent video + aligned position pin | Prototype gap semantics; product path separate |
| GPS jitter / hold noise | Small chord + scatter geometry class | **Yes** — higher-rate GNSS or fused speed | Calibration bundle review (out of P22A tuning) |
| Position gaps | 37–100 % present across manifest trips | **Yes** — provider/uplink forensics | Gap detector unchanged; interpretation only |
| Back-and-forth / maneuver | E01 reverse departure; RD003 clip 9 | **Yes** — maneuver-specific video GT | v0_2 chord model blind to path length |
| Video vs telemetry time skew | Kompakt: no sub-second absolute offset; RD003 ±30s | **Yes** — clock calibration protocol | No — alignment layer |
| Video tacho vs GPS speed | iPhone overlay holds 11.7/21.2 at tacho 0 | **Yes** — do not use overlay as GT | N/A |

## Development-only halt diagnostics (not P22A metrics)

- \`${d.likelyHaltWithoutVideoTachoInGap.join(', ')}\`: LIKELY_HALT without decisive video in gap window.
- Video-supported LIKELY_HALT: ${d.videoSupportedLikelyHalt.join(', ')}.
- Not decisive: ${d.videoNotDecisiveLikelyHalt.join(', ')}.
- Natural-gap counters: ${JSON.stringify(d.falseHaltSignalsNaturalGaps)}.

## Remaining evidence gaps

1. Zero **independent** trips with P21 pin + per-second video labels for all five case types.  
2. RD003 lacks validated telemetry↔video chronology for halt windows.  
3. RD004 documents timing gaps, not halt ontology.  
4. No blind holdout drive post-freeze.
`;
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const pr = parsePr(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '../../..');
  fs.mkdirSync(outDir, { recursive: true });

  const payload = buildP22AValidationPayload(repoRoot, headSha(repoRoot), pr);
  const anchors = buildVideoAnchorInventory(repoRoot);

  fs.writeFileSync(path.join(outDir, 'P22A_INDEPENDENT_VALIDATION.json'), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(outDir, 'P22A_VIDEO_EVIDENCE_INVENTORY.md'), renderInventoryMd(anchors));
  fs.writeFileSync(path.join(outDir, 'P22A_FAILURE_ANALYSIS.md'), renderFailureAnalysis(payload));
  fs.writeFileSync(path.join(outDir, 'P22A_GATE_REPORT.md'), renderGateReport(payload));

  console.log(JSON.stringify({ ok: true, p22aResult: payload.p22aResult, outDir }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

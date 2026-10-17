#!/usr/bin/env ts-node
/**
 * LDI-02 — Ruptela fusion feasibility document generator (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  buildFusionEvidenceMatrix,
  buildLdi02FusionCompletionLines,
  buildTemporalExamples,
} from './ldi02-fusion-feasibility.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-02');
  }
  return path.resolve(argv[i + 1]);
}

function renderMd(repoRoot: string, headSha: string): string {
  const matrix = buildFusionEvidenceMatrix();
  const examples = buildTemporalExamples(repoRoot);

  const matrixTable = [
    '| Dimension | GPS-L3/QC | R1 OBD | HF 1 Hz | Native behavior | Path A (Tesla) | Path B (Ruptela) |',
    '|-----------|-----------|--------|---------|-----------------|----------------|------------------|',
    ...matrix.map(
      (r) =>
        `| ${r.dimension} | ${r.gpsL3Qc} | ${r.r1Obd} | ${r.hf1Hz} | ${r.nativeBehavior} | ${r.teslaPathA} | ${r.ruptelaPathB} |`,
    ),
  ].join('\n');

  return [
    '# LDI02 — Ruptela Multi-Signal Fusion Feasibility (GPS-L3-First)',
    '',
    `**HEAD:** \`${headSha}\` · **Mode:** read-only architecture amendment · **No production changes**`,
    '',
    '## Owner rules (LDI-02)',
    '',
    '### Path A — Software-only / Tesla',
    '',
    '- **GPS-L3/QC** remains primary motion reference.',
    '- Additional HF/EV signals only if availability, cadence, and quality are **proven** per trip pin.',
    '- **No** assumed OBD or pedal signals.',
    '',
    '### Path B — Ruptela R1',
    '',
    'Evaluate **together** (not HF-only or native-only):',
    '',
    '1. GPS-L3/QC reconstruction',
    '2. Ruptela native `behavior.*` events',
    '3. R1 OBD five-field subset',
    '4. R1 1 Hz HF stream',
    '',
    'GPS-L3 is the **primary reference candidate** — not a mandate to ignore better-resolved evidence when pinned.',
    '',
    '## Epistemic output classes',
    '',
    '| Class | Use |',
    '|-------|-----|',
    '| `ACCELERATION_OBSERVED` | Trusted L3 Δv/Δt or corroborated HF segment |',
    '| `DECELERATION_OBSERVED` | Same |',
    '| `BRAKE_ACTUATION_CONFIRMED` | Requires pedal/switch — **unsupported** in current pins |',
    '| `NATIVE_BRAKING_EVENT_REPORTED` | DIMO `behavior.harsh*` / `extreme*` — **not** physical GT |',
    '| `REGEN_CONFIRMED` | HF positive traction power while moving — **not** SOC/GPS decel alone |',
    '| `UNKNOWN` | Gaps, conflict, or sparse OBD |',
    '',
    '## Evidence matrix',
    '',
    matrixTable,
    '',
    '### Code paths (fusion-related)',
    '',
    ...matrix.flatMap((r) => r.codeOrEvidence.map((c) => `- \`${c}\` (${r.dimension})`)),
    '',
    '## Temporal examples (repository evidence)',
    '',
    '### Synthetic QC corroboration (unit contract)',
    '',
    '```json',
    JSON.stringify(examples.syntheticQcIllustration, null, 2),
    '```',
    '',
    '### Ruptela `f502a4a0…` (transferability export)',
    '',
    '```json',
    JSON.stringify(examples.ruptelaTripF502a4a0, null, 2),
    '```',
    '',
    '### Ruptela `24deb8af…` (sparse POSITION)',
    '',
    '```json',
    JSON.stringify(examples.ruptelaTrip24deb8af, null, 2),
    '```',
    '',
    '### Tesla Path A (`186946` / EXP021 pin)',
    '',
    '```json',
    JSON.stringify(examples.teslaPathA186946, null, 2),
    '```',
    '',
    '## Dynamic source prioritization (recommendation — design only)',
    '',
    '1. **Tier 0 — Kinematic truth surface:** `TRUSTED` / `TRUSTED_LIMITED` L3/QC per bucket (no interpolation across `ROW_ABSENT`).',
    '2. **Tier 1 — Corroboration:** R1 OBD speed at same calendar label **only if** `r1CorroboratesL3` and not `R1_INTERVAL_ONLY`.',
    '3. **Tier 2 — HF kinematics:** `hf-acceleration` / `hf-braking` on clean HF runs; label `ACCELERATION_OBSERVED` / `DECELERATION_OBSERVED`; downgrade when cadence gaps >5s.',
    '4. **Tier 3 — Native provider:** Map to `NATIVE_BRAKING_EVENT_REPORTED` / harsh accel analog; **max claim L1**; dedupe against Tier 2 within ±2s.',
    '5. **Tier 4 — Regen:** `REGEN_CONFIRMED` only when HF `tractionBatteryPowerKw` integrated per `hf-recuperation.ts` rules; else `UNKNOWN`.',
    '6. **Conflict rule:** If R1 disagrees beyond `r1Disagrees` threshold or `CONFLICT_EXPLAINED` relation → withhold numeric promotion; do not auto-pick HF.',
    '7. **Double-count guard:** One physical maneuver → at most one kinematic event + optional native report flag (metadata), not duplicate stress counters.',
    '',
    '## Path A vs B summary',
    '',
    '| | Tesla software | Ruptela R1 |',
    '|---|----------------|------------|',
    '| Primary | L3/QC POSITION pin | L3/QC + mandatory multi-stream review |',
    '| Native events | Off on EXP021 pin | Ingested (`lte-r1-behavior-enrichment`) |',
    '| OBD | N/A | Sparse vs shadow — fusion required |',
    '| Regen | Prove HF power first | Same |',
    '',
    '## Explicit non-goals (LDI-02)',
    '',
    '- No new production fusion worker',
    '- No harsh threshold tuning',
    '- No provider API calls in this document run',
    '',
  ].join('\n');
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const payload = {
    schema: 'LDI02_GPS_L3_FIRST_FUSION_V1',
    headSha,
    matrix: buildFusionEvidenceMatrix(),
    temporalExamples: buildTemporalExamples(repoRoot),
    completion: buildLdi02FusionCompletionLines(),
  };

  fs.writeFileSync(path.join(outDir, 'LDI02_RUPTELA_FUSION_FEASIBILITY.md'), renderMd(repoRoot, headSha));
  fs.writeFileSync(path.join(outDir, 'LDI02_FUSION_AUDIT.json'), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(outDir, 'LDI02_FUSION_RESULT.txt'), payload.completion.join('\n') + '\n');

  console.log(JSON.stringify({ ok: true, outDir, headSha }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

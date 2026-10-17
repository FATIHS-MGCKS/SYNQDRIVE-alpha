#!/usr/bin/env ts-node
/**
 * LDI-01 — Longitudinal Driving Intelligence discovery (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  buildLdi01CompletionLines,
  buildLdi01Payload,
  buildSignalCapabilityMatrix,
  analyzeVideoLongitudinalWindows,
} from './ldi01-discovery-audit.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) throw new Error('usage: --out-dir <dir>');
  return path.resolve(argv[i + 1]);
}

function renderArchitectureAuditMd(repoRoot: string): string {
  return [
    '# LDI01 — Architecture Audit (Existing Longitudinal Logic)',
    '',
    '**Scope:** Read-only code + artifact review. Separate from EXP021 v0_2 halt workstream.',
    '',
    '## GPS speed reconstruction',
    '',
    '| Layer | Path | Production active? |',
    '|-------|------|------------------|',
    '| **L3 (DI V0 core)** | `backend/src/modules/vehicle-intelligence/driving-intelligence/core/` | Library + shadow/S4 replay paths; not customer-facing alone |',
    '| **L3 + QC V2** | `trip-speed-quality/`, `speed-qc/di-v0-speed-qc-*.ts` | Pinned in EXP021 pre-deploy replay (`775/1136` trusted numeric) |',
    '| **Legacy HF speed** | `DimoSegmentsService.fetchHighFrequency()` → `hf-preprocessing.ts` | **Yes** — post-trip behavior enrichment |',
    '',
    '## L3/QC V1 vs V2',
    '',
    '- **QC policy:** `DI_V0_SPEED_QC_POLICY_V2` on EXP021 Tesla pin (`pre-deploy/PRE_DEPLOY_BASELINE_MANIFEST.json`).',
    '- **Motion states:** `STATIONARY_SUPPORTED`, `TRANSITION_UNCERTAIN`, `NO_MOTION_EVIDENCE` — see `di-v0-p21-r3-forensic-classify.ts`.',
    '- **Product read / admission:** gated (`ADMISSION_RECORD_MISSING` on pin) — forensic replay still valid.',
    '',
    '## EXP021 video ground truth',
    '',
    '- Tesla: `external-video-review-kompakt-2026-10-16/` — **development reference only** (6 clips).',
    '- RD003: sparse speed labels; UTC blocked (P22D). Not used as detector input.',
    '',
    '## Acceleration / braking (production)',
    '',
    '| Component | File | Role |',
    '|-----------|------|------|',
    '| HF acceleration detector | `trips/hf-acceleration.ts` | Point-pair kinematics on 1s HF; LIGHT–EXTREME |',
    '| HF braking detector | `trips/hf-braking.ts` | Same; intensity score |',
    '| Behavior enrichment worker | `trip-behavior-enrichment.processor.ts` | Queues HF fetch + detectors |',
    '| LTE R1 native events | `lte-r1-behavior-enrichment.service.ts` + `driving-events.query.ts` | `behavior.harsh*` events |',
    '| Driving impact | `driving-impact-braking-provenance.ts` | End-speed provenance (measured vs proxy) |',
    '| Brake health | `brakes/brake-health.service.ts` | Harsh brake wear multipliers (not longitudinal physics) |',
    '',
    '## DIMO mappings',
    '',
    '- Segments + HF: `backend/src/modules/dimo/dimo-segments.service.ts`',
    '- Driving events GraphQL: `backend/src/modules/dimo/queries/driving-events.query.ts`',
    '- Battery / traction power: `dimo-battery-signal.mapper.ts` (W→kW convention documented in Prisma comments)',
    '',
    '## Tesla software integration (token 186946)',
    '',
    '- Source family: **API_SYNTHETIC** (DIMO software integration).',
    '- Frozen EXP021 S4 pin: **POSITION only**; R1 OBD **NOT_APPLICABLE**; native events **DISABLED**.',
    '',
    '## Ruptela R1',
    '',
    '- DI V0 R1 OBD query **V0_3**: speed, rpm, throttle, engine load, ECT (`r1-obd-acquisition/`).',
    '- Production behavior events via LTE_R1 path (see `CURRENT_STATE.md`).',
    '',
    '## HV battery / EED',
    '',
    '- **HF recuperation summary:** `trips/hf-recuperation.ts` + `trip-behavior-enrichment.service.ts` (positive kW × time while speed ≥8 km/h).',
    '- **EED:** `vehicle-intelligence/energy-events/` + DIMO `segments(mechanism: refuel|recharge)` — fuel/charge episodes, **not** on-road regen attribution.',
    '',
    '## Driving Intelligence V2',
    '',
    '- Flag `DRIVING_INTELLIGENCE_V2_ENABLED` — code default false; production may be true (`CURRENT_STATE.md`).',
    '- **LDI-01 does not activate or extend V2.** Design notes on regen ambiguity: `driving-intelligence-v2-canonical-design.ts`.',
    '',
    '## DI V0 S4 / shadow',
    '',
    '- Position acquisition + R1 adapters are **dormant libraries**; S4 execution not authorized for new product logic in this task.',
    '',
  ].join('\n');
}

function renderAccelBrakeFeasibilityMd(p: ReturnType<typeof buildLdi01Payload>): string {
  return [
    '# LDI01 — Acceleration & Braking Feasibility (Offline)',
    '',
    '## What can be reconstructed from frozen L3/QC (Tesla pin)?',
    '',
    `- **Trusted numeric coverage:** ${p.baselineInvariantsFromExp021.trustedNumeric} — only these seconds support stable Δv/Δt on bucket grid.`,
    `- **ROW_ABSENT:** ${p.baselineInvariantsFromExp021.rowAbsent} — **no interpolation** across gaps.`,
    `- **Abstention / transition:** 45 PRESENT+NO_MOTION, 32 TRANSITION_UNCERTAIN (EXP021 P22E).`,
    '',
    '### Feasible offline (conservative)',
    '',
    '1. **Segment-wise kinematics** on contiguous TRUSTED numeric runs (variable effective Δt = 1 s label, not proven physics sampling).',
    '2. **Comparative diagnostics** against video tacho windows (development trip only) — label independence required.',
    '3. **QC leg-implied speeds** where calendar-complete — subject to GEOMETRY_JUMP rejection (1 outlier on pin).',
    '',
    '### Not feasible without new data / policy change',
    '',
    '- Harsh event thresholds on unvalidated sparse labels.',
    '- Braking “stop proved” from GPS deceleration alone inside ROW_ABSENT.',
    '- Merging EXP021 halt prototype scores into accel/brake metrics.',
    '',
    '## Production HF path (separate from L3 pin)',
    '',
    '- Uses `fetchHighFrequency` 1s buckets — **cadence not guaranteed 1 Hz** (`CURRENT_STATE.md`).',
    '- Detectors require ≥3 clean points; merge windows 1.5–2 s.',
    '- Skip reasons: `INSUFFICIENT_POINTS`, `NO_HF_DATA`, `CAPABILITY`.',
    '',
    '## Stop-and-go / slow-roll interaction',
    '',
    '- EXP021 documents band semantics vs display tacho (P22E-F).',
    '- Slow-roll geometry (52 s) ≠ harsh braking; do not reuse halt thresholds.',
    '',
    `**Assessment:** ${p.feasibility.accelOfflineFromL3Qc}; braking: ${p.feasibility.brakingOfflineFromL3Qc}.`,
  ].join('\n');
}

function renderRegenFeasibilityMd(): string {
  return [
    '# LDI01 — Regeneration Feasibility',
    '',
    '## Classification framework (LDI-01)',
    '',
    '| Class | Meaning |',
    '|-------|---------|',
    '| `VEHICLE_DECELERATION` | Negative Δv from speed (GPS/HF/L3) — **not** regen-specific |',
    '| `FRICTION_BRAKING_CONFIRMED` | Requires pedal/switch or friction torque — **not in pin** |',
    '| `REGEN_ACTIVE_CONFIRMED` | Positive traction power into battery while moving, signed + synced |',
    '| `REGEN_POSSIBLE_UNCONFIRMED` | Decel + EV power present but timing/sign ambiguous |',
    '| `REGEN_ENERGY_MEASURED` | Integrated kWh from HF power series (`hf-recuperation.ts`) |',
    '| `UNKNOWN` | Missing power series or charging conflated with regen |',
    '',
    '## Tesla token 186946 (frozen EXP021 evidence)',
    '',
    '- **S4 frozen channels:** POSITION only — **no** traction power time series in pin.',
    '- **HF schema:** `tractionBatteryPowerKw` declared in `HighFrequencyReading` (DIMO W→kW, positive = into battery).',
    '- **Status:** `SCHEMA_DECLARED` / `NOT_VERIFIED` for on-trip regen on this pin.',
    '',
    '## Excluded as regen proof (explicit)',
    '',
    '- SOC step changes alone',
    '- EED recharge/refuel segments',
    '- GPS-only deceleration',
    '- Video tacho slowing without power channel',
    '',
    '## Sign / sync checklist (for future capture)',
    '',
    '1. Confirm DIMO field maps to `powertrainTractionBatteryCurrentPower` at 1s HF.',
    '2. Align HF timestamps with POSITION/L3 bucket labels (known bucket vs observation skew).',
    '3. Separate stationary charging (positive power, speed ≈0) from on-road regen (`REGEN_MIN_SPEED_KMH=8`).',
    '4. Persist raw HF export before any detector run.',
    '',
    '**Assessment:** `REGEN_CONFIRMATION_FEASIBLE=RESEARCH` until independent HF power evidence is pinned.',
  ].join('\n');
}

function renderNextStepsMd(): string {
  return [
    '# LDI01 — Next Steps',
    '',
    '1. **LDI-02 (proposed):** Read-only HF export on one **new** independent Tesla capture (power + speed + position), no threshold tuning.',
    '2. **Ruptela slice:** Audit one completed LTE_R1 trip for OBD throttle + native harsh events vs HF kinematics (offline DB export if owner approves).',
    '3. **P23 field protocol:** Use `exp021-ev-ground-truth/p22e/P23_FIELD_CAPTURE_READINESS.md` for longitudinal labels.',
    '4. **Do not** conflate EXP021 halt v0_2 with accel/brake/regen product detectors.',
    '5. **Design-only:** If regen product claims are needed, extend `driving-intelligence-v2-canonical-design.ts` epistemics before code.',
  ].join('\n');
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const payload = buildLdi01Payload(repoRoot, headSha);
  const matrix = buildSignalCapabilityMatrix(repoRoot);

  fs.writeFileSync(path.join(outDir, 'LDI01_SIGNAL_CAPABILITY_MATRIX.json'), JSON.stringify(matrix, null, 2));
  fs.writeFileSync(path.join(outDir, 'LDI01_ARCHITECTURE_AUDIT.md'), renderArchitectureAuditMd(repoRoot));
  fs.writeFileSync(path.join(outDir, 'LDI01_ACCEL_BRAKE_FEASIBILITY.md'), renderAccelBrakeFeasibilityMd(payload));
  fs.writeFileSync(path.join(outDir, 'LDI01_REGEN_FEASIBILITY.md'), renderRegenFeasibilityMd());
  fs.writeFileSync(path.join(outDir, 'LDI01_NEXT_STEPS.md'), renderNextStepsMd());
  fs.writeFileSync(path.join(outDir, 'LDI01_FULL_AUDIT.json'), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(outDir, 'LDI01_RESULT.txt'), buildLdi01CompletionLines(payload).join('\n') + '\n');

  console.log(JSON.stringify({ ok: true, outDir, headSha }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

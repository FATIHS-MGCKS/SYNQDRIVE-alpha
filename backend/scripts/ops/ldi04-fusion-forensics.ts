#!/usr/bin/env ts-node
/**
 * LDI-04 — Ruptela fusion policy & conflict forensics (offline).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import {
  LDI04_PIN,
  analyzeCadence,
  analyzeConflicts,
  buildLdi04ResultLines,
  loadLdi03DocumentedConflictIndex,
  loadLdi03Snapshot,
} from './ldi04-fusion-forensics.lib';

function parseOutDir(argv: string[]): string {
  const i = argv.indexOf('--out-dir');
  if (i < 0 || !argv[i + 1]) {
    return path.resolve(__dirname, '../../../architecture/drivingintelligence/evidence/ldi-04');
  }
  return path.resolve(argv[i + 1]);
}

function renderTemporalMd(cadence: ReturnType<typeof analyzeCadence>, conflicts: ReturnType<typeof analyzeConflicts>): string {
  return [
    '# LDI04 — Temporal alignment',
    '',
    `**Pin:** \`${LDI04_PIN.tripId}\` · **UTC** \`${LDI04_PIN.utcFrom}\`–\`${LDI04_PIN.utcTo}\``,
    '',
    '## 1 Hz HF assumption vs observation',
    '',
    '| Metric | Expected (contract) | Observed on pin |',
    '|--------|---------------------|-----------------|',
    `| Query family | \`HIGH_FREQUENCY_SUBSET\` @ 1 s | ${cadence.observedHfNumericBuckets} numeric speed buckets / 1090 shadow indices |`,
    `| Median Δt between OBD/HF buckets | 1000 ms | **${cadence.observedMedianDeltaMs ?? 'n/a'} ms** |`,
    `| Min / max Δt | 1000 ms | ${cadence.observedMinDeltaMs ?? 'n/a'} / ${cadence.observedMaxDeltaMs ?? 'n/a'} ms |`,
    `| Strict 1 Hz lattice | yes | **${cadence.supportsStrict1Hz ? 'yes' : 'no'}** |`,
    '',
    '**Conclusion:** The DIMO R1 query requests 1 s buckets, but the **observed** delivery on this trip is **sparse and irregular** (median 5 s). Do not treat HF/OBD as a contiguous 1 Hz series.',
    '',
    '## 6.1 % triple overlap (GPS + trusted L3 + HF + OBD same index)',
    '',
    `- **Buckets:** ${cadence.tripleOverlapBuckets} / 1090 (${(cadence.tripleOverlapFraction * 100).toFixed(2)}%)`,
    `- **Within corroboration band** on trusted overlap (max(5 km/h, 10% L3)): ${cadence.tripleOverlapCorroboration} / ${cadence.tripleOverlapBuckets}`,
    `- **Documented L3/OBD conflicts** (LDI03 rule): ${cadence.documentedL3ObdConflicts} — these buckets have **UNTRUSTED** L3 (CROSS_SOURCE_CONFLICT) and are excluded from the 66 trusted overlap set`,
    `- **Forensic dispositions:** EXPLAINED ${conflicts.filter((c) => c.disposition === 'EXPLAINED').length}, UNRESOLVED ${conflicts.filter((c) => c.disposition === 'UNRESOLVED').length}, NOT_COMPARABLE ${conflicts.filter((c) => c.disposition === 'NOT_COMPARABLE').length}`,
    '',
    'No interpolation was applied between absent buckets.',
    '',
    '## Temporal semantics',
    '',
    '- R1/OBD payloads are **`INTERVAL_ONLY`** (`r1-temporal-containment.ts`, `DI_V0_R1_OBD_QUERY_V0_3`).',
    '- Calendar bucket labels are an **evaluation index**, not proof of point-synchronous ECU vs GPS samples.',
  ].join('\n');
}

function renderNativeAbsenceMd(): string {
  return [
    '# LDI04 — Native event absence',
    '',
    `**Pin trip:** \`${LDI04_PIN.tripId}\` · **Vehicle:** \`${LDI04_PIN.vehicleId}\``,
    '',
    '## Observed fact (LDI-03 read-only DB export)',
    '',
    '- `DrivingEvent` count in acquisition window: **0** (including `tripId` null + vehicle time filter).',
    '- All **8** frozen-manifest Ruptela candidates scored **0** native events in-window (see `LDI03_TRIP_SELECTION.md`).',
    '',
    '## Code path (ingestion → persistence)',
    '',
    '1. **Fetch:** `LteR1BehaviorEnrichmentService.enrichTrip` → `DimoSegmentsService.fetchDrivingEvents()` with `driving-events.query.ts` (`behavior.harsh*` names).',
    '2. **Map:** `mapDimoNativeDrivingEvent` → `DrivingEvent` rows (`source = TELEMETRY_EVENTS`).',
    '3. **Persist:** `DimoNativeDrivingEventPersistenceService` (idempotent, org-scoped fingerprint).',
    '4. **Trip link:** `tripId` set when enrichment runs post-trip completion; LDI-03 also searched `tripId: null` in window.',
    '',
    '## Skip / zero-event gates (belegbar)',
    '',
    '| Gate | Relevance to this pin |',
    '|------|------------------------|',
    '| Trip `endTime` required | Trip completed (pinned work item) — **pass** |',
    '| `MIN_TRIP_DURATION_MS` (60 s) | ~18 min drive — **pass** |',
    '| DIMO token / vehicle | Vehicle in org manifest — **assumed pass** (POSITION/R1 pin succeeded) |',
    '| `assessZeroNativeEventsConduct` | Provider may return **zero** harsh events on calm drives — **plausible** |',
    '| S4 `NATIVE_EVENT` channel | Separate from `DrivingEvent` table; pin can have POSITION+R1 without native channel events in DB |',
    '| Feature flags `DI_V0_S4_NATIVE_ENABLED` | Controls S4 acquisition, not retroactive `DrivingEvent` backfill for this historical pin |',
    '',
    '## Most likely explanation (epistemic: INFERRED)',
    '',
    '1. **No harsh provider events** on this trip (smooth driving — consistent with zero overlap assessability).',
    '2. **Enrichment not re-run** for this historical trip window before pin — DB simply has no rows (cannot prove without job logs).',
    '3. **Not** evidence of ingestion disabled globally — other LTE_R1 paths exist; this trip lacks rows in-window.',
    '',
    '## Explicit non-claims',
    '',
    '- No synthetic native events were created.',
    '- No provider API was called for LDI-04.',
  ].join('\n');
}

function renderFusionPolicyMd(): string {
  return [
    '# LDI04 — Fusion policy draft (offline)',
    '',
    '**Status:** design-only · **no threshold tuning** · **no production arm**',
    '',
    '## Epistemic classes',
    '',
    '| Class | Meaning |',
    '|-------|---------|',
    '| `CONFIRMED` | Multiple independent witnesses agree within corroboration band |',
    '| `CORROBORATED` | Primary L3 trusted + OBD agrees (not necessarily multi-witness) |',
    '| `CONFLICTED` | Witnesses disagree beyond disagreement threshold |',
    '| `PARTIAL` | Some streams present; others missing or LIMITED |',
    '| `UNKNOWN` | Cannot assert kinematics (gaps, UNTRUSTED, or no data) |',
    '',
    '## Decision matrix',
    '',
    '| Scenario | Policy output | Notes |',
    '|----------|---------------|-------|',
    '| L3 **TRUSTED** + OBD agrees (≤ max(5,10% L3)) | **CORROBORATED** kinematic speed | OBD is witness, not primary |',
    '| L3 **TRUSTED** + OBD conflicts | **CONFLICTED** — withhold promotion | Do **not** auto-pick OBD; mark `CONFLICTED` + forensic flags |',
    '| L3 **TRUSTED_LIMITED** + OBD available | **PARTIAL** | Use L3 as index; OBD may inform QC only |',
    '| L3 missing + OBD available | **PARTIAL** / **UNKNOWN** | `INTERVAL_ONLY` — no OBD fallback to define trip speed surface |',
    '| L3 available + HF dynamics (≥2 HF points) | **PARTIAL** kinematic derivative | HF braking/accel detectors — separate from speed claim |',
    '| Native event + L3 agreement (±2 s) | **CORROBORATED** event envelope | Native remains **NATIVE_*_REPORTED**, not CONFIRMED physics |',
    '| Native event without corroboration | **PARTIAL** (report only) | Class `NATIVE_BRAKING_EVENT_REPORTED` |',
    '| All sources missing | **UNKNOWN** | No interpolation |',
    '',
    '## LDI-04 pin implications',
    '',
    '- Only **~10%** of seconds have OBD/HF speed — fusion must default to **L3-first** with **UNKNOWN** elsewhere.',
    '- **36** L3/OBD conflicts on overlap buckets — **OBD fallback infeasible** as default.',
    '- **0** native events — native row of matrix **not exercised** on this pin.',
    '',
    '## Prohibitions (carry-forward)',
    '',
    '- No harsh threshold changes.',
    '- No automatic OBD override of L3.',
    '- No native event → ground truth promotion.',
  ].join('\n');
}

async function main(): Promise<void> {
  const outDir = parseOutDir(process.argv.slice(2));
  const repoRoot = process.env.LDI04_REPO_ROOT
    ? path.resolve(process.env.LDI04_REPO_ROOT)
    : path.resolve(__dirname, '../../..');
  const headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  fs.mkdirSync(outDir, { recursive: true });

  const { rows, meta } = loadLdi03Snapshot(repoRoot);
  const documented = loadLdi03DocumentedConflictIndex(repoRoot);
  const conflicts = analyzeConflicts(rows, documented);
  const cadence = analyzeCadence(rows);

  const nativeCause =
    'ZERO_IN_WINDOW_all_8_manifest_candidates_plausible_no_harsh_dimo_samples_or_no_enrichment_rows';

  const payload = {
    schema: 'LDI04_CONFLICT_FORENSICS_V1',
    headSha,
    pin: LDI04_PIN,
    ldi03SnapshotMeta: {
      pinnedSnapshotHash: meta.pinnedSnapshotHash,
      rowCount: meta.rowCount,
    },
    policyThresholds: {
      source: 'DI_V0_SPEED_QC_CALIBRATION_PROVISIONAL_V1',
      r1CorroborationAbsKmh: 5,
      r1CorroborationRelPct: 0.1,
      r1DisagreementAbsKmh: 10,
      r1DisagreementRelPct: 0.25,
    },
    conflictCount: conflicts.length,
    dispositionSummary: {
      EXPLAINED: conflicts.filter((c) => c.disposition === 'EXPLAINED').length,
      UNRESOLVED: conflicts.filter((c) => c.disposition === 'UNRESOLVED').length,
      NOT_COMPARABLE: conflicts.filter((c) => c.disposition === 'NOT_COMPARABLE').length,
    },
    conflicts,
    cadence,
  };

  fs.writeFileSync(path.join(outDir, 'LDI04_CONFLICT_FORENSICS.json'), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(outDir, 'LDI04_TEMPORAL_ALIGNMENT.md'), renderTemporalMd(cadence, conflicts));
  fs.writeFileSync(path.join(outDir, 'LDI04_NATIVE_EVENT_ABSENCE.md'), renderNativeAbsenceMd());
  fs.writeFileSync(path.join(outDir, 'LDI04_FUSION_POLICY_DRAFT.md'), renderFusionPolicyMd());
  fs.writeFileSync(
    path.join(outDir, 'LDI04_NEXT_DECISION.md'),
    [
      '# LDI04 — Next decision',
      '',
      '1. Accept **L3-first** fusion policy draft for Ruptela pins with sparse `INTERVAL_ONLY` OBD.',
      '2. Do **not** enable OBD speed fallback — conflicts are majority **EXPLAINED** by sparsity/zero-OBD, remainder **UNRESOLVED**.',
      '3. For native-event matrix validation, pin a trip with non-zero `DrivingEvent` rows (owner-approved DB export) before LDI-05.',
      '',
      'Repro: `cd backend && npm run ldi04:fusion-forensics`',
    ].join('\n'),
  );
  fs.writeFileSync(
    path.join(outDir, 'LDI04_RESULT.txt'),
    buildLdi04ResultLines({ conflicts, cadence, nativeCause }).join('\n') + '\n',
  );

  console.log(JSON.stringify({ ok: true, outDir, conflicts: conflicts.length, cadence }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

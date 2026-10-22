# EXP021 Phase 5A — Reproduce frozen M5 / M7A / M7

## Prerequisites

| Requirement | Location / note |
|---|---|
| Research git checkout | `477ecad737294efbf18472cf8d903d447ca1e397` on `cursor/di-master-architecture-research-20261021` |
| Node + backend deps | `cd <worktree>/backend && npm ci` (or symlink `node_modules` from main workspace install) |
| `ts-node` | via backend `node_modules` |
| Phase 3 harness | `phase3_lib.snapshot.ts` in this freeze dir **or** canonical `exp021-scientific-audit-phase3/scripts/phase3_lib.ts` (same sha256) |
| Tiguan inputs (smoke) | `/opt/cursor/artifacts/exp021-tiguan-validation/research-output/` (grid + OSM + GT CSV) |
| Phase 3 reference hashes | `exp021-scientific-audit-phase3/results/reproducibility.json` |

**Not required for §2 smoke:** original video MOVs, Tesla TRIP gz payloads, Phase 4 sealed GT.

---

## §1 Full Phase 3 real-drive benchmark (reference)

From Phase 3 `run_phase3_benchmark.snapshot.ts` header:

```bash
cd /workspace/.worktrees/di-master-architecture-research-20261021/backend
node --expose-gc -r ts-node/register/transpile-only \
  /opt/cursor/artifacts/exp021-scientific-audit-phase3/scripts/run_phase3_benchmark.ts
```

**Additional inputs (beyond Tiguan):**

| Drive | Artifact paths |
|---|---|
| Tesla TRIP_1 / TRIP_2 | `exp021-tesla-two-trip/{TRIP}_evidence_payload.gz`, `manifest.json`, `exp021-tesla-b2/shadow/{TRIP}_shadow_intervals.jsonl`, `exp021-tesla-two-trip-research/{TRIP}/OSM_FROZEN_SNAPSHOT.json` |
| Tesla LDI-10D | repo fixtures under `architecture/drivingintelligence/evidence/ldi-10d/` |

Outputs: `exp021-scientific-audit-phase3/results/*` (metrics, per-bucket CSVs, `reproducibility.json`).

---

## §2 Phase 5A offline smoke (frozen triple on Tiguan dev set)

**Drive:** `TIGUAN_20261019` — `DEVELOPMENT_SET` (M7 thresholds were chosen on this drive in Phase 3). **Not a blind holdout.**

```bash
cd /workspace/.worktrees/di-master-architecture-research-20261021/backend
node --expose-gc -r ts-node/register/transpile-only -e "
const fs=require('fs');const crypto=require('crypto');
const lib=require('/opt/cursor/artifacts/exp021-scientific-audit-phase3/scripts/phase3_lib.ts');
const {loadTiguan,baselineHeadings,runModel}=lib;
const repro=JSON.parse(fs.readFileSync('/opt/cursor/artifacts/exp021-scientific-audit-phase3/results/reproducibility.json','utf8'));
function hash(m){return crypto.createHash('sha256').update(m.map(x=>x.bucketLabelUtc+'|'+(x.osmWayId??'')+'|'+x.outcome).join('\\n')).digest('hex');}
const {ctx}=loadTiguan();
const h=baselineHeadings(ctx.buckets);
for (const mid of ['M5','M7A','M7']){
  const got=hash(runModel(ctx,mid,h).matches);
  const exp=repro.TIGUAN_20261019.perBucketSha256[mid];
  if(got!==exp) throw new Error(mid+' mismatch got='+got+' exp='+exp);
  console.log(mid,'OK',got);
}
"
```

**Expected per-bucket sha256** (way + outcome sequence):

| Model | sha256 |
|---|---|
| M5 | `84e2ca581b22638f463d637197009db0eb5556a0efab2920d51100f5c385849d` |
| M7A | `4201e931ac47734e4a68aa11e8735b264aee6d9e9055f1b6e6c3f94b37acf74f` |
| M7 | `1da4a19d86f8c402c8badacd714238fae72982870ef8c23c2d1dccd6da34c033` |

Recorded run: `smoke/TIGUAN_SMOKE_REPLAY.json` (2026-10-21T12:17:34Z, all `match: true`).

**Tiguan L3 note:** v1 grid (`pinnedProductionL3Kmh` all null) is what the harness loads. Phase 4 offline v2 (`exp021-phase4-historical-gt/l3_recovery/TIGUAN_POSITION_GRID.v2-offline-l3.json`) is **not** used here and is **unvalidated** — do not substitute silently.

---

## §3 Phase 4 retrospective (optional, not part of 5A smoke)

Sealed GT + retrospective join (already completed in Phase 4):

```bash
python3 /opt/cursor/artifacts/exp021-phase4-historical-gt/scripts/build_sealed_gt_tesla_ldi10d.py
python3 /opt/cursor/artifacts/exp021-phase4-historical-gt/scripts/retrospective_compare_tesla_ldi10d.py
```

Label: `HISTORICAL_RETROSPECTIVE_VALIDATION` — not blind.

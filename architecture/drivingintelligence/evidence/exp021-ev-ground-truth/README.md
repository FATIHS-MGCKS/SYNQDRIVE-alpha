# EXP021 — EV Ground Truth reference campaign

**Campaign:** owner-confirmed Tesla Model 3 reference drive (2026-10-16, Europe/Berlin morning).  
**Priority:** optimization reference #1 **after** the separate joint deploy — **not** part of that deploy.  
**Scope of this package:** protocol, evaluation schema, video-ingest protocol (template), read-only baselines, offline replay tooling.  
**Out of scope:** production algorithm/QC/calibration/gate changes; video analysis until file handoff; post-deploy re-baseline until owner-authorized deploy.

## Reference identities (owner-confirmed)

| Field | Value |
|-------|--------|
| `trip_id` | `358d0158-b2a9-47ed-af26-33926c5770b4` |
| `vehicle_id` | `68868291-5478-42cd-b0c4-cc77b2a78e21` |
| `organization_id` | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| DIMO `tokenId` | `186946` |
| PRIMARY work item | `99fe9d1b-5cb6-4cbb-ba0c-e5f27a5cd50a` |
| `shadow_run_id` | `62117347-71b5-4946-b633-52cb10017043` |
| CURRENT V2 projection | `567c3dc2-d514-447a-97d5-bc294c8c6c12` |

Owner-reported window (Berlin): `2026-10-16T05:36:00+02:00` → `2026-10-16T05:54:55.989+02:00`.

## Authority documents

| Document | Role |
|----------|------|
| [EXP021_EV_GROUND_TRUTH_REFERENCE_PROTOCOL.md](./EXP021_EV_GROUND_TRUTH_REFERENCE_PROTOCOL.md) | Campaign rules, semantics, non-goals |
| [EXP021_EV_GROUND_TRUTH_EVALUATION_SCHEMA.md](./EXP021_EV_GROUND_TRUTH_EVALUATION_SCHEMA.md) | Metrics and comparison schema vs baselines |
| [EXP021_EV_GROUND_TRUTH_VIDEO_PROTOCOL.md](./EXP021_EV_GROUND_TRUTH_VIDEO_PROTOCOL.md) | Video ingest + sync (not executed until file received) |
| [EXP021_EV_GROUND_TRUTH_PRE_DEPLOY_BASELINE.md](./EXP021_EV_GROUND_TRUTH_PRE_DEPLOY_BASELINE.md) | Pre-deploy read-only baseline summary |
| [POST_DEPLOY_VERIFICATION_PLAN.md](./POST_DEPLOY_VERIFICATION_PLAN.md) | Post-deploy read-only checklist (pending) |

## Frozen baseline artifacts (`pre-deploy/`)

Read-only Production capture at a single observation time. **No coordinates** in per-second export; availability and QC replay only.

Verify integrity:

```bash
cd architecture/drivingintelligence/evidence/exp021-ev-ground-truth/pre-deploy
sha256sum -c SHA256SUMS
```

Regenerate (read-only DB, no Production mutations):

```bash
cd backend
EXP021_EV_GT_ORG_ID=... EXP021_EV_GT_TRIP_ID=... EXP021_EV_GT_WORK_ITEM_ID=... \
EXP021_EV_GT_PROJECTION_ID=... EXP021_EV_GT_PRODUCTION_SHA=... \
EXP021_EV_GT_ANALYSIS_CODE_SHA="$(git rev-parse HEAD)" \
npm run exp021:ev-ground-truth:baseline -- --out-dir ../architecture/drivingintelligence/evidence/exp021-ev-ground-truth/pre-deploy
```

## Flags

| Flag | Value |
|------|--------|
| `VIDEO_RECEIVED_AND_ANALYZED` | **NO** (owner holds video; not in repo) |
| `VIDEO_PROTOCOL_READY` | **YES** |
| `POST_DEPLOY_VERIFICATION` | **NOT_RUN** |
| `PRODUCTION_MUTATIONS` | **NONE** |
| `PROVIDER_CALLS` | **NONE** |

# LDI-10D Phase 3C.1 — Tesla manifest audit (DIMO 186946)

## Canonical manifest

- **Path:** `architecture/drivingintelligence/evidence/exp021-ev-ground-truth/pre-deploy/PRE_DEPLOY_BASELINE_MANIFEST.json`
- **Trip ID:** `358d0158-b2a9-47ed-af26-33926c5770b4`
- **Vehicle:** `68868291-5478-42cd-b0c4-cc77b2a78e21`
- **DIMO token:** `186946`
- **Capture production SHA:** `a0ce01f192d888974e49c2558ee05e534f3dfeea`
- **Capture analysis SHA:** `a0ce01f192d888974e49c2558ee05e534f3dfeea`
- **Repo HEAD (this run):** `4c81fb6f4d14cc4c84300c91dbd3fe84fa51e18d`

## Time window

- Start: **2026-10-16T03:36:00.000Z**
- Trip end: **2026-10-16T03:54:55.989Z**
- 1 s grid end label: **2026-10-16T03:54:56Z**
- Expected buckets: **1136**

## Checksums

- Manifest sha256: `0d6eea5714849d0d2c873d9fcfec25611b421e8bb90cc8ee89e2c6e1dcfc78d8`
- Per-second replay sha256: `68bff4d695ee1a922be1c980a1a9d441dcc1145e1dee57e8c17fe73ed0864157`
- SHA256SUMS verified: **YES**

## Data layers

### Raw (not fully in git)

- S4 pinned snapshot (DB/cold-store at capture; POSITION payload not in git)
- DIMO historical location 1s AVG query family (documented in supplements)

### Derived (in git)

- `architecture/drivingintelligence/evidence/exp021-ev-ground-truth/pre-deploy/PRE_DEPLOY_PER_SECOND_REPLAY.json`
- `architecture/drivingintelligence/evidence/exp021-ev-ground-truth/external-video-review-kompakt-2026-10-16/analysis/results/comparison.json`
- `review-bundle/PRE_DEPLOY_PER_SECOND_REPLAY.json (kompakt bundle copy)`

### Hash-only references

- POSITION payloadSha256 2dbcf7c6eebea5cda15482efa4dde3297e4b39672c9d42529916cee1a76a45e2
- DI_V0_S4_EVIDENCE_V1:sha256:c703e9c41e5e65ab643f9416c469818d88a0fbfa93218885d7c5beb6fa284503
- DI_V0_COMBINED_INPUT_IDENTITY_V0_3:sha256:302385ed3e346345524aceed2b69172242df385dd4797c824c0645f0de915cab

## GPS coordinates

- Full lat/lon + UTC in repo: **NO**
- Repro without new provider fetch: PARTIAL — per-second QC/L3/abstention replay in git; lat/lon requires read-only S4 POSITION payload rehydrate from Production evidence store (not committed) or owner-authorized export

- pre-deploy README: no coordinates in per-second export
- POSITION_SNAPSHOT_INPUT_AUDIT_SUPPLEMENT_V2.json: bucket availability only, no lat/lon array
- comparison.json coordinatesOcr is iPhone screen OCR — not DIMO GPS authority

## Video / tacho overlap

- Comparison buckets: **1136**
- Tacho-readable: **973**
- Paired TRUSTED L3 + tacho: **748**
- Window: 2026-10-16T03:36:00Z → 2026-10-16T03:54:55Z

## Phase B gate

- Eligible for 7-algorithm GPS replay: **NO**

Blockers:
- POSITION channel payload sha256=2dbcf7c6eebea5cda15482efa4dde3297e4b39672c9d42529916cee1a76a45e2 not committed; only hash in manifest.

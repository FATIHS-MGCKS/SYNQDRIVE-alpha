# DS4 Fetch GPS — P12 / P13 / P14 Evidence Handoff (TIG22)

Handoff package for the separate **SynqDrive DS4 Fetch-GPS Intelligence** workstream. This directory transfers **documentation, join contracts, and report artifacts** from the historical DS4×RPM Cursor agent investigations (P12–P14, P14.1). It does **not** replace Tier-B raw CloudEvent payloads (see `EVIDENCE_GAPS.md`).

## 1. Origin of investigations

| Op | Agent artifact prefix | What ran |
|----|------------------------|----------|
| P12 | `ds4-rpm-p12-*` | Fetch metadata: `availableCloudEventTypes` + `indexes` (no payloads) |
| P13 | `ds4-rpm-p13-*` | Single `cloudEvents` limit 5, in-memory boolean inspection only |
| P14 | `ds4-rpm-p14-*` | Single `cloudEvents` limit 30 + offline join vs sealed S4 position pin |
| P14.1 | `ds4-rpm-p14-1-*` | Strict offline forensics on ~1014 m residual (no new Fetch) |

Cursor Cloud run context: operations executed November 2025 (UTC); sealed TIG22 eval inputs frozen October 2026 in repo.

## 2. Original raw data availability

**Critical:** P13 and P14 **did not persist** Fetch `cloudEvents` JSON, event IDs, or coordinate pairs to disk at execution time. Only **derived reports** (counts, booleans, aggregate residuals) exist under `/opt/cursor/artifacts/` on the agent VM and copies in `reports/` here.

- **FETCH raw coordinates for replay:** **NOT AVAILABLE** in this handoff (Tier B pending).
- **Pairwise Fetch↔S4 table:** **NOT CAPTURED** historically (`NOT_CAPTURED` in `P14_PAIRWISE_EVIDENCE_SANITIZED.json`).

Reproduction of per-event distances requires a **new owner-authorized Fetch export** using `P14_JOIN_SPEC.json` + Tier-B package once populated.

## 3. Package layout

| File | Tier | Role |
|------|------|------|
| `EVIDENCE_MANIFEST.json` | A | Catalog + SHA-256 |
| `P12_METADATA_SUMMARY.json` | A | P12 counts (PREVIOUSLY_REPORTED + report copy) |
| `P13_EVENT_SCHEMA_AND_METADATA.json` | A | Required fields + what was / was not stored |
| `P14_JOIN_SPEC.json` | A | Exact P14 join algorithm (reconstructed from executed script) |
| `P14_PAIRWISE_EVIDENCE_SANITIZED.json` | A | Aggregate stats only; `pairs[]` empty |
| `P14_1_METHODICAL_FINDINGS.md` | A | Methodological vs root-cause separation |
| `S4_FROZEN_REFERENCE.json` | A | Sealed pin pointer (no trajectory export) |
| `REPLAY_INSTRUCTIONS.md` | A | Step-by-step for downstream team |
| `EVIDENCE_GAPS.md` | A | Missing evidence explicit |
| `reports/*.json` | A | Verbatim copies of agent completion reports |

Tier B (not in git): `/opt/cursor/artifacts/ds4-fetch-gps-tier-b-local-only/` — see local agent completion; **no raw CloudEvents inside**.

## 4. Repo / commit references

- **Handoff branch:** `research/ds4-fetch-gps-p13-p14-evidence-handoff`
- **Sealed TIG22 inputs (already in monorepo):** `research/driving-intelligence/evaluations/ds4-speed-video-reference-20261023/inputs/tiguan-20261022/`
- **S4 container SHA-256 (full file):** see `S4_FROZEN_REFERENCE.json` (matches pinned hash in provenance when normalized)

Record the handoff **commit SHA** from git log when this branch is committed.

## 5. Time field semantics (do not conflate)

| Field | Source | Documented meaning | Physical GNSS fix time proven? |
|-------|--------|--------------------|--------------------------------|
| Fetch `header.time` | Fetch `cloudEvents` | CloudEvent event time on archived `dimo.status` | **No** (processed event time) |
| GraphQL row `timestamp` | Telemetry historical query | **1s bucket label** (start), not proven observation instant | **No** (`di-v0-position-acquisition.versions.ts`) |
| S4 snapshot `bucketLabel` | Pinned S3A acquisition | Same as GraphQL bucket label at pin time | **BUCKET_BOUNDED** only |
| Ruptela record time | Protocol / ingest (not in P14 export) | Device record epoch + extension in public parser | **Not captured** in P13/P14 artifacts |

P14.1 finding: equating Fetch `header.time` (second) to S4 bucket label is **not** secured co-temporality (`METHODOLOGICAL_COMPARABILITY_VERDICT`).

## 6. Proven vs open

**Proven (with cited reports / repo spec):**

- Same SynqDrive vehicle + DIMO token asset **192922** on sealed S4 pin (identity).
- P12: `dimo.status` count **710** in metadata window (report).
- P13: 5/5 events had GPS + RPM94 + header.time in sample (report; no coords stored).
- P14: 30 events, aggregate mean residual **~1014 m** at 75 m threshold, 0/30 matched (report).
- S3A uses **1s AVG**; AVG may differ from any single sample (code spec).

**Open / unresolved:**

- Physical root cause of ~1014 m (`ACTUAL_MISMATCH_ROOT_CAUSE`).
- Per-event pairwise replay without new Fetch.
- Whether Fetch `data.pos` matches telemetry VSS at same archive event.

## 7. What the Fetch-GPS team needs to reproduce

1. Owner-authorized Tier-B export: `cloudEvents` with full headers + `data` for window `2026-10-22T18:40:00Z`–`18:50:00Z` (paginated if needed).
2. This handoff: `P14_JOIN_SPEC.json`, `S4_FROZEN_REFERENCE.json`, sealed `di_v0_s4_evidence_container.bin` from repo path.
3. Pre-registered alignment hypotheses (no best-fit as truth); see P14.1.

## 8. Boundaries

No change to DS4 C4/L3, RPM research veto, or production paths. No secrets in this branch.

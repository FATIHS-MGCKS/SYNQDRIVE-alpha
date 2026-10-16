# EXP021 — external video review (kompakt, 2026-10-16)

**Type:** `COMPACT_TRANSFER_SUBSET_NOT_FULL_VISUAL_EVIDENCE`  
**Full package SHA-256 (reference):** see `KOMPAKT_MANIFEST.json` → `original_zip_sha256`  
**Baseline bytes:** unchanged — canonical frozen replay remains [`../pre-deploy/`](../pre-deploy/) (`sha256sum -c SHA256SUMS`).

## What this folder contains

- Human report: [`Bericht.md`](./Bericht.md) (+ HTML), [`Vergleich.png`](./Vergleich.png)
- Cursor follow-up prompts: [`Cursor-Prompts.md`](./Cursor-Prompts.md)
- Video provenance + frame observations: `PROVENANCE_REVIEW.json`, `analysis/*`
- Reproducible metric scripts: `analysis/compare.py`, `enrich.py`, `finalize_rows.py` (annotations only; no JPEG frames in git)

## Explicitly **not** in this kompakt upload

Per [`ZUERST_LESEN_KOMPAKT.txt`](./ZUERST_LESEN_KOMPAKT.txt): JPEG single frames and paper checklists were omitted due to upload limits. Paths in JSON may point at the full evidence zip. **Independent visual re-check requires the full package or original MOV files.**

The full zip’s `review-bundle/` bytes are **not** duplicated. For `analysis/compare.py`, a **symlink** [`review-bundle/PRE_DEPLOY_PER_SECOND_REPLAY.json`](./review-bundle/PRE_DEPLOY_PER_SECOND_REPLAY.json) points at canonical [`../pre-deploy/`](../pre-deploy/) (same hash as frozen baseline).

## Integrity

```bash
cd architecture/drivingintelligence/evidence/exp021-ev-ground-truth/external-video-review-kompakt-2026-10-16
# Hashes for files shipped in the full review zip (not every file in this folder):
sha256sum -c SHA256SUMS_REVIEW 2>/dev/null || true
# Included-subset manifest for this kompakt transfer:
jq . KOMPAKT_MANIFEST.json
```

## Read-only DB follow-ups (Auftrag 1 + 2)

Machine exports at [`../forensic-readonly-exports-2026-10-16/`](../forensic-readonly-exports-2026-10-16/) — generated with `npm run exp021:ev-ground-truth:forensic-export` (Production DB, read-only transaction). Summaries:

- [`EXP021_EV_GROUND_TRUTH_BOUNDARY_PROVENANCE_2026-10-16.md`](../EXP021_EV_GROUND_TRUTH_BOUNDARY_PROVENANCE_2026-10-16.md)
- [`EXP021_EV_GROUND_TRUTH_STOP_CREEP_FORENSIC_2026-10-16.md`](../EXP021_EV_GROUND_TRUTH_STOP_CREEP_FORENSIC_2026-10-16.md)

`PRODUCTION_MUTATIONS=NONE`, `PROVIDER_CALLS=NONE`, no algorithm change from this package.

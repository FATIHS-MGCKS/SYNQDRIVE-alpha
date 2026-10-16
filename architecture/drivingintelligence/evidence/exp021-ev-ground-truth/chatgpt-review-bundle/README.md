# EXP021 EV Ground Truth — ChatGPT / external review bundle

Read-only copies of the pre-deploy forensic exports for trip `358d0158-b2a9-47ed-af26-33926c5770b4`.  
**No coordinates** in per-second export. Canonical frozen package remains [`../pre-deploy/`](../pre-deploy/) (unchanged hashes).

## Integrity

```bash
cd architecture/drivingintelligence/evidence/exp021-ev-ground-truth/chatgpt-review-bundle
sha256sum -c SHA256SUMS
```

## Files

| File | Purpose |
|------|---------|
| `PRE_DEPLOY_PER_SECOND_REPLAY.json` | 1136 one-second rows (QC replay) |
| `PRE_DEPLOY_PER_SECOND_REPLAY.csv` | Same data, CSV for spreadsheet / ChatGPT Code Interpreter |
| `PRE_DEPLOY_PROJECTION_EXCERPT.json` | V2 summary excerpt (full `projection_json` not in baseline freeze) |
| `PRE_DEPLOY_BASELINE_MANIFEST.json` | Trip boundaries, identities, admission, projection id |
| `PROVENANCE.json` | Hashes for **pre-deploy** package (see note in excerpt) |

Context: [Trip-start forensic](../EXP021_EV_GROUND_TRUTH_TRIP_START_FORENSIC_2026-10-16.md).

## Raw GitHub URLs (for ChatGPT “browse” / file upload)

Replace `<branch>` with the branch that contains this folder (e.g. `cursor/exp021-ev-ground-truth-7d78` on PR #2051, or `main` after merge).

```
https://raw.githubusercontent.com/FATIHS-MGCKS/SYNQDRIVE-alpha/<branch>/architecture/drivingintelligence/evidence/exp021-ev-ground-truth/chatgpt-review-bundle/PRE_DEPLOY_PER_SECOND_REPLAY.csv
https://raw.githubusercontent.com/FATIHS-MGCKS/SYNQDRIVE-alpha/<branch>/architecture/drivingintelligence/evidence/exp021-ev-ground-truth/chatgpt-review-bundle/PRE_DEPLOY_PER_SECOND_REPLAY.json
https://raw.githubusercontent.com/FATIHS-MGCKS/SYNQDRIVE-alpha/<branch>/architecture/drivingintelligence/evidence/exp021-ev-ground-truth/chatgpt-review-bundle/PRE_DEPLOY_PROJECTION_EXCERPT.json
https://raw.githubusercontent.com/FATIHS-MGCKS/SYNQDRIVE-alpha/<branch>/architecture/drivingintelligence/evidence/exp021-ev-ground-truth/chatgpt-review-bundle/PRE_DEPLOY_BASELINE_MANIFEST.json
```

**Note:** ChatGPT cannot authenticate to private repos; the repository must be **public** or you must paste/upload files manually. Public raw URLs work when the repo is public.

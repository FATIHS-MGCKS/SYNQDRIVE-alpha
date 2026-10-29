# DS4 L3-C — Artefact screening & robust FULL reference

Regenerate:

```bash
node analyze-l3c.mjs
```

## Immutable inputs

Working copies under `inputs/` are **byte-identical** to:

| File | Canonical source |
|------|------------------|
| `event-intensity-dataset.jsonl` | L3-B package / batch v1 aggregate export |
| `layer2-observables-index.json` | batch v1 |
| `cohort-manifest.json` | `ds4-historical-batch-v1-20261029/` |
| `batch-v1-batch-dataset-summary.json` | batch v1 |

SHA-256 recorded in `outputs/source-integrity-manifest.json`. Original batch v1 directory is not modified.

## Policy

`screening-policy.json` — conservative 10.0 m/s² mean intensity bound (~1.02g), mirror-pair rules, research-only.

## Outputs

See `outputs/l3c-summary.json` for the consolidated report.

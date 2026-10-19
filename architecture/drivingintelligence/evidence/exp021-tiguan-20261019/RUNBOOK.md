# EXP021 Tiguan validation — runbook

```bash
# 1) Optional: export snapshot gzip from production (read-only, already done in cloud run)
# stored at /opt/cursor/artifacts/exp021-tiguan-validation/raw/tiguan_evidence_payload.gz

# 2) Replay + reports
cd backend
export TIGUAN_COMPACT_DIR=/opt/cursor/artifacts/exp021-tiguan-validation/compact
export TIGUAN_EVIDENCE_GZIP=/opt/cursor/artifacts/exp021-tiguan-validation/raw/tiguan_evidence_payload.gz
export TIGUAN_RESEARCH_OUT=$PWD/../architecture/drivingintelligence/evidence/exp021-tiguan-20261019
npx ts-node --transpile-only scripts/research/exp021-tiguan-validation.harness.ts

# 3) Reuse frozen OSM (skip network)
export TIGUAN_SKIP_OSM_FETCH=1
```

Pinned commit: `9f0693bef572a065e45f5dad91ef236ba4f2ccd9`.

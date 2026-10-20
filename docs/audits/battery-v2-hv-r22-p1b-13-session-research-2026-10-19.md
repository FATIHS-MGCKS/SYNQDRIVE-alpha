# HV R22 P1B — 13-session historical counter research

**Date:** 2026-10-19 · **Mode:** production DB read-only + owner-authorized DIMO (11/13 GraphQL) · **Production SHA:** `aeb7234fbb76b4a80a3238e5860c6a140862a735`

Artifacts (local research, not committed): `/opt/cursor/artifacts/hv-r22-p1b-*`

- `hv-r22-p1b-production-sessions.json` — Phase A export
- `hv-r22-p1b-query-manifest.json` — frozen manifest
- `hv-r22-p1b-sessions/*-dimo-response.json` — per-session provider payloads (sanitized)
- `hv-r22-p1b-batch-summary.json` — aggregate run summary
- `hv-r22-p1b-session-matrix.md` — human matrix

Script: `backend/scripts/ops/hv-r22-p1b-13-session-research.cjs`  
Evaluator: `hv-charging-counter-boundary-forensics.v1.ts`

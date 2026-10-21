# R9 resilience PR ancestry (R2.7)

| PR | Branch | Scope | Merge authority |
|----|--------|-------|-----------------|
| **#1982** | `cursor/dimo-integration-deep-audit-r1-1d7d` | DIMO audit, evidence, research | Documentation only |
| **#1984** | `cursor/r25-webhook-resilience-1d7d` | **SUPERSEDED** — 84-file mix with #1982 | Do not merge |
| **#1985** | `cursor/r26-r9-resilience-engineering-1d7d` | Runtime/ops engineering (draft) | **Canonical** for `backend/scripts/ops/r9-*` and VO5C webhook-safe |

## R24 recovery scripts (`r9-r24-webhook-recovery*`)

- Present on both #1982 and #1985 with **identical content** (verified `git diff` empty @ R2.7).
- **Change authority:** #1985 (engineering). #1982 retains evidence references only; do not merge conflicting ops edits on #1982 after #1985 lands.

## Baseline SHAs

- Engineering gate head: documented per release commit on #1985.
- `origin/main`: independent; engineering branch rebased or merged at human review time.
- Production: read-only reference `92d3d61133ad524ae6d328dd0f603c525b0bd178` until next deploy.

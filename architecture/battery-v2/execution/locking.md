# Battery V2 — Locking (Bootstrap)

**Epistemic status:** UNKNOWN — not fully reconstructed in bootstrap

## Known references

- `LOCK_CONTENTION` appeared in production DLQ for `BATTERY_LV_REST_SESSION_OPEN` (#1445 production evidence)
- Per-vehicle serialization mentioned in preserved invariants (#1445 architecture memo)

## Open questions

- Redis lock fail-open rationale for Battery V2 paths
- Exact lock scope (vehicle-level vs org-level)

See `research/OPEN_QUESTIONS.md` — locking section.

**Do not invent locking semantics beyond evidence.**

# Users & Invites — knowledge graph (human-readable)

| Layer | Location |
|-------|----------|
| Machine graph | [`graph/`](graph/) |
| Validator | `bash architecture/users-and-invites/scripts/validate-graph.sh` |

## Core nodes

| ID | Title |
|----|-------|
| USR-DOM-001 | Users & Invites domain |
| USR-UI-SEC-001 | Security & Access hub |
| USR-API-GOV-001 | `/admin/security` governance API |
| USR-API-LEGACY-001 | Legacy `/admin/users` |
| USR-SVC-AUDIT-001 | Session revocation audit (fire-and-forget) |

## Owner-approved invariants (2026-11-25)

`USR-INV-004` … `USR-INV-007` in [`graph/invariants.yaml`](graph/invariants.yaml) — bind USR-OWN-01–04.

## Open contradictions

See [`contradictions/OPEN_CONTRADICTIONS.md`](contradictions/OPEN_CONTRADICTIONS.md).
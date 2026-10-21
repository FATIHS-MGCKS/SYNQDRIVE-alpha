# P4B16 R0A — Design correction record

| Field | Value |
|-------|-------|
| **Parent** | PR #1979 · base design R0 |
| **Mode** | `DESIGN_AND_DOCUMENTATION_ONLY` |
| **Production mutations** | **NO** |

## Corrections applied

| Topic | R0 gap | R0A resolution |
|-------|--------|----------------|
| Multi-file atomicity | Two independent `mv` on state + `backend.env` | **Single authoritative** `release-attestation.state` + **append-only journal**; `COMMITTED` only after `PUBLISHED` journal record + mirrors |
| PM2 semantics | Implied file write fixes runtime | Explicit consumer matrix; runtime identity API; **no** claim of env reload without restart |
| Per-replica proof | Symlink + git | **`.synqdrive-release-manifest.json`** + `/health/runtime-identity` per replica |
| Entrypoints | Deploy hook only implied | Table: commit vs exclude; legacy paths still reachable under enforcement OFF |
| Drift snapshot | In R0 audit only | **Frozen table** preserved in design doc; not assumed current |

## Validation

- `bash architecture/dsrg/scripts/validate-graph.sh` — required on PR head
- `bash architecture/scripts/validate-module-registry.sh` — required on PR head

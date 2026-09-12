# DIMO Integration — Change Ledger

| Date (UTC) | Change | Workstream |
|------------|--------|------------|
| 2026-09-07 | Registry `NOT_STARTED` → `AUDIT_IN_PROGRESS`; bootstrap authority at `architecture/dimo-integration/` | R9 pre-merge governance correction |
| 2026-09-07 | Initial repository audit of `backend/src/modules/dimo/` | Same |
| 2026-09-07 | Read-only Production baseline (R9 NOT_ON_PRODUCTION confirmed) | Same |
| 2026-09-07 | DIM-R9-001 cross-module webhook wake delegation documented | Same |
| 2026-09-07 | Authorized R9 scoped DIMO trigger bootstrap — **ROLLED_BACK** (tokenId 190497 subscribe 403); evidence recorded | Provider mutation session | [../evidence/R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md](../evidence/R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md) |
| 2026-09-07 | Read-only R9 permission root-cause audit — tokenId **190497** classified `FORMER_FLEET_VEHICLE`; re-grant remediation rejected | Provider permission audit | [../evidence/R9_PERMISSION_ROOT_CAUSE_AUDIT_2026-09-07.md](../evidence/R9_PERMISSION_ROOT_CAUSE_AUDIT_2026-09-07.md) |
| 2026-09-07 | Authorized R9 five-vehicle canary — **PASS** (5/5 speed+ignition; stableIds `9eeb7158afee`, `5d611d470eab`; 190497 excluded) | Provider mutation session | [../evidence/R9_FIVE_VEHICLE_CANARY_2026-09-07.md](../evidence/R9_FIVE_VEHICLE_CANARY_2026-09-07.md) |
| 2026-09-08 | Semantic authority cleanup — align current state with R9 deployed + five-vehicle canary PASS; preserve historical pre-R9 / rolled-back evidence | Post-canary reconciliation | This commit |
| 2026-09-08 | KS MS 661 R9 wake cross-reference — first natural trigger delivery on Production (tokenId 187361); read-only log forensics @ `684950419…` | Natural-drive audit addendum (read-only) | [../evidence/KS_MS_661_R9_WAKE_2026-09-08.md](../evidence/KS_MS_661_R9_WAKE_2026-09-08.md) |
| 2026-09-12 | DIMO webhook operations runbook — verified R9 + preflight + forensics workflows; UNPLUG recovery PUT designed not executed (DIM-EV-WEBHOOK-OPS-001) | GT-R1 UNPLUG forensics cross-ref | [../operations/WEBHOOK_OPERATIONS.md](../operations/WEBHOOK_OPERATIONS.md), [../evidence/EVIDENCE_INDEX.md](../evidence/EVIDENCE_INDEX.md) |

No runtime code changes in governance correction commits.

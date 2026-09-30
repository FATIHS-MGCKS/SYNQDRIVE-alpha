# Vehicle Onboarding — Evidence Index

| Evidence ID | Title | Type | Path |
|-------------|-------|------|------|
| VO-EVID-0B-001 | VO-0B governance bootstrap commit + sealed CURRENT_STATE | REPO_DOCUMENTATION | [CURRENT_STATE.md](../CURRENT_STATE.md), [AUDIT_MANIFEST.md](../AUDIT_MANIFEST.md) |
| VO-EVID-1-001 | VO-1 target architecture package | REPO_DOCUMENTATION | [TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md), [VO1_QUESTION_RESOLUTIONS.md](../research/VO1_QUESTION_RESOLUTIONS.md) |
| VO-EVID-2-001 | VO-2 persistence migration + schema | REPO_CODE | `backend/prisma/migrations/20260930130000_vehicle_onboarding_vo2_persistence/`, [VO2_LINK_HISTORY_AUDIT.md](./VO2_LINK_HISTORY_AUDIT.md) |
| VO-EVID-2-002 | VO-2.1 integrity constraints + legacy upgrade proof | REPO_CODE | `backend/prisma/migrations/20260930140000_vehicle_onboarding_vo2_1_integrity/`, [VO2_1_PERSISTENCE_INTEGRITY.md](./VO2_1_PERSISTENCE_INTEGRITY.md) |
| VO-EVID-3-001 | VO-3 orchestrator + atomic activation (no public cutover) | REPO_CODE | [VO3_ORCHESTRATOR_ACTIVATION.md](./VO3_ORCHESTRATOR_ACTIVATION.md), [CURRENT_RUNTIME_ACTIVATION_MATRIX.md](./CURRENT_RUNTIME_ACTIVATION_MATRIX.md) |
| VO-EVID-3-001B | VO-3.1 correctness / tenant isolation seal | REPO_CODE | [VO3_1_CORRECTNESS_SEAL.md](./VO3_1_CORRECTNESS_SEAL.md) |
| VO-EVID-3-001C | VO-3.2 source-adoption security + Postgres final seal | REPO_CODE | [VO3_2_FINAL_RUNTIME_SEAL.md](./VO3_2_FINAL_RUNTIME_SEAL.md) |
| VO-EVID-4-001 | VO-4 readiness authority + profile engine | REPO_CODE | [VO4_READINESS_AUTHORITY.md](./VO4_READINESS_AUTHORITY.md) |
| VO-EVID-4-005 | VO-4.5 technical baseline V2 + activation materialization | REPO_CODE | [VO45_TECHNICAL_BASELINE_MATERIALIZATION.md](./VO45_TECHNICAL_BASELINE_MATERIALIZATION.md) |
| VO-EVID-4-008 | VO-4.8 authenticated capture API + concurrency authority | REPO_CODE | [VO48_AUTHENTICATED_CAPTURE_API.md](./VO48_AUTHENTICATED_CAPTURE_API.md) |
| VO-EVID-0A-001 | VO-0A repository discovery anchor | REPO_AUDIT | Anchor SHA `312d9f54a2b4c0b0740061d3e2b74897e78eacb0` cited in CURRENT_STATE |

Supporting UI audit (not VO authority): `docs/ui/master-admin-connected-vehicles-dimo-deep-audit.md`

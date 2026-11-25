# USR_P0 → grouped implementation handoff

**No implementation in P0 PR.** Owner policies USR-OWN-01–04 approved; see attestation evidence.

| Package | Scope | Findings / policies |
|---------|-------|---------------------|
| **USR-P1A** | Session audit durability + HTTP test harness | R-002, F-003, USR-OWN-04 |
| **USR-P1B** | Master shell dead code + Security & Access i18n | F-001, F-002 |
| **USR-P2** | Effective session / privilege revocation (request-time) | R-008, USR-OWN-02 |
| **USR-P3** | Central MA user lifecycle + MFA policy (no flag arm without separate approval) | F-004, F-005, USR-OWN-01, USR-OWN-03 |
| **USR-P4** | Retention ops proof, production read-only audit, AUTHORITY_ACTIVE gates | R-006, F-006 |

Avoid redundant single-finding PRs. Reuse existing guards, versioning, outbox, transactional audit utilities.
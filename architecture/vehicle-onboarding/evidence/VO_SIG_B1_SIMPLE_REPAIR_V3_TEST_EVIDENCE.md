# VO-SIG-01 B1 — Simple repair SQL V3 ephemeral test evidence

Offline verification on disposable PostgreSQL only.

## Command

```bash
bash architecture/vehicle-onboarding/evidence/scripts/run-vo-sig-b1-simple-repair-v2-ephemeral-test.sh
```

## Scenarios covered (2026-10-14)

- Production V3 static: ends with `ROLLBACK;`, no `CREATE EXTENSION` statement, production cohort + manifest guards, no `OWNER_SET_*` execution placeholders
- Production artifact SHA-256: `aa09f9063d5780d6d96f4063dd753da544daae51c85efdab97d388c1fd49735c`
- Metadata fingerprint parity (Node `fingerprintLinkMetadata` vs `pg_temp` helpers)
- Node `sha256CanonicalJson` parity vs `pg_temp.vo_sig_b1_sha256_node_json` on B1 DIMO fixture shapes
- Happy path: 4 updates + 4 `APPLIED` audits, `last_verified_at` unchanged, B1 rollback CAS restores metadata
- Inactive link guard: full transaction abort, zero cohort writes
- Mutated DIMO `raw_json`: `RAW_JSON_SHA256_MISMATCH`, zero cohort writes
- Mutated `last_verified_at`: `PRIOR_LAST_VERIFIED_AT_MISMATCH`, zero cohort writes

Console log: `VO_SIG_B1_SIMPLE_REPAIR_V3_TEST_EVIDENCE.log` (gitignored; produced by the run script).

# VO-SIG-01 B1 — Simple repair SQL V2 ephemeral test evidence

Offline verification only (disposable PostgreSQL). No production execution.

## Command

```bash
bash architecture/vehicle-onboarding/evidence/scripts/run-vo-sig-b1-simple-repair-v2-ephemeral-test.sh
```

## Result (2026-10-14)

- Production `VO_SIG_B1_SIMPLE_REPAIR_REVIEW_V2.sql` static checks (ends with `ROLLBACK;`, no `OWNER_SET_*` execution placeholders)
- Fingerprint parity: Node `fingerprintLinkMetadata` vs `pg_temp.vo_sig_b1_canonical_json_text` helpers
- Happy path (generated cohort SQL): 4 link updates, 4 `APPLIED` audits, unrelated metadata preserved, `last_verified_at` unchanged, B1 rollback CAS restores originals
- Guard failure: inactive link aborts transaction with zero cohort writes

Full console log: `VO_SIG_B1_SIMPLE_REPAIR_V2_TEST_EVIDENCE.log`

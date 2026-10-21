# DSRG — Open contradictions

| ID | State | Summary | Resolution |
|----|-------|---------|------------|
| DSRG-CONTRA-001 | **RESOLVED (HISTORICAL)** | Some early read-only preflights reported pin not installed (`PIN_INSTALLED=NO`) while DSRG-02 documents successful pin promotion to `448a889…`. | Independent VPS read (DSRG-03 R2 @ `2026-10-11T10:14:01Z`) confirms config `0600 root:root`, ROOT/SHA `448a889…`, clean git porcelain on pin tree, `exec bash` in runner. **Do not** treat stale preflight output as current Production truth. |

No **open** contradictions block DSRG architecture authority under `AUTHORITY_ACTIVE`. Enforcement/runtime gaps are tracked in [`KNOWLEDGE_GAPS.md`](KNOWLEDGE_GAPS.md), not as registry contradictions.

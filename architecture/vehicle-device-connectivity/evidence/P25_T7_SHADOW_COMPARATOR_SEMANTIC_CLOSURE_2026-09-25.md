# P2.5 T+7 shadow comparator semantic closure (Option C)

| Field | Value |
|-------|--------|
| ID | VDC-EVID-P25-T7-SEMANTIC-CLOSURE-001 |
| Epoch | T0 `2026-09-18T09:33:25Z` → T7 `2026-09-25T09:33:25Z` |
| Epistemic | CONFIRMED (Production read-only) |
| Implementation | PR #1697 branch (not Production-deployed at audit time) |

## Production T7 facts

- **1,552** `UNEXPLAINED_OLD_REJECT_NEW_ACCEPT` rows (raw deployed comparator).
- **0** effective state changes among unexplained rows.
- **0** true physical-state disagreements, binding divergence, or equal-time opposing state.
- Primary semantic domain: **SAME_STATE_PROVENANCE_REFRESH** (1,552/1,552).

### Patterns (all safe non-isomorphic refresh)

| Pattern | Count | Shape |
|---------|------:|-------|
| P1A | 985 | SNAPSHOT PLUGGED→PLUGGED, strictly newer, legacy `no_open_episode` |
| P1B | 148 | SNAPSHOT PLUGGED→PLUGGED, equal timestamp, different source/reference |
| P2 | 416 | WEBHOOK PLUGGED→PLUGGED, legacy `no_state_change` |
| P3 | 3 | SNAPSHOT UNPLUGGED→UNPLUGGED, legacy `obd_false` |

## Exact PR #1697 replay (pre-Option-C)

- **970** direct `SNAPSHOT_PLUG_POST_BOOTSTRAP_PROVENANCE_REFRESH` proof pass (log-backed legacy reason).
- **15** P1A rows at PM2 log-retention edge (legacy reason recoverable via episode-model replay).
- **567** outside narrow proof (P1B + P2 + P3).

## Architectural decision

**Option C:** domain-aware comparator + mandatory online admissibility proof for
`NON_ISOMORPHIC_SAME_STATE_PROVENANCE_REFRESH` (`correctnessBlocking=false`).

`EXPECTED_FIX_*` remains for true **STATE_TRANSITION** corrections where legacy behavior is wrong.

### Runtime vs sequence invariant

- **Online admissibility** uses only evidence available at comparison time.
- **Sequence safety** (e.g. WOB 2026-09-23 07:41:49 PLUG refresh then 07:41:53 UNPLUG `APPLIED`) is proven in policy + sequence tests, not via future-looking comparator logic.

## Cutover gates (post-fix)

Future cutover must **not** use raw `UNEXPLAINED_OLD_REJECT_NEW_ACCEPT` alone.

Required (among others):

- `CORRECTNESS_BLOCKING_UNEXPLAINED=0`
- `UNPROVEN_SAME_STATE_REFRESH=0`
- `TRUE_STATE_DISAGREEMENT=0`
- version / stale / out-of-order authority checks

## Epoch status

- Current T7 epoch = **pre-fix validation only**.
- **New full 7-day post-fix epoch** required after merge + deploy + build attestation reissue.
- `CONNECTIVITY_PHYSICAL_STATE_CUTOVER_CAPABLE_BUILD_ID` mismatch remains a cutover blocker until reissued for deployed SHA.

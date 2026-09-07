# Trip Detection & Lifecycle — Decision Register (partial, post-R9)

Append-only architectural decisions. R9 packages indexed at abstraction level; detail in supporting audit evidence.

| Decision ID | Title | STATUS | Evidence |
|-------------|-------|--------|----------|
| TDL-DEC-R9-001 | R9 adaptive polling wake subsystem | VALIDATED | TDL-EVID-R9-AUDIT-001 |
| TDL-DEC-R9A-001 | Durable-first wake mailboxes | VALIDATED | TDL-EVID-R9-AUDIT-001 |
| TDL-DEC-R9B-001 | Handoff rearm without self-coalescing stable jobId | VALIDATED | TDL-EVID-R9-AUDIT-001 |
| TDL-DEC-R9C-001 | Generation-1 probe terminal bound | VALIDATED | TDL-TEST-R9-001 |
| TDL-DEC-R9D-001 | Continuation RESTING + eligibility authority | VALIDATED | TDL-EVID-R9-AUDIT-001 |
| TDL-DEC-R9E-001 | UNKNOWN handoff defer and obsolete CAS retirement | VALIDATED | TDL-TEST-R9-001 |
| TDL-DEC-R9F-001 | UNKNOWN bounded retry outside handoff dispatch | VALIDATED | TDL-TEST-R9-001 |

---

## TDL-DEC-R9-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Tiered snapshot polling only; provider trigger wake lacked durable start-liveness path |
| **WHY** | RESTING vehicles could miss trip starts when polling cadence lagged provider ignition/speed signals |
| **CHANGE** | R9 start-liveness ingress subsystem around canonical `dimo.snapshot.poll` path |
| **NON-EFFECTS** | Does not replace TripDecisionEngine lifecycle authority or R4 start scoring |
| **EVIDENCE** | TDL-EVID-R9-AUDIT-001 |

---

## TDL-DEC-R9A-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Destructive mailbox consume and same-ID successor self-coalescing races |
| **WHY** | Lost wakes under concurrent provider events and ACTIVE canonical jobs |
| **CHANGE** | Atomic Redis pending/successor mailboxes; durable-first coalesce; logical wake origin |
| **EVIDENCE** | TDL-EVID-R9-AUDIT-001 |

---

## TDL-DEC-R9B-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Stable handoff jobId reused for successor dispatch coalesced against itself |
| **WHY** | Post-terminal successor never ran |
| **CHANGE** | Separate handoff queue; BullMQ DelayedError rearm design (completed in R9C) |
| **EVIDENCE** | TDL-EVID-R9-AUDIT-001 |

---

## TDL-DEC-R9C-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | Generation-1 probes could chain; stale successor ACK ordering issues |
| **WHY** | Unbounded probe recursion and handoff false completion |
| **CHANGE** | Gen-1 terminal guard; fresh-covered-no-candidate ordering; DelayedError protocol |
| **EVIDENCE** | TDL-TEST-R9-001 |

---

## TDL-DEC-R9D-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | ACTIVE tail-race dropped post-finalize successor; READ_ERROR treated as MISSING |
| **WHY** | Coalesce after snapshot completion could strand pending wake without successor |
| **CHANGE** | Continuation classifier (RESTING + eligible); strict FOUND/MISSING/READ_ERROR reads |
| **EVIDENCE** | TDL-EVID-R9-AUDIT-001 |

---

## TDL-DEC-R9E-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | UNKNOWN handoff false success; obsolete successor/pending ACK used latest version under stale classification |
| **WHY** | Handoff completed while successor remained; newer wakes deleted incorrectly |
| **CHANGE** | UNKNOWN → SnapshotWakeHandoffDeferError; bounded exact-version retirement |
| **EVIDENCE** | TDL-TEST-R9-001 |

---

## TDL-DEC-R9F-001

| Field | Value |
|-------|-------|
| **STATUS** | VALIDATED |
| **BEFORE** | UNKNOWN outside dispatchSuccessorHandoff had no bounded execution path |
| **WHY** | reconcile/afterSnapshot/scheduleDurable paths preserved pending but never scheduled retry |
| **CHANGE** | scheduleUnknownContinuationRetryHandoff applied consistently with explicit enqueue outcomes |
| **EVIDENCE** | TDL-TEST-R9-001 |

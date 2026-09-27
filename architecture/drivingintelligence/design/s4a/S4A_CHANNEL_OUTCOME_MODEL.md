# S4A — Channel outcome model (P1-3 closed fail-closed)

**Contract:** `channelOutcomes`, `channelRules`, `combinedInputIdentity`, fixtures `combinedIdentityCases` / `invalidChannelPins` · **Evidence:** [authority correction §3](../../evidence/EXP021_C1D10A_AUTHORITY_CORRECTION.md) · **Gap:** DI-GAP-S4-NATIVE-READINESS-001

## 1. Why the S3B V0_2 identity is not enough

S3B's combined input identity V0_2 had four states (PRESENT / NO_EVENT / SOURCE_FAILURE / NOT_AVAILABLE). `NOT_AVAILABLE` collapsed three different facts: the channel is disabled by policy, the channel does not apply to this source family, and the channel is not ready. `NO_EVENT` was asserted without any proof that ingestion completed. C1D.10A shows that no such proof exists today: provider failures in the native path are swallowed to `[]`, and `behaviorEnrichedAt`, `nativeQuerySucceeded` and V2 stage `COMPLETED` are all reachable after a failure.

## 2. Outcomes per channel (`CHANNEL_STATE_MODEL_FINAL`)

**POSITION** (required, `POSITION_REQUIRED=YES`):

| Outcome | Meaning | Snapshot | Runnable |
|---------|---------|----------|:--------:|
| PRESENT | position series acquired (may be sparse; S1 abstains per interval) | required | **yes** |
| SOURCE_FAILURE | timeout / 5xx / 429 / network | none | no (T07) |
| AUTHORIZATION_FAILURE | 401/403, missing or revoked vehicle token | none | no (T08) |
| INVALID_REQUEST | 400 / query rejected | none | no (T08) |
| MALFORMED | response fails schema validation | none | no (T08) |
| UNSUPPORTED_SOURCE | the family has no usable position signal | none | no (T09) |

Only `PRESENT` is runnable. Position is the spine of S1, and there is no DI V0 run without it.

**R1_OBD** (optional, `R1_REQUIRED=NO`):

| Outcome | Meaning | Snapshot |
|---------|---------|----------|
| PRESENT | successful read with ≥1 usable value | required |
| PRESENT_SPARSE | successful read, zero usable values (resolves R1_ABSENT_AT_LABEL: *read OK, nothing there* is distinct from *not read*) | required (empty series, hash-pinned) |
| SOURCE_FAILURE | read failed | none, reason required |
| NOT_APPLICABLE | family ≠ `RUPTELA_R1` | none, reason required |
| DISABLED | `channelEnablement.R1_OBD=false` | none, reason required |

R1 `SOURCE_FAILURE` does **not** block the run (position-only degraded run, `POSITION_ONLY_DEGRADED_RUN_ALLOWED=YES`), but it is recorded in the combined identity. A later successful R1 read is therefore a different combined identity and a different S2 idempotency key, never silently equal.

**NATIVE_EVENT** (optional, `NATIVE_REQUIRED=NO`):

| Outcome | Meaning | Requires |
|---------|---------|----------|
| READY_WITH_EVENTS | ingest complete, ≥1 event | **native ingest attestation** + snapshot |
| READY_NO_EVENT | ingest complete, zero events | **native ingest attestation** + snapshot (empty) |
| NOT_READY | readiness cannot be proven | reason |
| SOURCE_FAILURE | attestation says the ingest failed | reason |
| NOT_APPLICABLE | family ≠ `RUPTELA_R1` (for example Tesla `API_SYNTHETIC`, even though routed as `hardwareType=LTE_R1`) | reason |
| DISABLED | `channelEnablement.NATIVE_EVENT=false` | reason |
| CONTEXT_REJECTED | events exist but fail trip-window/tenant context checks | reason + snapshot |

## 3. Native readiness (fail closed)

- `NATIVE_READINESS_AUTHORITY = NONE_EXISTING`. Channel policy V1 sets `channelPolicyV1NativeReadinessAuthority=NONE`, so `READY_WITH_EVENTS` and `READY_NO_EVENT` are **unreachable** under V1 (validator: `channelPolicyV1ReachableNativeOutcomes` excludes them; a READY pin without `attestationRef` is rejected).
- `NATIVE_NO_EVENT_CONTRACT`: `READY_NO_EVENT` may only be asserted from a **Native Ingest Attestation**, a durable per-(trip, boundary fingerprint) record written by the native-ingest owner. It states `COMPLETE` only when every page and chunk succeeded, and `FAILED` when any retry was exhausted. `behaviorEnrichedAt`, `nativeQuerySucceeded`, V2 stage `COMPLETED` and event count = 0 are explicitly **not** attestations.
- `NO_EVENT_FALSE_NEGATIVE_POSSIBLE = NO` under this contract. It would be YES if legacy markers were accepted (3 of 95 repaired trips even hold a marker older than their current boundary).
- Ownership: the attestation is a native-ingest / DIMO-integration change (strict failure propagation in `fetchDrivingEventsChunkWithRetry` and `fetchEventDataSummary`). It is **not** part of S4A–S4F. Until it exists, native is `NOT_READY` (or `NOT_APPLICABLE` / `DISABLED`), and tiny activation is position + R1 only.

## 4. Combined input identity V0_3

Lines: `DI_V0_COMBINED_INPUT_IDENTITY_V0_3`, then for each channel in the order NATIVE_EVENT, POSITION, R1_OBD: `JSON.stringify([channel, outcome, reasonCodeOrNull, channelSnapshotVersionOrNull, attestationRefOrNull])`, joined by `\n` and hashed with sha256 (prefix `DI_V0_COMBINED_INPUT_IDENTITY_V0_3:sha256:`).

- DISABLED ≠ NOT_APPLICABLE ≠ NOT_READY ≠ SOURCE_FAILURE all produce different hashes (validator `combinedIdentityCases`).
- The combined identity becomes the S2 `inputEvidenceVersion` component, so the S2 idempotency key separates them too.
- V0_2 remains valid for S3B history; V0_3 is additive (new version string, no reinterpretation).

## 5. Pin validity rules (validator `invalidChannelPins`)

- A snapshot is required for PRESENT, PRESENT_SPARSE, READY_WITH_EVENTS, READY_NO_EVENT and CONTEXT_REJECTED.
- A snapshot is forbidden for NOT_APPLICABLE, DISABLED and NOT_READY.
- A reason code is required for every non-success outcome.
- An attestation is required for READY_*.
- An outcome must belong to its channel's vocabulary (a native `PRESENT` is rejected).

## 6. Result

A work item may complete when POSITION=PRESENT, whatever the R1 and NATIVE outcomes are, provided they are valid pins. Every outcome is visible in the combined identity. No outcome can be mistaken for another.

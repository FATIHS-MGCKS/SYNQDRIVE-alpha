# P2.5 OBD physical evidence time contract

| Field | Value |
|-------|--------|
| ID | VDC-EVID-P25-OBD-EVIDENCE-TIME-001 |
| Date | 2026-09-25 |
| Epistemic | CONFIRMED (code + policy) |

## WEBHOOK_OBD_EVIDENCE_TIME_SEMANTIC

`extractWebhookObdPhysicalEvidence()` sets `evidenceObservedAt` from the webhook **`observedAt`** argument — the provider-reported OBD plug/unplug observation instant supplied by the DIMO device-connection webhook ingress path.

It does **not** use `receivedAt`, poll completion, `providerFetchedAt`, or synthetic server time.

## SNAPSHOT_OBD_EVIDENCE_TIME_SEMANTIC

`extractSnapshotObdPhysicalEvidenceFromSignals()` / `extractFromObdNode()` set `evidenceObservedAt` from **`signals.obdIsPluggedIn.timestamp`** (per-signal VSS timestamp).

It does **not** use aggregate `lastSeen`, poll time, or ingest `receivedAt`.

## WEBHOOK_AND_SNAPSHOT_SHARE_COMPARABLE_SIGNAL_TIME_DOMAIN

**YES** — both paths represent provider-observed OBD plug state instants intended for physical ordering. They are comparable for `evaluatePhysicalStateTransition()` / `evidenceObservedAt` ordering.

Webhook `observedAt` is the OBD event observation time from the webhook payload path; snapshot uses the embedded per-signal timestamp for the same semantic signal family (`obdIsPluggedIn`).

## SOURCE_TIMESTAMP_IS_PHYSICAL_ORDERING_CONTRACT

**YES** — `device-connection-physical-state.policy.ts` orders exclusively on `evidenceObservedAt` (physical/source time). Stale evidence (`incomingMs < currentMs`) is **STALE** and does not mutate authority — including when arrival order is reversed (late delivery of older source time).

### Implication (not hidden by shadow comparator)

If a same-state **PROVENANCE_REFRESH** advances projection provenance to **T200**, a later-arriving **UNPLUG @ T150** is **historical** relative to authority watermark and remains **STALE**. That is correct under the current single-watermark model.

**PROVENANCE_CLOCK_ARCHITECTURAL_BLOCKER** for cutover: **NO** — contract is explicit and tested; separation of `STATE_AUTHORITY_WATERMARK` vs `LATEST_PROVENANCE_WATERMARK` is **not implemented** (future design only if multi-watermark is authorized).

## References

- `backend/src/modules/dimo/device-connection-physical-state/device-connection-physical-state.obd-evidence.ts`
- `backend/src/modules/dimo/device-connection-physical-state/device-connection-physical-state.policy.ts`
- `physical-state-provenance-clock.policy.spec.ts`

# Vehicle & Device Connectivity — Proposed Target Semantic Model (Phase 3)

**Status:** PROPOSED — not implemented.  
**Decision:** VDC-DEC-004 (evidence dimensions), VDC-DEC-005 (freshness classification), VDC-DEC-003 (provider link semantics).

## Design principles

1. **No flattened connected/disconnected boolean** — operators and automations consume explicit dimensions.
2. **Provider-neutral core, provider-specific adapters** — DIMO `connectionStatus`, HM health freshness, LTE_R1 ~24h wake are adapter/profile inputs, not universal invariants.
3. **Evidence layers are independent** — poll success, provider fetch, source advance, physical plug, episode, and alert each prove different things.
4. **UNKNOWN is valid** — especially for authorization confidence and event-processing health when evidence is incomplete.

## Runtime dimensions (existing + proposed clarifications)

| Dimension | Current field | Proposed meaning | Authoritative evidence | Weak / non-authoritative |
|-----------|---------------|------------------|------------------------|---------------------------|
| **Authorization / entitlement** | `providerLinkState` (partial) | Tenant consent + IAM authorization + active data-source mapping confidence | ACTIVE consent, ACTIVE authorization, active DIMO mapping | `dimo_vehicles.connectionStatus` alone; historical identity without active chain |
| **Provider mirror health** | *(no dedicated field)* | Provider-reported link/session health from adapter mirror | `dimo_vehicles.connectionStatus`, HM connection state when integrated | Poll HTTP success without mirror update |
| **Provider reachability** | diagnostic + `providerFetchedAt` | SynqDrive successfully polled/received provider payload recently | Recent `providerFetchedAt`, SUCCESS poll in tier window | Stale skip path still updates `providerFetchedAt` |
| **Source telemetry freshness** | `telemetryState` | Age of canonical source observation instant | `sourceTimestamp` / resolved `lastSeenAt` chain | `providerFetchedAt`; poll time |
| **Physical device** | `physicalDeviceState` | OBD/hardware presence inference | Confirmed unplug/plug webhook; sustained `obdIsPluggedIn` | Open episode absence; poll success |
| **Data coverage** | `dataCoverageState` | Signal field completeness vs profile | Builder coverage % | Single-signal freshness |
| **Event processing health** | *(implicit in alerts)* | Webhook inbox → canonical → episode pipeline health | Inbox `processingStatus`, dead-letter, latency metrics | Provider link ERROR |
| **Attention** | `attentionState` | Operator actionability synthesis | Policy on dimensions above | Diagnostic tracker alone |
| **Overall** | `overallState` | Precedence-ranked operator headline | `connectivity-domain.priority.ts` chain | Legacy `onlineStatus` |

### Proposed naming clarification (VDC-DEC-003)

**Do not equate `providerLinkState` with DIMO `CONNECTED`.** Today `providerLinkState` behaves as **authorization confidence**, not provider session health. Target model either:

- **Option A (document):** Rename presentation to `authorizationLinkState` (breaking) — deferred.
- **Option B (recommended PROPOSED):** Keep field name; document dual sub-concepts in API contract:
  - `providerAuthorizationState` (consent/IAM/mapping)
  - `providerMirrorConnectionState` (adapter mirror, e.g. DIMO `CONNECTED`)

Expose mirror state as a **separate optional field** on runtime projection for DIMO/HM adapters without forcing UNKNOWN authorization to hide CONNECTED mirror.

## Recovery vocabulary (canonical meanings)

| Term | Meaning | May open episode? | May resolve episode? | Proves physical? | Proves telemetry? | Proves full recovery? |
|------|---------|-------------------|----------------------|------------------|-------------------|----------------------|
| `PHYSICAL_UNPLUG_OBSERVED` | Provider webhook or confirmed snapshot unplug | Yes (with policy) | No | Yes (provider-reported) | No | No |
| `PHYSICAL_REPLUG_OBSERVED` | Human-observed replug | No alone | Yes (with GT) | Yes (human) | No | No |
| `SNAPSHOT_PLUG_SIGNAL` | `obdIsPluggedIn=true` in snapshot path | No | Yes (observed Aug 2026) | Inferred present | No | No |
| `PHYSICAL_DEVICE_PRESENT` | Sustained positive physical evidence | No | Contributes | Yes | No | No |
| `PROVIDER_EVENT_RECEIVED` | Inbox row received | No | No | No | No | No |
| `PROVIDER_EVENT_CANONICALIZED` | Canonical domain event persisted | Triggers lifecycle | Enables resolution | No | No | No |
| `TELEMETRY_RESUMED` | Sustained fresh source per policy | No | Yes | No | Yes | No |
| `FULL_CONNECTIVITY_RECOVERED` | Strict source advance + healthy dimensions | No | Yes (composite) | Partial | Yes | **Yes** (target) |

**Invariant (PROPOSED):** `connected ≠ fresh telemetry`; `fresh providerFetchedAt ≠ new source data`; `long telemetry silence ≠ disconnected`; `plugged ≠ full connectivity recovered`; `successful poll ≠ source advance`; `absence of episode ≠ uninterrupted connection`.

## Threshold taxonomy (unchanged values)

Canonical domain thresholds remain **15m / 24h / 48h** (VDC-DEC-005). Parallel semantics:

| Surface | Class | Threshold | Disposition |
|---------|-------|-----------|-------------|
| `vehicle-state-interpreter` | DOMAIN CONNECTIVITY SEMANTIC | 15m/24h/48h | KEEP — canonical |
| Fleet `telemetryState` | DOMAIN CONNECTIVITY SEMANTIC | same | KEEP |
| `onlineStatus` 3-state | LEGACY SEMANTIC | OFFLINE ≥24h | SUPERSEDE_LEGACY_PATH |
| Admin DIMO debug status | LEGACY SEMANTIC | offline ≥24h | DOCUMENTATION_ONLY until aligned |
| Admin DIMO debug "Live" label | UI PRESENTATION SEMANTIC | <5m | DOCUMENTATION_ONLY |
| Frontend rental "Live" | UI PRESENTATION SEMANTIC | ~5m presentation | DOCUMENTATION_ONLY |
| `synqdrive_stale_snapshots_total` | OBSERVABILITY METRIC | 5m | KEEP_AS_IS — not domain truth |
| LTE_R1 +163–181s jitter window | PROVIDER PROFILE OBSERVATION | ~24h wake | DEFERRED — evaluate tolerance in implementation phase |

## HM / Smart5 portability

**Provider-neutral core:** freshness resolver buckets, runtime dimension assembly, evidence hierarchy, recovery vocabulary.

**Adapter/profile-specific (not core invariants):**

- DIMO `signalsLatest` + `obdIsPluggedIn` physical path
- DIMO device-connection webhooks and episodes
- LTE_R1 ~24h standby source advance cadence
- HM per-signal-group freshness windows (`HmFreshnessStatus`) — parallel until VDC-GAP-009 closed

Smart5 (future DIMO) should use DIMO adapter with profile overrides, not new core states.

## Explicit non-goals (Phase 3)

- No runtime field additions implemented
- No threshold changes
- No HM runtime integration design detail

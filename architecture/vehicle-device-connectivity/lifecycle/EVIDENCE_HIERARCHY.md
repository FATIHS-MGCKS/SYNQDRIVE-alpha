# Vehicle & Device Connectivity — Evidence Hierarchy

**Phase 3:** Proposed **canonical** provider-neutral hierarchy (VDC-DEC-004).  
**Phase 1 section** below documents **current code** behavior — preserved as historical baseline.

## Canonical hierarchy (PROPOSED — Phase 3)

Dimensions are **independent**. Do not collapse to a single connected boolean.

### 1. Physical device

| Strength | Evidence | Limitations |
|----------|----------|-------------|
| **Authoritative** | Confirmed OBD unplug/plug webhook; sustained `obdIsPluggedIn` with policy | Provider-reported; LTE_R1 OBD path only where applicable |
| **Weak** | Single snapshot plug bit; open episode | Snapshot may lag physical |
| **Negative** | Absence of open episode | **Does not prove** uninterrupted connection (VDC-CX-007) |
| **UNKNOWN** | No webhook + ambiguous snapshot | Default when OBD not applicable |
| **Adapter** | DIMO `obdIsPluggedIn`; future HM physical signals | Profile-specific |

### 2. Provider authorization / entitlement (`providerLinkState` target semantics)

| Strength | Evidence | Limitations |
|----------|----------|-------------|
| **Authoritative** | ACTIVE consent + ACTIVE authorization + active data-source mapping | Tenant-scoped |
| **Weak** | Historical identity without active chain | → UNKNOWN, not ACTIVE |
| **Negative** | REVOKED / expired consent | Blocks ACTIVE |
| **UNKNOWN** | Incomplete IAM/consent chain | **May coexist** with DIMO CONNECTED mirror (VDC-CX-011) |
| **Contradiction** | CONNECTED mirror + UNKNOWN link | Documented — separate mirror dimension proposed |

### 3. Provider mirror connection health (PROPOSED additive)

| Strength | Evidence | Limitations |
|----------|----------|-------------|
| **Authoritative** | `dimo_vehicles.connectionStatus` (DIMO adapter) | Not authorization |
| **Weak** | Last provider API success | HTTP ≠ session health |
| **Adapter** | DIMO CONNECTED/DISCONNECTED; HM connection state | Not universal VDC core |

### 4. Provider reachability (SynqDrive poll/fetch)

| Strength | Evidence | Limitations |
|----------|----------|-------------|
| **Authoritative** | Recent `providerFetchedAt` within tier | Updated even on stale skip |
| **Weak** | SUCCESS `dimo_poll_logs` | ≠ strict source advance (VDC-INV-001) |
| **Negative** | Poll FAILURE streak | Provider gateway or scheduling issue |
| **UNKNOWN** | No polls scheduled (vehicle status) | vs provider down |

### 5. Source telemetry freshness

| Strength | Evidence | Limitations |
|----------|----------|-------------|
| **Authoritative** | Canonical `sourceTimestamp` / resolved `lastSeenAt` | Monotonic guard |
| **Weak** | Individual signal timestamps in payload | May lag `lastSeen` (VDC-HYP-004) |
| **Stale behavior** | 15m/24h/48h buckets — **unchanged in Phase 3** | LTE_R1 +163–181s jitter → potential window only |
| **Negative** | `no_signal` | No observation instant |
| **Profile** | LTE_R1 ~24h wake cadence | Not HM universal |

### 6. Event processing health

| Strength | Evidence | Limitations |
|----------|----------|-------------|
| **Authoritative** | Inbox `processingStatus`, dead-letter, latency metrics | Aug 2026: ~4.7s delivery vs ~100.5m canonicalization |
| **Weak** | `lastErrorCode: enqueue_failed` | Root cause unknown (VDC-Q-013) |
| **Separate from** | Provider link ERROR (VDC-CX-008) | Must not conflate |
| **Terms** | PROVIDER_LINK_ERROR, WEBHOOK_DELIVERY_FAILURE, WEBHOOK_PROCESSING_FAILURE, QUEUE_ENQUEUE_FAILURE, CANONICALIZATION_DELAY, RETRY_RECOVERY | VDC-DEC-006 |

### 7. Data coverage

| Strength | Evidence | Limitations |
|----------|----------|-------------|
| **Authoritative** | Runtime builder coverage % vs profile | Signal group completeness |
| **Weak** | Single field present | |

### 8. Recovery (cross-cutting)

See [../reconciliation/TARGET_SEMANTIC_MODEL.md](../reconciliation/TARGET_SEMANTIC_MODEL.md) recovery vocabulary.  
`FULL_CONNECTIVITY_RECOVERED` → strict source advance required (VDC-DEC-010, VDC-HYP-007).

---

## Current code precedence (Phase 1 baseline — unchanged)

### Telemetry observation instant

`telemetry-freshness.resolver.ts` priority chain — [../signals/FRESHNESS_SEMANTICS.md](../signals/FRESHNESS_SEMANTICS.md).

**Reduced path:** `vehicles-operational.service.ts` `resolveRowTelemetry()` — VDC-GAP-010.

### Physical device

`physical-device-evidence.ts`: newest timestamp wins; tie-break plug > unplug > snapshot.

### Overall connectivity

`connectivity-domain.priority.ts` numeric ranks.

### Provider link

`provider-link-state.builder.ts` 10-step chain.

## Documented inconsistencies (tracked as CX)

- Poll success vs strict source advance — VDC-CX-010, VDC-INV-001
- Equality upsert vs advance proof — VDC-CX-010
- `providerFetchedAt` vs `sourceTimestamp`
- Episode absent vs physical unplug — VDC-CX-007
- Webhook failure vs provider link ERROR — VDC-CX-008
- DIMO CONNECTED vs UNKNOWN link — VDC-CX-011

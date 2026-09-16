# VDC RB-019 Phase 2 P2.5 — STATEFUL_SHADOW Pilot Scope Gate + Scope-Bound Observability

| Field | Value |
|-------|-------|
| **Date** | 2026-09-16 |
| **Type** | Implementation audit — **code/test/doc only** |
| **Authority** | Vehicle & Device Connectivity (`AUDIT_IN_PROGRESS`) |
| **Deployed Production SHA (unchanged)** | `6876fb412e26822e7a02ca322031267283bae4da` |
| **STARTING_MAIN_SHA** | `2c862b69930c24099d2cb76a968d6a3b1661e5d5` |
| **MAIN_DELTA_VDC_OVERLAP (6876fb41..origin/main)** | **NO** |

## Explicit non-claims

| Invariant | Value |
|-----------|-------|
| `PRODUCTION_DEPLOYED` | **NO** |
| `PRODUCTION_ENV_CHANGED` | **NO** |
| `FEATURE_FLAGS_ENABLED` | **NO** |
| `STATEFUL_SHADOW_ENABLED_IN_PRODUCTION` | **NO** |
| `AUTHORITY_MODE_IN_PRODUCTION` | **LEGACY** |
| `P2_5_CUTOVER_EXECUTED` | **NO** |
| `STATEFUL_SHADOW_PILOT_ENABLEMENT_READY` | **NO** (requires post-deploy verification) |
| `P2_5_CUTOVER_ACTIVATION_READY` | **NOT_PROVEN** |

---

## 1. Problem statement

At deployed SHA `6876fb41`, enabling global physical-state master + projection-write + shadow-compare would apply STATEFUL_SHADOW durable writes to **all** eligible Production DIMO scopes — unbounded blast radius.

Additionally, shadow comparison results already carried `organizationId` / `vehicleId` / `provider` in `PhysicalStateShadowComparisonResult.scope`, but structured logs and Prometheus metrics did not expose scope identifiers for operational cohort evidence required for ≥7-day pilot proof.

---

## 2. Deployed global-blast-radius finding

| Check (deployed SHA) | Result |
|----------------------|--------|
| `PILOT_SCOPE_GATE_PRESENT` | **NO** |
| `WEBHOOK_PATH_PILOT_SCOPED` | **NO** |
| `SNAPSHOT_PATH_PILOT_SCOPED` | **NO** |
| `SCOPE_LEVEL_OBSERVABILITY_AVAILABLE` | **NO** |

---

## 3. Pilot authority identity

Pilot membership is keyed exactly as:

```
organizationId + vehicleId + normalizeConnectivityProvider(provider)
```

**Not used:** `tokenId`, `bindingKey`, `deviceBindingId`, `station`, `providerDeviceIdHash`.

Device/binding replacement does **not** remove a vehicle from the pilot when org + vehicle + provider remain unchanged.

---

## 4. Fail-closed pilot config

| Field | Value |
|-------|-------|
| **Env** | `CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON` |
| **Default** | Absent / blank / `[]` / malformed → **zero** allowed LEGACY pilot scopes |
| **Parser** | `backend/src/config/connectivity-physical-state-shadow-pilot-scope.config.ts` |

Shape:

```json
[
  {
    "organizationId": "...",
    "vehicleId": "...",
    "provider": "DIMO"
  }
]
```

Gate decision reasons:

| Reason | Semantics |
|--------|-----------|
| `ALLOWED` | Scope in allowlist; unsafe flags off |
| `DENIED_NOT_CONFIGURED` | Empty/missing config |
| `DENIED_SCOPE_NOT_ALLOWLISTED` | Scope not in allowlist |
| `DENIED_INVALID_CONFIG` | Malformed JSON/entry/wildcard |
| `DENIED_UNSAFE_SIDE_EFFECTS_FLAG` | `sideEffectsEnabled=true` blocked audibly |
| `DENIED_UNSAFE_AUTHORITY_CUTOVER_FLAG` | `authorityCutoverEnabled=true` blocked audibly |
| `BYPASSED_PHYSICAL_AUTHORITY` | PHYSICAL latched scope ignores pilot gate |

No wildcards. No implicit all-scope fallback.

---

## 5. Critical ordering invariant

For **LEGACY** authority, pilot gating occurs in `resolveRuntimePolicy()` **before**:

- `ensureAuthorityRow()`
- physical projection mutation
- transition mutation
- webhook-event-history mutation
- shadow comparison recording tied to physical writes

Non-pilot LEGACY scopes with global master ON perform **zero** authority/projection/transition/webhook-event/episode/alert/outbox durable mutations while preserving existing LEGACY authoritative behavior.

---

## 6. PHYSICAL authority bypass invariant

```
PHYSICAL authority > pilot membership
```

Scopes latched `authorityMode = PHYSICAL` continue PHYSICAL routing even when:

- not in pilot allowlist
- pilot env missing/malformed/removed

Removing a pilot scope **cannot** restore LEGACY for an already-PHYSICAL scope.

---

## 7. Webhook + snapshot path semantics

Both `writeWebhookEvidence` and `writeSnapshotEvidence` call `resolveRuntimePolicy` first.

| Authority | Pilot | Result |
|-----------|-------|--------|
| LEGACY | allowed + valid shadow flags | STATEFUL_SHADOW durable path |
| LEGACY | denied | zero physical durable mutation |
| PHYSICAL | any | existing PHYSICAL-authority behavior |

`statefulShadow` additionally requires `pilotScopeAllowed === true`.

---

## 8. Scope-bound observability

### Structured logs

| Event | Scope fields |
|-------|--------------|
| `physical_state_shadow_comparison` | `organizationId`, `vehicleId`, `provider`, `classification`, `correctnessBlocking`, `authorityMode`, `legacyDecision`, `physicalDecision`, `observedAt`, `evidenceReferenceId`, `bindingKey` |
| `physical_state_shadow_pilot_scope_gate` | `organizationId`, `vehicleId`, `provider`, `allowed`, `reason` |

### Prometheus (low cardinality)

New counter: `synqdrive_connectivity_physical_state_shadow_pilot_scope_gate_total` with labels `allowed`, `reason`, `provider` only.

Existing shadow metrics **unchanged** — no `organizationId` / `vehicleId` labels added.

---

## 9. Seven-day evidence durability

| Field | Value |
|-------|-------|
| `SEVEN_DAY_SCOPE_EVIDENCE_SOURCE` | PostgreSQL `device_connection_physical_state_shadow_observations` |
| `SEVEN_DAY_RETENTION_PROVEN` | **YES** (default retention 90 days via `CONNECTIVITY_PHYSICAL_STATE_SHADOW_OBSERVATION_RETENTION_DAYS`) |

**Why not PM2 logs alone:** Production logrotate (14-day retain, per-process files, no query API) does not guarantee restart-safe, replica-aggregated, scope-filtered retrieval across a complete ≥7-day pilot window.

**Durable table contract:**

- Pilot-only bounded storage of shadow comparison rows
- Queryable by `organizationId + vehicleId + provider + observedAt` window
- `summarizeScopeWindow()` for classification/blocker counts
- `pruneExpiredObservations()` retention cleanup
- Covered by PostgreSQL integration tests (PSG-W + durable query cases)

---

## 10. Test matrix PSG-A..W

| Case | Description | Expected |
|------|-------------|----------|
| PSG-A | Missing pilot config | zero physical mutations |
| PSG-B | Empty `[]` config | zero physical mutations |
| PSG-C | Malformed JSON | fail closed |
| PSG-D | Malformed scope entry | fail closed |
| PSG-E | Allowlisted scope | shadow path reachable |
| PSG-F | Different org | denied |
| PSG-G | Different vehicle | denied |
| PSG-H | Different provider | denied |
| PSG-I | Provider casing normalization | allowed |
| PSG-J | Binding replacement same scope | still allowed |
| PSG-K | Non-pilot webhook | zero writes |
| PSG-L | Non-pilot snapshot | zero writes |
| PSG-M | Pilot webhook | shadow writes, sideEffects=false |
| PSG-N | Pilot snapshot | shadow writes, sideEffects=false |
| PSG-O | Non-pilot denial preserves LEGACY behavior | pass |
| PSG-P | PHYSICAL non-pilot still PHYSICAL | pass |
| PSG-Q | PHYSICAL with missing/malformed pilot config | pass |
| PSG-R | sideEffects remain zero during pilot | pass |
| PSG-S | authorityCutover not granted by pilot | pass |
| PSG-T | Shadow structured log scope-bound | pass |
| PSG-U | No org/vehicle Prometheus labels | pass |
| PSG-V | Mixed pilot/non-pilot in one process | pilot-only writes |
| PSG-W | Multi-tenant PG proof | non-pilot zero, pilot mutates |

---

## 11. Production remains unchanged

This PR does **not** deploy, enable flags, configure signing keyring, or execute cutover.

Production remains:

- authority = **LEGACY**
- physical authority scopes = **0**
- all physical-state flags = **OFF**
- `STATEFUL_SHADOW` = **OFF**

---

## 12. Exact next operational step after merge/deploy

1. Deploy this PR to Production (flags still OFF).
2. Configure `CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON` with the formally approved pilot cohort only.
3. Enable master + projection-write + shadow-compare (keep `sideEffects=false`, `authorityCutover=false`).
4. Verify gate logs + durable observation rows for pilot scopes only; confirm non-pilot scopes show zero physical-state mutation deltas.
5. Accumulate ≥7 days scope-bound shadow evidence before cutover activation proof.

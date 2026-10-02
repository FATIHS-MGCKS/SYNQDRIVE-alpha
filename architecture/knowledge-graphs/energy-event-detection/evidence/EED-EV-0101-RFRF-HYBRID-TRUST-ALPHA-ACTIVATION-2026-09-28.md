# EED-EV-0101 — RFRF Hybrid Trust Alpha Fleet Scoped Activation

**Date:** 2026-09-28  
**Status:** PROVEN_BY_TEST (repository + isolated PostgreSQL gate)

## Summary

Introduces **scoped production activation** for hybrid absolute signal trust v2:

- `RFRF_HYBRID_TRUST_ACTIVATION_MODE`: `OFF` (default) | `ALPHA_ALLOWLIST`
- Explicit UUID allowlists for organizations and/or vehicles — no wildcards, empty lists fail closed
- Semantic hybrid authority (`evaluateHybridAbsoluteSignalTrust`) remains observation-local and general
- Effective promotion trust = activation layer applied over `computedHybridClassification`
- `ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE` remains `false` (no global flip)

## Production rollout model

SynqDrive-owned **Alpha test fleet** only via `ALPHA_ALLOWLIST` — not fleet-wide activation.

Activation does not bypass convergence, promotion execution, baseline recency, READY refresh, OQ-015, or native duplicate firewalls.

## Promotion-time authority hardening (2026-09-29)

- `RawRefuelPromotionService` recomputes activation from **current env** + **persisted hybrid provenance** + **Vehicle.organizationId** at promotion; stale `evidenceMeta.hybridTrustActivation` is not authoritative alone.
- `combineAuthoritativeAndContextPromotionTrust`: caller/recovery context may only **restrict**, never elevate.
- Missing/malformed `hybridAbsoluteSignalTrust` provenance ⇒ effective `UNKNOWN` (no fallback to row `absoluteSignalTrust`).
- Malformed allowlist token invalidates the **entire** configured list (no partial UUID acceptance).
- Promotion audit persisted in `qualityMeta.promotionTimeHybridTrustActivation` (+ timestamp); raw allowlist values are never persisted.
- `RFRF_SIGNAL_TRUST_RESOLVER_VERSION` unchanged: activation policy version (`rfrf-hybrid-trust-activation-v1`) is the separate boundary; READY refresh does not require provider refetch solely for activation env changes.

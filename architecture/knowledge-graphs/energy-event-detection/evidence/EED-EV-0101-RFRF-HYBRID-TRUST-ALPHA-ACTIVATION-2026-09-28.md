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

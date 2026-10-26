# VSI P0 semantic fingerprint — explicit Fable review questions

| Field | Value |
|-------|-------|
| **Date** | 2026-10-26 |
| **PR** | #2174 (P0 core hardening + concurrency hardening) |
| **Scope** | Review only — no change requested in this document |

## Questions for independent scientific review

1. **`strictSourceAdvanced` normalization** — Semantic identity maps any non-`true` value to `NOT_ADVANCED`. Can this suppress knowledge transitions where `UNKNOWN` vs `false` materially affects downstream consumer interpretation?

2. **Omitted quality dimensions** — `freshnessClassification`, `qualityClassification`, and `confidenceLevel` are excluded from revision identity. Are these omissions safe for P5-H1 historical as-of semantics and APDS read-only correlation when evaluation clock moves without source timestamp advance?

3. **Bundle ledger metrics** — `observedSamples`, `provenSourceAdvances`, cadence fields, and `maxStaleIntervalSeconds` are excluded from semantic identity. Can P2C ledger growth without bundle source advance cause revision under-counting of capability drift?

4. **`contentFingerprint` vs `signalsSnapshot` consistency** — Operational refresh updates `signalsSnapshot` operational fields while `contentFingerprint` remains the semantic hash. Does any consumer assume byte-level snapshot equality with `contentFingerprint`?

5. **Operational monotonic merge** — Fetch-only refresh merges `lastMaterializedProviderFetchAt` and per-signal `lastProviderFetchAt` with `max()` against the persisted row. Is this sufficient for concurrent snapshot-hook races without inventing semantic revisions?

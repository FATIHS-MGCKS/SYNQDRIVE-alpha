# Vehicle Connectivity — Open Hypotheses

Falsifiable questions — **not conclusions**. Each hypothesis has a graph node `VC-HYP-*`.

---

## VC-HYP-001 — ~24h stationary source update

| Field | Value |
|-------|-------|
| **Statement** | LTE_R1 may emit a periodic source update approximately every 24h while the vehicle remains stationary. |
| **Reason** | Pending forensic session on KS MX 2024 suggested ~86.5k s gaps between distinct `lastSeen` values post-trip; aligns with AI mapper standby window upper bound (24h). |
| **Falsification** | Observe ≥5 post-trip wakes with gaps consistently **not** near 86.400 s ± tolerance; or sustained silence >48h without disconnect evidence. |
| **Required evidence** | Deduplicated ClickHouse `telemetry_snapshots`, VLS `source_timestamp` series, multi-day Production window |
| **Epistemic state** | INFERRED |
| **Validation status** | PROPOSED |

---

## VC-HYP-002 — IO174 not exposed via signalsLatest

| Field | Value |
|-------|-------|
| **Statement** | Periodic standby update may be device-timer initiated, but IO174 is not exposed through the SynqDrive DIMO `signalsLatest` ingestion path. |
| **Reason** | VSS GraphQL abstracts Ruptela raw IO; no IO174 in latest VLS payloads indexed to date. |
| **Falsification** | Discover IO174 or sleep-timer fields in raw ingest archive, reference capture, or provider raw tables. |
| **Required evidence** | Raw payload archives, DIMO MCP/device raw surfaces, reference-evidence captures |
| **Epistemic state** | INFERRED |
| **Validation status** | PROPOSED |

---

## VC-HYP-003 — Poll frequency ≠ R1 source-update frequency

| Field | Value |
|-------|-------|
| **Statement** | SynqDrive snapshot poll frequency is independent of actual R1 source-update frequency. |
| **Reason** | Scheduler polls ~every 5 min while device may source-silent for hours; monotonic guard drops stale responses. |
| **Falsification** | 1:1 correlation between `dimo_poll_logs` SUCCESS and new `source_timestamp` over 72h stationary window. |
| **Required evidence** | `dimo_poll_logs`, VLS history or ClickHouse deduped timeline |
| **Epistemic state** | INFERRED |
| **Validation status** | PROPOSED |

---

## VC-HYP-004 — Per-signal timestamp heterogeneity

| Field | Value |
|-------|-------|
| **Statement** | Individual signals may retain older timestamps even when `signalsLatest.lastSeen` advances on standby wakes. |
| **Reason** | Latest KS MX 2024 payload showed fuel/ECT stale at trip-end while LV/GNSS updated on wake. |
| **Falsification** | All signal `.timestamp` fields advance in lockstep with `lastSeen` on every standby wake. |
| **Required evidence** | Per-wake `raw_payload_json` capture or reference-evidence time series |
| **Epistemic state** | INFERRED |
| **Validation status** | PROPOSED |

---

## VC-HYP-005 — Long silence is not disconnect

| Field | Value |
|-------|-------|
| **Statement** | A healthy sleeping LTE_R1 may remain source-silent for many hours and must not be classified as disconnected based solely on short `lastSeen` age. |
| **Reason** | Product false alarms if standby tolerance too aggressive; AI mapper already distinguishes standby up to 24h. |
| **Falsification** | Device confirmed unplugged/offline while source-silent <24h without other fault signals. |
| **Required evidence** | Controlled unplug test + Production stationary baselines |
| **Epistemic state** | INFERRED |
| **Validation status** | PROPOSED |

---

## VC-HYP-006 — Distinct fault states required

| Field | Value |
|-------|-------|
| **Statement** | Device disconnected, device sleeping, DIMO provider unavailable, permission failure, and vehicle not producing CAN data require separate connectivity states. |
| **Reason** | Collapsed states cause incorrect operator action and alert noise. |
| **Falsification** | Single observable dimension reliably separates all cases in Production data. |
| **Required evidence** | Fault injection matrix (ground-truth plan), episode + permission + source timelines |
| **Epistemic state** | INFERRED |
| **Validation status** | PROPOSED |

---

## VC-HYP-007 — Reconnect requires fresh device evidence

| Field | Value |
|-------|-------|
| **Statement** | Reconnect should require fresh provider/device evidence (new monotonic `sourceTimestamp`), not merely a successful HTTP/API poll returning stale `signalsLatest`. |
| **Reason** | Monotonic guard already prevents VLS regression; reconnect semantics may still treat poll success as recovery incorrectly in UI. |
| **Falsification** | Product correctly stays in suspect/disconnected when polls succeed but `lastSeen` unchanged for >N hours. |
| **Required evidence** | Fleet connectivity projection code paths + UI acceptance tests |
| **Epistemic state** | INFERRED |
| **Validation status** | PROPOSED |

# Physical Drive Index — Identity & Deduplication

## Rule

One **physical drive** = one continuous operator/session on one vehicle with a single canonical `tripId` (or sealed reference-drive session ID). Multiple experiments, algorithms, or reports on the **same** `tripId` are **one** physical drive.

**TC-1 … TC-6** are **test-case anchors** on Tesla Oct-20 trips — **not** separate drives.

## Verified physical drives (EXP021 core)

| PHYS_ID | Vehicle | tripId | UTC window (primary) | Same as other IDs? |
|---------|---------|--------|----------------------|-------------------|
| `PHYS-TESLA-20261016` | Tesla Model 3 `68868291-…` token **186946** | `358d0158-b2a9-47ed-af26-33926c5770b4` | Grid from `2026-10-16T03:36:00Z` (1136 buckets) | **≠** Oct-20 TRIPs; in-repo LDI-10D |
| `PHYS-TESLA-20261020-A` | same | `11f5a645-752e-4b8a-b20a-9f1fc3a6673e` | Oct 20 campaign (B1–B7.4) | **NOT_IN_REPO** @ `0a16ffb5b` |
| `PHYS-TESLA-20261020-B` | same | `0f8d2f76-9b09-4aba-8c56-fa7e2ce1c5a8` | Oct 20 campaign | **NOT_IN_REPO** @ `0a16ffb5b` |
| `PHYS-TIGUAN-20261019` | VW Tiguan `19fedd4b-…` token **192922** | `632dc9c5-a8d9-45ce-a269-abe89d22d677` | `2026-10-19T10:15:00Z` – `10:39:39.603Z` | Same **vehicle** as RD001/RD003, **different** sessions |
| `PHYS-AUDI-20261014` | Audi A4 KS MS 661 `c10351f8-…` | `d0af9cc7-ce0d-4e40-9854-2c1341e83bed` | `2026-10-14T05:37:00Z` – `06:01:40Z` (1480 s) | **≠** Tiguan despite equal bucket count |

## Historical reference drives (pre-Oct-2025 EXP021)

| PHYS_ID | Series | Vehicle | Session / notes |
|---------|--------|---------|-----------------|
| `PHYS-RD001` | RD001 | Tiguan `19fedd4b` | `06638509-…`; no video GT |
| `PHYS-RD002` | RD002 | C63 `a60c0749` | Sealed HF cadence study |
| `PHYS-RD003` | RD003 | Tiguan WOB L 7503 | `0fa040aa-…`; sparse video |
| `PHYS-RD004` | RD004 | KS MX 2024 | `f1e81e78-…`; segments A/B **same** physical drive |

## Session benchmarks (not single trip)

| PHYS_ID | Description |
|---------|-------------|
| `PHYS-KS-MX-EXP021-CAL` | EXP-019/021 HF cadence calibration session (KS MX 2024) |
| `PHYS-KS-MS661-UBV2` | KS MS 661 upper-bound v2 forensic session |

## Synthetic / golden (not a road drive)

| PHYS_ID | Description |
|---------|-------------|
| `PHYS-GOLDEN-C1-R1-002` | Sealed coordinate window **C1-MOBILE-FULL-R1-002** for S3A→S1 tests |

## Count reconciliation (master-review “12”)

| Interpretation | Count |
|----------------|------:|
| REF-001 … REF-012 register **rows** | 12 |
| **Distinct physical drives** (core EXP021 + RD + KS, excl. golden) | **11** |
| **Distinct physical drives** (core five: Tesla×3 + Tiguan + Audi P2.1) | **5** |
| TC-1 … TC-6 as separate “trips” | **0** (invalid — use DRIVER_REPORTED anchors) |

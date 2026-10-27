# Tire V3 — production release isolation (51adb234 → cutover)

| Role | SHA |
|------|-----|
| Production (2026-10-28 audit) | `51adb23499653d0f2c7774d98737a34bd615b262` |
| Tire-complete stack (`TIRE_COMPLETE_SHA`) | `4ba28a9b0e613ee2d847b2854222cbc979f70925` |
| `main` tip at audit (includes ZB-I #2198) | `9512ff95f357b698efa71027358e22473db5b0c8` |

## Recommended release candidate (forward-only)

**Do not deploy `main` tip blindly.** Use:

1. **`4ba28a9`** — minimum commit containing Tire V3 P1–P3 (#2186, #2197, #2201, #2202).
2. **+ UI authority fix** — branch `cursor/tire-v3-ui-authority-release-gate-b126` (hides V2 tread-life % when `wearReadModel=v3`).
3. **Exclude `9512ff95`** (#2198 P4 ZB-I storage) from the first tire cutover deploy unless separately approved.

Deploy SHA = RC branch HEAD after CI gate success (not production `51adb234`).

## Tire V3 commits (in `51adb234..4ba28a9`)

| Commit | Description |
|--------|-------------|
| `e0c077623` | #2186 P1 measurement ingestion |
| `b9a561408` | #2197 P2 customer read adapter |
| `0d4be9153` | V3 alert reason codes |
| `ebe9e67dd` | #2201 AND-gate + V2 snapshot suppression |
| `4ba28a9b0` | #2202 P3 offline validation artifacts |

## Unrelated workstream commits (same range — ship with `4ba28a9` if deploying that SHA)

| Area | Commits / PRs | Risk |
|------|----------------|------|
| VSI RPM classification | #2196, #2197-era fixes | Backend analytics; not tire UI |
| Vehicle identity / Fahrzeugschein | #2194, #2195 | Flag-gated UI |
| ZB-I document extraction P1 | #2191 | Flag-gated OCR contract |
| CI / Legal dispatch | #2199, `394c73057` | CI only |
| RPM export cleanup | #2200 | Dev script removal |
| Trip UI / other | (between prod and 4ba28a9) | Review changelog |

**Beyond `4ba28a9` on `main`:** `9512ff95` (#2198 ZB-I storage ACL) — **out of tire RC scope**.

## Database migrations (`51adb234` → `4ba28a9`)

| Migration | Workstream |
|-----------|------------|
| `20261027150000_document_extraction_registration_certificate_type` | Document / ZB-I |
| `20261027180000_vehicle_registration_identity_provenance` | Vehicle identity |

No tire-specific DDL in this delta. Run standard `prisma migrate deploy` on deploy.

## Deployment dependencies

- Rolling dual-replica deploy (`3001` / `3002`) via `vps-deploy-release.sh`.
- Shared `/opt/synqdrive/shared/backend.env` for both cutover flags (see `TIRE_WEAR_V3_CUTOVER_PRODUCTION.md`).
- CI gate success on **exact deploy SHA** before owner-authorized deploy.

## Cross-workstream risks

- Migrations add vehicle/document columns — backward compatible with flags OFF.
- Tire cutover flags independent of ZB-I / vehicle-identity feature flags.
- Production today has **no** `TIRE_WEAR_V3_*` env keys.

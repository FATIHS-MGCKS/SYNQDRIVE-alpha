# Vehicle Physics Phase A.1 — Master Mistral live validation (manual)

Production baseline: `2076c2e3feef9fabe681ab24ec078f979b4a4f7e`

Cloud agents **cannot** call `GET /api/v1/vehicles/register/ai-specs` without a live **MASTER_ADMIN** Clerk session (`401` unauthenticated). Do not treat local/off-repo Mistral calls as production live results.

## Fleet (F.S Mobility Service — `faa710c9-6d91-4079-a7d5-91fdccdec14a`)

| Label | DIMO token | vehicle_id |
|-------|------------|------------|
| Tesla Model 3 | 186946 | `68868291-5478-42cd-b0c4-cc77b2a78e21` |
| VW Tiguan | 192922 | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| Audi A4 | 2016 / 187361 | `c10351f8-b6a2-4258-947f-631aeaa6d359` |
| VW Arteon | 187784 | `8c850ff1-4201-432b-af2e-2711dbc7ca48` |

## Manual UI test (authorized Master)

1. Sign in to **Master** with `MASTER_ADMIN`.
2. Open **Registered vehicle** → **Edit** for each row above.
3. Use **Fetch AI specs** (existing Mistral stream) — do not edit motion fields before fetch if you want empty-field merge behavior.
4. Record **Mistral candidates** separately from form values already on the vehicle:
   - `curbWeightKg`, `systemMotorPowerKw`, `accel0To100S`, `variantAssumption`
5. **Save** only after reviewing: save creates an **ESTIMATED** `VehicleMotionPhysicsReference` with source **MISTRAL_AI** when motion fields were filled from AI in that session (Phase A.1).
6. Use **Confirm reference** for explicit **CONFIRMED** — not automatic on save.

## VW Tiguan identity (read-only)

- Vehicle row: `vin_provenance=LEGACY_SYNTHETIC`, placeholder-style VIN vs DIMO VIN mismatch.
- Official path: reconcile via **Vehicle Onboarding / Master registration** using DIMO-linked identity — see `architecture/vehicle-onboarding/evidence/VO2_VIN_NULLABLE_PG.md` (synthetic `DIMO-*` classification). **No DB hotfix** without owner approval; do not use synthetic VIN for manufacturer fingerprinting or VERIFIED flows.

## Agent status

`MASTER_MISTRAL_LIVE=AUTH_BLOCKED` in unattended agent runs.

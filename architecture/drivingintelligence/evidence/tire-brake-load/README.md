# Tire and brake load evidence contract

**Purpose:** Operational load proxies vs measured wear; health module consumption.

**Primary sources:**
- `backend/src/modules/vehicle-intelligence/driving-impact/driving-impact-load-components.ts`
- `backend/src/modules/vehicle-intelligence/driving-intelligence-jobs/handlers/driving-health-impact-publish.handler.ts`

**Invariant:** DI-INV-LOAD-NOT-WEAR-001 — proxies must not be presented as physical wear measurements.

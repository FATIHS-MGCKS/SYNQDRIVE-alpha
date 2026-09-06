# Driving events evidence contract

**Purpose:** Event types, detection thresholds, severity, native vs HF provenance.

**Primary sources:**
- `backend/src/modules/vehicle-intelligence/trips/hf-acceleration.ts`
- `backend/src/modules/vehicle-intelligence/trips/hf-braking.ts`
- `backend/src/modules/vehicle-intelligence/trips/hf-abuse.ts`
- `backend/src/modules/vehicle-intelligence/dimo-native-driving-events/`

**Authority split:** LTE_R1 short-event misuse → native events; HF whole-trip → Trip Signal Summary.

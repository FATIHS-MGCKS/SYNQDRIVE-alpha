/**
 * SynqDrive — Engine Context Guardrails (LTE_R1 / ICE vs Tesla / EV)
 *
 * Central, pure predicates that decide whether ICE engine-context enrichment
 * (RPM / throttle / engine load / coolant interpretation) may run for a vehicle.
 * They build STRICTLY on the existing capability layer (`vehicle-capabilities.ts`)
 * so there is no second source of truth and no scattered
 * `if (hardwareType === 'LTE_R1')` / `if (fuelType === 'ELECTRIC')` checks.
 *
 * GUARDRAILS (foundation — not yet wired into enrichment):
 *   - ICE engine-context enrichment is allowed ONLY for engine-capable vehicles
 *     (engineSignalsAvailable === true), i.e. non-BEV powertrains.
 *   - Tesla / EV must NEVER enter ICE engine-context logic.
 *   - Native DIMO behavior events stay allowed for ALL LTE_R1 vehicles
 *     (including Tesla/EV) — these guards do NOT gate native event intake.
 *   - The new LTE_R1 context architecture is intentionally LTE_R1-scoped; SMART5 /
 *     UNKNOWN are not treated as LTE_R1 native-event anchors here.
 *
 * All functions are pure and side-effect free.
 */

import type { HardwareType } from '@prisma/client';
import {
  getVehicleCapabilities,
  deriveVehicleCapabilityProfile,
} from '../vehicle-capabilities';

/**
 * Minimal vehicle shape required by the guardrails. Accepts the common Prisma
 * Vehicle fields (`hardwareType`, `fuelType`) without coupling to the full model.
 */
export interface EngineContextVehicleInput {
  hardwareType?: HardwareType | null;
  /** Prisma Vehicle.fuelType or equivalent free-form string (case-insensitive). */
  fuelType?: string | null;
}

function resolveHardwareType(vehicle: EngineContextVehicleInput): HardwareType {
  return vehicle.hardwareType ?? 'UNKNOWN';
}

/**
 * True if the vehicle can emit native DIMO `behavior.*` events (LTE_R1 path).
 *
 * IMPORTANT: this is powertrain-agnostic. An LTE_R1 Tesla/EV is still native-event
 * capable — native event intake must keep working for it. Only ICE *engine
 * context* enrichment is gated by the EV/ICE guards below.
 */
export function isLteR1NativeEventCapable(vehicle: EngineContextVehicleInput): boolean {
  return getVehicleCapabilities(resolveHardwareType(vehicle)).nativeEventCapable;
}

/**
 * True if combustion-engine signals (RPM / throttle / engine load / coolant) are
 * plausibly available — i.e. the vehicle is NOT battery-electric. This is the
 * `engineSignalsAvailable` powertrain gate from the capability profile.
 */
export function isIceEngineContextApplicable(vehicle: EngineContextVehicleInput): boolean {
  const profile = deriveVehicleCapabilityProfile({
    hardwareType: vehicle.hardwareType,
    fuelType: vehicle.fuelType,
  });
  return profile.engineSignalsAvailable;
}

/**
 * True if the vehicle is battery-electric (Tesla / EV). EV vehicles must be routed
 * to a separate EV context path later — never into ICE engine logic.
 */
export function isEvContextApplicable(vehicle: EngineContextVehicleInput): boolean {
  const profile = deriveVehicleCapabilityProfile({
    hardwareType: vehicle.hardwareType,
    fuelType: vehicle.fuelType,
  });
  return !profile.engineSignalsAvailable;
}

/**
 * Master guardrail: should ICE event-context enrichment run for this vehicle?
 *
 * Requires BOTH:
 *   - LTE_R1 native-event capability (the new architecture is LTE_R1-anchored), AND
 *   - an applicable combustion powertrain (engineSignalsAvailable === true).
 *
 * Returns false for Tesla/EV (no engine), for non-LTE_R1 hardware, and whenever
 * the powertrain is electric. Foundation predicate — no caller wired yet, so it
 * cannot change current behavior.
 */
export function shouldRunIceEventContextEnrichment(
  vehicle: EngineContextVehicleInput,
): boolean {
  return isLteR1NativeEventCapable(vehicle) && isIceEngineContextApplicable(vehicle);
}

/**
 * Explicit negative guard for callers that want to assert "skip ICE context here".
 * True when the vehicle is battery-electric (Tesla/EV) and therefore must NOT run
 * ICE engine-context interpretation.
 */
export function shouldSkipIceContextForEv(vehicle: EngineContextVehicleInput): boolean {
  return isEvContextApplicable(vehicle);
}

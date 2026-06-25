/**
 * SynqDrive V3 — Vehicle Capability Layer
 *
 * Resolves runtime behavior capabilities from a vehicle's hardware type.
 * Do NOT scatter raw `if (hardwareType === 'LTE_R1')` checks across the codebase.
 * Call `getVehicleCapabilities()` once and pass the result where needed.
 *
 * Hardware types:
 *   LTE_R1  — DIMO LTE dongle. Reports native harsh-event signals via the
 *              Telemetry API. Driving Events are sourced from Telemetry API Events.
 *   SMART5  — SynqDrive SMART5 hardware. Driving Events are derived from local
 *              HF time-series reconstruction (the existing V2 path).
 *   UNKNOWN — Default for unclassified vehicles. Falls back to HF_DERIVED
 *              behaviour (same as SMART5) to preserve backward compatibility.
 */

import type { HardwareType } from '@prisma/client';

// ── Public types ─────────────────────────────────────────────────────────────

export type DrivingEventsSource = 'TELEMETRY_EVENTS' | 'HF_DERIVED';
export type AbuseSource = 'HF';

export interface VehicleCapabilities {
  /**
   * Primary source for normal Driving Events (harsh braking, acceleration, etc.)
   * - TELEMETRY_EVENTS → ingest from DIMO Telemetry API Events (LTE_R1)
   * - HF_DERIVED       → reconstruct from local HF time-series (SMART5 / UNKNOWN)
   */
  drivingEventsSource: DrivingEventsSource;

  /**
   * Abuse detection source — always HF for both hardware types.
   * HF pipeline runs for all vehicles regardless of hardware type.
   */
  abuseSource: AbuseSource;

  /**
   * Whether the HF pipeline should also produce contextual enrichment badges
   * for event-native Driving Events (LTE_R1 only).
   * When true, the HF pipeline annotates imported events with cold-engine,
   * RPM, and throttle context where available.
   */
  supportsHfContextEnrichment: boolean;

  /**
   * Whether this vehicle should receive the full HF-based Driving Event
   * reconstruction (acceleration/braking event objects in TripBehaviorEvent).
   * True for SMART5/UNKNOWN; false for LTE_R1 (where events come from Telemetry API).
   */
  useHfDrivingEvents: boolean;

  /**
   * Whether this vehicle can emit native DIMO behavior.* events
   * (harsh braking/acceleration/cornering) via the Telemetry API.
   * Read-only descriptor — does NOT change any routing on its own.
   */
  nativeEventCapable: boolean;

  /**
   * Whether the HF (1s) reconstruction pipeline is applicable for this vehicle
   * class at all. True for every class today (HF runs for abuse on all classes).
   * Read-only descriptor.
   */
  hfCapable: boolean;
}

// ── Capability profile (read-only diagnostics) ────────────────────────────────

/**
 * A richer, read-only capability profile that combines the static hardware
 * capability matrix with optional runtime context (fuel type, observed HF
 * waypoint density). This is intended for diagnostics/UI (e.g. the Data Analyse
 * page) so we can honestly state what a vehicle can and cannot do WITHOUT
 * scattering a second source of truth. It never changes enrichment routing.
 */
export interface VehicleCapabilityProfile {
  hardwareType: HardwareType;
  /** Native DIMO behavior.* events available (LTE_R1). */
  nativeEventCapable: boolean;
  /** HF (1s) reconstruction applicable for this class. */
  hfCapable: boolean;
  /**
   * Only snapshot-level (~30s) telemetry is realistically available. True when
   * no dense HF stream is observed for the vehicle. Aggressive misuse detection
   * (e.g. launch-like start) must not be claimed in this state.
   */
  snapshotOnly: boolean;
  /**
   * Whether combustion-engine signals (RPM, coolant ECT, throttle, engine load)
   * are plausibly available. False for battery-electric vehicles, where all
   * engine-signal-based detectors are impossible regardless of HF density.
   */
  engineSignalsAvailable: boolean;
  /** Short human-readable label for UI. */
  profileLabel: string;
}

export interface DeriveCapabilityProfileInput {
  hardwareType: HardwareType | null | undefined;
  /** Prisma Vehicle.fuelType or equivalent free-form string (case-insensitive). */
  fuelType?: string | null;
  /** Whether a dense HF waypoint/point stream was observed (e.g. ClickHouse). */
  hasHfWaypoints?: boolean | null;
}

/** Returns true if the fuel type string denotes a battery-electric vehicle. */
function isBatteryElectric(fuelType?: string | null): boolean {
  if (!fuelType) return false;
  const f = fuelType.trim().toLowerCase();
  return (
    f === 'electric' ||
    f === 'ev' ||
    f === 'bev' ||
    f === 'battery_electric' ||
    f === 'battery-electric' ||
    f.includes('electric')
  );
}

/**
 * Derive a read-only capability profile. Pure function, no side effects.
 * Does NOT alter any driving-event/abuse routing — diagnostics only.
 */
export function deriveVehicleCapabilityProfile(
  input: DeriveCapabilityProfileInput,
): VehicleCapabilityProfile {
  const hardwareType: HardwareType = input.hardwareType ?? 'UNKNOWN';
  const caps = getVehicleCapabilities(hardwareType);
  const bev = isBatteryElectric(input.fuelType);
  // Engine signals require a combustion engine. For UNKNOWN fuel we assume they
  // *may* be available (conservative — do not pre-emptively disable detectors).
  const engineSignalsAvailable = !bev;
  const snapshotOnly = input.hasHfWaypoints === true ? false : input.hasHfWaypoints === false ? true : false;

  const profileLabel = caps.nativeEventCapable
    ? 'LTE R1 (native events)'
    : bev
      ? 'Cloud/EV (HF speed-only)'
      : 'HF reconstruction';

  return {
    hardwareType,
    nativeEventCapable: caps.nativeEventCapable,
    hfCapable: caps.hfCapable,
    snapshotOnly,
    engineSignalsAvailable,
    profileLabel,
  };
}

// ── Capability resolution ─────────────────────────────────────────────────────

const CAPABILITIES: Record<HardwareType, VehicleCapabilities> = {
  LTE_R1: {
    drivingEventsSource: 'TELEMETRY_EVENTS',
    abuseSource: 'HF',
    supportsHfContextEnrichment: true,
    useHfDrivingEvents: false,
    nativeEventCapable: true,
    hfCapable: true,
  },
  SMART5: {
    drivingEventsSource: 'HF_DERIVED',
    abuseSource: 'HF',
    supportsHfContextEnrichment: false,
    useHfDrivingEvents: true,
    nativeEventCapable: false,
    hfCapable: true,
  },
  UNKNOWN: {
    // Backward-compatible default — same as SMART5 so existing vehicles
    // continue to work without any change in behaviour.
    drivingEventsSource: 'HF_DERIVED',
    abuseSource: 'HF',
    supportsHfContextEnrichment: false,
    useHfDrivingEvents: true,
    nativeEventCapable: false,
    hfCapable: true,
  },
};

export function getVehicleCapabilities(hardwareType: HardwareType): VehicleCapabilities {
  return CAPABILITIES[hardwareType] ?? CAPABILITIES['UNKNOWN'];
}

/**
 * Returns true if this vehicle should use the DIMO Telemetry API Events path
 * for Driving Event ingestion.
 */
export function usesNativeTelemetryEvents(hardwareType: HardwareType): boolean {
  return getVehicleCapabilities(hardwareType).drivingEventsSource === 'TELEMETRY_EVENTS';
}

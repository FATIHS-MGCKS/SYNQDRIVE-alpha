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
}

// ── Capability resolution ─────────────────────────────────────────────────────

const CAPABILITIES: Record<HardwareType, VehicleCapabilities> = {
  LTE_R1: {
    drivingEventsSource: 'TELEMETRY_EVENTS',
    abuseSource: 'HF',
    supportsHfContextEnrichment: true,
    useHfDrivingEvents: false,
  },
  SMART5: {
    drivingEventsSource: 'HF_DERIVED',
    abuseSource: 'HF',
    supportsHfContextEnrichment: false,
    useHfDrivingEvents: true,
  },
  UNKNOWN: {
    // Backward-compatible default — same as SMART5 so existing vehicles
    // continue to work without any change in behaviour.
    drivingEventsSource: 'HF_DERIVED',
    abuseSource: 'HF',
    supportsHfContextEnrichment: false,
    useHfDrivingEvents: true,
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

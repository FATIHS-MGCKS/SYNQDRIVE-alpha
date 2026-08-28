/**
 * In-memory dedupe for connectivity diagnostic state observability.
 *
 * The connectivity runtime is projected on every fleet request (and DIMO polls
 * every ~30s), so emitting a log/metric per projection would be pure noise.
 * This tracker reduces that to state transitions only.
 *
 * Best-effort by design: process-local and reset on restart. A restart re-emits
 * the current state once per vehicle, which is desirable for visibility and
 * bounded by fleet size.
 */
import { Injectable } from '@nestjs/common';
import type { ConnectivityDiagnosticState } from '../../vehicles/connectivity/domain/connectivity-diagnostic-state';

/** Bound on tracked vehicles; oldest entries are evicted first. */
const MAX_TRACKED_VEHICLES = 20_000;

export interface ConnectivityDiagnosticTransition {
  previous: ConnectivityDiagnosticState | null;
  current: ConnectivityDiagnosticState;
}

@Injectable()
export class ConnectivityDiagnosticTransitionTracker {
  private readonly lastStateByVehicle = new Map<
    string,
    ConnectivityDiagnosticState
  >();

  /**
   * Record the latest diagnostic state for a vehicle.
   * Returns the transition when the state changed, otherwise `null`.
   */
  observe(
    vehicleId: string,
    state: ConnectivityDiagnosticState,
  ): ConnectivityDiagnosticTransition | null {
    const previous = this.lastStateByVehicle.get(vehicleId) ?? null;
    if (previous === state) return null;

    this.lastStateByVehicle.set(vehicleId, state);
    this.evictIfNeeded();
    return { previous, current: state };
  }

  private evictIfNeeded(): void {
    while (this.lastStateByVehicle.size > MAX_TRACKED_VEHICLES) {
      const oldest = this.lastStateByVehicle.keys().next();
      if (oldest.done) return;
      this.lastStateByVehicle.delete(oldest.value);
    }
  }
}

/**
 * Coarse observation-age bucket for observability.
 * Deliberately low-cardinality — raw per-vehicle ages stay out of metrics/logs.
 */
export function observationAgeBucket(ageMs: number | null): string {
  if (ageMs == null) return 'unknown';
  const hours = ageMs / (60 * 60 * 1000);
  if (hours < 24) return 'lt_24h';
  if (hours < 48) return '24h_48h';
  if (hours < 24 * 7) return '48h_7d';
  return 'gte_7d';
}

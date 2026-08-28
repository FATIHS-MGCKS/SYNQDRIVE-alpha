/**
 * In-memory dedupe for connectivity diagnostic state observability.
 *
 * The connectivity runtime is projected whenever a consumer asks for it — fleet
 * and vehicle-detail reads, the operational projection, and episode-resolution
 * outbox processing. Those paths can repeat many times per minute, so emitting
 * a log/metric per projection would be pure noise; this tracker reduces it to
 * state transitions.
 *
 * DEMAND-DRIVEN, BEST-EFFORT — NOT AN AUTHORITATIVE MONITOR.
 * No scheduled job evaluates the diagnostic dimension: DIMO snapshot polling
 * writes telemetry but never projects connectivity runtime state. A vehicle
 * nobody looks at emits nothing, so absence of a stale event is not evidence of
 * health. State is also process-local and resets on restart (which re-emits the
 * current state once per vehicle, bounded by fleet size), and each instance in a
 * multi-instance deployment keeps its own map, so counters can double-count the
 * same real-world transition. Treat these signals as leading indicators for
 * investigation, never as an SLO source.
 */
import { Injectable } from '@nestjs/common';
import type { ConnectivityDiagnosticState } from '../../vehicles/connectivity/domain/connectivity-diagnostic-state';

/** Bound on tracked vehicles; least recently observed entries are evicted. */
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

  /** Number of vehicles currently tracked. Exposed for eviction assertions. */
  get trackedCount(): number {
    return this.lastStateByVehicle.size;
  }

  /**
   * Record the latest diagnostic state for a vehicle.
   * Returns the transition when the state changed, otherwise `null`.
   */
  observe(
    vehicleId: string,
    state: ConnectivityDiagnosticState,
  ): ConnectivityDiagnosticTransition | null {
    const previous = this.lastStateByVehicle.get(vehicleId) ?? null;

    // Re-insert on every observation so Map iteration order tracks recency.
    // Evicting the least recently *observed* vehicle is correct: a vehicle no
    // longer being projected is the right one to forget, whereas evicting by
    // first-insert would drop actively watched vehicles and re-emit their
    // current state as a fresh transition.
    this.lastStateByVehicle.delete(vehicleId);
    this.lastStateByVehicle.set(vehicleId, state);
    this.evictIfNeeded();

    return previous === state ? null : { previous, current: state };
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

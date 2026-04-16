import { Injectable, Logger, Optional } from '@nestjs/common';
import { ClickHouseService } from './clickhouse.service';
import { TripMetricsService } from '../observability/trip-metrics.service';

export interface NormalizedSnapshot {
  isIgnitionOn: boolean | null;
  speedKmh: number | null;
  odometerKm: number | null;
  latitude: number | null;
  longitude: number | null;
  engineLoad: number | null;
  fuelLevelAbsolute: number | null;
  evSoc: number | null;
  tractionKw: number | null;
  recordedAt: Date;
}

/**
 * ClickHouseTelemetryService
 *
 * Handles ingestion (mirroring) of DIMO snapshot data into ClickHouse.
 * Called fire-and-forget from DimoSnapshotProcessor after each snapshot.
 *
 * All writes are best-effort — failures are logged but never throw to the
 * caller, so ClickHouse unavailability never blocks the live FSM pipeline.
 */
@Injectable()
export class ClickHouseTelemetryService {
  private readonly logger = new Logger(ClickHouseTelemetryService.name);

  constructor(
    private readonly ch: ClickHouseService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  /**
   * Mirrors a normalized snapshot into telemetry_snapshots.
   */
  async insertSnapshot(
    vehicleId: string,
    tokenId: number,
    snap: NormalizedSnapshot,
  ): Promise<void> {
    if (!this.ch.isAvailable) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: 'telemetry_snapshots',
        result: 'skipped_unavailable',
      });
      return;
    }

    try {
      await this.ch.getClient().insert({
        table: 'telemetry_snapshots',
        values: [
          {
            vehicle_id: vehicleId,
            token_id: tokenId,
            recorded_at: snap.recordedAt.getTime(),
            is_ignition_on: snap.isIgnitionOn == null ? null : snap.isIgnitionOn ? 1 : 0,
            speed_kmh: snap.speedKmh,
            odometer_km: snap.odometerKm,
            latitude: snap.latitude,
            longitude: snap.longitude,
            engine_load: snap.engineLoad,
            fuel_absolute: snap.fuelLevelAbsolute,
            ev_soc: snap.evSoc,
            traction_kw: snap.tractionKw,
          },
        ],
        format: 'JSONEachRow',
      });
      this.metrics?.clickHouseMirrorWrites.inc({
        table: 'telemetry_snapshots',
        result: 'success',
      });
      this.metrics?.clickHouseLastMirrorUnixSeconds.set(
        { table: 'telemetry_snapshots' },
        snap.recordedAt.getTime() / 1000,
      );
    } catch (err: unknown) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: 'telemetry_snapshots',
        result: 'error',
      });
      this.logger.warn(`insertSnapshot failed: ${(err as Error).message}`);
    }
  }

  /**
   * Detects ignition state changes vs the previous snapshot and inserts
   * them into telemetry_state_changes for use by analytical detectors.
   */
  async detectAndInsertStateChanges(
    vehicleId: string,
    previousSnap: {
      isIgnitionOn: boolean | null;
      speedKmh: number | null;
    } | null,
    current: NormalizedSnapshot,
  ): Promise<void> {
    if (!this.ch.isAvailable) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: 'telemetry_state_changes',
        result: 'skipped_unavailable',
      });
      return;
    }
    if (!previousSnap) return;

    const changes: Array<{
      vehicle_id: string;
      changed_at: number;
      signal_name: string;
      old_value: number | null;
      new_value: number | null;
    }> = [];

    // Detect ignition transition
    if (previousSnap.isIgnitionOn !== current.isIgnitionOn &&
        previousSnap.isIgnitionOn != null && current.isIgnitionOn != null) {
      changes.push({
        vehicle_id: vehicleId,
        changed_at: current.recordedAt.getTime(),
        signal_name: 'ignition',
        old_value: previousSnap.isIgnitionOn ? 1 : 0,
        new_value: current.isIgnitionOn ? 1 : 0,
      });
    }

    // Detect motion start/stop (threshold: 2 km/h)
    const prevMoving = (previousSnap.speedKmh ?? 0) > 2;
    const currMoving = (current.speedKmh ?? 0) > 2;
    if (prevMoving !== currMoving) {
      changes.push({
        vehicle_id: vehicleId,
        changed_at: current.recordedAt.getTime(),
        signal_name: 'motion',
        old_value: prevMoving ? 1 : 0,
        new_value: currMoving ? 1 : 0,
      });
    }

    if (changes.length === 0) return;

    try {
      await this.ch.getClient().insert({
        table: 'telemetry_state_changes',
        values: changes,
        format: 'JSONEachRow',
      });
      this.metrics?.clickHouseMirrorWrites.inc({
        table: 'telemetry_state_changes',
        result: 'success',
      });
      this.metrics?.clickHouseLastMirrorUnixSeconds.set(
        { table: 'telemetry_state_changes' },
        current.recordedAt.getTime() / 1000,
      );
    } catch (err: unknown) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: 'telemetry_state_changes',
        result: 'error',
      });
      this.logger.warn(`detectAndInsertStateChanges failed: ${(err as Error).message}`);
    }
  }
}

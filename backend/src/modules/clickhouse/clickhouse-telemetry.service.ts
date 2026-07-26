import { Injectable, Logger, Optional } from '@nestjs/common';
import { ClickHouseService } from './clickhouse.service';
import { TripMetricsService } from '../observability/trip-metrics.service';
import { ClickHouseMirrorRetryProducer } from './clickhouse-mirror-retry.producer';

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

type SnapshotRow = {
  org_id: string;
  vehicle_id: string;
  token_id: number;
  recorded_at: number;
  is_ignition_on: number | null;
  speed_kmh: number | null;
  odometer_km: number | null;
  latitude: number | null;
  longitude: number | null;
  engine_load: number | null;
  fuel_absolute: number | null;
  ev_soc: number | null;
  traction_kw: number | null;
};

type StateChangeRow = {
  org_id: string;
  vehicle_id: string;
  changed_at: number;
  signal_name: string;
  old_value: number | null;
  new_value: number | null;
};

/**
 * ClickHouseTelemetryService
 *
 * Handles ingestion (mirroring) of DIMO snapshot data into ClickHouse.
 * Failed writes enqueue durable retries (P1-PL1); duplicate snapshots are skipped (R2).
 */
@Injectable()
export class ClickHouseTelemetryService {
  private readonly logger = new Logger(ClickHouseTelemetryService.name);

  constructor(
    private readonly ch: ClickHouseService,
    @Optional() private readonly metrics?: TripMetricsService,
    @Optional() private readonly mirrorRetry?: ClickHouseMirrorRetryProducer,
  ) {}

  async insertSnapshot(
    orgId: string,
    vehicleId: string,
    tokenId: number,
    snap: NormalizedSnapshot,
  ): Promise<void> {
    if (!this.ch.isAvailable) {
      this.recordMirror('telemetry_snapshots', 'skipped_unavailable');
      return;
    }

    const row = this.buildSnapshotRow(orgId, vehicleId, tokenId, snap);

    if (await this.hasSnapshotAt(vehicleId, snap.recordedAt)) {
      this.recordMirror('telemetry_snapshots', 'skipped_duplicate');
      return;
    }

    try {
      await this.insertSnapshotRow(row);
      this.recordMirror('telemetry_snapshots', 'success');
      this.metrics?.clickHouseLastMirrorUnixSeconds.set(
        { table: 'telemetry_snapshots' },
        snap.recordedAt.getTime() / 1000,
      );
    } catch (err: unknown) {
      await this.handleSnapshotInsertError(row, err);
    }
  }

  async detectAndInsertStateChanges(
    orgId: string,
    vehicleId: string,
    previousSnap: {
      isIgnitionOn: boolean | null;
      speedKmh: number | null;
    } | null,
    current: NormalizedSnapshot,
  ): Promise<void> {
    if (!this.ch.isAvailable) {
      this.recordMirror('telemetry_state_changes', 'skipped_unavailable');
      return;
    }
    if (!previousSnap) return;

    const changes = this.buildStateChangeRows(orgId, vehicleId, previousSnap, current);
    if (changes.length === 0) return;

    try {
      await this.insertStateChangeRows(changes);
      this.recordMirror('telemetry_state_changes', 'success');
      this.metrics?.clickHouseLastMirrorUnixSeconds.set(
        { table: 'telemetry_state_changes' },
        current.recordedAt.getTime() / 1000,
      );
    } catch (err: unknown) {
      await this.handleStateChangeInsertError(changes, err);
    }
  }

  /** Called by ClickHouseMirrorRetryProcessor — may throw for BullMQ retry. */
  async retryInsertSnapshotFromQueue(payload: Record<string, unknown>): Promise<void> {
    const row = payload as unknown as SnapshotRow;
    if (await this.hasSnapshotAt(String(row.vehicle_id), new Date(Number(row.recorded_at)))) {
      return;
    }
    await this.insertSnapshotRow(row);
    this.recordMirror('telemetry_snapshots', 'success');
  }

  async retryInsertStateChangesFromQueue(payload: Record<string, unknown>): Promise<void> {
    const changes = (payload.changes as StateChangeRow[]) ?? [];
    if (changes.length === 0) return;
    await this.insertStateChangeRows(changes);
    this.recordMirror('telemetry_state_changes', 'success');
  }

  private buildSnapshotRow(
    orgId: string,
    vehicleId: string,
    tokenId: number,
    snap: NormalizedSnapshot,
  ): SnapshotRow {
    return {
      org_id: orgId,
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
    };
  }

  private buildStateChangeRows(
    orgId: string,
    vehicleId: string,
    previousSnap: { isIgnitionOn: boolean | null; speedKmh: number | null },
    current: NormalizedSnapshot,
  ): StateChangeRow[] {
    const changes: StateChangeRow[] = [];

    if (
      previousSnap.isIgnitionOn !== current.isIgnitionOn &&
      previousSnap.isIgnitionOn != null &&
      current.isIgnitionOn != null
    ) {
      changes.push({
        org_id: orgId,
        vehicle_id: vehicleId,
        changed_at: current.recordedAt.getTime(),
        signal_name: 'ignition',
        old_value: previousSnap.isIgnitionOn ? 1 : 0,
        new_value: current.isIgnitionOn ? 1 : 0,
      });
    }

    const prevMoving = (previousSnap.speedKmh ?? 0) > 2;
    const currMoving = (current.speedKmh ?? 0) > 2;
    if (prevMoving !== currMoving) {
      changes.push({
        org_id: orgId,
        vehicle_id: vehicleId,
        changed_at: current.recordedAt.getTime(),
        signal_name: 'motion',
        old_value: prevMoving ? 1 : 0,
        new_value: currMoving ? 1 : 0,
      });
    }

    return changes;
  }

  private async hasSnapshotAt(vehicleId: string, recordedAt: Date): Promise<boolean> {
    if (!this.ch.isAvailable) return false;
    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT count() AS cnt
          FROM telemetry_snapshots
          WHERE vehicle_id = {vehicleId: String}
            AND recorded_at = {recordedAt: UInt64}
          LIMIT 1
        `,
        query_params: { vehicleId, recordedAt: recordedAt.getTime() },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 5 },
      });
      const [row] = await result.json<{ cnt: string | number }>();
      return Number(row?.cnt ?? 0) > 0;
    } catch {
      return false;
    }
  }

  private async insertSnapshotRow(row: SnapshotRow): Promise<void> {
    await this.ch.getClient().insert({
      table: 'telemetry_snapshots',
      values: [row],
      format: 'JSONEachRow',
    });
  }

  private async insertStateChangeRows(changes: StateChangeRow[]): Promise<void> {
    await this.ch.getClient().insert({
      table: 'telemetry_state_changes',
      values: changes,
      format: 'JSONEachRow',
    });
  }

  private async handleSnapshotInsertError(row: SnapshotRow, err: unknown): Promise<void> {
    this.recordMirror('telemetry_snapshots', 'error');
    this.ch.markUnavailable((err as Error).message);
    this.logger.warn(`insertSnapshot failed: ${(err as Error).message}`);
    await this.mirrorRetry?.enqueue('telemetry_snapshot', row, 'insertSnapshot');
    this.metrics?.clickHouseMirrorWrites.inc({
      table: 'telemetry_snapshots',
      result: 'retry_enqueued',
    });
  }

  private async handleStateChangeInsertError(
    changes: StateChangeRow[],
    err: unknown,
  ): Promise<void> {
    this.recordMirror('telemetry_state_changes', 'error');
    this.ch.markUnavailable((err as Error).message);
    this.logger.warn(`detectAndInsertStateChanges failed: ${(err as Error).message}`);
    await this.mirrorRetry?.enqueue(
      'telemetry_state_changes',
      { changes },
      'detectAndInsertStateChanges',
    );
    this.metrics?.clickHouseMirrorWrites.inc({
      table: 'telemetry_state_changes',
      result: 'retry_enqueued',
    });
  }

  private recordMirror(
    table: string,
    result:
      | 'success'
      | 'error'
      | 'skipped_unavailable'
      | 'skipped_duplicate'
      | 'retry_enqueued',
  ): void {
    this.metrics?.clickHouseMirrorWrites.inc({ table, result });
  }
}

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ClickHouseService } from './clickhouse.service';
import { TripMetricsService } from '../observability/trip-metrics.service';
import type {
  HfAvailabilitySummary,
  HfDerivedEvent,
  HfEventRow,
  HfRecentEventsResult,
  HfSignalFrequencyRow,
  HfSignalFrequencySummary,
  HfSignalPoint,
} from './clickhouse-hf.types';

const HF_POINTS_TABLE = 'telemetry_hf_points';
const HF_EVENTS_TABLE = 'telemetry_hf_events';

function toChDateTimeParam(value: Date): string {
  return value.toISOString().replace('T', ' ').replace('Z', '');
}

function parseChUtc(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * ClickHouseHfService
 *
 * Ingestion + read layer for the High-Frequency telemetry mirror.
 *
 * Contract:
 *   - Inserts are BEST-EFFORT: if ClickHouse is unavailable, they skip + log +
 *     return (never throw). No operational SynqDrive flow may be blocked by an
 *     HF/ClickHouse outage.
 *   - Read methods degrade gracefully: when ClickHouse is unavailable or a query
 *     fails they return a degraded response (available=false) rather than crash
 *     a caller such as data-analyse.
 *   - Empty input arrays are never inserted.
 *   - Logs never contain secrets.
 */
@Injectable()
export class ClickHouseHfService {
  private readonly logger = new Logger(ClickHouseHfService.name);

  constructor(
    private readonly ch: ClickHouseService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  /**
   * Idempotency guard: returns true if any HF points are already mirrored for a
   * given trip. Used by the post-trip mirror so re-running enrichment does not
   * duplicate rows in the append-only telemetry_hf_points table. Degrades to
   * false on any failure (best-effort — never blocks enrichment).
   */
  async hasTripHfPoints(vehicleId: string, tripId: string): Promise<boolean> {
    if (!this.ch.isAvailable) return false;
    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT count() AS cnt
          FROM ${HF_POINTS_TABLE}
          WHERE vehicle_id = {vehicleId: String}
            AND trip_id = {tripId: String}
          LIMIT 1
        `,
        query_params: { vehicleId, tripId },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 10 },
      });
      const [row] = await result.json<{ cnt: string | number }>();
      return Number(row?.cnt ?? 0) > 0;
    } catch (err: unknown) {
      this.logger.warn(`hasTripHfPoints failed: ${(err as Error).message}`);
      return false;
    }
  }

  /** Best-effort bulk insert of normalized HF signal points. */
  async insertHfPoints(points: HfSignalPoint[]): Promise<void> {
    if (!points || points.length === 0) return;

    if (!this.ch.isAvailable) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_POINTS_TABLE,
        result: 'skipped_unavailable',
      });
      this.logger.debug(
        `HF points insert skipped (ClickHouse unavailable) — ${points.length} point(s).`,
      );
      return;
    }

    const rows = points.map((p) => ({
      org_id: p.orgId,
      vehicle_id: p.vehicleId,
      token_id: p.tokenId,
      source: p.source,
      signal_name: p.signalName,
      signal_group: p.signalGroup,
      recorded_at: p.recordedAt.getTime(),
      value_float: p.valueFloat ?? null,
      value_int: p.valueInt ?? null,
      value_bool: p.valueBool == null ? null : p.valueBool ? 1 : 0,
      value_string: p.valueString ?? null,
      unit: p.unit ?? null,
      quality: p.quality,
      request_id: p.requestId ?? null,
      trip_id: p.tripId ?? null,
      booking_id: p.bookingId ?? null,
    }));

    try {
      await this.ch.getClient().insert({
        table: HF_POINTS_TABLE,
        values: rows,
        format: 'JSONEachRow',
      });
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_POINTS_TABLE,
        result: 'success',
      });
      this.metrics?.hfPointsInsertedTotal.inc(rows.length);
      const latestMs = Math.max(...points.map((p) => p.recordedAt.getTime()));
      if (Number.isFinite(latestMs)) {
        this.metrics?.clickHouseLastMirrorUnixSeconds.set(
          { table: HF_POINTS_TABLE },
          latestMs / 1000,
        );
      }
    } catch (err: unknown) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_POINTS_TABLE,
        result: 'error',
      });
      this.logger.warn(`insertHfPoints failed: ${(err as Error).message}`);
    }
  }

  /** Best-effort bulk insert of derived HF events. */
  async insertHfEvents(events: HfDerivedEvent[]): Promise<void> {
    if (!events || events.length === 0) return;

    if (!this.ch.isAvailable) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_EVENTS_TABLE,
        result: 'skipped_unavailable',
      });
      this.logger.debug(
        `HF events insert skipped (ClickHouse unavailable) — ${events.length} event(s).`,
      );
      return;
    }

    const rows = events.map((e) => ({
      org_id: e.orgId,
      vehicle_id: e.vehicleId,
      event_type: e.eventType,
      severity: e.severity,
      event_start: e.eventStart.getTime(),
      event_end: e.eventEnd ? e.eventEnd.getTime() : null,
      duration_ms: e.durationMs ?? null,
      confidence: e.confidence,
      primary_value: e.primaryValue ?? null,
      primary_unit: e.primaryUnit ?? null,
      evidence_json: e.evidenceJson ?? '',
      trip_id: e.tripId ?? null,
      booking_id: e.bookingId ?? null,
    }));

    try {
      await this.ch.getClient().insert({
        table: HF_EVENTS_TABLE,
        values: rows,
        format: 'JSONEachRow',
      });
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_EVENTS_TABLE,
        result: 'success',
      });
      this.metrics?.hfEventsDetectedTotal.inc(rows.length);
    } catch (err: unknown) {
      this.metrics?.clickHouseMirrorWrites.inc({
        table: HF_EVENTS_TABLE,
        result: 'error',
      });
      this.logger.warn(`insertHfEvents failed: ${(err as Error).message}`);
    }
  }

  /** HF availability summary for a vehicle/time-range. Degrades gracefully. */
  async getHfAvailability(
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<HfAvailabilitySummary> {
    const base: HfAvailabilitySummary = {
      available: false,
      vehicleId,
      from: from.toISOString(),
      to: to.toISOString(),
      pointCount: 0,
      earliestPointAt: null,
      latestPointAt: null,
      signalGroups: [],
    };

    if (!this.ch.isAvailable) {
      return { ...base, degradedReason: 'clickhouse_unavailable' };
    }

    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT
            count()                  AS point_count,
            min(recorded_at)         AS earliest_point_at,
            max(recorded_at)         AS latest_point_at,
            groupUniqArray(signal_group) AS signal_groups
          FROM ${HF_POINTS_TABLE}
          WHERE vehicle_id = {vehicleId: String}
            AND recorded_at >= parseDateTime64BestEffort({from: String})
            AND recorded_at <= parseDateTime64BestEffort({to: String})
        `,
        query_params: {
          vehicleId,
          from: toChDateTimeParam(from),
          to: toChDateTimeParam(to),
        },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 10 },
      });

      const [row] = await result.json<{
        point_count: number;
        earliest_point_at: string | null;
        latest_point_at: string | null;
        signal_groups: string[];
      }>();

      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_availability',
        result: 'success',
      });

      return {
        ...base,
        available: true,
        pointCount: Number(row?.point_count ?? 0),
        earliestPointAt: parseChUtc(row?.earliest_point_at),
        latestPointAt: parseChUtc(row?.latest_point_at),
        signalGroups: Array.isArray(row?.signal_groups) ? row.signal_groups : [],
      };
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_availability',
        result: 'error',
      });
      this.logger.warn(`getHfAvailability failed: ${(err as Error).message}`);
      return { ...base, degradedReason: (err as Error).message };
    }
  }

  /** Per-signal frequency summary for a vehicle/time-range. Degrades gracefully. */
  async getSignalFrequencySummary(
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<HfSignalFrequencySummary> {
    const base: HfSignalFrequencySummary = {
      available: false,
      vehicleId,
      from: from.toISOString(),
      to: to.toISOString(),
      signals: [],
    };

    if (!this.ch.isAvailable) {
      return { ...base, degradedReason: 'clickhouse_unavailable' };
    }

    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT
            signal_name                                   AS signal_name,
            any(signal_group)                             AS signal_group,
            count()                                       AS point_count,
            min(recorded_at)                              AS first_seen_at,
            max(recorded_at)                              AS last_seen_at,
            (toUnixTimestamp64Milli(max(recorded_at)) - toUnixTimestamp64Milli(min(recorded_at)))
              / nullIf(count() - 1, 0)                    AS avg_interval_ms
          FROM ${HF_POINTS_TABLE}
          WHERE vehicle_id = {vehicleId: String}
            AND recorded_at >= parseDateTime64BestEffort({from: String})
            AND recorded_at <= parseDateTime64BestEffort({to: String})
          GROUP BY signal_name
          ORDER BY signal_name
        `,
        query_params: {
          vehicleId,
          from: toChDateTimeParam(from),
          to: toChDateTimeParam(to),
        },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 10 },
      });

      const rows = await result.json<{
        signal_name: string;
        signal_group: string;
        point_count: number;
        first_seen_at: string | null;
        last_seen_at: string | null;
        avg_interval_ms: number | null;
      }>();

      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_signal_frequency',
        result: 'success',
      });

      const signals: HfSignalFrequencyRow[] = rows.map((r) => ({
        signalName: r.signal_name,
        signalGroup: r.signal_group,
        pointCount: Number(r.point_count ?? 0),
        firstSeenAt: parseChUtc(r.first_seen_at),
        lastSeenAt: parseChUtc(r.last_seen_at),
        avgIntervalMs:
          r.avg_interval_ms == null ? null : Number(r.avg_interval_ms),
      }));

      return { ...base, available: true, signals };
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_signal_frequency',
        result: 'error',
      });
      this.logger.warn(
        `getSignalFrequencySummary failed: ${(err as Error).message}`,
      );
      return { ...base, degradedReason: (err as Error).message };
    }
  }

  /** Recent derived HF events for a vehicle/time-range. Degrades gracefully. */
  async getRecentHfEvents(
    vehicleId: string,
    from: Date,
    to: Date,
    limit = 200,
  ): Promise<HfRecentEventsResult> {
    const base: HfRecentEventsResult = {
      available: false,
      vehicleId,
      from: from.toISOString(),
      to: to.toISOString(),
      events: [],
    };

    if (!this.ch.isAvailable) {
      return { ...base, degradedReason: 'clickhouse_unavailable' };
    }

    try {
      const result = await this.ch.getClient().query({
        query: `
          SELECT
            event_type    AS event_type,
            severity      AS severity,
            event_start   AS event_start,
            event_end     AS event_end,
            duration_ms   AS duration_ms,
            confidence    AS confidence,
            primary_value AS primary_value,
            primary_unit  AS primary_unit,
            trip_id       AS trip_id,
            booking_id    AS booking_id
          FROM ${HF_EVENTS_TABLE} FINAL
          WHERE vehicle_id = {vehicleId: String}
            AND event_start >= parseDateTime64BestEffort({from: String})
            AND event_start <= parseDateTime64BestEffort({to: String})
          ORDER BY event_start DESC
          LIMIT {limit: UInt32}
        `,
        query_params: {
          vehicleId,
          from: toChDateTimeParam(from),
          to: toChDateTimeParam(to),
          limit,
        },
        format: 'JSONEachRow',
        clickhouse_settings: { max_execution_time: 10 },
      });

      const rows = await result.json<{
        event_type: string;
        severity: string;
        event_start: string;
        event_end: string | null;
        duration_ms: number | null;
        confidence: string;
        primary_value: number | null;
        primary_unit: string | null;
        trip_id: string | null;
        booking_id: string | null;
      }>();

      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_recent_events',
        result: 'success',
      });

      const events: HfEventRow[] = rows.map((r) => ({
        eventType: r.event_type,
        severity: r.severity,
        eventStart: parseChUtc(r.event_start) ?? r.event_start,
        eventEnd: parseChUtc(r.event_end),
        durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
        confidence: r.confidence,
        primaryValue: r.primary_value == null ? null : Number(r.primary_value),
        primaryUnit: r.primary_unit ?? null,
        tripId: r.trip_id ?? null,
        bookingId: r.booking_id ?? null,
      }));

      return { ...base, available: true, events };
    } catch (err: unknown) {
      this.metrics?.clickHouseAnalyticsQueries.inc({
        query: 'hf_recent_events',
        result: 'error',
      });
      this.logger.warn(`getRecentHfEvents failed: ${(err as Error).message}`);
      return { ...base, degradedReason: (err as Error).message };
    }
  }
}

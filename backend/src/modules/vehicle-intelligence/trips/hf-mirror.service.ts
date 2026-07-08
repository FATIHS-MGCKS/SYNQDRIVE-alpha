import { Injectable, Logger, Optional } from '@nestjs/common';
import { ClickHouseHfService } from '@modules/clickhouse/clickhouse-hf.service';
import { isHfMirrorEnabled } from '@modules/clickhouse/clickhouse-env.util';
import { resolveSignalGroup } from '@modules/clickhouse/hf-signal-map';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import type {
  HfDerivedEvent,
  HfEventConfidence,
  HfEventSeverity,
  HfSignalPoint,
} from '@modules/clickhouse/clickhouse-hf.types';
import type { HighFrequencyReading } from '../../dimo/dimo-segments.service';
import type { AbuseEvent, AbuseSeverity } from './hf-abuse';

export type HfMirrorSkipReason =
  | 'disabled'
  | 'unavailable'
  | 'no_org'
  | 'no_readings'
  | 'no_points'
  | 'error'
  | 'points_already_mirrored';

export interface HfMirrorResult {
  mirrored: boolean;
  pointsInserted: number;
  eventsInserted: number;
  reason?: HfMirrorSkipReason;
}

/**
 * HfMirrorService
 *
 * Phase 2 — best-effort, idempotent, fire-and-forget mirror of post-trip HF
 * telemetry into the ClickHouse analytics layer (telemetry_hf_points +
 * telemetry_hf_events).
 *
 * SAFETY CONTRACT (must never regress operational flows):
 *   - Disabled by default. Only runs when HF_MIRROR_ENABLED=true AND ClickHouse
 *     is available. When off it is a pure no-op — zero behaviour change.
 *   - PostgreSQL stays the canonical truth. This is an analytics mirror only.
 *   - NEVER throws into the caller. Every path is wrapped; the underlying
 *     insert methods are themselves best-effort.
 *   - Idempotent: points are skipped if already mirrored for the trip (the
 *     append-only points table cannot dedup on its own); events use a
 *     ReplacingMergeTree keyed by (org, vehicle, type, start) so re-insert is
 *     safe.
 *   - Does NOT change detector logic, DIMO polling, or the 1s HF window. It
 *     only reads already-computed readings + abuse events and writes a mirror.
 */
@Injectable()
export class HfMirrorService {
  private readonly logger = new Logger(HfMirrorService.name);

  constructor(
    private readonly clickHouseHf: ClickHouseHfService,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  /** Whether the HF mirror is enabled via environment flag (default: off). */
  get isEnabled(): boolean {
    return isHfMirrorEnabled();
  }

  /**
   * Mirror a trip's HF readings + derived abuse events into ClickHouse.
   * Fire-and-forget: callers should NOT await the result in a way that can
   * block enrichment. Returns a small summary for logging/tests.
   */
  async mirrorTripHf(params: {
    orgId: string | null | undefined;
    vehicleId: string;
    tokenId: number;
    tripId: string;
    /** Canonical booking link from VehicleTrip.assignedBookingId — nullable only. */
    bookingId?: string | null;
    readings: HighFrequencyReading[];
    abuseEvents: AbuseEvent[];
    source?: string;
  }): Promise<HfMirrorResult> {
    try {
      if (!this.isEnabled) return this.skip('disabled');
      if (!this.clickHouseHf.isAvailable) {
        this.logger.debug(
          `HF mirror skipped (ClickHouse unavailable) for trip ${params.tripId}.`,
        );
        return this.skip('unavailable');
      }
      if (!params.orgId) return this.skip('no_org');
      if (!params.readings || params.readings.length === 0) {
        return this.skip('no_readings');
      }

      const orgId = params.orgId;
      const source = params.source ?? 'dimo';
      const bookingId = params.bookingId ?? null;

      const alreadyMirrored = await this.clickHouseHf.hasTripHfPoints(
        params.vehicleId,
        params.tripId,
      );

      let pointsInserted = 0;
      if (!alreadyMirrored) {
        const points = this.toHfPoints({
          orgId,
          vehicleId: params.vehicleId,
          tokenId: params.tokenId,
          tripId: params.tripId,
          bookingId,
          source,
          readings: params.readings,
        });
        if (points.length > 0) {
          await this.clickHouseHf.insertHfPoints(points);
          pointsInserted = points.length;
        }
      }

      const events = this.toHfEvents({
        orgId,
        vehicleId: params.vehicleId,
        tripId: params.tripId,
        bookingId,
        abuseEvents: params.abuseEvents ?? [],
      });
      let eventsInserted = 0;
      if (events.length > 0) {
        await this.clickHouseHf.insertHfEvents(events);
        eventsInserted = events.length;
      }

      if (pointsInserted === 0 && eventsInserted === 0) {
        if (alreadyMirrored) {
          return {
            mirrored: false,
            pointsInserted: 0,
            eventsInserted: 0,
            reason: 'points_already_mirrored',
          };
        }
        return this.skip('no_points');
      }

      return {
        mirrored: true,
        pointsInserted,
        eventsInserted,
        reason: alreadyMirrored ? 'points_already_mirrored' : undefined,
      };
    } catch (err: unknown) {
      this.logger.warn(
        `mirrorTripHf failed for trip ${params.tripId}: ${(err as Error).message}`,
      );
      return this.skip('error');
    }
  }

  private skip(reason: HfMirrorSkipReason): HfMirrorResult {
    this.metrics?.hfMirrorSkipped.inc({ reason });
    return { mirrored: false, pointsInserted: 0, eventsInserted: 0, reason };
  }

  /** Map HF readings (one row, many signals) into normalized HF signal points. */
  private toHfPoints(input: {
    orgId: string;
    vehicleId: string;
    tokenId: number;
    tripId: string;
    bookingId: string | null;
    source: string;
    readings: HighFrequencyReading[];
  }): HfSignalPoint[] {
    const out: HfSignalPoint[] = [];
    const base = {
      orgId: input.orgId,
      vehicleId: input.vehicleId,
      tokenId: input.tokenId,
      source: input.source,
      tripId: input.tripId,
      bookingId: input.bookingId,
      quality: 'normalized' as const,
    };

    const SIGNALS: Array<{
      signalName: string;
      unit: string | null;
      pick: (r: HighFrequencyReading) => number | null;
    }> = [
      { signalName: 'speed', unit: 'km/h', pick: (r) => r.speedKmh },
      { signalName: 'powertrainCombustionEngineSpeed', unit: 'rpm', pick: (r) => r.rpm },
      { signalName: 'powertrainCombustionEngineECT', unit: '°C', pick: (r) => r.engineCoolantTempC },
      { signalName: 'obdThrottlePosition', unit: '%', pick: (r) => r.throttlePosition },
      { signalName: 'obdEngineLoad', unit: '%', pick: (r) => r.engineLoad },
      { signalName: 'powertrainTractionBatteryCurrentPower', unit: 'kW', pick: (r) => r.tractionBatteryPowerKw },
    ];

    for (const reading of input.readings) {
      const recordedAt = new Date(reading.timestamp);
      if (Number.isNaN(recordedAt.getTime())) continue;
      for (const sig of SIGNALS) {
        const value = sig.pick(reading);
        if (value == null || !Number.isFinite(value)) continue;
        out.push({
          ...base,
          signalName: sig.signalName,
          signalGroup: resolveSignalGroup(sig.signalName),
          recordedAt,
          valueFloat: value,
          unit: sig.unit,
        });
      }
    }
    return out;
  }

  private toHfEvents(input: {
    orgId: string;
    vehicleId: string;
    tripId: string;
    bookingId: string | null;
    abuseEvents: AbuseEvent[];
  }): HfDerivedEvent[] {
    return input.abuseEvents.map((e) => ({
      orgId: input.orgId,
      vehicleId: input.vehicleId,
      eventType: e.eventType,
      severity: mapAbuseSeverityToHf(e.severity),
      eventStart: e.startedAt,
      eventEnd: e.endedAt,
      durationMs: e.durationMs ?? null,
      confidence: mapAbuseConfidence(e.severity),
      primaryValue: e.peakValue ?? null,
      primaryUnit: e.peakValueUnit ?? null,
      evidenceJson: safeJson(e.metadata),
      tripId: input.tripId,
      bookingId: input.bookingId,
    }));
  }
}

function mapAbuseSeverityToHf(s: AbuseSeverity): HfEventSeverity {
  switch (s) {
    case 'WARNING':
      return 'warning';
    case 'SEVERE':
      return 'warning';
    case 'CRITICAL':
      return 'critical';
    default:
      return 'info';
  }
}

function mapAbuseConfidence(s: AbuseSeverity): HfEventConfidence {
  return s === 'CRITICAL' ? 'high' : 'medium';
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
}

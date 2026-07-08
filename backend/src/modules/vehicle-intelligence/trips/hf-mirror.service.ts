import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseHfService } from '@modules/clickhouse/clickhouse-hf.service';
import type {
  HfDerivedEvent,
  HfEventConfidence,
  HfEventSeverity,
} from '@modules/clickhouse/clickhouse-hf.types';
import type { HighFrequencyReading } from '../../dimo/dimo-segments.service';
import type { AbuseEvent, AbuseSeverity } from './hf-abuse';
import { buildHfMirrorPoints } from './hf-mirror-signals';

/**
 * HfMirrorService — best-effort post-trip HF analytics mirror (HF_MIRROR_ENABLED).
 * PostgreSQL stays canonical; ClickHouse is evidence only.
 */
@Injectable()
export class HfMirrorService {
  private readonly logger = new Logger(HfMirrorService.name);

  constructor(private readonly clickHouseHf: ClickHouseHfService) {}

  get isEnabled(): boolean {
    return process.env.HF_MIRROR_ENABLED === 'true';
  }

  async mirrorTripHf(params: {
    orgId: string | null | undefined;
    vehicleId: string;
    tokenId: number;
    tripId: string;
    bookingId?: string | null;
    readings: HighFrequencyReading[];
    abuseEvents: AbuseEvent[];
    source?: string;
  }): Promise<{ mirrored: boolean; pointsInserted: number; eventsInserted: number; reason?: string }> {
    const noop = (reason: string) => ({ mirrored: false, pointsInserted: 0, eventsInserted: 0, reason });

    try {
      if (!this.isEnabled) return noop('disabled');
      if (!params.orgId) return noop('no_org');
      if (!params.readings || params.readings.length === 0) return noop('no_readings');

      const orgId = params.orgId;
      const source = params.source ?? 'dimo';

      const alreadyMirrored = await this.clickHouseHf.hasTripHfPoints(
        params.vehicleId,
        params.tripId,
      );

      let pointsInserted = 0;
      if (!alreadyMirrored) {
        const points = buildHfMirrorPoints(
          {
            orgId,
            vehicleId: params.vehicleId,
            tokenId: params.tokenId,
            tripId: params.tripId,
            bookingId: params.bookingId ?? null,
            source,
          },
          params.readings,
        );
        if (points.length > 0) {
          await this.clickHouseHf.insertHfPoints(points);
          pointsInserted = points.length;
        }
      }

      const events = this.toHfEvents({
        orgId,
        vehicleId: params.vehicleId,
        tripId: params.tripId,
        bookingId: params.bookingId ?? null,
        abuseEvents: params.abuseEvents ?? [],
      });
      let eventsInserted = 0;
      if (events.length > 0) {
        await this.clickHouseHf.insertHfEvents(events);
        eventsInserted = events.length;
      }

      return {
        mirrored: pointsInserted > 0 || eventsInserted > 0,
        pointsInserted,
        eventsInserted,
        reason: alreadyMirrored ? 'points_already_mirrored' : undefined,
      };
    } catch (err: unknown) {
      this.logger.warn(
        `mirrorTripHf failed for trip ${params.tripId}: ${(err as Error).message}`,
      );
      return noop('error');
    }
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

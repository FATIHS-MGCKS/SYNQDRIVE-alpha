import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from './clickhouse.service';
import { ClickHouseHfService, toChDateTimeParam } from './clickhouse-hf.service';
import { SignalQualityReadService } from './signal-quality-read.service';
import type { TripClickHouseEvidenceDto } from './trip-evidence.types';
import { signalAvailabilityFromWindows } from './signal-quality-assess';
import {
  buildTripEvidenceSummary,
  deriveGpsCoverage,
} from '@modules/vehicle-intelligence/trips/trip-evidence-read-model';

const SNAPSHOTS_TABLE = 'telemetry_snapshots';

/**
 * Read-only aggregator for trip-scoped ClickHouse evidence.
 * Never writes scores or canonical trip assessments.
 */
@Injectable()
export class TripEvidenceReadService {
  private readonly logger = new Logger(TripEvidenceReadService.name);

  constructor(
    private readonly clickHouse: ClickHouseService,
    private readonly clickHouseHf: ClickHouseHfService,
    private readonly signalQualityRead: SignalQualityReadService,
  ) {}

  async getTripClickHouseEvidence(params: {
    orgId: string;
    vehicleId: string;
    tripId: string;
    startTime: Date;
    endTime: Date | null;
  }): Promise<TripClickHouseEvidenceDto> {
    const mirrorEnabled = process.env.HF_MIRROR_ENABLED === 'true';
    const chConfigured = this.clickHouse.isConfigured;
    const chAvailable = this.clickHouse.isAvailable;

    const unavailableBase = (
      status: TripClickHouseEvidenceDto['clickhouseStatus'],
      debugReason: string,
    ): TripClickHouseEvidenceDto => ({
      evidenceAvailable: false,
      clickhouseStatus: status,
      readOnly: true,
      signalQuality: 'unavailable',
      hfAvailability: 'missing',
      snapshotSampleCount: null,
      hfPointCount: 0,
      hfEventCount: 0,
      hfWindowCount: 0,
      gpsCoverage: 'missing',
      signalAvailability: emptySignalAvailability(),
      missingSignals: [],
      evidenceSummary: [debugReason],
      detectorFeasibility: [],
      lastEvidenceAt: null,
      degraded: status !== 'mirror_disabled',
      debugReason,
    });

    if (!chConfigured) {
      return unavailableBase(
        'unavailable',
        'ClickHouse nicht konfiguriert — keine Evidence-Anreicherung.',
      );
    }

    if (!chAvailable) {
      return unavailableBase(
        'degraded',
        'ClickHouse nicht erreichbar — Trip-Bewertung bleibt aus PostgreSQL.',
      );
    }

    try {
      const endTime =
        params.endTime ?? new Date(params.startTime.getTime() + 60 * 60 * 1000);

      const [
        signalQuality,
        hfEventCount,
        snapshotSampleCount,
        lastEvidenceAt,
        windowsResult,
      ] = await Promise.all([
        this.signalQualityRead.getTripSignalQuality(
          params.orgId,
          params.vehicleId,
          params.tripId,
        ),
        this.clickHouseHf.countTripHfEvents(params.vehicleId, params.tripId),
        this.countSnapshotsInWindow(
          params.vehicleId,
          params.startTime,
          endTime,
        ),
        this.clickHouseHf.getTripLastEvidenceAt(
          params.vehicleId,
          params.tripId,
        ),
        this.clickHouseHf.getTripHfWindows(params.vehicleId, params.tripId),
      ]);

      const availFromWindows =
        windowsResult.windows.length > 0
          ? signalAvailabilityFromWindows(windowsResult.windows)
          : null;

      const signalAvailability = {
        rpm: availFromWindows?.rpmAvailable ?? false,
        throttle: availFromWindows?.throttleAvailable ?? false,
        engineLoad: availFromWindows?.loadAvailable ?? false,
        coolant: availFromWindows?.coolantAvailable ?? false,
        tractionPower: availFromWindows?.tractionBatteryPowerAvailable ?? false,
      };

      const gpsPointCount = windowsResult.windows
        .filter((w) => w.signalGroup === 'gps')
        .reduce((sum, w) => sum + w.gpsPointCount, 0);

      const evidenceSummary = buildTripEvidenceSummary({
        signalQuality,
        snapshotSampleCount,
        hfEventCount,
        gpsPointCount,
        signalAvailability,
        hfMirrorEnabled: mirrorEnabled,
      });

      const degraded =
        signalQuality.degraded ||
        !mirrorEnabled ||
        Boolean(windowsResult.degradedReason);

      let clickhouseStatus: TripClickHouseEvidenceDto['clickhouseStatus'] =
        'available';
      if (!mirrorEnabled) {
        clickhouseStatus = 'mirror_disabled';
      } else if (degraded) {
        clickhouseStatus = 'degraded';
      } else if (
        signalQuality.hfPointCount === 0 &&
        (snapshotSampleCount ?? 0) === 0
      ) {
        clickhouseStatus = 'unavailable';
      }

      const evidenceAvailable =
        signalQuality.hfPointCount > 0 ||
        hfEventCount > 0 ||
        signalQuality.windowCount > 0 ||
        (snapshotSampleCount ?? 0) > 0;

      return {
        evidenceAvailable,
        clickhouseStatus,
        readOnly: true,
        signalQuality: signalQuality.overallQuality,
        hfAvailability: signalQuality.hfAvailability,
        snapshotSampleCount,
        hfPointCount: signalQuality.hfPointCount,
        hfEventCount,
        hfWindowCount: signalQuality.windowCount,
        gpsCoverage: deriveGpsCoverage(gpsPointCount),
        signalAvailability,
        missingSignals: signalQuality.missingKeySignals,
        evidenceSummary,
        detectorFeasibility: signalQuality.detectorFeasibilityHints,
        lastEvidenceAt,
        degraded,
        debugReason: signalQuality.degradedReason ?? windowsResult.degradedReason ?? null,
      };
    } catch (err: unknown) {
      this.logger.warn(
        `getTripClickHouseEvidence failed for trip ${params.tripId}: ${(err as Error).message}`,
      );
      return unavailableBase(
        'degraded',
        'ClickHouse-Evidence konnte nicht geladen werden — Trip-Detail bleibt nutzbar.',
      );
    }
  }

  private async countSnapshotsInWindow(
    vehicleId: string,
    from: Date,
    to: Date,
  ): Promise<number | null> {
    if (!this.clickHouse.isAvailable) return null;
    try {
      const result = await this.clickHouse.getClient().query({
        query: `
          SELECT count() AS cnt
          FROM ${SNAPSHOTS_TABLE}
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
      const [row] = await result.json<{ cnt: string | number }>();
      return Number(row?.cnt ?? 0);
    } catch {
      return null;
    }
  }
}

function emptySignalAvailability() {
  return {
    rpm: false,
    throttle: false,
    engineLoad: false,
    coolant: false,
    tractionPower: false,
  };
}

import { Injectable, Logger } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  TripDetectionState,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSegmentsService } from '../../dimo/dimo-segments.service';
import { BatteryHealthService } from './battery-health.service';
import { BatteryEvidenceService } from './battery-evidence.service';
import {
  stabilize,
  shouldPublish,
  determineLvMaturity,
  combinedConfidence,
  mapSignalConfidence,
  daysBetween,
  type PublicationState,
} from './soh-publication';

// ── Voltage → SOC lookup (standard 12V lead-acid / AGM) ──
const VOLTAGE_SOC: [number, number][] = [
  [12.73, 100], [12.62, 90], [12.50, 80], [12.37, 70],
  [12.24, 60], [12.10, 50], [11.96, 40], [11.81, 30],
  [11.66, 20], [11.51, 10], [11.30, 0],
];

function voltageToSoc(v: number): number | null {
  if (v >= 12.73) return 100;
  if (v <= 11.30) return 0;
  for (let i = 0; i < VOLTAGE_SOC.length - 1; i++) {
    const [v1, s1] = VOLTAGE_SOC[i];
    const [v2, s2] = VOLTAGE_SOC[i + 1];
    if (v >= v2 && v <= v1) {
      const ratio = (v - v2) / (v1 - v2);
      return Math.round(s2 + ratio * (s1 - s2));
    }
  }
  return null;
}

// Thresholds — configurable via env without code changes
const REST_60M_MS = parseInt(
  process.env.BATTERY_REST_60M_MS ?? String(60 * 60_000),
  10,
);
const REST_6H_MS = parseInt(
  process.env.BATTERY_REST_6H_MS ?? String(6 * 60 * 60_000),
  10,
);
const BATTERY_MAX_SAMPLE_AGE_MS = parseInt(
  process.env.BATTERY_MAX_SAMPLE_AGE_MS ?? String(5 * 60_000),
  10,
);
const BATTERY_MAX_FUTURE_SKEW_MS = 60_000;
// Tolerance for matching "same rest window" — 2 minutes
const REST_WINDOW_TOLERANCE_MS = 2 * 60_000;

function isPlausibleVoltage(v: number | null | undefined): v is number {
  return v != null && v >= 9.0 && v <= 16.0;
}

interface HealthResult {
  soc: number | null;
  soh: number | null;
  confidence: string;
  badge: string;
}

type BatteryFeaturesLike = {
  vOff60m: number | null;
  vOff6h: number | null;
  deltaVRest: number | null;
  vPreCrank: number | null;
  vMinCrank: number | null;
  crankDrop: number | null;
  vRecovery5s: number | null;
  vRecovery30s: number | null;
};

@Injectable()
export class BatteryV2Service {
  private readonly logger = new Logger(BatteryV2Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: DimoSegmentsService,
    private readonly batteryHealth: BatteryHealthService,
    private readonly batteryEvidence: BatteryEvidenceService,
  ) {}

  // ══════════════════════════════════════════════════════════
  //  SNAPSHOT HOOK — called after every vehicleLatestState upsert
  // ══════════════════════════════════════════════════════════

  async onSnapshot(
    vehicleId: string,
    lvBatteryVoltage: number | null,
    observedAt: Date | null = null,
  ): Promise<void> {
    if (!isPlausibleVoltage(lvBatteryVoltage)) return;
    const now = new Date();
    const sampleAt = observedAt ?? now;
    if (Number.isNaN(sampleAt.getTime())) return;

    const sampleAgeMs = now.getTime() - sampleAt.getTime();
    if (sampleAt.getTime() - now.getTime() > BATTERY_MAX_FUTURE_SKEW_MS) {
      this.logger.debug(
        `Skipping LV sample with future timestamp: vehicle=${vehicleId} sampleAt=${sampleAt.toISOString()}`,
      );
      return;
    }
    if (sampleAgeMs > BATTERY_MAX_SAMPLE_AGE_MS) {
      this.logger.debug(
        `Skipping stale LV sample: vehicle=${vehicleId} ageMs=${sampleAgeMs}`,
      );
      return;
    }

    // Load current V2 detection state to check rest window
    const detState = await this.prisma.vehicleTripDetectionState.findUnique({
      where: { vehicleId },
      select: { state: true, lastActivityAt: true },
    });

    if (
      !detState ||
      detState.state !== TripDetectionState.RESTING ||
      !detState.lastActivityAt
    ) {
      // Vehicle is active or state unknown — no rest capture needed
      return;
    }

    const restDurationMs =
      sampleAt.getTime() - detState.lastActivityAt.getTime();

    // Short-circuit: below first threshold
    if (restDurationMs < REST_60M_MS) return;

    const features = await this.prisma.batteryFeatures.findUnique({
      where: { vehicleId },
    });

    const lastActivityMs = detState.lastActivityAt.getTime();
    const storedWindowMs = features?.restWindowStartedAt?.getTime() ?? -1;
    const isNewWindow =
      Math.abs(storedWindowMs - lastActivityMs) > REST_WINDOW_TOLERANCE_MS;

    if (isNewWindow) {
      // Record the start of this new rest window; actual captures happen
      // on the next eligible snapshot after the threshold is reached.
      await this.prisma.batteryFeatures.upsert({
        where: { vehicleId },
        create: {
          vehicleId,
          restWindowStartedAt: detState.lastActivityAt,
        },
        update: {
          restWindowStartedAt: detState.lastActivityAt,
          rest60mCapturedAt: null,
          rest6hCapturedAt: null,
          vOff60m: null,
          vOff6h: null,
          deltaVRest: null,
        },
      });
      return;
    }

    // Ignore duplicate/out-of-order samples for already processed windows.
    const latestCapturedAt =
      (features?.rest6hCapturedAt ?? features?.rest60mCapturedAt) ?? null;
    if (latestCapturedAt && sampleAt.getTime() <= latestCapturedAt.getTime()) {
      return;
    }

    const needs60m =
      restDurationMs >= REST_60M_MS && !features?.rest60mCapturedAt;
    const needs6h =
      restDurationMs >= REST_6H_MS && !features?.rest6hCapturedAt;

    if (!needs60m && !needs6h) return;

    const updates: Record<string, unknown> = {};

    if (needs60m) {
      updates.vOff60m = lvBatteryVoltage;
      updates.rest60mCapturedAt = sampleAt;
      this.logger.log(
        `Battery 60m rest captured: vehicle=${vehicleId} v=${lvBatteryVoltage}V`,
      );
    }
    if (needs6h) {
      updates.vOff6h = lvBatteryVoltage;
      updates.rest6hCapturedAt = sampleAt;
      const v60m = features?.vOff60m;
      if (v60m != null) {
        updates.deltaVRest = lvBatteryVoltage - v60m;
      }
      this.logger.log(
        `Battery 6h rest captured: vehicle=${vehicleId} v=${lvBatteryVoltage}V`,
      );
    }

    const updated = await this.prisma.batteryFeatures.update({
      where: { vehicleId },
      data: updates,
    });

    await this.recomputeHealth(
      vehicleId,
      updated as BatteryFeaturesLike,
      {
        newRestObservation: needs60m || needs6h,
        observedAt: sampleAt,
      },
    );

    // Record a formal BatteryHealthSnapshot so existing trend/history APIs
    // stay populated.  BatteryHealthService.recordSnapshot already emits the
    // corresponding VOLTAGE_V / RESTING_VOLTAGE_V evidence rows — emitting
    // them again here would create deterministic duplicates on every rest
    // capture (one per observedAt), which pollutes the evidence stream and
    // inflates trend counts.
    await this.batteryHealth.recordSnapshot({
      vehicleId,
      voltageV: lvBatteryVoltage,
      restingVoltage: lvBatteryVoltage,
      engineRunning: false,
      observedAt: sampleAt,
    });
  }

  // ══════════════════════════════════════════════════════════
  //  TRIP-START HOOK — fire-and-forget crank feature extraction
  // ══════════════════════════════════════════════════════════

  async onTripStart(
    vehicleId: string,
    dimoTokenId: number,
    tripId: string,
    tripStartAt: Date,
  ): Promise<void> {
    const from = new Date(tripStartAt.getTime() - 30_000);
    const to = new Date(tripStartAt.getTime() + 120_000);

    const points = await this.segments.fetchCrankWindow(dimoTokenId, from, to);
    if (points.length === 0) {
      this.logger.debug(
        `No crank window data for vehicle=${vehicleId} — skipping`,
      );
      return;
    }

    const startMs = tripStartAt.getTime();

    // Pre-crank: last voltage reading before trip start
    const preCrankPoints = points.filter(
      (p) => new Date(p.timestamp).getTime() <= startMs,
    );
    const vPreCrank =
      preCrankPoints.length > 0
        ? preCrankPoints[preCrankPoints.length - 1].voltage
        : null;

    // Min voltage in ±30 s window around crank
    const crankZonePoints = points.filter((p) => {
      const t = new Date(p.timestamp).getTime();
      return t >= startMs - 30_000 && t <= startMs + 30_000;
    });
    const crankVoltages = crankZonePoints
      .map((p) => p.voltage)
      .filter((v): v is number => v != null);
    const vMinCrank =
      crankVoltages.length > 0 ? Math.min(...crankVoltages) : null;

    const crankDrop =
      vPreCrank != null && vMinCrank != null ? vPreCrank - vMinCrank : null;

    // 5 s recovery
    const t5 = startMs + 5_000;
    const p5s = points.find(
      (p) => new Date(p.timestamp).getTime() >= t5,
    );
    const vRecovery5s = p5s?.voltage ?? null;

    // 30 s recovery
    const t30 = startMs + 30_000;
    const p30s = points.find(
      (p) => new Date(p.timestamp).getTime() >= t30,
    );
    const vRecovery30s = p30s?.voltage ?? null;

    const crankUpdate = {
      crankTripId: tripId,
      crankAt: tripStartAt,
      vPreCrank: isPlausibleVoltage(vPreCrank) ? vPreCrank : null,
      vMinCrank: isPlausibleVoltage(vMinCrank) ? vMinCrank : null,
      crankDrop:
        crankDrop != null && crankDrop >= 0 && crankDrop <= 6.0
          ? crankDrop
          : null,
      vRecovery5s: isPlausibleVoltage(vRecovery5s) ? vRecovery5s : null,
      vRecovery30s: isPlausibleVoltage(vRecovery30s) ? vRecovery30s : null,
    };

    const updated = await this.prisma.batteryFeatures.upsert({
      where: { vehicleId },
      create: { vehicleId, ...crankUpdate },
      update: crankUpdate,
    });

    await this.recomputeHealth(
      vehicleId,
      updated as BatteryFeaturesLike,
      {
        newCrankObservation: crankUpdate.crankDrop != null,
        observedAt: tripStartAt,
      },
    );

    this.logger.log(
      `Crank features captured: vehicle=${vehicleId} trip=${tripId}` +
        ` vPre=${vPreCrank?.toFixed(2) ?? '—'} drop=${crankDrop?.toFixed(2) ?? '—'}V`,
    );
  }

  // ══════════════════════════════════════════════════════════
  //  SCORING
  // ══════════════════════════════════════════════════════════

  private computeHealth(f: BatteryFeaturesLike): HealthResult {
    // SOC from best available resting voltage (6 h preferred over 60 m)
    const restV = f.vOff6h ?? f.vOff60m;
    const soc = restV != null ? voltageToSoc(restV) : null;

    let scoreSum = 0;
    let weightSum = 0;

    // 35 % — Resting voltage, derived from the same VOLTAGE_SOC lookup table
    // that produces the displayed SOC.  Using a single curve keeps SOC and
    // the SOH rest-component semantically consistent (a 12.10 V resting
    // reading no longer yields 50 % SOC and 63 % rest-score simultaneously).
    if (restV != null) {
      const rest = voltageToSoc(restV);
      if (rest != null) {
        scoreSum += rest * 0.35;
        weightSum += 0.35;
      }
    }

    // 35 % — Crank drop (0.3 V → 100, ≥ 2.5 V → 0)
    if (f.crankDrop != null) {
      const s = Math.min(100, Math.max(0, ((2.5 - f.crankDrop) / 2.2) * 100));
      scoreSum += s * 0.35;
      weightSum += 0.35;
    }

    // 20 % — 5 s voltage recovery relative to pre-crank (80 % ratio → 0, 100 % → 100)
    if (f.vRecovery5s != null && f.vPreCrank != null && f.vPreCrank > 0) {
      const ratio = f.vRecovery5s / f.vPreCrank;
      const s = Math.min(100, Math.max(0, ((ratio - 0.80) / 0.20) * 100));
      scoreSum += s * 0.20;
      weightSum += 0.20;
    }

    // 10 % — Rest stability: small |deltaVRest| = stable chemistry
    if (f.deltaVRest != null) {
      const s = Math.min(100, Math.max(0, 100 - Math.abs(f.deltaVRest) * 25));
      scoreSum += s * 0.10;
      weightSum += 0.10;
    }

    const soh =
      weightSum > 0 ? Math.round(scoreSum / weightSum) : null;

    const confidence: string =
      weightSum >= 0.85
        ? 'high'
        : weightSum >= 0.50
          ? 'medium'
          : weightSum > 0
            ? 'low'
            : 'insufficient_data';

    const badge: string =
      soh === null || confidence === 'insufficient_data'
        ? 'unknown'
        : soh >= 75
          ? 'healthy'
          : soh >= 50
            ? 'attention'
            : 'critical';

    return { soc, soh, confidence, badge };
  }

  private async recomputeHealth(
    vehicleId: string,
    features: BatteryFeaturesLike,
    observation?: {
      newRestObservation?: boolean;
      newCrankObservation?: boolean;
      observedAt?: Date;
    },
  ): Promise<void> {
    const result = this.computeHealth(features);
    const now = new Date();

    const current = await this.prisma.batteryFeatures.findUnique({
      where: { vehicleId },
    });
    if (!current) return;

    const rawSoh = result.soh;

    let qualifiedEventCount = current.qualifiedEventCount;
    let restObservationCount = current.restObservationCount;
    let crankObservationCount = current.crankObservationCount;
    let firstUsable = current.firstUsableMeasurementAt;
    const hasNewRestObservation = observation?.newRestObservation === true;
    const hasNewCrankObservation = observation?.newCrankObservation === true;
    const hasNewQualifiedObservation =
      hasNewRestObservation || hasNewCrankObservation;

    if (rawSoh != null && hasNewQualifiedObservation) {
      qualifiedEventCount += 1;
      if (hasNewRestObservation) restObservationCount += 1;
      if (hasNewCrankObservation) crankObservationCount += 1;
      if (!firstUsable) {
        firstUsable = observation?.observedAt ?? now;
      }
    }

    // Layer 2: Stabilize via EWMA with outlier guard
    let stabilizedSoh = current.stabilizedSohPct;
    let outlierSuppressed = current.outlierSuppressedCount;

    if (rawSoh != null) {
      const { stabilized, wasOutlier } = stabilize(
        current.stabilizedSohPct,
        rawSoh,
        current.ewmaAlpha,
      );
      stabilizedSoh = stabilized;
      if (wasOutlier) outlierSuppressed += 1;
    }

    // Layer 3: Maturity determination
    const days = daysBetween(firstUsable, now);
    const pubState: PublicationState = determineLvMaturity({
      qualifiedEventCount,
      daysSinceFirstMeasurement: days,
      restObservationCount,
      crankObservationCount,
    });

    // Combined confidence
    const signalConf = mapSignalConfidence(result.confidence);
    const matConf = combinedConfidence(signalConf, pubState);

    // Publication hysteresis
    let publishedSoh = current.publishedSohPct;
    let lastPublishedAt = current.lastPublishedAt;

    if (stabilizedSoh != null && pubState !== 'INITIAL_CALIBRATION') {
      const rounded = Math.round(stabilizedSoh);
      const stateChanged = pubState !== current.publicationState;
      if (stateChanged || shouldPublish(rounded, publishedSoh)) {
        publishedSoh = rounded;
        lastPublishedAt = now;
      }
    }

    // Badge uses published SOH when available, otherwise raw
    const badgeSoh = publishedSoh ?? rawSoh;
    const badge: string =
      badgeSoh == null || result.confidence === 'insufficient_data'
        ? 'unknown'
        : badgeSoh >= 70
          ? 'healthy'
          : badgeSoh >= 50
            ? 'attention'
            : 'critical';

    await this.prisma.batteryFeatures.update({
      where: { vehicleId },
      data: {
        estimatedSocPct: result.soc,
        estimatedSohPct: result.soh,
        confidence: result.confidence,
        badge,
        scoredAt: now,
        rawSohPct: rawSoh,
        stabilizedSohPct: stabilizedSoh,
        publishedSohPct: publishedSoh,
        publicationState: pubState,
        maturityConfidence: matConf,
        qualifiedEventCount,
        restObservationCount,
        crankObservationCount,
        firstUsableMeasurementAt: firstUsable,
        lastPublishedAt: lastPublishedAt,
        outlierSuppressedCount: outlierSuppressed,
      },
    });

    const observedAt = observation?.observedAt ?? now;
    await this.batteryEvidence.recordMany([
      {
        vehicleId,
        scope: BatteryEvidenceScope.LV,
        sourceType: BatteryEvidenceSourceType.MODEL_DERIVED,
        valueType: BatteryEvidenceValueType.SOH_PERCENT,
        numericValue: rawSoh,
        unit: 'percent',
        observedAt,
        provider: 'SynqDrive',
        confidence: result.confidence,
      },
      {
        vehicleId,
        scope: BatteryEvidenceScope.LV,
        sourceType: BatteryEvidenceSourceType.TELEMETRY_DERIVED,
        valueType: BatteryEvidenceValueType.SOH_PERCENT,
        numericValue: publishedSoh,
        unit: 'percent',
        observedAt,
        provider: 'SynqDrive',
        confidence: matConf,
      },
    ]);
  }

  // ══════════════════════════════════════════════════════════
  //  PUBLIC READ
  // ══════════════════════════════════════════════════════════

  async getV2Health(vehicleId: string) {
    const f = await this.prisma.batteryFeatures.findUnique({
      where: { vehicleId },
    });
    if (!f) return null;

    return {
      ...f,
      // User-facing SOH: published when available, null during calibration
      userFacingSohPct: f.publishedSohPct,
      publicationState: f.publicationState,
      maturityConfidence: f.maturityConfidence,
      signalConfidence: f.confidence,
    };
  }
}

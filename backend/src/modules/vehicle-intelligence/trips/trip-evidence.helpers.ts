import type {
  TripCoreDataPoint,
  PerformanceReading,
  RoutePoint,
} from '../../dimo/dimo-segments.service';
import { VehicleDetectionProfile } from '@prisma/client';
import { START_DETECTION_MODES, END_DETECTION_MODES } from './trip-detection.types';
import type { SnapshotEvidenceSignals, StartDetectionMode } from './trip-detection.types';
import type { DetectorFinding } from './detectors/detector.interfaces';
import {
  START_DETECTION_PHASES,
  assessLiveStartSnapshotFreshness,
  classifySpeedMotionBand,
  getLegacyProfileThresholds,
  getSharedSignalThresholds,
  getStartCandidatePolicy,
  getStartConfirmationPolicy,
  type LiveStartFreshnessAssessment,
  type StartCandidatePolicy,
  type StartConfirmationPolicy,
} from './trip-start-detection-policy';
import { isValidProviderEventTimestamp } from './trip-fsm-clock-contract';

type ProfileThresholds = ReturnType<typeof getLegacyProfileThresholds>;

export {
  START_DETECTION_PHASES,
  assessLiveStartSnapshotFreshness,
  getSharedSignalThresholds,
  getStartCandidatePolicy,
  getStartConfirmationPolicy,
  isLiveStartCandidateEligible,
  resolveLiveStartSkipReason,
  LIVE_START_STALE_THRESHOLD_MS,
  type LiveStartFreshnessAssessment,
  type LiveStartFreshnessState,
  type StartCandidatePolicy,
  type StartConfirmationPolicy,
} from './trip-start-detection-policy';

// ═══════════════════════════════════════════════════════════════
//  INTERFACES
// ═══════════════════════════════════════════════════════════════

export interface ActivityEvidence {
  hasMotion: boolean;
  hasIgnition: boolean;
  hasOdometerProgress: boolean;
  hasEnergyActivity: boolean;
  motionPointCount: number;
  ignitionOnCount: number;
  totalPoints: number;
  maxConsecutiveActive: number;
  activeDurationMs: number;
  avgSpeedKmh: number | null;
  odometerDeltaKm: number | null;
  fuelDelta: number | null;
  energyDelta: number | null;
}

export interface InactivityEvidence {
  allStopped: boolean;
  allIgnitionOff: boolean;
  noOdometerProgress: boolean;
  noEnergyChange: boolean;
  inactivePointCount: number;
  totalPoints: number;
  inactivityDurationMs: number;
}

export interface FrequencyCadence {
  pointsPerMinute: number;
  isActiveFrequency: boolean;
  isRestingFrequency: boolean;
}

export interface WindowAssessment {
  activity: ActivityEvidence;
  inactivity: InactivityEvidence;
  frequency: FrequencyCadence;
  overallVerdict: 'ACTIVE' | 'IDLE' | 'INACTIVE' | 'INSUFFICIENT_DATA';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface StartValidationResult {
  confirmed: boolean;
  mode: StartDetectionMode;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  summary: Record<string, unknown>;
}

export interface ContinuityAssessment {
  verdict: 'ACTIVE' | 'IDLE' | 'POSSIBLE_END';
  endMode?: string;
  endConfidence?: 'LOW' | 'MEDIUM' | 'HIGH';
  summary: Record<string, unknown>;
}

export interface TripQualityCheck {
  shouldDiscard: boolean;
  shouldMergeWithPrevious: boolean;
  reason?: string;
}

export interface SnapshotStartEvidence {
  triggered: boolean;
  strong: number;
  weak: number;
  hasMovement: boolean;
  reasons: string[];
  mode: StartDetectionMode;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  candidatePhase: typeof START_DETECTION_PHASES.START_CANDIDATE_WAKE;
  candidatePolicyProfile: string;
  candidatePolicy: Pick<
    StartCandidatePolicy,
    'trigger' | 'confidence' | 'signals' | 'profilePolicy'
  >;
}

export interface RefinedTripStartBoundary {
  startAt: Date;
  source: 'SNAPSHOT_CANDIDATE' | 'ROUTE_ACTIVITY' | 'CORE_ACTIVITY';
  startLatitude: number | null;
  startLongitude: number | null;
  adjustedMs: number;
}

export interface AnalyticsAssistedStartDecision {
  confirmed: boolean;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  mode: string;
  evidencePath: 'DIMO_ONLY' | 'DIMO_PLUS_CLICKHOUSE' | 'CLICKHOUSE_ASSISTED';
  summary: Record<string, unknown>;
}

export interface AnalyticsAssistedEndDecision {
  confirmed: boolean;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  endMode: string;
  evidencePath:
    | 'DIMO_ONLY'
    | 'DIMO_PLUS_CLICKHOUSE'
    | 'CLICKHOUSE_END_ASSISTED'
    | 'CLICKHOUSE_INCONCLUSIVE';
  detectedEndAt?: Date;
  summary: Record<string, unknown>;
}

export interface SegmentEndCandidate {
  endAt: Date;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  source: 'ignition' | 'motion';
  durationMs: number;
}

export interface ClickHouseContinuityGuard {
  keepTripOpen: boolean;
  evidencePath: 'DIMO_ONLY' | 'CLICKHOUSE_GUARD';
  summary: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════
//  PROFILE THRESHOLDS (legacy merged view — see trip-start-detection-policy.ts)
// ═══════════════════════════════════════════════════════════════

export function getProfileThresholds(profile: string) {
  return getLegacyProfileThresholds(profile);
}

// ═══════════════════════════════════════════════════════════════
//  PROFILE RESOLUTION
// ═══════════════════════════════════════════════════════════════

export function resolveDetectionProfile(
  fuelType: string | null | undefined,
): VehicleDetectionProfile {
  if (!fuelType) return VehicleDetectionProfile.UNKNOWN;
  const ft = fuelType.toUpperCase();
  if (ft === 'ELECTRIC' || ft === 'EV' || ft === 'BEV')
    return VehicleDetectionProfile.EV;
  if (ft === 'HYBRID' || ft === 'PLUGIN_HYBRID' || ft === 'PHEV')
    return VehicleDetectionProfile.HYBRID;
  if (['PETROL', 'DIESEL', 'GASOLINE', 'CNG', 'LPG'].includes(ft))
    return VehicleDetectionProfile.ICE;
  return VehicleDetectionProfile.UNKNOWN;
}

// ═══════════════════════════════════════════════════════════════
//  SNAPSHOT → POSSIBLE_START EVIDENCE
// ═══════════════════════════════════════════════════════════════

export function evaluateSnapshotEvidence(
  current: SnapshotEvidenceSignals,
  previous: {
    latitude: number | null;
    longitude: number | null;
    odometerKm: number | null;
    fuelLevelAbsolute: number | null;
    evSoc: number | null;
  } | null,
  profile: string,
): SnapshotStartEvidence {
  const candidatePolicy = getStartCandidatePolicy(profile);
  const {
    shared,
    signals,
    trigger,
    confidence: confContract,
    commonScoring,
    profilePolicy,
  } = candidatePolicy;

  let strong = 0;
  let weak = 0;
  let hasMovement = false;
  const reasons: string[] = [];

  if (current.isIgnitionOn === true) {
    strong += profilePolicy.ignitionOnStrongIncrement;
    reasons.push('ignition ON');
  }

  if (current.speedKmh != null) {
    const speedBand = classifySpeedMotionBand(current.speedKmh, shared);
    if (speedBand === 'strong') {
      strong++;
      hasMovement = true;
      reasons.push(`speed=${current.speedKmh}`);
    } else if (speedBand === 'weak') {
      weak++;
      hasMovement = true;
      reasons.push(`lowSpeed=${current.speedKmh}`);
    }
  }

  if (
    current.engineLoad != null &&
    current.engineLoad > signals.engineLoadStrongThreshold
  ) {
    if (profilePolicy.engineLoadStrongIncrement > 0) {
      strong += profilePolicy.engineLoadStrongIncrement;
    } else {
      weak += profilePolicy.engineLoadWeakIncrement;
    }
    reasons.push(`engineLoad=${current.engineLoad}%`);
  }

  const pKw = current.tractionBatteryPowerKw;
  if (
    pKw != null &&
    !Number.isNaN(pKw) &&
    profilePolicy.tractionBatteryEvidenceEnabled
  ) {
    if (pKw <= signals.tractionDrawStrong2Kw) {
      strong += commonScoring.tractionDrawStrong2Increment;
      reasons.push(`batteryOut=${pKw.toFixed(1)}kW`);
    } else if (pKw <= signals.tractionDrawStrong1Kw) {
      strong += commonScoring.tractionDrawStrong1Increment;
      reasons.push(`batteryOut=${pKw.toFixed(1)}kW`);
    } else if (pKw <= signals.tractionDrawWeakKw) {
      weak += commonScoring.tractionDrawWeakIncrement;
      reasons.push(`batteryDraw=${pKw.toFixed(1)}kW`);
    }
    if (
      pKw >= signals.tractionRegenWeakMinKw &&
      current.speedKmh != null &&
      current.speedKmh > signals.tractionRegenWeakMinSpeedKmh
    ) {
      weak++;
      reasons.push(`regen=${pKw.toFixed(1)}kW`);
    }
    if (
      pKw >= signals.tractionChargeWeakMinKw &&
      (current.speedKmh == null ||
        current.speedKmh < signals.tractionChargeWeakMaxSpeedKmh)
    ) {
      weak++;
      reasons.push('possibleCharging');
    }
  }

  if (
    previous?.latitude != null &&
    previous?.longitude != null &&
    current.latitude != null &&
    current.longitude != null
  ) {
    const dist = haversineM(
      previous.latitude,
      previous.longitude,
      current.latitude,
      current.longitude,
    );
    if (dist > signals.gpsStrongMinM) {
      strong += commonScoring.gpsStrongIncrement;
      hasMovement = true;
      reasons.push(`GPS moved ${Math.round(dist)}m`);
    } else if (dist > signals.gpsWeakMinM) {
      weak += commonScoring.gpsWeakIncrement;
      hasMovement = true;
      reasons.push(`GPS drift ${Math.round(dist)}m`);
    }
  }

  if (
    previous?.odometerKm != null &&
    current.odometerKm != null &&
    current.odometerKm > previous.odometerKm + shared.odometerMinDeltaKm
  ) {
    strong += commonScoring.odometerStrongIncrement;
    hasMovement = true;
    reasons.push('odometer+');
  }

  if (
    current.engineLoad != null &&
    current.engineLoad > 0 &&
    current.engineLoad <= signals.engineLoadStrongThreshold &&
    profilePolicy.lowEngineLoadWeakEvidenceEnabled
  ) {
    weak += profilePolicy.engineLoadWeakIncrement;
  }

  if (
    previous?.fuelLevelAbsolute != null &&
    current.fuelLevelAbsolute != null &&
    Math.abs(current.fuelLevelAbsolute - previous.fuelLevelAbsolute) >
      signals.fuelDeltaWeakMin
  ) {
    weak += commonScoring.fuelDeltaWeakIncrement;
    reasons.push('fuel change');
  }

  if (
    previous?.evSoc != null &&
    current.evSoc != null &&
    Math.abs(current.evSoc - previous.evSoc) > signals.socDeltaStrongMin
  ) {
    if (profilePolicy.socDeltaStrongForEvHybrid) {
      strong++;
    } else {
      weak++;
    }
    reasons.push('energy change');
  }

  const triggered =
    strong >= trigger.minStrong ||
    (strong >= trigger.minStrongWithMovement && hasMovement) ||
    weak >= trigger.minWeak;

  let mode: StartDetectionMode;
  if (strong >= trigger.minStrong && hasMovement) {
    mode =
      current.isIgnitionOn && profilePolicy.ignitionPrimaryModeEligible
        ? START_DETECTION_MODES.IGNITION_PRIMARY
        : START_DETECTION_MODES.MOTION_PRIMARY;
  } else if (hasMovement) {
    mode = START_DETECTION_MODES.MOTION_PRIMARY;
  } else if (
    current.isIgnitionOn &&
    current.engineLoad != null &&
    current.engineLoad > signals.engineLoadStrongThreshold
  ) {
    mode = START_DETECTION_MODES.RPM_VALIDATED;
  } else if (
    profilePolicy.tractionBatteryPrimaryModeEligible &&
    current.tractionBatteryPowerKw != null &&
    current.tractionBatteryPowerKw <= signals.tractionDrawStrong1Kw
  ) {
    mode = START_DETECTION_MODES.MOTION_PRIMARY;
  } else {
    mode = START_DETECTION_MODES.COMPOSITE_MULTI_SIGNAL;
  }

  const confidence: 'LOW' | 'MEDIUM' | 'HIGH' =
    strong >= confContract.highMinStrong
      ? 'HIGH'
      : strong >= confContract.mediumMinStrong
        ? 'MEDIUM'
        : 'LOW';

  return {
    triggered,
    strong,
    weak,
    hasMovement,
    reasons,
    mode,
    confidence,
    candidatePhase: START_DETECTION_PHASES.START_CANDIDATE_WAKE,
    candidatePolicyProfile: candidatePolicy.profile,
    candidatePolicy: {
      trigger,
      confidence: confContract,
      signals,
      profilePolicy,
    },
  };
}

export function refineTripStartBoundary(
  candidateStartAt: Date,
  corePoints: TripCoreDataPoint[],
  routePoints: RoutePoint[],
  profile: string = 'UNKNOWN',
): RefinedTripStartBoundary {
  const t = getProfileThresholds(profile);
  const earliestCoreAt = findEarliestCoreActivityAt(corePoints, t.odometerMinDeltaKm, t.speedMotionKmh);
  const earliestRouteAt = findEarliestRouteActivityAt(routePoints, t.speedMotionKmh);

  const chosenSource =
    earliestRouteAt != null
      ? 'ROUTE_ACTIVITY'
      : earliestCoreAt != null
        ? 'CORE_ACTIVITY'
        : 'SNAPSHOT_CANDIDATE';

  const startAt =
    chosenSource === 'ROUTE_ACTIVITY'
      ? earliestRouteAt!
      : chosenSource === 'CORE_ACTIVITY'
        ? earliestCoreAt!
        : candidateStartAt;

  const closestRoutePoint = findClosestRoutePoint(routePoints, startAt);

  return {
    startAt,
    source: chosenSource,
    startLatitude: closestRoutePoint?.latitude ?? null,
    startLongitude: closestRoutePoint?.longitude ?? null,
    adjustedMs: startAt.getTime() - candidateStartAt.getTime(),
  };
}

export function resolveAnalyticsAssistedStartDecision(input: {
  startConfirmation?: DetectorFinding;
  activityWindow?: DetectorFinding;
  ignitionSegment?: DetectorFinding;
  motionSegment?: DetectorFinding;
  profile?: string;
  currentTelemetry: {
    isIgnitionOn: boolean | null;
    speedKmh: number | null;
    engineLoad: number | null;
  } | null;
}): AnalyticsAssistedStartDecision {
  const startConfirmation = input.startConfirmation;
  const activityWindow = input.activityWindow;
  const ignitionSegment = input.ignitionSegment;
  const motionSegment = input.motionSegment;
  const profile = (input.profile ?? 'UNKNOWN').toUpperCase();
  const currentTelemetryActive =
    (input.currentTelemetry?.speedKmh ?? 0) > 0.5 ||
    input.currentTelemetry?.engineLoad != null && input.currentTelemetry.engineLoad > 15 ||
    (input.currentTelemetry?.isIgnitionOn === true &&
      (input.currentTelemetry?.speedKmh ?? 0) > 0);
  const activityTriggered = activityWindow?.verdict === 'TRIGGERED';
  const ignitionTriggered = ignitionSegment?.verdict === 'TRIGGERED';
  const motionTriggered = motionSegment?.verdict === 'TRIGGERED';
  const analyticsCorroborated =
    activityTriggered || ignitionTriggered || motionTriggered;

  if (startConfirmation?.verdict === 'TRIGGERED') {
    return {
      confirmed: true,
      confidence: startConfirmation.confidence,
      mode:
        (startConfirmation.evidence?.mode as string) ??
        START_DETECTION_MODES.COMPOSITE_MULTI_SIGNAL,
      evidencePath: analyticsCorroborated
        ? 'DIMO_PLUS_CLICKHOUSE'
        : 'DIMO_ONLY',
      summary: {
        startConfirmationConfidence: startConfirmation.confidence,
        clickhouseActivityTriggered: activityTriggered,
        clickhouseIgnitionTriggered: ignitionTriggered,
        clickhouseMotionTriggered: motionTriggered,
      },
    };
  }

  const activityPointCount =
    typeof activityWindow?.evidence?.pointCount === 'number'
      ? (activityWindow.evidence.pointCount as number)
      : 0;
  const activitySpeed =
    typeof activityWindow?.evidence?.maxSpeedKmh === 'number'
      ? (activityWindow.evidence.maxSpeedKmh as number)
      : 0;
  const activityOdometerDelta =
    typeof activityWindow?.evidence?.odometerDeltaKm === 'number'
      ? (activityWindow.evidence.odometerDeltaKm as number)
      : 0;
  const strongActivityWindow =
    activityTriggered &&
    (activityPointCount >= 3 || activitySpeed > 5 || activityOdometerDelta > 0.05);

  // ICE / HYBRID path: require ignition + activity corroboration.
  if (currentTelemetryActive && strongActivityWindow && ignitionTriggered) {
    return {
      confirmed: true,
      confidence:
        activityWindow?.confidence === 'HIGH' || ignitionSegment?.confidence === 'HIGH'
          ? 'HIGH'
          : 'MEDIUM',
      mode: START_DETECTION_MODES.COMPOSITE_MULTI_SIGNAL,
      evidencePath: 'CLICKHOUSE_ASSISTED',
      summary: {
        currentTelemetryActive,
        clickhouseActivityTriggered: activityTriggered,
        clickhouseIgnitionTriggered: ignitionTriggered,
        clickhouseMotionTriggered: motionTriggered,
        pointCount: activityPointCount,
        maxSpeedKmh: activitySpeed,
        odometerDeltaKm: activityOdometerDelta,
      },
    };
  }

  // EV / UNKNOWN path: ignition telemetry is frequently absent. Accept motion
  // segment + activity window as sufficient corroboration when telemetry is
  // active. This is the single most impactful fix for Tesla trip detection.
  const isEvProfile =
    profile === 'EV' || profile === 'HYBRID' || profile === 'UNKNOWN';
  if (
    isEvProfile &&
    currentTelemetryActive &&
    (motionTriggered || strongActivityWindow)
  ) {
    return {
      confirmed: true,
      confidence:
        motionSegment?.confidence === 'HIGH' ||
        activityWindow?.confidence === 'HIGH'
          ? 'HIGH'
          : 'MEDIUM',
      mode: START_DETECTION_MODES.MOTION_PRIMARY,
      evidencePath: 'CLICKHOUSE_ASSISTED',
      summary: {
        currentTelemetryActive,
        clickhouseActivityTriggered: activityTriggered,
        clickhouseIgnitionTriggered: ignitionTriggered,
        clickhouseMotionTriggered: motionTriggered,
        pointCount: activityPointCount,
        maxSpeedKmh: activitySpeed,
        odometerDeltaKm: activityOdometerDelta,
        evPath: true,
      },
    };
  }

  return {
    confirmed: false,
    confidence: 'LOW',
    mode: START_DETECTION_MODES.COMPOSITE_MULTI_SIGNAL,
    evidencePath: analyticsCorroborated ? 'DIMO_PLUS_CLICKHOUSE' : 'DIMO_ONLY',
    summary: {
      currentTelemetryActive,
      clickhouseActivityTriggered: activityTriggered,
      clickhouseIgnitionTriggered: ignitionTriggered,
      clickhouseMotionTriggered: motionTriggered,
      pointCount: activityPointCount,
      maxSpeedKmh: activitySpeed,
      odometerDeltaKm: activityOdometerDelta,
    },
  };
}

/** Whether live snapshot telemetry indicates the vehicle is stationary (inverse of start assist). */
export function isCurrentTelemetryInactive(
  telemetry: {
    isIgnitionOn: boolean | null;
    speedKmh: number | null;
    engineLoad: number | null;
  } | null,
): boolean {
  if (!telemetry) return false;
  const speed = telemetry.speedKmh ?? 0;
  const load = telemetry.engineLoad ?? 0;
  if (speed > 0.5) return false;
  if (load > 15) return false;
  if (telemetry.isIgnitionOn === true && speed > 0) return false;
  return true;
}

type SegmentEvidenceRow = {
  end: string;
  durationMs?: number;
  confidence?: 'LOW' | 'MEDIUM' | 'HIGH';
};

/** Latest ignition/motion segment end within the trip window (CH state_changes mirror). */
export function extractLatestSegmentEnd(
  findings: {
    ignitionSegment?: DetectorFinding;
    motionSegment?: DetectorFinding;
  },
  tripStartAt: Date,
  now: Date,
  preferMotion: boolean,
): SegmentEndCandidate | null {
  const candidates: SegmentEndCandidate[] = [];

  const collect = (
    finding: DetectorFinding | undefined,
    source: 'ignition' | 'motion',
  ) => {
    if (!finding || finding.verdict !== 'TRIGGERED') return;
    const segments = finding.evidence?.segments as SegmentEvidenceRow[] | undefined;
    if (!segments?.length) return;
    for (const row of segments) {
      const endAt = new Date(row.end);
      if (Number.isNaN(endAt.getTime())) continue;
      if (endAt.getTime() <= tripStartAt.getTime() || endAt.getTime() > now.getTime()) {
        continue;
      }
      candidates.push({
        endAt,
        confidence: row.confidence ?? finding.confidence,
        source,
        durationMs: row.durationMs ?? 0,
      });
    }
  };

  collect(findings.ignitionSegment, 'ignition');
  collect(findings.motionSegment, 'motion');
  if (candidates.length === 0) return null;

  const motionCandidates = candidates.filter((c) => c.source === 'motion');
  const ignitionCandidates = candidates.filter((c) => c.source === 'ignition');
  const pool =
    preferMotion && motionCandidates.length > 0
      ? motionCandidates
      : !preferMotion && ignitionCandidates.length > 0
        ? ignitionCandidates
        : candidates;

  return pool.sort((a, b) => b.endAt.getTime() - a.endAt.getTime())[0] ?? null;
}

/**
 * ClickHouse-first trip end assist (mirror of resolveAnalyticsAssistedStartDecision).
 * Requires live stationary telemetry + CH segment end + post-stop inactivity.
 */
export function resolveAnalyticsAssistedEndDecision(input: {
  continuityFinding?: DetectorFinding;
  activityWindow?: DetectorFinding;
  ignitionSegment?: DetectorFinding;
  motionSegment?: DetectorFinding;
  profile?: string;
  tripStartAt: Date;
  now: Date;
  currentTelemetry: {
    isIgnitionOn: boolean | null;
    speedKmh: number | null;
    engineLoad: number | null;
  } | null;
  minStationaryAfterSegmentMs: number;
  minTripDurationMs: number;
  highConfidenceStationaryMs?: number;
}): AnalyticsAssistedEndDecision {
  const inconclusive = (
    summary: Record<string, unknown>,
  ): AnalyticsAssistedEndDecision => ({
    confirmed: false,
    confidence: 'LOW',
    endMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
    evidencePath: 'CLICKHOUSE_INCONCLUSIVE',
    summary,
  });

  if (!isCurrentTelemetryInactive(input.currentTelemetry)) {
    return inconclusive({ reason: 'telemetry_still_active' });
  }

  const tripDurationMs = input.now.getTime() - input.tripStartAt.getTime();
  if (tripDurationMs < input.minTripDurationMs) {
    return inconclusive({ reason: 'trip_too_short', tripDurationMs });
  }

  const profile = (input.profile ?? 'UNKNOWN').toUpperCase();
  const isEvProfile =
    profile === 'EV' || profile === 'HYBRID' || profile === 'UNKNOWN';

  const segmentEnd = extractLatestSegmentEnd(
    {
      ignitionSegment: input.ignitionSegment,
      motionSegment: input.motionSegment,
    },
    input.tripStartAt,
    input.now,
    isEvProfile,
  );

  if (!segmentEnd) {
    return inconclusive({ reason: 'no_ch_segment_end' });
  }

  if (!isEvProfile && segmentEnd.source !== 'ignition') {
    return inconclusive({
      reason: 'ice_requires_ignition_segment',
      segmentSource: segmentEnd.source,
    });
  }

  const stationaryMs = input.now.getTime() - segmentEnd.endAt.getTime();
  if (stationaryMs < input.minStationaryAfterSegmentMs) {
    return inconclusive({
      reason: 'segment_end_too_recent',
      stationaryMs,
      minStationaryAfterSegmentMs: input.minStationaryAfterSegmentMs,
    });
  }

  const activityTriggered = input.activityWindow?.verdict === 'TRIGGERED';
  const maxSpeedKmh =
    typeof input.activityWindow?.evidence?.maxSpeedKmh === 'number'
      ? (input.activityWindow.evidence.maxSpeedKmh as number)
      : 0;
  const pointCount =
    typeof input.activityWindow?.evidence?.pointCount === 'number'
      ? (input.activityWindow.evidence.pointCount as number)
      : 0;
  const odometerDeltaKm =
    typeof input.activityWindow?.evidence?.odometerDeltaKm === 'number'
      ? (input.activityWindow.evidence.odometerDeltaKm as number)
      : 0;

  const resumedAfterStop =
    activityTriggered &&
    (pointCount >= 2 || maxSpeedKmh > 5 || odometerDeltaKm > 0.03);

  if (resumedAfterStop) {
    return inconclusive({
      reason: 'activity_resumed_after_segment_end',
      maxSpeedKmh,
      pointCount,
      odometerDeltaKm,
    });
  }

  const highStationaryMs =
    input.highConfidenceStationaryMs ?? 90_000;

  let confidence: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
  if (
    segmentEnd.confidence === 'HIGH' &&
    stationaryMs >= highStationaryMs &&
    !resumedAfterStop
  ) {
    confidence = 'HIGH';
  } else if (
    (segmentEnd.confidence === 'HIGH' || segmentEnd.confidence === 'MEDIUM') &&
    stationaryMs >= input.minStationaryAfterSegmentMs
  ) {
    confidence = 'MEDIUM';
  } else {
    return inconclusive({
      reason: 'insufficient_segment_confidence',
      segmentConfidence: segmentEnd.confidence,
      stationaryMs,
    });
  }

  const continuityVerdict =
    (input.continuityFinding?.evidence?.continuityVerdict as
      | string
      | undefined) ??
    (input.continuityFinding?.evidence?.verdict as string | undefined);
  const dimoCorroborated =
    input.continuityFinding != null &&
    ((input.continuityFinding.verdict === 'NOT_TRIGGERED' &&
      continuityVerdict === 'POSSIBLE_END') ||
      (input.continuityFinding.verdict === 'TRIGGERED' &&
        (continuityVerdict === 'IDLE' ||
          continuityVerdict === 'INACTIVE')));

  return {
    confirmed: true,
    confidence,
    endMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
    evidencePath: dimoCorroborated
      ? 'DIMO_PLUS_CLICKHOUSE'
      : 'CLICKHOUSE_END_ASSISTED',
    detectedEndAt: segmentEnd.endAt,
    summary: {
      segmentSource: segmentEnd.source,
      segmentEndAt: segmentEnd.endAt.toISOString(),
      segmentConfidence: segmentEnd.confidence,
      segmentDurationMs: segmentEnd.durationMs,
      stationaryMs,
      clickhouseActivityTriggered: activityTriggered,
      maxSpeedKmh,
      pointCount,
      profile,
      isEvProfile,
    },
  };
}

export function resolveClickHouseContinuityGuard(
  activityWindow?: DetectorFinding,
): ClickHouseContinuityGuard {
  const activityTriggered = activityWindow?.verdict === 'TRIGGERED';
  const pointCount =
    typeof activityWindow?.evidence?.pointCount === 'number'
      ? (activityWindow.evidence.pointCount as number)
      : 0;
  const maxSpeedKmh =
    typeof activityWindow?.evidence?.maxSpeedKmh === 'number'
      ? (activityWindow.evidence.maxSpeedKmh as number)
      : 0;
  const odometerDeltaKm =
    typeof activityWindow?.evidence?.odometerDeltaKm === 'number'
      ? (activityWindow.evidence.odometerDeltaKm as number)
      : 0;
  const keepTripOpen =
    activityTriggered &&
    (pointCount >= 3 || maxSpeedKmh > 5 || odometerDeltaKm > 0.05);

  return {
    keepTripOpen,
    evidencePath: keepTripOpen ? 'CLICKHOUSE_GUARD' : 'DIMO_ONLY',
    summary: {
      clickhouseActivityTriggered: activityTriggered,
      pointCount,
      maxSpeedKmh,
      odometerDeltaKm,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  ACTIVITY WINDOW EVALUATION (Group 1)
// ═══════════════════════════════════════════════════════════════

/**
 * A point is "active" when the vehicle is clearly moving.
 * Ignition alone is NOT sufficient to mark a point as active — speed must
 * also exceed the motion threshold.  This prevents stale ignition from
 * inflating the active count during end-of-trip detection.
 */
function isPointActive(pt: TripCoreDataPoint, t: ProfileThresholds): boolean {
  // Primary: speed clearly above the profile motion threshold
  const hasSpeed = pt.speed != null && pt.speed > t.speedActiveKmh;
  // Secondary: ignition + minimal speed (both must be present, ignition alone is not enough)
  const hasIgnitionWithSpeed =
    pt.isIgnitionOn === true && pt.speed != null && pt.speed > t.speedMotionKmh;
  return hasSpeed || hasIgnitionWithSpeed;
}

export function evaluateActivityWindow(
  points: TripCoreDataPoint[],
  profile: string = 'UNKNOWN',
): ActivityEvidence {
  const t = getProfileThresholds(profile);

  let motionCount = 0;
  let ignitionOnCount = 0;
  let maxConsec = 0;
  let consec = 0;
  let activeDurMs = 0;
  let activeStartMs: number | null = null;
  const speeds: number[] = [];

  for (const pt of points) {
    if (isPointActive(pt, t)) {
      consec++;
      if (activeStartMs == null)
        activeStartMs = new Date(pt.timestamp).getTime();
      maxConsec = Math.max(maxConsec, consec);
    } else {
      if (activeStartMs != null)
        activeDurMs += new Date(pt.timestamp).getTime() - activeStartMs;
      consec = 0;
      activeStartMs = null;
    }

    if (pt.speed != null && pt.speed > t.speedMotionKmh) {
      motionCount++;
      speeds.push(pt.speed);
    }
    if (pt.isIgnitionOn) ignitionOnCount++;
  }

  if (activeStartMs != null && points.length > 0) {
    activeDurMs +=
      new Date(points[points.length - 1].timestamp).getTime() - activeStartMs;
  }

  const odoValues = points
    .filter((p) => p.travelledDistance != null)
    .map((p) => p.travelledDistance!);
  let odometerDelta: number | null = null;
  if (odoValues.length >= 2) {
    const delta = odoValues[odoValues.length - 1] - odoValues[0];
    if (delta >= 0 && delta < 2000) odometerDelta = delta;
  }

  const fuelValues = points
    .filter((p) => p.fuelAbsoluteLevel != null)
    .map((p) => p.fuelAbsoluteLevel!);
  let fuelDelta: number | null = null;
  if (fuelValues.length >= 2) {
    fuelDelta = fuelValues[0] - fuelValues[fuelValues.length - 1];
  }

  const energyValues = points
    .filter((p) => p.batteryEnergy != null)
    .map((p) => p.batteryEnergy!);
  let energyDelta: number | null = null;
  if (energyValues.length >= 2) {
    energyDelta = energyValues[0] - energyValues[energyValues.length - 1];
  }

  return {
    hasMotion: motionCount > 0,
    hasIgnition: ignitionOnCount > 0,
    hasOdometerProgress:
      odometerDelta != null && odometerDelta > t.odometerMinDeltaKm,
    hasEnergyActivity:
      (fuelDelta != null && fuelDelta > 0.2) ||
      (energyDelta != null && energyDelta > 0.3),
    motionPointCount: motionCount,
    ignitionOnCount,
    totalPoints: points.length,
    maxConsecutiveActive: maxConsec,
    activeDurationMs: activeDurMs,
    avgSpeedKmh:
      speeds.length > 0
        ? Math.round((speeds.reduce((a, b) => a + b, 0) / speeds.length) * 10) / 10
        : null,
    odometerDeltaKm: odometerDelta,
    fuelDelta,
    energyDelta,
  };
}

// ═══════════════════════════════════════════════════════════════
//  INACTIVITY WINDOW EVALUATION
// ═══════════════════════════════════════════════════════════════

export function evaluateInactivityWindow(
  points: TripCoreDataPoint[],
  profile: string = 'UNKNOWN',
): InactivityEvidence {
  if (points.length === 0) {
    return {
      allStopped: true,
      allIgnitionOff: true,
      noOdometerProgress: true,
      noEnergyChange: true,
      inactivePointCount: 0,
      totalPoints: 0,
      inactivityDurationMs: 0,
    };
  }

  const t = getProfileThresholds(profile);
  let inactiveCount = 0;
  let allStopped = true;
  let allIgnitionOff = true;
  let hasAnyIgnitionData = false;

  for (const pt of points) {
    const isStopped = pt.speed == null || pt.speed <= t.speedMotionKmh;
    if (!isStopped) allStopped = false;
    if (pt.isIgnitionOn != null) {
      hasAnyIgnitionData = true;
      if (pt.isIgnitionOn) allIgnitionOff = false;
    }
    // Count as inactive if stopped — ignition state is secondary since it can be stale
    if (isStopped) inactiveCount++;
  }

  // If we have no ignition data at all (e.g. Tesla via DIMO), we cannot
  // confirm "all ignition off" — treat it as unknown rather than asserting off.
  // This prevents false HIGH-confidence end detection for EVs.
  if (!hasAnyIgnitionData) {
    allIgnitionOff = false;
  }

  const odoValues = points
    .filter((p) => p.travelledDistance != null)
    .map((p) => p.travelledDistance!);
  const noOdometerProgress =
    odoValues.length < 2 ||
    Math.abs(odoValues[odoValues.length - 1] - odoValues[0]) <
      t.odometerMinDeltaKm;

  const fuelValues = points
    .filter((p) => p.fuelAbsoluteLevel != null)
    .map((p) => p.fuelAbsoluteLevel!);
  const energyValues = points
    .filter((p) => p.batteryEnergy != null)
    .map((p) => p.batteryEnergy!);
  const noEnergyChange =
    (fuelValues.length < 2 ||
      Math.abs(fuelValues[fuelValues.length - 1] - fuelValues[0]) < 0.2) &&
    (energyValues.length < 2 ||
      Math.abs(energyValues[energyValues.length - 1] - energyValues[0]) < 0.3);

  const firstMs = new Date(points[0].timestamp).getTime();
  const lastMs = new Date(points[points.length - 1].timestamp).getTime();

  return {
    allStopped,
    allIgnitionOff,
    noOdometerProgress,
    noEnergyChange,
    inactivePointCount: inactiveCount,
    totalPoints: points.length,
    inactivityDurationMs: lastMs - firstMs,
  };
}

// ═══════════════════════════════════════════════════════════════
//  FREQUENCY / CADENCE  — profile-aware
// ═══════════════════════════════════════════════════════════════

/**
 * Evaluate the data-point frequency within a window.
 *
 * Uses profile-specific thresholds from PROFILE_THRESHOLDS so that each
 * profile's configured activeFrequencyPerMin / restingFrequencyPerMin values
 * are actually respected.
 */
export function evaluateFrequency(
  points: TripCoreDataPoint[],
  windowMs: number,
  profile: string = 'UNKNOWN',
): FrequencyCadence {
  const t = getProfileThresholds(profile);

  if (points.length < 2 || windowMs <= 0) {
    return {
      pointsPerMinute: 0,
      isActiveFrequency: false,
      isRestingFrequency: true,
    };
  }
  const ppm = points.length / (windowMs / 60_000);
  return {
    pointsPerMinute: Math.round(ppm * 100) / 100,
    isActiveFrequency: ppm >= t.activeFrequencyPerMin,
    isRestingFrequency: ppm < t.restingFrequencyPerMin,
  };
}

// ═══════════════════════════════════════════════════════════════
//  GROUP 4 (PERFORMANCE) EVALUATION  — ICE / HYBRID focus
// ═══════════════════════════════════════════════════════════════

/**
 * Returns true if performance readings indicate the ICE engine is active
 * (RPM > 600, throttle > 5%, or engine load > 10%).
 *
 * NOTE: For EVs these signals are typically absent or near-zero.  Do NOT
 * rely on this function to assess EV idle continuity — use
 * assessActiveContinuity()'s profile-aware path instead.
 */
export function evaluatePerformanceActivity(
  readings: PerformanceReading[],
): boolean {
  if (readings.length === 0) return false;
  return readings.some(
    (r) =>
      (r.rpm != null && r.rpm > 600) ||
      (r.throttlePosition != null && r.throttlePosition > 5) ||
      (r.engineLoad != null && r.engineLoad > 10),
  );
}

// ═══════════════════════════════════════════════════════════════
//  POSSIBLE_START VALIDATION (Group 1 backfill)
// ═══════════════════════════════════════════════════════════════

export function validateTripStart(
  corePoints: TripCoreDataPoint[],
  currentTelemetry: {
    isIgnitionOn: boolean | null;
    speedKmh: number | null;
    engineLoad: number | null;
  } | null,
  profile: string = 'UNKNOWN',
): StartValidationResult {
  const confirmationPolicy = getStartConfirmationPolicy(profile);
  const t = confirmationPolicy.evidenceWeights;
  const shared = confirmationPolicy.shared;
  const act = evaluateActivityWindow(corePoints, profile);
  const windowMs =
    corePoints.length >= 2
      ? new Date(corePoints[corePoints.length - 1].timestamp).getTime() -
        new Date(corePoints[0].timestamp).getTime()
      : 0;
  const freq = evaluateFrequency(corePoints, windowMs, profile);

  let score = 0;
  const maxScore =
    t.ignitionWeight +
    t.speedWeight +
    t.odometerWeight +
    t.energyWeight +
    t.frequencyWeight;

  if (act.hasIgnition) score += t.ignitionWeight;
  if (act.hasMotion) score += t.speedWeight;
  if (act.hasOdometerProgress) score += t.odometerWeight;
  if (act.hasEnergyActivity) score += t.energyWeight;
  if (freq.isActiveFrequency) score += t.frequencyWeight;

  const strongConsecutive = act.maxConsecutiveActive >= 3;
  const stableDuration = act.activeDurationMs >= 60_000;
  const compositeStrong =
    act.maxConsecutiveActive >= 2 && score >= maxScore * 0.5;
  const currentlyActive =
    currentTelemetry?.isIgnitionOn === true &&
    (currentTelemetry?.speedKmh ?? 0) > 0;
  const combinedCurrent = act.maxConsecutiveActive >= 2 && currentlyActive;

  const confirmed =
    strongConsecutive || stableDuration || compositeStrong || combinedCurrent;

  let mode: StartDetectionMode;
  let confidence: 'LOW' | 'MEDIUM' | 'HIGH';

  if (strongConsecutive) {
    mode =
      act.hasIgnition && (profile === 'ICE' || profile === 'HYBRID')
        ? START_DETECTION_MODES.IGNITION_PRIMARY
        : START_DETECTION_MODES.MOTION_PRIMARY;
    confidence = 'HIGH';
  } else if (stableDuration) {
    mode = START_DETECTION_MODES.MOTION_PRIMARY;
    confidence = 'MEDIUM';
  } else if (compositeStrong) {
    if (act.hasIgnition && act.hasMotion)
      mode = START_DETECTION_MODES.IGNITION_PRIMARY;
    else if (act.hasOdometerProgress)
      mode = START_DETECTION_MODES.GPS_ODOMETER_FALLBACK;
    else if (freq.isActiveFrequency)
      mode = START_DETECTION_MODES.FREQUENCY_FALLBACK;
    else mode = START_DETECTION_MODES.COMPOSITE_MULTI_SIGNAL;
    confidence = 'MEDIUM';
  } else if (combinedCurrent) {
    mode = START_DETECTION_MODES.COMPOSITE_MULTI_SIGNAL;
    confidence = 'LOW';
  } else {
    mode = START_DETECTION_MODES.COMPOSITE_MULTI_SIGNAL;
    confidence = 'LOW';
  }

  return {
    confirmed,
    mode,
    confidence,
    summary: {
      confirmationPhase: START_DETECTION_PHASES.START_CONFIRMATION,
      confirmationPolicyProfile: confirmationPolicy.profile,
      maxConsecutiveActive: act.maxConsecutiveActive,
      activeDurationMs: act.activeDurationMs,
      motionPointCount: act.motionPointCount,
      ignitionOnCount: act.ignitionOnCount,
      hasOdometerProgress: act.hasOdometerProgress,
      hasEnergyActivity: act.hasEnergyActivity,
      score,
      maxScore,
      frequencyPPM: freq.pointsPerMinute,
      currentlyActive,
      profile,
      totalCorePoints: corePoints.length,
      evidenceWeights: t,
      speedMotionKmh: shared.speedMotionKmh,
      speedActiveKmh: shared.speedActiveKmh,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  ACTIVE CONTINUITY ASSESSMENT
// ═══════════════════════════════════════════════════════════════

/**
 * Assess whether an active trip should remain ACTIVE, transition to
 * IDLE_WITHIN_TRIP, or move toward POSSIBLE_END.
 *
 * Decision priority (in order):
 *   1. Clear motion or odometer progress → ACTIVE
 *   2. Stopped + ICE engine active (RPM/throttle/load) → IDLE  (genuine traffic stop, ICE)
 *   3. Stopped + EV/HYBRID + telemetry still fresh (active frequency) → IDLE  (Fix A)
 *   4. Stopped + energy activity → IDLE  (EV/HYBRID post-stop energy activity)
 *   5. Stopped + ignition confirmed OFF + no energy change → POSSIBLE_END (high confidence)
 *   6. Stopped + frequency dropped to resting → POSSIBLE_END (medium confidence)
 *   7. Stopped + stale ignition ON but no perf activity + no energy change → POSSIBLE_END
 *   8. Ambiguous → POSSIBLE_END (low confidence, conservative fallback)
 *
 * Ignition-off is treated as a BONUS confirmation signal, never a required
 * primary end condition.  Stale ignition-ON can no longer block trip end
 * unless backed by real performance or energy evidence.
 */
export function assessActiveContinuity(
  recentPoints: TripCoreDataPoint[],
  perfHasActivity: boolean,
  profile: string = 'UNKNOWN',
): ContinuityAssessment {
  if (recentPoints.length === 0) {
    return {
      verdict: 'POSSIBLE_END',
      endMode: END_DETECTION_MODES.NO_ACTIVITY_TIMEOUT,
      endConfidence: 'LOW',
      summary: { reason: 'no_data_points' },
    };
  }

  const act = evaluateActivityWindow(recentPoints, profile);
  const inact = evaluateInactivityWindow(recentPoints, profile);
  const windowMs =
    recentPoints.length >= 2
      ? new Date(recentPoints[recentPoints.length - 1].timestamp).getTime() -
        new Date(recentPoints[0].timestamp).getTime()
      : 0;
  const freq = evaluateFrequency(recentPoints, windowMs, profile);

  const isEvOrHybrid = profile === 'EV' || profile === 'HYBRID';

  // ── 1. Clear motion or odometer progress → ACTIVE ──
  if (act.hasMotion || act.hasOdometerProgress) {
    return {
      verdict: 'ACTIVE',
      summary: {
        reason: 'motion_detected',
        motionCount: act.motionPointCount,
        odometerDelta: act.odometerDeltaKm,
      },
    };
  }

  // ── 2. Stopped + ICE engine active (Performance signals) → genuine traffic stop ──
  if (inact.allStopped && perfHasActivity) {
    return {
      verdict: 'IDLE',
      summary: { reason: 'stopped_perf_active', profile },
    };
  }

  // ── 3. Stopped + energy activity (EV charging, ICE warm-down, regen) → IDLE ──
  // Energy change is the most specific physical evidence that the powertrain is
  // still active. Check this before frequency so explicit energy evidence wins.
  if (inact.allStopped && act.hasEnergyActivity) {
    return {
      verdict: 'IDLE',
      summary: {
        reason: 'stopped_energy_active',
        energy: act.hasEnergyActivity,
        profile,
      },
    };
  }

  // ── 4. FIX A: Stopped + EV/HYBRID + telemetry still fresh → IDLE ──
  // For EVs and HYBRIDs there are no RPM/throttle/load signals at a traffic stop.
  // Instead we rely on signal frequency: if data is still arriving at an active
  // cadence, the device considers the vehicle awake and within the trip context.
  // This prevents a brief EV stop from immediately triggering POSSIBLE_END.
  if (inact.allStopped && isEvOrHybrid && freq.isActiveFrequency) {
    return {
      verdict: 'IDLE',
      summary: {
        reason: 'ev_hybrid_stop_active_frequency',
        profile,
        ppm: freq.pointsPerMinute,
      },
    };
  }

  // ── 5. Full inactivity + confirmed ignition-off + no energy change ──
  // Ignition-off is a bonus here — it boosts confidence but is NOT required.
  if (inact.allStopped && inact.allIgnitionOff && inact.noEnergyChange) {
    return {
      verdict: 'POSSIBLE_END',
      endMode: END_DETECTION_MODES.IGNITION_OFF_CONFIRMED,
      endConfidence: 'HIGH',
      summary: {
        reason: 'full_inactivity_ignition_off',
        inactivePoints: inact.inactivePointCount,
      },
    };
  }

  // ── 6. Stopped + frequency dropped to resting ──
  // Device is no longer sending at active cadence.  Ignition state is deliberately
  // NOT checked here — the device may stop sending before ignition-off arrives.
  if (inact.allStopped && freq.isRestingFrequency) {
    return {
      verdict: 'POSSIBLE_END',
      endMode: END_DETECTION_MODES.FREQUENCY_DROP_TIMEOUT,
      endConfidence: 'MEDIUM',
      summary: {
        reason: 'stopped_frequency_dropped',
        ppm: freq.pointsPerMinute,
        ignitionStuck: !inact.allIgnitionOff,
      },
    };
  }

  // ── 7. Stopped + stale ignition ON but no perf activity + no energy change ──
  // This is the stale-ignition guard: the device stopped reporting meaningful
  // engine or energy data but the last ignition sample is still ON.  We do NOT
  // let a stale ignition-ON value keep the trip open.
  if (
    inact.allStopped &&
    !inact.allIgnitionOff &&
    inact.noEnergyChange &&
    !perfHasActivity
  ) {
    return {
      verdict: 'POSSIBLE_END',
      endMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
      endConfidence: 'MEDIUM',
      summary: {
        reason: 'stopped_stale_ignition_no_activity',
        ignitionStuck: true,
        ppm: freq.pointsPerMinute,
        profile,
      },
    };
  }

  // ── 8. Ambiguous fallback → conservative POSSIBLE_END ──
  return {
    verdict: 'POSSIBLE_END',
    endMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
    endConfidence: 'LOW',
    summary: {
      reason: 'ambiguous_inactivity',
      ppm: freq.pointsPerMinute,
      allStopped: inact.allStopped,
      profile,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  ACTIVITY RESUMPTION CHECK (for POSSIBLE_END)
// ═══════════════════════════════════════════════════════════════

/**
 * Returns true if any recent point shows clear movement above the profile
 * motion threshold.
 *
 * Ignition alone is NOT treated as evidence of activity resumption.
 * A stale ignition-ON value must be backed by real speed to reopen the trip.
 * This prevents devices with slow ignition-off reporting from indefinitely
 * blocking trip finalization.
 */
export function hasActivityResumed(
  recentPoints: TripCoreDataPoint[],
  profile: string = 'UNKNOWN',
): boolean {
  const t = getProfileThresholds(profile);
  // Speed must exceed the motion threshold — ignition alone is not enough.
  return recentPoints.some(
    (p) => p.speed != null && p.speed > t.speedMotionKmh,
  );
}

// ═══════════════════════════════════════════════════════════════
//  TRIP QUALITY / MERGE / DISCARD
// ═══════════════════════════════════════════════════════════════

export function checkTripQuality(
  durationMs: number,
  distanceKm: number | null,
  maxConsecutiveActive: number,
  previousTripEndTime: Date | null,
  currentTripStartTime: Date,
): TripQualityCheck {
  if (durationMs < 60_000 && (distanceKm == null || distanceKm < 0.1)) {
    return {
      shouldDiscard: true,
      shouldMergeWithPrevious: false,
      reason: 'too_short_no_distance',
    };
  }

  if (
    distanceKm != null &&
    distanceKm < 0.1 &&
    maxConsecutiveActive < 2
  ) {
    return {
      shouldDiscard: true,
      shouldMergeWithPrevious: false,
      reason: 'no_meaningful_movement',
    };
  }

  if (previousTripEndTime) {
    const gapMs =
      currentTripStartTime.getTime() - previousTripEndTime.getTime();
    if (gapMs >= 0 && gapMs < 5 * 60_000) {
      return {
        shouldDiscard: false,
        shouldMergeWithPrevious: true,
        reason: 'small_gap_merge',
      };
    }
  }

  return { shouldDiscard: false, shouldMergeWithPrevious: false };
}

// ═══════════════════════════════════════════════════════════════
//  HAVERSINE UTILITY
// ═══════════════════════════════════════════════════════════════

export function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findEarliestCoreActivityAt(
  points: TripCoreDataPoint[],
  odometerMinDeltaKm: number,
  speedMotionKmh: number,
): Date | null {
  let previousDistance: number | null = null;

  for (const point of points) {
    const hasSpeedMotion =
      point.speed != null && point.speed > speedMotionKmh;
    const hasOdometerProgress =
      previousDistance != null &&
      point.travelledDistance != null &&
      point.travelledDistance > previousDistance + odometerMinDeltaKm;

    if (hasSpeedMotion || hasOdometerProgress) {
      return new Date(point.timestamp);
    }

    if (point.travelledDistance != null) {
      previousDistance = point.travelledDistance;
    }
  }

  return null;
}

function findEarliestRouteActivityAt(
  points: RoutePoint[],
  speedMotionKmh: number,
): Date | null {
  const ROUTE_MOVEMENT_MIN_METERS = 25;

  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const previous = index > 0 ? points[index - 1] : null;
    const hasSpeedMotion =
      point.speedKmh != null && point.speedKmh > speedMotionKmh;
    const hasCoordinateJump =
      previous != null &&
      haversineM(
        previous.latitude,
        previous.longitude,
        point.latitude,
        point.longitude,
      ) > ROUTE_MOVEMENT_MIN_METERS;

    if (hasSpeedMotion || hasCoordinateJump) {
      return new Date(point.timestamp);
    }
  }

  return null;
}

function findClosestRoutePoint(
  points: RoutePoint[],
  targetAt: Date,
): RoutePoint | null {
  if (points.length === 0) return null;

  let closest: RoutePoint | null = null;
  let closestDeltaMs = Number.POSITIVE_INFINITY;

  for (const point of points) {
    const deltaMs = Math.abs(
      new Date(point.timestamp).getTime() - targetAt.getTime(),
    );
    if (deltaMs < closestDeltaMs) {
      closest = point;
      closestDeltaMs = deltaMs;
    }
  }

  return closest;
}

/**
 * Latest provider-timestamped movement evidence used for lastMeaningfulMovementAt.
 * Returns null when continuity is ACTIVE only via ClickHouse guard without an
 * explicit event timestamp — caller must preserve the previous anchor.
 */
export function resolveLatestMeaningfulMovementEventAt(params: {
  recentPoints: TripCoreDataPoint[];
  profile: string;
  continuitySummary?: Record<string, unknown> | null;
  clickhouseGuardSummary?: {
    maxSpeedKmh?: number;
    odometerDeltaKm?: number;
    windowEndAt?: string | Date | null;
  } | null;
  workerNow?: Date;
}): Date | null {
  const workerNow = params.workerNow ?? new Date();
  const t = getProfileThresholds(params.profile);
  const summary = params.continuitySummary ?? {};
  const motionCount = (summary.motionCount as number) ?? 0;
  const odometerDelta = (summary.odometerDelta as number) ?? null;
  const ch = params.clickhouseGuardSummary;

  const hasCoreMotion = motionCount > 0;
  const hasOdometerProgress =
    odometerDelta != null && odometerDelta > t.odometerMinDeltaKm;
  const hasChMotion =
    (ch?.maxSpeedKmh ?? 0) > 5 || (ch?.odometerDeltaKm ?? 0) > 0.05;

  if (!hasCoreMotion && !hasOdometerProgress && !hasChMotion) {
    return null;
  }

  let latest: Date | null = null;

  const chronological = [...params.recentPoints].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  for (const pt of chronological) {
    const ts = new Date(pt.timestamp);
    if (!isValidProviderEventTimestamp(ts, workerNow)) continue;
    const speedMotion = pt.speed != null && pt.speed > t.speedMotionKmh;
    const speedActive = pt.speed != null && pt.speed > t.speedActiveKmh;
    if (speedMotion || speedActive) {
      if (!latest || ts.getTime() > latest.getTime()) latest = ts;
    }
  }

  if (hasOdometerProgress) {
    const odometerAdvanceAt = resolveLatestOdometerAdvanceEventAt(
      chronological,
      workerNow,
    );
    if (
      odometerAdvanceAt &&
      (!latest || odometerAdvanceAt.getTime() > latest.getTime())
    ) {
      latest = odometerAdvanceAt;
    }
  }

  if (hasChMotion && !latest && ch?.windowEndAt) {
    const chTs =
      ch.windowEndAt instanceof Date
        ? ch.windowEndAt
        : new Date(ch.windowEndAt);
    if (isValidProviderEventTimestamp(chTs, workerNow)) {
      latest = chTs;
    }
  }

  return latest;
}

/**
 * Latest provider timestamp at which odometer value actually increased.
 * Ignores plateau/repeated samples after the last advance.
 */
export function resolveLatestOdometerAdvanceEventAt(
  points: TripCoreDataPoint[],
  workerNow: Date = new Date(),
): Date | null {
  const chronological = points
    .map((p) => ({
      ts: new Date(p.timestamp),
      odo: p.travelledDistance,
    }))
    .filter(
      (p): p is { ts: Date; odo: number } =>
        p.odo != null && isValidProviderEventTimestamp(p.ts, workerNow),
    )
    .sort((a, b) => a.ts.getTime() - b.ts.getTime());

  if (chronological.length < 2) return null;

  let latestAdvance: Date | null = null;
  let prevOdo = chronological[0].odo;

  for (let i = 1; i < chronological.length; i++) {
    const { ts, odo } = chronological[i];
    if (odo > prevOdo) {
      latestAdvance = ts;
      prevOdo = odo;
    } else if (odo < prevOdo) {
      prevOdo = odo;
    }
  }

  return latestAdvance;
}

/** Whether ACTIVE continuity implies meaningful movement for anchor advancement. */
export function continuityImpliesMeaningfulMovement(
  continuitySummary?: Record<string, unknown> | null,
  clickhouseGuardSummary?: {
    maxSpeedKmh?: number;
    odometerDeltaKm?: number;
  } | null,
): boolean {
  const summary = continuitySummary ?? {};
  const motionCount = (summary.motionCount as number) ?? 0;
  const odometerDelta = (summary.odometerDelta as number) ?? 0;
  const ch = clickhouseGuardSummary;
  return (
    motionCount > 0 ||
    odometerDelta > 0 ||
    (ch?.maxSpeedKmh ?? 0) > 5 ||
    (ch?.odometerDeltaKm ?? 0) > 0.05
  );
}

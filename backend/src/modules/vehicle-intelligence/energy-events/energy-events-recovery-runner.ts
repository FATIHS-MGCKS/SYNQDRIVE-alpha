import { execSync } from 'child_process';
import {
  DIMO_ENERGY_DETECTOR_CONFIG_VERSION,
  DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG,
} from '@modules/dimo/energy-events/dimo-energy-detector.config';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import type { EnergyMechanismFetchOutcome } from '@modules/dimo/energy-events/energy-mechanism-fetch.types';
import {
  CANONICAL_REFUEL_ACCEPTANCE_BEHAVIOR,
  ENERGY_EVENTS_BACKFILL_INTER_REQUEST_DELAY_MS,
  ENERGY_EVENTS_BACKFILL_PROPOSED_CONCURRENCY,
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
  ENERGY_EVENTS_RECOVERY_WINDOW_MS,
  mechanismsForEnergyClass,
} from './energy-events-recovery.constants';
import { splitRecoveryQueryWindows } from './energy-events-window.util';
import {
  simulateRecoveryWindow,
  summarizeClassifications,
} from './energy-events-recovery-dry-run';
import {
  allManualReviewsResolved,
  countUnresolvedManualReviews,
  buildManualReviewReport,
} from './energy-events-recovery-manual-review';
import { reconcileRecoveryCandidates } from './energy-events-recovery-reconcile';
import type { DbComparisonStatus, RecoveryExistingEnergyEvent } from './energy-events-recovery-read.repository';
import type {
  DimoRequestAccounting,
  EnergyRecoveryCandidate,
  EnergyRecoveryDryRunReport,
  EnergyRecoveryVehicleInventoryRow,
  EnergyVehicleEnergyClass,
} from './energy-events-recovery.types';

export interface RecoveryVehicleInput {
  vehicleId: string;
  label: string;
  tokenId: number;
  provider: string;
  powertrain: 'ICE' | 'EV' | 'UNKNOWN';
  relativeFuelAvailable: boolean;
  absoluteFuelAvailable: boolean;
  rechargeSocAvailable: boolean;
  capabilityLookupStatus: 'ok' | 'failed';
  dimoAccessAvailable: boolean;
  dbVehicleMapped: boolean;
  existingEvents: RecoveryExistingEnergyEvent[];
}

export interface RecoveryDryRunDeps {
  fetchSegments: (
    tokenId: number,
    from: Date,
    to: Date,
    energyClass: EnergyVehicleEnergyClass,
  ) => Promise<{
    segments: DimoEnergyEventSegment[];
    outcomes: EnergyMechanismFetchOutcome[];
    accounting: DimoRequestAccounting;
  }>;
  interRequestDelayMs?: number;
  windowsOverride?: Array<{ from: Date; to: Date }>;
  mode: 'full' | 'quick';
  dbComparisonEnabled: boolean;
  dbComparisonStatus: DbComparisonStatus;
}

function emptyAccounting(): DimoRequestAccounting {
  return {
    telemetryGraphqlRequests: 0,
    tokenExchangeRequests: 0,
    mechanismRequests: 0,
    retries: 0,
  };
}

function mergeAccounting(
  total: DimoRequestAccounting,
  delta: DimoRequestAccounting,
): void {
  total.telemetryGraphqlRequests += delta.telemetryGraphqlRequests;
  total.tokenExchangeRequests += delta.tokenExchangeRequests;
  total.mechanismRequests += delta.mechanismRequests;
  total.retries += delta.retries;
}

export async function runEnergyEventsRecoveryDryRun(
  vehicles: RecoveryVehicleInput[],
  deps: RecoveryDryRunDeps,
): Promise<EnergyRecoveryDryRunReport> {
  const outageStart = new Date(ENERGY_EVENTS_OUTAGE_START_ISO);
  const recoveryCutoff = new Date(ENERGY_EVENTS_RECOVERY_CUTOFF_ISO);
  const windows =
    deps.windowsOverride ??
    splitRecoveryQueryWindows(
      outageStart,
      recoveryCutoff,
      ENERGY_EVENTS_RECOVERY_WINDOW_MS,
    );

  const inventory: EnergyRecoveryVehicleInventoryRow[] = vehicles.map((v) => ({
    vehicleId: v.vehicleId,
    label: v.label,
    tokenId: v.tokenId,
    provider: v.provider,
    powertrain: v.powertrain,
    dimoAccessAvailable: v.dimoAccessAvailable,
    dbVehicleMapped: v.dbVehicleMapped,
    relativeFuelAvailable: v.relativeFuelAvailable,
    absoluteFuelAvailable: v.absoluteFuelAvailable,
    rechargeSocAvailable: v.rechargeSocAvailable,
    capabilityLookupStatus: v.capabilityLookupStatus,
    existingEventCountInWindow: v.existingEvents.length,
    energyClass: classifyVehicle(v),
  }));

  const eligible = vehicles.filter((v) => {
    const energyClass = classifyVehicle(v);
    const mappingOk = deps.mode === 'quick' || v.dbVehicleMapped;
    return (
      v.dimoAccessAvailable &&
      mappingOk &&
      energyClass !== 'NO_ENERGY_SIGNAL' &&
      energyClass !== 'DIMO_ACCESS_FAILED' &&
      energyClass !== 'CAPABILITY_UNKNOWN'
    );
  });
  const inaccessibleVehicles = vehicles.filter(
    (v) => !v.dimoAccessAvailable || classifyVehicle(v) === 'DIMO_ACCESS_FAILED',
  );
  const capabilityUnknownVehicles = vehicles.filter(
    (v) => classifyVehicle(v) === 'CAPABILITY_UNKNOWN',
  );
  const unmappedVehicles = vehicles.filter((v) => {
    const energyClass = classifyVehicle(v);
    return (
      deps.mode === 'full' &&
      !v.dbVehicleMapped &&
      energyClass !== 'NO_ENERGY_SIGNAL' &&
      energyClass !== 'DIMO_ACCESS_FAILED' &&
      energyClass !== 'CAPABILITY_UNKNOWN'
    );
  });

  const requestAccounting = emptyAccounting();
  const windowCandidates: EnergyRecoveryCandidate[] = [];
  const legacySubsegmentsWouldReplace = new Set<string>();
  const fetchFailures: EnergyRecoveryDryRunReport['fetchFailures'] = [];
  let refuelDetections = 0;
  let rechargeDetections = 0;

  const delayMs = deps.interRequestDelayMs ?? ENERGY_EVENTS_BACKFILL_INTER_REQUEST_DELAY_MS;
  let expectedTelemetryRequests = 0;
  let totalMechanismsPerWindow = 0;

  for (const vehicle of eligible) {
    const energyClass = classifyVehicle(vehicle);
    const mechanisms = mechanismsForEnergyClass(energyClass);
    expectedTelemetryRequests += windows.length * mechanisms.length;
    totalMechanismsPerWindow += mechanisms.length;

    for (const window of windows) {
      if (delayMs > 0 && requestAccounting.mechanismRequests > 0) {
        await sleep(delayMs);
      }

      let fetchResult: {
        segments: DimoEnergyEventSegment[];
        outcomes: EnergyMechanismFetchOutcome[];
        accounting: DimoRequestAccounting;
      };
      try {
        fetchResult = await deps.fetchSegments(
          vehicle.tokenId,
          window.from,
          window.to,
          energyClass,
        );
        mergeAccounting(requestAccounting, fetchResult.accounting);
      } catch (error) {
        for (const mechanism of mechanisms) {
          fetchFailures.push({
            vehicleId: vehicle.vehicleId,
            tokenId: vehicle.tokenId,
            mechanism,
            windowFrom: window.from.toISOString(),
            windowTo: window.to.toISOString(),
            message: error instanceof Error ? error.message : String(error),
          });
        }
        continue;
      }

      refuelDetections += fetchResult.segments.filter((s) => s.mechanism === 'refuel').length;
      rechargeDetections += fetchResult.segments.filter((s) => s.mechanism === 'recharge').length;

      for (const outcome of fetchResult.outcomes.filter((o) => o.status === 'FAILED')) {
        fetchFailures.push({
          vehicleId: vehicle.vehicleId,
          tokenId: vehicle.tokenId,
          mechanism: outcome.mechanism,
          windowFrom: window.from.toISOString(),
          windowTo: window.to.toISOString(),
          httpStatus: outcome.error?.httpStatus,
          message: outcome.error?.message,
        });
      }

      const simulated = simulateRecoveryWindow({
        vehicleId: vehicle.vehicleId,
        label: vehicle.label,
        tokenId: vehicle.tokenId,
        windowFrom: window.from,
        windowTo: window.to,
        segments: fetchResult.segments,
        mechanismOutcomes: fetchResult.outcomes,
        existingEvents: vehicle.existingEvents,
        detectorConfigVersion: DIMO_ENERGY_DETECTOR_CONFIG_VERSION,
      });

      windowCandidates.push(...simulated.candidates);
      for (const id of simulated.legacySubsegmentsWouldReplace) {
        legacySubsegmentsWouldReplace.add(id);
      }
    }
  }

  const existingEventsByVehicle = new Map<
    string,
    Array<{
      id: string;
      dimoSegmentId: string;
      kind: string;
      startTime: Date;
      endTime: Date;
      socDeltaPercent: number | null;
      energyDeltaKwh: number | null;
    }>
  >();
  for (const vehicle of vehicles) {
    existingEventsByVehicle.set(
      vehicle.vehicleId,
      vehicle.existingEvents.map((event) => ({
        id: event.id,
        dimoSegmentId: event.dimoSegmentId,
        kind: event.kind,
        startTime: event.startTime,
        endTime: event.endTime,
        socDeltaPercent: event.socDeltaPercent,
        energyDeltaKwh: event.energyDeltaKwh,
      })),
    );
  }

  const reconciled = reconcileRecoveryCandidates(
    windowCandidates,
    existingEventsByVehicle,
  );
  const candidates = reconciled.candidates;
  const summary = summarizeClassifications(candidates);
  const manualReviewReport = buildManualReviewReport(candidates);
  const manualReviewCount = summary.MANUAL_REVIEW_REQUIRED;
  const unresolvedManualReviewCount =
    countUnresolvedManualReviews(manualReviewReport);
  const fetchFailedCount = summary.FETCH_FAILED;

  const canonicalRefuelCandidate = findCanonicalRefuelCandidate(candidates);

  const evTokenIds = new Set(
    vehicles
      .filter((vehicle) => vehicle.powertrain === 'EV')
      .map((vehicle) => vehicle.tokenId),
  );
  const evRechargeCandidates = candidates.filter(
    (candidate) =>
      evTokenIds.has(candidate.tokenId) && candidate.mechanism === 'recharge',
  );

  const mechanismsPerWindowAverage =
    eligible.length > 0 ? totalMechanismsPerWindow / eligible.length : 0;
  const worstCaseWithRetries = expectedTelemetryRequests * 3;
  const estimatedRuntimeMinutes = Math.ceil(
    (expectedTelemetryRequests * delayMs) /
      ENERGY_EVENTS_BACKFILL_PROPOSED_CONCURRENCY /
      60_000,
  );

  const gateBlockersRaw: string[] = [];
  if (deps.mode === 'full' && !deps.dbComparisonEnabled) {
    gateBlockersRaw.push('DB_COMPARISON_UNAVAILABLE');
  }
  if (deps.dbComparisonStatus === 'DB_COMPARISON_UNAVAILABLE') {
    gateBlockersRaw.push('DB_COMPARISON_UNAVAILABLE');
  }
  if (deps.mode === 'full' && fetchFailedCount > 0) {
    gateBlockersRaw.push(`UNRESOLVED_FETCH_FAILED:${fetchFailedCount}`);
  }
  if (unresolvedManualReviewCount > 0) {
    gateBlockersRaw.push(
      `MANUAL_REVIEW_UNRESOLVED:${unresolvedManualReviewCount}`,
    );
  }
  if (deps.mode === 'full' && unmappedVehicles.length > 0) {
    gateBlockersRaw.push(`DB_VEHICLE_MAPPING_MISSING:${unmappedVehicles.length}`);
  }
  if (deps.mode === 'full' && capabilityUnknownVehicles.length > 0) {
    gateBlockersRaw.push(
      `CAPABILITY_UNKNOWN:${capabilityUnknownVehicles.length}`,
    );
  }

  if (
    !canonicalRefuelCandidate ||
    canonicalRefuelCandidate.classification !== 'WOULD_CREATE'
  ) {
    gateBlockersRaw.push('CANONICAL_REFUEL_CASE_MISSING');
  }

  const gateBlockers = [...new Set(gateBlockersRaw)];

  let backfillGate: EnergyRecoveryDryRunReport['backfillGate'] = 'NOT READY';
  if (deps.mode === 'quick') {
    backfillGate =
      unresolvedManualReviewCount > 0
        ? (`READY AFTER MANUAL REVIEW OF ${unresolvedManualReviewCount} EVENTS` as EnergyRecoveryDryRunReport['backfillGate'])
        : 'NOT READY';
  } else if (gateBlockers.includes('DB_COMPARISON_UNAVAILABLE')) {
    backfillGate = 'NOT READY';
  } else if (
    gateBlockers.some((blocker) => blocker.startsWith('DB_VEHICLE_MAPPING_MISSING'))
  ) {
    backfillGate = 'NOT READY';
  } else if (
    gateBlockers.some((blocker) => blocker.startsWith('CAPABILITY_UNKNOWN'))
  ) {
    backfillGate = 'NOT READY';
  } else if (
    gateBlockers.some((blocker) => blocker.startsWith('UNRESOLVED_FETCH_FAILED'))
  ) {
    backfillGate = 'NOT READY';
  } else if (
    gateBlockers.some((blocker) => blocker.startsWith('MANUAL_REVIEW_UNRESOLVED'))
  ) {
    backfillGate = `READY AFTER MANUAL REVIEW OF ${unresolvedManualReviewCount} EVENTS` as EnergyRecoveryDryRunReport['backfillGate'];
  } else if (gateBlockers.length === 0) {
    backfillGate = 'READY FOR CONTROLLED WRITE BACKFILL';
  } else {
    backfillGate = 'NOT READY';
  }

  let codeShaUnderTest = 'unknown';
  let baseMainSha = 'unknown';
  try {
    codeShaUnderTest = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    baseMainSha = execSync('git merge-base HEAD main', { encoding: 'utf8' }).trim();
  } catch {
    // non-git environment
  }

  const windowSizesHours = windows.map(
    (window) => (window.to.getTime() - window.from.getTime()) / (60 * 60 * 1000),
  );

  return {
    generatedAt: new Date().toISOString(),
    codeShaUnderTest,
    baseMainSha,
    detectorConfigVersion: DIMO_ENERGY_DETECTOR_CONFIG_VERSION,
    refuelDetectorConfig: DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG,
    rechargeDetectorConfig: 'default',
    outageStart: ENERGY_EVENTS_OUTAGE_START_ISO,
    recoveryCutoff: ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
    windowSizeHours: ENERGY_EVENTS_RECOVERY_WINDOW_MS / (60 * 60 * 1000),
    windowSizesHours,
    windowSemantics:
      'Non-overlapping [from, to) windows; inclusive start, exclusive end at recovery cutoff. DIMO segments with startedBeforeRange=true may appear in the first window that contains their start timestamp; global dedup keeps one candidate per dimoSegmentId.',
    mode: deps.mode,
    dbComparisonEnabled: deps.dbComparisonEnabled,
    dbComparisonStatus: deps.dbComparisonStatus,
    dbVehicleMappingFailures: unmappedVehicles.length,
    vehicles: inventory,
    requestAccounting,
    refuelDetections,
    rechargeDetections,
    deduplicatedCandidateCount: candidates.length,
    summary,
    candidates,
    manualReviewReport,
    legacySubsegmentsWouldReplace: [...legacySubsegmentsWouldReplace],
    fetchFailures,
    trafficBudget: {
      eligibleVehicles: eligible.length,
      inaccessibleVehicles: inaccessibleVehicles.length,
      capabilityUnknownVehicles: capabilityUnknownVehicles.length,
      windowsPerVehicle: windows.length,
      mechanismsPerWindowAverage,
      expectedTelemetryGraphqlRequests: expectedTelemetryRequests,
      worstCaseWithRetries,
      proposedConcurrency: ENERGY_EVENTS_BACKFILL_PROPOSED_CONCURRENCY,
      interRequestDelayMs: delayMs,
      estimatedRuntimeMinutes,
    },
    acceptance: {
      canonicalRefuel: {
        found: !!canonicalRefuelCandidate,
        classification: canonicalRefuelCandidate?.classification ?? 'NOT_FOUND',
        segmentStart: canonicalRefuelCandidate?.startTime ?? null,
      },
      canonicalEvRecharge: {
        detectedSessions: evRechargeCandidates.filter(
          (candidate) =>
            candidate.classification !== 'FETCH_FAILED' &&
            candidate.classification !== 'WOULD_SKIP_NOT_PERSISTABLE',
        ).length,
        wouldCreate: evRechargeCandidates.filter(
          (candidate) => candidate.classification === 'WOULD_CREATE',
        ).length,
        alreadyIdentical: evRechargeCandidates.filter(
          (candidate) => candidate.classification === 'ALREADY_IDENTICAL',
        ).length,
        manualReview: evRechargeCandidates.filter(
          (candidate) => candidate.classification === 'MANUAL_REVIEW_REQUIRED',
        ).length,
      },
    },
    dbWritesPerformed: false,
    backfillGate,
    manualReviewCount,
    gateBlockers,
  };
}

function classifyVehicle(vehicle: RecoveryVehicleInput): EnergyVehicleEnergyClass {
  if (!vehicle.dimoAccessAvailable) return 'DIMO_ACCESS_FAILED';
  if (vehicle.capabilityLookupStatus === 'failed') return 'CAPABILITY_UNKNOWN';
  const refuel = vehicle.relativeFuelAvailable || vehicle.absoluteFuelAvailable;
  const recharge = vehicle.rechargeSocAvailable;
  if (refuel && recharge) return 'BOTH';
  if (refuel) return 'REFUEL_CANDIDATE';
  if (recharge) return 'RECHARGE_CANDIDATE';
  return 'NO_ENERGY_SIGNAL';
}

function matchesCanonicalRefuelAcceptance(
  candidate: EnergyRecoveryCandidate,
): boolean {
  if (candidate.mechanism !== 'refuel') return false;
  if (
    !candidate.startTime.startsWith(
      CANONICAL_REFUEL_ACCEPTANCE_BEHAVIOR.monthPrefix,
    )
  ) {
    return false;
  }
  if (
    candidate.durationSeconds <
      CANONICAL_REFUEL_ACCEPTANCE_BEHAVIOR.minDurationSeconds ||
    candidate.durationSeconds >
      CANONICAL_REFUEL_ACCEPTANCE_BEHAVIOR.maxDurationSeconds
  ) {
    return false;
  }
  const liters = candidate.fuelDeltaLiters;
  if (
    liters == null ||
    liters < CANONICAL_REFUEL_ACCEPTANCE_BEHAVIOR.minFuelDeltaLiters ||
    liters > CANONICAL_REFUEL_ACCEPTANCE_BEHAVIOR.maxFuelDeltaLiters
  ) {
    return false;
  }
  if (
    candidate.odometerStartKm != null &&
    candidate.odometerEndKm != null
  ) {
    const deltaKm = Math.abs(candidate.odometerEndKm - candidate.odometerStartKm);
    if (deltaKm > CANONICAL_REFUEL_ACCEPTANCE_BEHAVIOR.maxOdometerDeltaKm) {
      return false;
    }
  }
  return true;
}

function findCanonicalRefuelCandidate(
  candidates: EnergyRecoveryCandidate[],
): EnergyRecoveryCandidate | undefined {
  return candidates.find(
    (candidate) =>
      matchesCanonicalRefuelAcceptance(candidate) &&
      candidate.classification !== 'FETCH_FAILED',
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { execSync } from 'child_process';
import {
  DIMO_ENERGY_DETECTOR_CONFIG_VERSION,
  DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG,
} from '@modules/dimo/energy-events/dimo-energy-detector.config';
import type { DimoEnergyEventSegment } from '@modules/dimo/dimo-segments.service';
import type { EnergyMechanismFetchOutcome } from '@modules/dimo/energy-events/energy-mechanism-fetch.types';
import {
  ENERGY_EVENTS_BACKFILL_INTER_REQUEST_DELAY_MS,
  ENERGY_EVENTS_BACKFILL_PROPOSED_CONCURRENCY,
  ENERGY_EVENTS_OUTAGE_START_ISO,
  ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
  ENERGY_EVENTS_RECOVERY_WINDOW_MS,
  KS_MX_2024_CANONICAL_REFUEL_START,
  KS_MX_2024_TOKEN_ID,
  mechanismsForEnergyClass,
  TESLA_KS_FH_660E_TOKEN_ID,
} from './energy-events-recovery.constants';
import { splitRecoveryQueryWindows } from './energy-events-window.util';
import {
  simulateRecoveryWindow,
  summarizeClassifications,
} from './energy-events-recovery-dry-run';
import {
  allManualReviewsResolved,
  buildManualReviewReport,
} from './energy-events-recovery-manual-review';
import { reconcileRecoveryCandidates } from './energy-events-recovery-reconcile';
import type { DbComparisonStatus } from './energy-events-recovery-read.repository';
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
  dimoAccessAvailable: boolean;
  existingEvents: Array<{
    id: string;
    dimoSegmentId: string;
    kind: string;
    startTime: Date;
    endTime: Date;
    fuelDeltaLiters: number | null;
    fuelDeltaPercent: number | null;
    socDeltaPercent: number | null;
    energyDeltaKwh: number | null;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
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
    relativeFuelAvailable: v.relativeFuelAvailable,
    absoluteFuelAvailable: v.absoluteFuelAvailable,
    rechargeSocAvailable: v.rechargeSocAvailable,
    existingEventCountInWindow: v.existingEvents.length,
    energyClass: classifyVehicle(v),
  }));

  const eligible = vehicles.filter((v) => {
    const energyClass = classifyVehicle(v);
    return (
      v.dimoAccessAvailable &&
      energyClass !== 'NO_ENERGY_SIGNAL' &&
      energyClass !== 'DIMO_ACCESS_FAILED'
    );
  });
  const inaccessibleVehicles = vehicles.filter(
    (v) => !v.dimoAccessAvailable || classifyVehicle(v) === 'DIMO_ACCESS_FAILED',
  );

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
    Array<{ id: string; dimoSegmentId: string; kind: string; startTime: Date; endTime: Date }>
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
  const fetchFailedCount = summary.FETCH_FAILED;

  const ksMxCandidate = candidates.find(
    (c) =>
      c.tokenId === KS_MX_2024_TOKEN_ID &&
      c.mechanism === 'refuel' &&
      c.startTime.startsWith(KS_MX_2024_CANONICAL_REFUEL_START.slice(0, 19)),
  );

  const teslaCandidates = candidates.filter(
    (c) => c.tokenId === TESLA_KS_FH_660E_TOKEN_ID && c.mechanism === 'recharge',
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
  if (manualReviewCount > 0 && !allManualReviewsResolved(manualReviewReport)) {
    gateBlockersRaw.push(`MANUAL_REVIEW_REQUIRED:${manualReviewCount}`);
  }
  if (!ksMxCandidate || ksMxCandidate.classification === 'FETCH_FAILED') {
    gateBlockersRaw.push('KS_MX_CANONICAL_MISSING');
  }

  const gateBlockers = [...new Set(gateBlockersRaw)];

  let backfillGate: EnergyRecoveryDryRunReport['backfillGate'] = 'NOT READY';
  if (deps.mode === 'quick') {
    backfillGate =
      manualReviewCount > 0
        ? (`READY AFTER MANUAL REVIEW OF ${manualReviewCount} EVENTS` as EnergyRecoveryDryRunReport['backfillGate'])
        : 'NOT READY';
  } else if (gateBlockers.includes('DB_COMPARISON_UNAVAILABLE')) {
    backfillGate = 'NOT READY';
  } else if (
    gateBlockers.some((blocker) => blocker.startsWith('UNRESOLVED_FETCH_FAILED'))
  ) {
    backfillGate = 'NOT READY';
  } else if (
    gateBlockers.some((blocker) => blocker.startsWith('MANUAL_REVIEW_REQUIRED'))
  ) {
    backfillGate = `READY AFTER MANUAL REVIEW OF ${manualReviewCount} EVENTS` as EnergyRecoveryDryRunReport['backfillGate'];
  } else if (gateBlockers.length === 0) {
    backfillGate = 'READY FOR CONTROLLED WRITE BACKFILL';
  } else {
    backfillGate = 'NOT READY';
  }

  let mainSha = 'unknown';
  let baseSha = 'unknown';
  try {
    mainSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    baseSha = execSync('git merge-base HEAD main', { encoding: 'utf8' }).trim();
  } catch {
    // non-git environment
  }

  return {
    generatedAt: new Date().toISOString(),
    mainSha,
    baseSha,
    detectorConfigVersion: DIMO_ENERGY_DETECTOR_CONFIG_VERSION,
    refuelDetectorConfig: DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG,
    rechargeDetectorConfig: 'default',
    outageStart: ENERGY_EVENTS_OUTAGE_START_ISO,
    recoveryCutoff: ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
    windowSizeHours: ENERGY_EVENTS_RECOVERY_WINDOW_MS / (60 * 60 * 1000),
    windowSemantics:
      'Non-overlapping [from, to) windows; inclusive start, exclusive end at recovery cutoff. DIMO segments with startedBeforeRange=true may appear in the first window that contains their start timestamp; global dedup keeps one candidate per dimoSegmentId.',
    mode: deps.mode,
    dbComparisonEnabled: deps.dbComparisonEnabled,
    dbComparisonStatus: deps.dbComparisonStatus,
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
      windowsPerVehicle: windows.length,
      mechanismsPerWindowAverage,
      expectedTelemetryGraphqlRequests: expectedTelemetryRequests,
      worstCaseWithRetries,
      proposedConcurrency: ENERGY_EVENTS_BACKFILL_PROPOSED_CONCURRENCY,
      interRequestDelayMs: delayMs,
      estimatedRuntimeMinutes,
    },
    acceptance: {
      ksMx2024: {
        found: !!ksMxCandidate,
        classification: ksMxCandidate?.classification ?? 'NOT_FOUND',
        segmentStart: ksMxCandidate?.startTime ?? null,
      },
      teslaRecharge: {
        detectedSessions: teslaCandidates.filter(
          (c) =>
            c.classification !== 'FETCH_FAILED' &&
            c.classification !== 'WOULD_SKIP_NOT_PERSISTABLE',
        ).length,
        wouldCreate: teslaCandidates.filter((c) => c.classification === 'WOULD_CREATE').length,
        alreadyIdentical: teslaCandidates.filter(
          (c) => c.classification === 'ALREADY_IDENTICAL',
        ).length,
        manualReview: teslaCandidates.filter(
          (c) => c.classification === 'MANUAL_REVIEW_REQUIRED',
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
  const refuel = vehicle.relativeFuelAvailable || vehicle.absoluteFuelAvailable;
  const recharge = vehicle.rechargeSocAvailable;
  if (refuel && recharge) return 'BOTH';
  if (refuel) return 'REFUEL_CANDIDATE';
  if (recharge) return 'RECHARGE_CANDIDATE';
  return 'NO_ENERGY_SIGNAL';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

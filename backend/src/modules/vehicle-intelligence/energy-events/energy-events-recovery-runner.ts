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
  TESLA_KS_FH_660E_TOKEN_ID,
} from './energy-events-recovery.constants';
import { splitRecoveryQueryWindows } from './energy-events-window.util';
import {
  simulateRecoveryWindow,
  summarizeClassifications,
} from './energy-events-recovery-dry-run';
import type {
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
  ) => Promise<{
    segments: DimoEnergyEventSegment[];
    outcomes: EnergyMechanismFetchOutcome[];
  }>;
  interRequestDelayMs?: number;
  /** When set, replaces default outage window split (e.g. quick acceptance mode). */
  windowsOverride?: Array<{ from: Date; to: Date }>;
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

  const eligible = vehicles.filter(
    (v) => v.dimoAccessAvailable && classifyVehicle(v) !== 'NO_ENERGY_SIGNAL' && classifyVehicle(v) !== 'DIMO_ACCESS_FAILED',
  );

  let dimoRequestCount = 0;
  const allCandidates: EnergyRecoveryCandidate[] = [];
  const legacySubsegmentsWouldReplace = new Set<string>();
  const fetchFailures: EnergyRecoveryDryRunReport['fetchFailures'] = [];
  let refuelDetections = 0;
  let rechargeDetections = 0;

  const delayMs = deps.interRequestDelayMs ?? ENERGY_EVENTS_BACKFILL_INTER_REQUEST_DELAY_MS;

  for (const vehicle of eligible) {
    for (const window of windows) {
      if (delayMs > 0 && dimoRequestCount > 0) {
        await sleep(delayMs);
      }

      let fetchResult: { segments: DimoEnergyEventSegment[]; outcomes: EnergyMechanismFetchOutcome[] };
      try {
        fetchResult = await deps.fetchSegments(
          vehicle.tokenId,
          window.from,
          window.to,
        );
        dimoRequestCount += 1;
      } catch (error) {
        dimoRequestCount += 1;
        fetchFailures.push({
          vehicleId: vehicle.vehicleId,
          tokenId: vehicle.tokenId,
          mechanism: 'both',
          windowFrom: window.from.toISOString(),
          windowTo: window.to.toISOString(),
          message: error instanceof Error ? error.message : String(error),
        });
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

      allCandidates.push(...simulated.candidates);
      for (const id of simulated.legacySubsegmentsWouldReplace) {
        legacySubsegmentsWouldReplace.add(id);
      }
    }
  }

  const summary = summarizeClassifications(allCandidates);
  const manualReviewCount = summary.MANUAL_REVIEW_REQUIRED;

  const ksMxCandidate = allCandidates.find(
    (c) =>
      c.tokenId === KS_MX_2024_TOKEN_ID &&
      c.mechanism === 'refuel' &&
      c.startTime.startsWith(KS_MX_2024_CANONICAL_REFUEL_START.slice(0, 19)),
  );

  const teslaCandidates = allCandidates.filter(
    (c) => c.tokenId === TESLA_KS_FH_660E_TOKEN_ID && c.mechanism === 'recharge',
  );

  const expectedDimoRequests = eligible.length * windows.length;
  const worstCaseWithRetries = expectedDimoRequests * 3;
  const estimatedRuntimeMinutes = Math.ceil(
    (expectedDimoRequests * delayMs) /
      ENERGY_EVENTS_BACKFILL_PROPOSED_CONCURRENCY /
      60_000,
  );

  let backfillGate: EnergyRecoveryDryRunReport['backfillGate'] = 'NOT READY';
  if (fetchFailures.length > 0 && summary.WOULD_CREATE === 0) {
    backfillGate = 'NOT READY';
  } else if (manualReviewCount > 0) {
    backfillGate = `READY AFTER MANUAL REVIEW OF ${manualReviewCount} EVENTS` as EnergyRecoveryDryRunReport['backfillGate'];
  } else if (ksMxCandidate && ksMxCandidate.classification !== 'FETCH_FAILED') {
    backfillGate = 'READY FOR CONTROLLED WRITE BACKFILL';
  } else {
    backfillGate = 'NOT READY';
  }

  let mainSha = 'unknown';
  try {
    mainSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    // non-git environment
  }

  return {
    generatedAt: new Date().toISOString(),
    mainSha,
    detectorConfigVersion: DIMO_ENERGY_DETECTOR_CONFIG_VERSION,
    refuelDetectorConfig: DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG,
    rechargeDetectorConfig: 'default',
    outageStart: ENERGY_EVENTS_OUTAGE_START_ISO,
    recoveryCutoff: ENERGY_EVENTS_RECOVERY_CUTOFF_ISO,
    windowSizeHours: ENERGY_EVENTS_RECOVERY_WINDOW_MS / (60 * 60 * 1000),
    windowSemantics:
      'Non-overlapping [from, to) windows; inclusive start, exclusive end at recovery cutoff.',
    vehicles: inventory,
    dimoRequestCount,
    refuelDetections,
    rechargeDetections,
    summary,
    candidates: allCandidates,
    legacySubsegmentsWouldReplace: [...legacySubsegmentsWouldReplace],
    fetchFailures,
    trafficBudget: {
      eligibleVehicles: eligible.length,
      windowsPerVehicle: windows.length,
      mechanismsPerWindow: 1,
      expectedDimoRequests,
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
          (c) => c.classification !== 'FETCH_FAILED' && c.classification !== 'WOULD_SKIP_NOT_PERSISTABLE',
        ).length,
        wouldCreate: teslaCandidates.filter((c) => c.classification === 'WOULD_CREATE').length,
        alreadyIdentical: teslaCandidates.filter((c) => c.classification === 'ALREADY_IDENTICAL').length,
        manualReview: teslaCandidates.filter((c) => c.classification === 'MANUAL_REVIEW_REQUIRED').length,
      },
    },
    dbWritesPerformed: false,
    backfillGate,
    manualReviewCount,
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

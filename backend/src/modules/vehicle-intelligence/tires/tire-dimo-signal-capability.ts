/**
 * DIMO signal capability registry for tire health — derived from
 * docs/audits/data/tire-health-dimo-signal-capability-2026-07.csv and
 * docs/audits/data/tire-health-dimo-timeseries-coverage-2026-07.csv.
 *
 * Only MVP/USABLE signals with full capability gates may influence tire logic.
 */

export type TireDimoSignalName =
  | 'exteriorAirTemperature'
  | 'powertrainTransmissionTravelledDistance'
  | 'chassisTireSystemIsWarningOn'
  | 'speed'
  | 'chassisAxleRow1WheelLeftTirePressure'
  | 'chassisAxleRow1WheelRightTirePressure'
  | 'chassisAxleRow2WheelLeftTirePressure'
  | 'chassisAxleRow2WheelRightTirePressure'
  | 'chassisAxleRow1WheelLeftSpeed'
  | 'chassisAxleRow1WheelRightSpeed'
  | 'angularVelocityYaw'
  | 'obdBarometricPressure';

export type TireDimoAuditRecommendation = 'MVP' | 'LATER' | 'DO_NOT_USE';

export interface TireDimoSignalRegistryEntry {
  recommendation: TireDimoAuditRecommendation;
  /** Explicit tire-health prohibition (audit DO_NOT_USE). */
  blockedForTireHealth: boolean;
  /** May be used without a dedicated SynqDrive column when pipeline consumes it (e.g. trips). */
  allowUseWithoutPersistence: boolean;
  /** Minimum 14-day samples for multi-day context (audit USABLE vehicles). */
  minSampleCount14d: number;
  /** Minimum coverage % when historical series is required. */
  minCoveragePercent: number;
  /** Max age of last observation before stale (ms). */
  maxStaleMs: number;
}

export const TIRE_DIMO_SIGNAL_REGISTRY: Record<
  TireDimoSignalName,
  TireDimoSignalRegistryEntry
> = {
  exteriorAirTemperature: {
    recommendation: 'MVP',
    blockedForTireHealth: false,
    allowUseWithoutPersistence: true,
    minSampleCount14d: 20,
    minCoveragePercent: 5,
    maxStaleMs: 7 * 24 * 60 * 60 * 1000,
  },
  powertrainTransmissionTravelledDistance: {
    recommendation: 'MVP',
    blockedForTireHealth: false,
    allowUseWithoutPersistence: false,
    minSampleCount14d: 20,
    minCoveragePercent: 5,
    maxStaleMs: 7 * 24 * 60 * 60 * 1000,
  },
  chassisTireSystemIsWarningOn: {
    recommendation: 'DO_NOT_USE',
    blockedForTireHealth: false,
    allowUseWithoutPersistence: false,
    minSampleCount14d: 1,
    minCoveragePercent: 0,
    maxStaleMs: 24 * 60 * 60 * 1000,
  },
  speed: {
    recommendation: 'MVP',
    blockedForTireHealth: false,
    allowUseWithoutPersistence: true,
    minSampleCount14d: 50,
    minCoveragePercent: 10,
    maxStaleMs: 24 * 60 * 60 * 1000,
  },
  chassisAxleRow1WheelLeftTirePressure: {
    recommendation: 'LATER',
    blockedForTireHealth: false,
    allowUseWithoutPersistence: false,
    minSampleCount14d: 20,
    minCoveragePercent: 5,
    maxStaleMs: 24 * 60 * 60 * 1000,
  },
  chassisAxleRow1WheelRightTirePressure: {
    recommendation: 'LATER',
    blockedForTireHealth: false,
    allowUseWithoutPersistence: false,
    minSampleCount14d: 20,
    minCoveragePercent: 5,
    maxStaleMs: 24 * 60 * 60 * 1000,
  },
  chassisAxleRow2WheelLeftTirePressure: {
    recommendation: 'LATER',
    blockedForTireHealth: false,
    allowUseWithoutPersistence: false,
    minSampleCount14d: 20,
    minCoveragePercent: 5,
    maxStaleMs: 24 * 60 * 60 * 1000,
  },
  chassisAxleRow2WheelRightTirePressure: {
    recommendation: 'LATER',
    blockedForTireHealth: false,
    allowUseWithoutPersistence: false,
    minSampleCount14d: 20,
    minCoveragePercent: 5,
    maxStaleMs: 24 * 60 * 60 * 1000,
  },
  chassisAxleRow1WheelLeftSpeed: {
    recommendation: 'DO_NOT_USE',
    blockedForTireHealth: true,
    allowUseWithoutPersistence: false,
    minSampleCount14d: 0,
    minCoveragePercent: 0,
    maxStaleMs: 0,
  },
  chassisAxleRow1WheelRightSpeed: {
    recommendation: 'DO_NOT_USE',
    blockedForTireHealth: true,
    allowUseWithoutPersistence: false,
    minSampleCount14d: 0,
    minCoveragePercent: 0,
    maxStaleMs: 0,
  },
  angularVelocityYaw: {
    recommendation: 'DO_NOT_USE',
    blockedForTireHealth: true,
    allowUseWithoutPersistence: false,
    minSampleCount14d: 0,
    minCoveragePercent: 0,
    maxStaleMs: 0,
  },
  obdBarometricPressure: {
    recommendation: 'DO_NOT_USE',
    blockedForTireHealth: true,
    allowUseWithoutPersistence: false,
    minSampleCount14d: 0,
    minCoveragePercent: 0,
    maxStaleMs: 0,
  },
};

/** Signals that must never feed tread-depth estimation or wear proxies. */
export const TIRE_DIMO_BLOCKED_WEAR_DERIVATIONS: TireDimoSignalName[] = [
  'chassisAxleRow1WheelLeftSpeed',
  'chassisAxleRow1WheelRightSpeed',
  'angularVelocityYaw',
  'obdBarometricPressure',
];

export interface EvaluateTireDimoSignalCapabilityInput {
  signalName: TireDimoSignalName;
  documentedInDimoSchema?: boolean;
  listedInAvailableSignals?: boolean;
  latestValueAvailable?: boolean;
  historicalValuesAvailable?: boolean;
  synqDrivePersistsSignal?: boolean;
  synqDriveUsesSignal?: boolean;
  sampleCount14d?: number;
  coveragePercent?: number | null;
  lastSeenAt?: string | Date | null;
  asOf?: Date;
}

export interface EvaluateTireDimoSignalCapabilityResult {
  signalName: TireDimoSignalName;
  usable: boolean;
  usability:
    | 'USABLE'
    | 'SPORADIC'
    | 'AVAILABLE_BUT_NO_HISTORICAL_VALUES'
    | 'DOCUMENTED_NOT_AVAILABLE'
    | 'BLOCKED';
  recommendation: TireDimoAuditRecommendation;
  reasons: string[];
  stale: boolean;
}

function parseAsOf(input?: string | Date | null): Date | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function evaluateTireDimoSignalCapability(
  input: EvaluateTireDimoSignalCapabilityInput,
): EvaluateTireDimoSignalCapabilityResult {
  const registry = TIRE_DIMO_SIGNAL_REGISTRY[input.signalName];
  const reasons: string[] = [];
  const asOf = input.asOf ?? new Date();

  if (registry.blockedForTireHealth || registry.recommendation === 'DO_NOT_USE') {
    return {
      signalName: input.signalName,
      usable: false,
      usability: 'BLOCKED',
      recommendation: 'DO_NOT_USE',
      reasons: ['Signal blocked for tire health by audit (DO_NOT_USE).'],
      stale: false,
    };
  }

  if (input.documentedInDimoSchema === false) {
    reasons.push('Signal not documented in DIMO schema.');
  }
  if (input.listedInAvailableSignals === false) {
    reasons.push('Signal not listed in availableSignals for this vehicle.');
  }
  if (input.latestValueAvailable === false) {
    reasons.push('No latest value available.');
  }
  if (input.historicalValuesAvailable === false) {
    reasons.push('No historical values available.');
  }

  const persists = input.synqDrivePersistsSignal === true;
  const uses = input.synqDriveUsesSignal === true;
  const pipelineReady =
    persists || (uses && registry.allowUseWithoutPersistence);
  if (!pipelineReady) {
    reasons.push('SynqDrive does not persist or consume this signal for tire use.');
  }

  const lastSeen = parseAsOf(input.lastSeenAt);
  const stale =
    lastSeen != null
      ? asOf.getTime() - lastSeen.getTime() > registry.maxStaleMs
      : true;
  if (stale) {
    reasons.push('Signal observation is stale for tire context.');
  }

  const sampleCount14d = input.sampleCount14d ?? 0;
  const coveragePercent = input.coveragePercent ?? null;
  const coverageInsufficient =
    sampleCount14d < registry.minSampleCount14d ||
    (coveragePercent != null && coveragePercent < registry.minCoveragePercent);

  if (coverageInsufficient) {
    reasons.push(
      `Insufficient historical coverage (${sampleCount14d} samples / ${coveragePercent ?? 'n/a'}% coverage).`,
    );
  }

  const documented = input.documentedInDimoSchema !== false;
  const listed = input.listedInAvailableSignals !== false;
  const latest = input.latestValueAvailable !== false;
  const historical = input.historicalValuesAvailable !== false;

  let usability: EvaluateTireDimoSignalCapabilityResult['usability'] =
    'DOCUMENTED_NOT_AVAILABLE';
  if (!listed || !latest) {
    usability = 'DOCUMENTED_NOT_AVAILABLE';
  } else if (!historical) {
    usability = 'AVAILABLE_BUT_NO_HISTORICAL_VALUES';
  } else if (coverageInsufficient || stale) {
    usability = 'SPORADIC';
  } else {
    usability = 'USABLE';
  }

  const usable =
    documented &&
    listed &&
    latest &&
    historical &&
    pipelineReady &&
    !stale &&
    !coverageInsufficient;

  if (usable) {
    return {
      signalName: input.signalName,
      usable: true,
      usability: 'USABLE',
      recommendation: registry.recommendation,
      reasons: [],
      stale: false,
    };
  }

  return {
    signalName: input.signalName,
    usable: false,
    usability,
    recommendation: registry.recommendation,
    reasons,
    stale,
  };
}

export function isBlockedTireWearDerivation(signalName: TireDimoSignalName): boolean {
  return TIRE_DIMO_BLOCKED_WEAR_DERIVATIONS.includes(signalName);
}

export function assertNoWheelSpeedTreadDerivation(
  attemptedSignal: TireDimoSignalName | string,
): void {
  if (
    attemptedSignal === 'chassisAxleRow1WheelLeftSpeed' ||
    attemptedSignal === 'chassisAxleRow1WheelRightSpeed'
  ) {
    throw new Error(
      'Wheel speed must not be used as tread-depth proxy (audit DO_NOT_USE).',
    );
  }
}

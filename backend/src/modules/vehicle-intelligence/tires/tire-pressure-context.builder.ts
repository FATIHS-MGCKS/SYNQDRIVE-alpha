import {
  assessTirePressurePlausibility,
  isPlausibleTirePressure,
  TIRE_PRESSURE_UNIT_BAR,
} from '@modules/dimo/dimo-tire-pressure.normalizer';
import { resolveCanonicalTirePressureBar } from './tire-pressure-canonical.util';
import type {
  BuildTirePressureContextInput,
  DimoPressureSnapshotInput,
  HmPressureSnapshotInput,
  TirePressureContext,
  TirePressureCoverage,
  TirePressureFreshness,
  TirePressureSourceType,
  TirePressureTpmsWarningSource,
  TirePressureWearEligibility,
  TirePressureWheelPosition,
  TirePressureWheelProvider,
  TirePressureWheelReading,
} from './tire-pressure-context.types';
import { TIRE_HEALTH_CONFIG } from './tire-health.config';

const WHEEL_POSITIONS: TirePressureWheelPosition[] = [
  'frontLeft',
  'frontRight',
  'rearLeft',
  'rearRight',
];

const FRESH_MS = 2 * 60 * 60 * 1000;
const AGING_MS = 12 * 60 * 60 * 1000;

const HM_STATUS_ISSUE_TOKENS = new Set([
  'ALERT',
  'WARNING',
  'WARN',
  'LOW',
  'HIGH',
  'DEFLATION',
  'UNDERINFLATION',
  'OVERINFLATION',
  'FLAT',
  'CRITICAL',
]);

interface WheelCandidate {
  value: number;
  sourceProvider: TirePressureWheelProvider;
  sourceTimestamp: Date | null;
  plausibility: ReturnType<typeof assessTirePressurePlausibility>;
  statusToken: string | null;
  statusIssue: boolean;
}

function resolveFreshness(
  timestamp: Date | null | undefined,
  hasValue: boolean,
  asOf: Date,
): TirePressureFreshness {
  if (!hasValue) return 'no_data';
  if (!timestamp) return 'aging';
  const ageMs = asOf.getTime() - timestamp.getTime();
  if (ageMs < FRESH_MS) return 'fresh';
  if (ageMs < AGING_MS) return 'aging';
  return 'stale';
}

function worstFreshness(
  values: TirePressureFreshness[],
): TirePressureFreshness {
  const rank: Record<TirePressureFreshness, number> = {
    no_data: 0,
    fresh: 1,
    aging: 2,
    stale: 3,
  };
  if (values.length === 0) return 'no_data';
  return values.reduce((worst, cur) =>
    rank[cur] > rank[worst] ? cur : worst,
  );
}

function dimoFieldForPosition(
  position: TirePressureWheelPosition,
): keyof Pick<
  DimoPressureSnapshotInput,
  'tirePressureFl' | 'tirePressureFr' | 'tirePressureRl' | 'tirePressureRr'
> {
  switch (position) {
    case 'frontLeft':
      return 'tirePressureFl';
    case 'frontRight':
      return 'tirePressureFr';
    case 'rearLeft':
      return 'tirePressureRl';
    case 'rearRight':
      return 'tirePressureRr';
  }
}

function hmFieldForPosition(
  position: TirePressureWheelPosition,
): keyof Pick<
  HmPressureSnapshotInput,
  'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight'
> {
  return position;
}

function hmStatusFieldForPosition(
  position: TirePressureWheelPosition,
): keyof Pick<
  HmPressureSnapshotInput,
  | 'statusFrontLeft'
  | 'statusFrontRight'
  | 'statusRearLeft'
  | 'statusRearRight'
> {
  switch (position) {
    case 'frontLeft':
      return 'statusFrontLeft';
    case 'frontRight':
      return 'statusFrontRight';
    case 'rearLeft':
      return 'statusRearLeft';
    case 'rearRight':
      return 'statusRearRight';
  }
}

export function normalizeHmStatusToken(
  status: string | null | undefined,
): string | null {
  if (status == null) return null;
  const trimmed = String(status).trim();
  return trimmed.length > 0 ? trimmed.toUpperCase() : null;
}

export function isHmStatusIssueToken(token: string | null): boolean {
  if (!token) return false;
  if (HM_STATUS_ISSUE_TOKENS.has(token)) return true;
  return false;
}

function resolveDimoGlobalTimestamp(
  dimo: DimoPressureSnapshotInput,
): Date | null {
  return (
    dimo.sourceTimestamp ??
    dimo.providerFetchedAt ??
    dimo.lastSeenAt ??
    null
  );
}

function buildDimoCandidate(
  dimo: DimoPressureSnapshotInput,
  position: TirePressureWheelPosition,
): WheelCandidate | null {
  const field = dimoFieldForPosition(position);
  const stored = dimo[field];
  if (stored == null || !Number.isFinite(stored)) return null;

  const resolved = resolveCanonicalTirePressureBar(
    stored,
    dimo.providerSource ?? 'DIMO',
    dimo.perWheelTimestamps?.[position] ??
      resolveDimoGlobalTimestamp(dimo),
  );
  if (resolved.normalizedValue == null) return null;

  return {
    value: resolved.normalizedValue,
    sourceProvider: 'DIMO',
    sourceTimestamp:
      dimo.perWheelTimestamps?.[position] ??
      resolveDimoGlobalTimestamp(dimo),
    plausibility: resolved.plausibility,
    statusToken: null,
    statusIssue: false,
  };
}

function buildHmCandidate(
  hm: HmPressureSnapshotInput,
  position: TirePressureWheelPosition,
  asOf: Date,
): WheelCandidate | null {
  const field = hmFieldForPosition(position);
  const raw = hm[field];
  if (raw == null || !Number.isFinite(raw)) return null;

  const unit = (hm.unit ?? 'bar').toLowerCase();
  const valueBar =
    unit === 'kilopascals' || unit === 'kpa' ? raw / 100 : raw;
  const plausibility = assessTirePressurePlausibility(valueBar);
  if (!isPlausibleTirePressure(plausibility)) return null;

  const statusToken = normalizeHmStatusToken(
    hm[hmStatusFieldForPosition(position)],
  );
  const ts = hm.lastUpdatedAt ? new Date(hm.lastUpdatedAt) : null;
  const timestamp =
    ts && !Number.isNaN(ts.getTime()) ? ts : null;

  return {
    value: valueBar,
    sourceProvider: 'HIGH_MOBILITY',
    sourceTimestamp: timestamp,
    plausibility,
    statusToken,
    statusIssue: isHmStatusIssueToken(statusToken),
  };
}

/**
 * Deterministic per-wheel merge: newer timestamp wins; tie → HIGH_MOBILITY.
 */
export function selectWheelCandidate(
  dimo: WheelCandidate | null,
  hm: WheelCandidate | null,
): WheelCandidate | null {
  if (!dimo && !hm) return null;
  if (!dimo) return hm;
  if (!hm) return dimo;

  const dimoTs = dimo.sourceTimestamp?.getTime() ?? 0;
  const hmTs = hm.sourceTimestamp?.getTime() ?? 0;
  if (hmTs > dimoTs) return hm;
  if (dimoTs > hmTs) return dimo;
  return hm;
}

function resolveSourceType(
  wheels: Record<TirePressureWheelPosition, TirePressureWheelReading>,
): TirePressureSourceType {
  const providers = new Set<TirePressureWheelProvider>();
  for (const pos of WHEEL_POSITIONS) {
    const provider = wheels[pos].sourceProvider;
    if (provider) providers.add(provider);
  }
  if (providers.size === 0) return 'NONE';
  if (providers.size === 1) {
    return providers.has('DIMO') ? 'DIMO' : 'HIGH_MOBILITY';
  }
  return 'MIXED';
}

function resolveCoverage(
  wheels: Record<TirePressureWheelPosition, TirePressureWheelReading>,
  wearEligibility: TirePressureWearEligibility,
  minWheelsRequired: number,
): TirePressureCoverage {
  const withValue = WHEEL_POSITIONS.filter((p) => wheels[p].value != null);
  const freshWheels = withValue.filter((p) => wheels[p].freshness === 'fresh');

  const timestamps = withValue
    .map((p) => wheels[p].sourceTimestamp)
    .filter((ts): ts is string => ts != null)
    .map((ts) => new Date(ts).getTime())
    .filter((t) => Number.isFinite(t));

  const periodStart =
    timestamps.length > 0
      ? new Date(Math.min(...timestamps)).toISOString()
      : null;
  const periodEnd =
    timestamps.length > 0
      ? new Date(Math.max(...timestamps)).toISOString()
      : null;
  const signalSpanMinutes =
    timestamps.length >= 2
      ? Math.round(
          (Math.max(...timestamps) - Math.min(...timestamps)) / 60_000,
        )
      : null;

  const overallFreshness = worstFreshness(
    withValue.map((p) => wheels[p].freshness),
  );

  const usableWheels = wearEligibility.eligible
    ? withValue.filter(
        (p) =>
          wheels[p].freshness !== 'stale' &&
          isPlausibleTirePressure(wheels[p].plausibility),
      )
    : [];

  return {
    wheelsAvailable: withValue.length,
    wheelsFresh: freshWheels.length,
    wheelsUsableForWear: usableWheels.length,
    coveragePercent: Math.round((withValue.length / 4) * 100),
    periodStart,
    periodEnd,
    signalSpanMinutes,
    continuousExposureEligible:
      overallFreshness !== 'stale' && withValue.length > 0,
    minWheelsRequired,
    meetsWearThreshold: withValue.length >= minWheelsRequired,
  };
}

export function resolvePressureWearEligibility(args: {
  wheels: Record<TirePressureWheelPosition, TirePressureWheelReading>;
  overallFreshness: TirePressureFreshness;
  sourceType: TirePressureSourceType;
  nominalPressureBar: number | null;
  minWheelsForWear: number;
  continuousExposureEligible: boolean;
}): TirePressureWearEligibility {
  const reasons: string[] = [];
  let confidencePenalty = 0;

  const usable = WHEEL_POSITIONS.filter(
    (p) =>
      args.wheels[p].value != null &&
      isPlausibleTirePressure(args.wheels[p].plausibility) &&
      args.wheels[p].freshness !== 'stale',
  );

  if (args.sourceType === 'NONE') {
    return {
      eligible: false,
      reasons: ['No tire pressure source available.'],
      confidencePenalty: 6,
      measurementHint: 'Check tire pressures manually or connect TPMS.',
    };
  }

  if (!args.nominalPressureBar || args.nominalPressureBar <= 0) {
    reasons.push('Nominal tire pressure unknown for this setup.');
    confidencePenalty += 4;
  }

  if (args.overallFreshness === 'stale') {
    reasons.push('Pressure data is stale; not used for wear exposure.');
    confidencePenalty += 4;
  }

  if (!args.continuousExposureEligible) {
    reasons.push(
      'Stale pressure must not imply continuous underinflation exposure.',
    );
    confidencePenalty += 2;
  }

  if (usable.length < args.minWheelsForWear) {
    reasons.push(
      `Insufficient wheel coverage (${usable.length}/${args.minWheelsForWear} required).`,
    );
    confidencePenalty += 3;
  }

  const unknownSource = WHEEL_POSITIONS.some(
    (p) => args.wheels[p].value != null && !args.wheels[p].sourceProvider,
  );
  if (unknownSource) {
    reasons.push('Pressure source unknown for one or more wheels.');
    confidencePenalty += 3;
  }

  const eligible =
    usable.length >= args.minWheelsForWear &&
    args.overallFreshness !== 'stale' &&
    args.nominalPressureBar != null &&
    args.nominalPressureBar > 0 &&
    args.continuousExposureEligible &&
    !unknownSource;

  return {
    eligible,
    reasons: eligible ? [] : reasons,
    confidencePenalty,
    measurementHint: eligible
      ? null
      : 'Record a workshop pressure check to improve wear confidence.',
  };
}

function resolveTpmsWarning(args: {
  dimo?: DimoPressureSnapshotInput | null;
  hm?: HmPressureSnapshotInput | null;
  wheels: Record<TirePressureWheelPosition, TirePressureWheelReading>;
}): { warning: boolean | null; source: TirePressureTpmsWarningSource } {
  const dimoPresent = args.dimo?.tpmsWarning?.signalPresent === true;
  const dimoActive =
    dimoPresent && args.dimo?.tpmsWarning?.value === true;

  const hmStatusIssue = WHEEL_POSITIONS.some((p) => args.wheels[p].statusIssue);
  const hmBooleanWarning = args.hm?.tirePressureWarning === true;
  const hmOverallIssue =
    String(args.hm?.overallStatus ?? '').toUpperCase() === 'ISSUE';
  const hmActive = hmBooleanWarning || hmStatusIssue || hmOverallIssue;

  if (dimoActive && hmActive) {
    return { warning: true, source: 'MIXED' };
  }
  if (dimoActive) {
    return { warning: true, source: 'DIMO' };
  }
  if (hmActive) {
    return { warning: true, source: 'HIGH_MOBILITY' };
  }
  if (dimoPresent && args.dimo?.tpmsWarning?.value === false && !hmActive) {
    return { warning: false, source: 'DIMO' };
  }
  return { warning: null, source: null };
}

function resolveOverallStatus(args: {
  sourceType: TirePressureSourceType;
  overallFreshness: TirePressureFreshness;
  tpmsWarning: boolean | null;
  wheels: Record<TirePressureWheelPosition, TirePressureWheelReading>;
}): TirePressureContext['overallStatus'] {
  if (args.tpmsWarning === true) return 'ISSUE';
  if (WHEEL_POSITIONS.some((p) => args.wheels[p].statusIssue)) {
    return 'ISSUE';
  }
  if (args.sourceType === 'NONE') return 'UNKNOWN';
  if (args.overallFreshness === 'stale') return 'STALE';
  return 'OK';
}

function buildQualityWarnings(args: {
  sourceType: TirePressureSourceType;
  overallFreshness: TirePressureFreshness;
  coverage: TirePressureCoverage;
  wearEligibility: TirePressureWearEligibility;
  tpmsWarning: boolean | null;
  dimo?: DimoPressureSnapshotInput | null;
  hm?: HmPressureSnapshotInput | null;
}): string[] {
  const warnings: string[] = [...args.wearEligibility.reasons];

  if (args.sourceType === 'MIXED') {
    warnings.push('Mixed DIMO and High Mobility pressure sources per wheel.');
  }
  if (args.overallFreshness === 'stale') {
    warnings.push('Pressure snapshot is stale for wear interpretation.');
  }
  if (args.coverage.wheelsAvailable > 0 && !args.coverage.meetsWearThreshold) {
    warnings.push(
      `Partial TPMS coverage (${args.coverage.wheelsAvailable}/4 wheels).`,
    );
  }
  if (args.tpmsWarning === true) {
    warnings.push('TPMS warning active.');
  }
  if (
    args.tpmsWarning === null &&
    args.dimo?.tpmsWarning?.signalPresent !== true &&
    args.coverage.wheelsAvailable === 0 &&
    args.hm == null
  ) {
    warnings.push('No tire pressure feed available.');
  }
  if (
    args.tpmsWarning === null &&
    args.dimo?.capability?.tpmsWarningSignalListed === false &&
    args.coverage.wheelsAvailable === 0
  ) {
    warnings.push('TPMS warning capability not confirmed for this vehicle.');
  }

  return Array.from(new Set(warnings));
}

export function buildTirePressureContext(
  input: BuildTirePressureContextInput,
): TirePressureContext {
  const asOf = input.asOf ?? new Date();
  const minWheelsForWear =
    input.minWheelsForWear ??
    TIRE_HEALTH_CONFIG.pressure.minReadingsForActive ??
    3;
  const nominalPressureBar =
    input.nominalPressureBar ??
    TIRE_HEALTH_CONFIG.pressure.nominalPressureBar;

  const wheels = {} as Record<TirePressureWheelPosition, TirePressureWheelReading>;

  for (const position of WHEEL_POSITIONS) {
    const dimoCandidate = input.dimo
      ? buildDimoCandidate(input.dimo, position)
      : null;
    const hmCandidate = input.hm
      ? buildHmCandidate(input.hm, position, asOf)
      : null;
    const selected = selectWheelCandidate(dimoCandidate, hmCandidate);

    const freshness = resolveFreshness(
      selected?.sourceTimestamp,
      selected != null,
      asOf,
    );

    wheels[position] = {
      value: selected?.value ?? null,
      normalizedUnit: TIRE_PRESSURE_UNIT_BAR,
      sourceProvider: selected?.sourceProvider ?? null,
      sourceTimestamp: selected?.sourceTimestamp?.toISOString() ?? null,
      freshness,
      plausibility: selected?.plausibility ?? 'missing',
      statusToken: selected?.statusToken ?? null,
      statusIssue: selected?.statusIssue ?? false,
    };
  }

  const sourceType = resolveSourceType(wheels);
  const wheelFreshnessValues = WHEEL_POSITIONS.map(
    (p) => wheels[p].freshness,
  ).filter((f) => f !== 'no_data');
  const overallFreshness =
    wheelFreshnessValues.length > 0
      ? worstFreshness(wheelFreshnessValues)
      : 'no_data';

  const continuousExposureEligible =
    overallFreshness !== 'stale' &&
    WHEEL_POSITIONS.some((p) => wheels[p].value != null);

  const wearEligibility = resolvePressureWearEligibility({
    wheels,
    overallFreshness:
      overallFreshness === 'no_data' ? 'no_data' : overallFreshness,
    sourceType,
    nominalPressureBar,
    minWheelsForWear,
    continuousExposureEligible,
  });

  const coverage = resolveCoverage(
    wheels,
    wearEligibility,
    minWheelsForWear,
  );

  const { warning: tpmsWarning, source: tpmsWarningSource } = resolveTpmsWarning({
    dimo: input.dimo,
    hm: input.hm,
    wheels,
  });

  const overallStatus = resolveOverallStatus({
    sourceType,
    overallFreshness,
    tpmsWarning,
    wheels,
  });

  const qualityWarnings = buildQualityWarnings({
    sourceType,
    overallFreshness,
    coverage,
    wearEligibility,
    tpmsWarning,
    dimo: input.dimo,
    hm: input.hm,
  });

  const dimoFreshness = worstFreshness(
    WHEEL_POSITIONS.filter((p) => wheels[p].sourceProvider === 'DIMO').map(
      (p) => wheels[p].freshness,
    ),
  );
  const hmFreshness = worstFreshness(
    WHEEL_POSITIONS.filter(
      (p) => wheels[p].sourceProvider === 'HIGH_MOBILITY',
    ).map((p) => wheels[p].freshness),
  );

  return {
    frontLeft: wheels.frontLeft.value,
    frontRight: wheels.frontRight.value,
    rearLeft: wheels.rearLeft.value,
    rearRight: wheels.rearRight.value,
    wheels,
    normalizedUnit: TIRE_PRESSURE_UNIT_BAR,
    sourceType,
    overallFreshness:
      overallFreshness === 'no_data' ? 'no_data' : overallFreshness,
    coverage,
    tpmsWarning,
    tpmsWarningSource,
    nominalPressureBar,
    qualityWarnings,
    wearEligibility,
    overallStatus,
    source: sourceType,
    dimoFreshness,
    hmFreshness,
    warningHints: qualityWarnings,
  };
}

export function extractDimoPerWheelTimestamps(
  rawPayloadJson: unknown,
): Partial<Record<TirePressureWheelPosition, Date | null>> | undefined {
  const payload = rawPayloadJson as
    | {
        _synqdrive?: {
          tirePressure?: Partial<
            Record<
              'fl' | 'fr' | 'rl' | 'rr',
              { sourceTimestamp?: string | null }
            >
          >;
        };
      }
    | null
    | undefined;
  const tirePressure = payload?._synqdrive?.tirePressure;
  if (!tirePressure) return undefined;

  const parse = (key: 'fl' | 'fr' | 'rl' | 'rr'): Date | null => {
    const raw = tirePressure[key]?.sourceTimestamp;
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  return {
    frontLeft: parse('fl'),
    frontRight: parse('fr'),
    rearLeft: parse('rl'),
    rearRight: parse('rr'),
  };
}

export function extractDimoTpmsWarningFromPayload(
  rawPayloadJson: unknown,
): import('./tire-pressure-context.types').DimoTpmsWarningInput {
  const payload = rawPayloadJson as
    | {
        _synqdrive?: {
          tpmsWarning?: {
            signalPresent?: boolean;
            value?: boolean | null;
            sourceTimestamp?: string | null;
          };
        };
        chassisTireSystemIsWarningOn?: {
          value?: number;
          timestamp?: string | number;
        };
      }
    | null
    | undefined;

  const embedded = payload?._synqdrive?.tpmsWarning;
  if (embedded?.signalPresent === true) {
    const ts = embedded.sourceTimestamp
      ? new Date(embedded.sourceTimestamp)
      : null;
    return {
      signalPresent: true,
      value: embedded.value ?? null,
      sourceTimestamp:
        ts && !Number.isNaN(ts.getTime()) ? ts : null,
    };
  }

  const signal = payload?.chassisTireSystemIsWarningOn;
  if (signal && typeof signal === 'object' && 'value' in signal) {
    const valueRaw = signal.value;
    const tsRaw = signal.timestamp;
    const ts =
      tsRaw != null ? new Date(tsRaw) : null;
    return {
      signalPresent: true,
      value:
        typeof valueRaw === 'number' ? valueRaw >= 0.5 : null,
      sourceTimestamp:
        ts && !Number.isNaN(ts.getTime()) ? ts : null,
    };
  }

  return {
    signalPresent: false,
    value: null,
    sourceTimestamp: null,
  };
}

export function emptyTirePressureContext(): TirePressureContext {
  return buildTirePressureContext({});
}

import { buildAmbientTemperatureContext } from './tire-ambient-context';
import type {
  AmbientTemperatureSample,
  TireDimoContext,
  TireDimoOdometerContext,
  TireDimoSignalCapabilityResult,
  TireDimoTpmsCapabilityContext,
} from './tire-dimo-context.types';
import {
  evaluateTireDimoSignalCapability,
  TIRE_DIMO_BLOCKED_WEAR_DERIVATIONS,
  TIRE_DIMO_SIGNAL_REGISTRY,
  type TireDimoSignalName,
} from './tire-dimo-signal-capability';
import type { DimoTpmsWarningInput } from './tire-pressure-context.types';
import { assessOdometerPlausibility } from './tire-odometer-anchor';

export interface BuildTireDimoContextInput {
  asOf?: Date;
  availableSignalNames?: string[];
  ambientSamples?: AmbientTemperatureSample[];
  latestState?: {
    odometerKm?: number | null;
    speedKmh?: number | null;
    providerSource?: string | null;
    sourceTimestamp?: Date | null;
    providerFetchedAt?: Date | null;
    lastSeenAt?: Date | null;
    rawPayloadJson?: unknown;
  } | null;
  /** 14-day coverage proxies from trips / telemetry audit loader. */
  coverage?: Partial<
    Record<
      TireDimoSignalName,
      { sampleCount14d?: number; coveragePercent?: number | null }
    >
  >;
  lastKnownOdometerKm?: number | null;
  tpmsWarning?: DimoTpmsWarningInput | null;
}

function signalListed(
  name: string,
  available: Set<string>,
  latestState: BuildTireDimoContextInput['latestState'],
): boolean {
  if (available.has(name)) return true;
  const raw = latestState?.rawPayloadJson as Record<string, unknown> | null;
  if (!raw) return false;
  const field = raw[name];
  if (field == null) return false;
  if (typeof field === 'object' && field !== null && 'value' in field) {
    return (field as { value?: unknown }).value != null;
  }
  return true;
}

function resolveLastSeen(
  signalName: TireDimoSignalName,
  latestState: BuildTireDimoContextInput['latestState'],
): Date | null {
  const raw = latestState?.rawPayloadJson as Record<string, unknown> | null;
  const field = raw?.[signalName];
  if (field && typeof field === 'object' && field !== null) {
    const ts = (field as { timestamp?: string | number }).timestamp;
    if (ts != null) {
      const parsed = new Date(ts);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return (
    latestState?.sourceTimestamp ??
    latestState?.providerFetchedAt ??
    latestState?.lastSeenAt ??
    null
  );
}

function buildSignalCapability(
  signalName: TireDimoSignalName,
  input: BuildTireDimoContextInput,
  available: Set<string>,
): TireDimoSignalCapabilityResult {
  const registry = TIRE_DIMO_SIGNAL_REGISTRY[signalName];
  const cov = input.coverage?.[signalName];
  const lastSeenAt = resolveLastSeen(signalName, input.latestState);
  const listed = signalListed(signalName, available, input.latestState);
  const latestValueAvailable =
    signalName === 'exteriorAirTemperature'
      ? (input.ambientSamples?.length ?? 0) > 0
      : signalName === 'powertrainTransmissionTravelledDistance'
        ? input.latestState?.odometerKm != null
        : signalName === 'speed'
          ? input.latestState?.speedKmh != null
          : signalName === 'chassisTireSystemIsWarningOn'
            ? input.tpmsWarning?.signalPresent === true
            : listed;

  const evaluated = evaluateTireDimoSignalCapability({
    signalName,
    documentedInDimoSchema: true,
    listedInAvailableSignals: listed,
    latestValueAvailable,
    historicalValuesAvailable:
      (cov?.sampleCount14d ?? input.ambientSamples?.length ?? 0) > 0 ||
      latestValueAvailable,
    synqDrivePersistsSignal:
      signalName === 'powertrainTransmissionTravelledDistance' ||
      signalName === 'speed' ||
      signalName.startsWith('chassisAxleRow')
        ? true
        : false,
    synqDriveUsesSignal:
      signalName === 'exteriorAirTemperature' ||
      signalName === 'powertrainTransmissionTravelledDistance' ||
      signalName === 'speed' ||
      signalName === 'chassisTireSystemIsWarningOn',
    sampleCount14d:
      cov?.sampleCount14d ??
      (signalName === 'exteriorAirTemperature'
        ? input.ambientSamples?.length ?? 0
        : 0),
    coveragePercent: cov?.coveragePercent ?? null,
    lastSeenAt,
    asOf: input.asOf,
  });

  return {
    signalName,
    usable: evaluated.usable,
    usability: evaluated.usability,
    recommendation: evaluated.recommendation,
    reasons: evaluated.reasons,
    documentedInDimoSchema: true,
    listedInAvailableSignals: listed,
    latestValueAvailable,
    historicalValuesAvailable:
      (cov?.sampleCount14d ?? input.ambientSamples?.length ?? 0) > 0 ||
      latestValueAvailable,
    synqDrivePersistsSignal:
      signalName === 'powertrainTransmissionTravelledDistance' ||
      signalName === 'speed' ||
      signalName.startsWith('chassisAxleRow'),
    synqDriveUsesSignal:
      signalName === 'exteriorAirTemperature' ||
      signalName === 'powertrainTransmissionTravelledDistance' ||
      signalName === 'speed' ||
      signalName === 'chassisTireSystemIsWarningOn',
    sampleCount14d:
      cov?.sampleCount14d ??
      (signalName === 'exteriorAirTemperature'
        ? input.ambientSamples?.length ?? 0
        : 0),
    coveragePercent: cov?.coveragePercent ?? null,
    lastSeenAt: lastSeenAt?.toISOString() ?? null,
    stale: evaluated.stale,
  };
}

export function buildTireDimoOdometerContext(args: {
  capability: TireDimoSignalCapabilityResult;
  odometerKm: number | null | undefined;
  providerSource: string | null | undefined;
  lastKnownOdometerKm?: number | null;
  lastSeenAt?: Date | null;
}): TireDimoOdometerContext {
  const reasons = [...args.capability.reasons];
  const valueKm =
    args.odometerKm != null && Number.isFinite(args.odometerKm)
      ? Math.round(args.odometerKm * 10) / 10
      : null;

  if (!args.capability.usable || valueKm == null) {
    return {
      usable: false,
      valueKm: null,
      source: null,
      lastSeenAt: args.lastSeenAt?.toISOString() ?? null,
      plausibilityOnly: true,
      reasons:
        valueKm == null
          ? [...reasons, 'No odometer value available.']
          : reasons,
    };
  }

  const plausibility = assessOdometerPlausibility(
    valueKm,
    args.lastKnownOdometerKm,
  );
  if (!plausibility.plausible) {
    reasons.push(`Odometer plausibility issue: ${plausibility.issue}.`);
    return {
      usable: false,
      valueKm,
      source: 'DIMO',
      lastSeenAt: args.lastSeenAt?.toISOString() ?? null,
      plausibilityOnly: true,
      reasons,
    };
  }

  const source =
    String(args.providerSource ?? '')
      .toUpperCase()
      .includes('HIGH_MOBILITY')
      ? 'HIGH_MOBILITY'
      : 'DIMO';

  return {
    usable: true,
    valueKm,
    source,
    lastSeenAt: args.lastSeenAt?.toISOString() ?? null,
    plausibilityOnly: true,
    reasons: [],
  };
}

export function buildTireDimoTpmsCapabilityContext(args: {
  capability: TireDimoSignalCapabilityResult;
  tpmsWarning?: DimoTpmsWarningInput | null;
}): TireDimoTpmsCapabilityContext {
  const present = args.tpmsWarning?.signalPresent === true;
  const usable = args.capability.usable && present;

  if (!present) {
    return {
      architecturePrepared: true,
      usable: false,
      signalPresent: false,
      warningActive: null,
      sourceTimestamp:
        args.tpmsWarning?.sourceTimestamp?.toISOString() ?? null,
      reasons: [
        'TPMS warning signal not available for this vehicle (0% fleet coverage in audit).',
      ],
    };
  }

  if (!usable) {
    return {
      architecturePrepared: true,
      usable: false,
      signalPresent: true,
      warningActive: args.tpmsWarning?.value ?? null,
      sourceTimestamp:
        args.tpmsWarning?.sourceTimestamp?.toISOString() ?? null,
      reasons: args.capability.reasons,
    };
  }

  return {
    architecturePrepared: true,
    usable: true,
    signalPresent: true,
    warningActive: args.tpmsWarning?.value ?? null,
    sourceTimestamp: args.tpmsWarning?.sourceTimestamp?.toISOString() ?? null,
    reasons: [],
  };
}

export function buildTireDimoContext(
  input: BuildTireDimoContextInput,
): TireDimoContext {
  const asOf = input.asOf ?? new Date();
  const available = new Set(input.availableSignalNames ?? []);

  const ambientCapability = buildSignalCapability(
    'exteriorAirTemperature',
    input,
    available,
  );
  const odometerCapability = buildSignalCapability(
    'powertrainTransmissionTravelledDistance',
    input,
    available,
  );
  const tpmsCapability = buildSignalCapability(
    'chassisTireSystemIsWarningOn',
    input,
    available,
  );
  const speedCapability = buildSignalCapability('speed', input, available);

  const ambient = buildAmbientTemperatureContext({
    capability: ambientCapability,
    samples: input.ambientSamples ?? [],
    lastSeenAt: resolveLastSeen('exteriorAirTemperature', input.latestState),
    asOf,
  });

  const odometer = buildTireDimoOdometerContext({
    capability: odometerCapability,
    odometerKm: input.latestState?.odometerKm,
    providerSource: input.latestState?.providerSource,
    lastKnownOdometerKm: input.lastKnownOdometerKm,
    lastSeenAt: resolveLastSeen(
      'powertrainTransmissionTravelledDistance',
      input.latestState,
    ),
  });

  const tpms = buildTireDimoTpmsCapabilityContext({
    capability: tpmsCapability,
    tpmsWarning: input.tpmsWarning,
  });

  return {
    asOf: asOf.toISOString(),
    signals: {
      exteriorAirTemperature: ambientCapability,
      powertrainTransmissionTravelledDistance: odometerCapability,
      chassisTireSystemIsWarningOn: tpmsCapability,
      speed: speedCapability,
    },
    ambient,
    odometer,
    tpms,
    blockedWearDerivations: [...TIRE_DIMO_BLOCKED_WEAR_DERIVATIONS],
  };
}

export function resolveCapabilityGatedTpmsWarning(
  tpms: TireDimoTpmsCapabilityContext,
  raw: DimoTpmsWarningInput | null | undefined,
): DimoTpmsWarningInput {
  if (!tpms.usable) {
    return {
      signalPresent: false,
      value: null,
      sourceTimestamp: null,
    };
  }
  return (
    raw ?? {
      signalPresent: false,
      value: null,
      sourceTimestamp: null,
    }
  );
}

export function resolveCapabilityGatedOdometerKm(
  dimoContext: TireDimoContext | null | undefined,
  fallbackOdometerKm: number | null | undefined,
): number | null {
  if (dimoContext?.odometer.usable && dimoContext.odometer.valueKm != null) {
    return dimoContext.odometer.valueKm;
  }
  if (dimoContext) {
    return null;
  }
  return fallbackOdometerKm ?? null;
}

export function resolveCapabilityGatedSpeedKmh(
  dimoContext: TireDimoContext | null | undefined,
  fallbackSpeedKmh: number | null | undefined,
): number | null {
  if (dimoContext?.signals?.speed?.usable) {
    return fallbackSpeedKmh ?? null;
  }
  return null;
}

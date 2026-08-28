/**
 * Runtime/canonical capability discovery for the E3A recovery dry-run.
 *
 * Two dimensions are resolved independently and must not be conflated:
 *
 *   A) APPLICABILITY — derived from the canonical fleet powertrain taxonomy
 *      (`resolveFleetPowertrainClass`). ICE has no traction battery, so recharge
 *      is NOT_APPLICABLE no matter what a provider lists.
 *
 *   B) PROVIDER SIGNAL AVAILABILITY — derived from runtime evidence: the DIMO
 *      `availableSignals` probe, persisted `VehicleBatteryCapability` rows and,
 *      supplementally, energy events already present in the outage window.
 *
 * Availability can only confirm an applicable mechanism. It can never make an
 * inapplicable mechanism applicable.
 */
import type { BatteryCapabilityStatus } from '@prisma/client';
import { resolveFleetPowertrainClass } from '@modules/vehicles/fleet-data-coverage';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '@modules/vehicle-intelligence/battery-health/capability-preflight/battery-capability-signals.registry';
import { isCapabilityMeasurementEnabled } from '@modules/vehicle-intelligence/battery-health/capability-preflight/battery-capability-lifecycle.policy';
import type { RecoveryExistingEnergyEvent } from './energy-events-recovery-read.repository';
import { inferFleetCapabilitiesFromEvents } from './energy-events-recovery-fleet-inference';
import type { RecoveryVehicleInput } from './energy-events-recovery-runner';
import {
  CAPABILITY_EVIDENCE_SOURCES,
  type CapabilityEvidenceAggregate,
  type CapabilityEvidenceSource,
  type EnergyMechanismApplicabilityMatrix,
  type RecoveryCapabilityEvidence,
  type RecoveryPowertrainClass,
} from './energy-events-recovery.types';

export type CapabilityLookupStatus = 'ok' | 'failed';

export interface RecoveryVehicleDbLoad {
  vehicleId: string;
  label: string;
  tokenId: number;
  provider: string;
  fuelType: string | null;
  dimoAccessAvailable: boolean;
  existingEvents: RecoveryExistingEnergyEvent[];
  batteryCapabilities: Array<{
    signalKey: string;
    status: BatteryCapabilityStatus;
  }>;
}

const FUEL_RELATIVE_SIGNAL = 'powertrainFuelSystemRelativeLevel';
const FUEL_ABSOLUTE_SIGNAL = 'powertrainFuelSystemAbsoluteLevel';
const SOC_SIGNAL = 'powertrainTractionBatteryStateOfChargeCurrent';

const RECHARGE_CAPABILITY_SIGNAL_KEYS = new Set([
  RECHARGE_SEGMENTS_SIGNAL_KEY,
  'hv.soc',
]);

/**
 * "The provider lists this signal" — deliberately delegated to the canonical
 * battery-capability authority rather than restating the enum here.
 *
 * `AVAILABLE_NULL` counts as listed (canonical: signal listed, latest value
 * null) and `DEGRADED` counts as recently-listed. Neither is narrowed for
 * recovery: an overbroad row is a *listing* fact, and the powertrain
 * applicability matrix — not the status filter — is what stops a listed but
 * inapplicable signal from becoming a capability.
 */
function batteryCapabilityIsListed(status: BatteryCapabilityStatus): boolean {
  return isCapabilityMeasurementEnabled(status) || status === 'DEGRADED';
}

export const SYNTHETIC_QUICK_TOKEN_ID_MIN = 100_001;
export const SYNTHETIC_QUICK_TOKEN_ID_MAX = 100_099;

export function isSyntheticQuickTokenId(tokenId: number): boolean {
  return tokenId >= SYNTHETIC_QUICK_TOKEN_ID_MIN && tokenId <= SYNTHETIC_QUICK_TOKEN_ID_MAX;
}

/**
 * Canonical powertrain class. Delegates to the existing fleet authority so
 * recovery cannot drift into a competing taxonomy; PHEV is preserved.
 */
export function toRecoveryPowertrain(
  fuelType: string | null | undefined,
): RecoveryPowertrainClass {
  return resolveFleetPowertrainClass(fuelType);
}

/**
 * Canonical applicability matrix, mirroring `resolveSignalCapabilityMatrix`
 * semantics for the fuel / evSoc pair.
 */
export function resolveEnergyMechanismApplicability(
  powertrain: RecoveryPowertrainClass,
): EnergyMechanismApplicabilityMatrix {
  switch (powertrain) {
    case 'ICE':
      return { refuel: 'APPLICABLE', recharge: 'NOT_APPLICABLE' };
    case 'EV':
      return { refuel: 'NOT_APPLICABLE', recharge: 'APPLICABLE' };
    case 'PHEV':
      return { refuel: 'APPLICABLE', recharge: 'APPLICABLE' };
    default:
      return { refuel: 'UNKNOWN', recharge: 'UNKNOWN' };
  }
}

function isBlocked(applicability: EnergyMechanismApplicabilityMatrix[keyof EnergyMechanismApplicabilityMatrix]): boolean {
  return applicability === 'NOT_APPLICABLE';
}

interface RawAvailabilityClaims {
  relativeFuel: CapabilityEvidenceSource[];
  absoluteFuel: CapabilityEvidenceSource[];
  rechargeSoc: CapabilityEvidenceSource[];
}

function collectAvailabilityClaims(input: {
  row: RecoveryVehicleDbLoad;
  availableSignals: string[] | null;
}): RawAvailabilityClaims {
  const claims: RawAvailabilityClaims = {
    relativeFuel: [],
    absoluteFuel: [],
    rechargeSoc: [],
  };

  const signals = input.availableSignals;
  if (signals) {
    if (signals.includes(FUEL_RELATIVE_SIGNAL)) {
      claims.relativeFuel.push('DIMO_AVAILABLE_SIGNALS');
    }
    if (signals.includes(FUEL_ABSOLUTE_SIGNAL)) {
      claims.absoluteFuel.push('DIMO_AVAILABLE_SIGNALS');
    }
    if (
      signals.includes(RECHARGE_SEGMENTS_SIGNAL_KEY) ||
      signals.includes(SOC_SIGNAL)
    ) {
      claims.rechargeSoc.push('DIMO_AVAILABLE_SIGNALS');
    }
  }

  const batteryCapabilityListsSoc = input.row.batteryCapabilities.some(
    (capability) =>
      RECHARGE_CAPABILITY_SIGNAL_KEYS.has(capability.signalKey) &&
      batteryCapabilityIsListed(capability.status),
  );
  if (batteryCapabilityListsSoc) {
    claims.rechargeSoc.push('VEHICLE_BATTERY_CAPABILITY');
  }

  const supplemental = inferFleetCapabilitiesFromEvents(input.row.existingEvents);
  if (supplemental.relativeFuel) {
    claims.relativeFuel.push('SUPPLEMENTAL_WINDOW_EVENTS');
  }
  if (supplemental.absoluteFuel) {
    claims.absoluteFuel.push('SUPPLEMENTAL_WINDOW_EVENTS');
  }
  if (supplemental.rechargeSoc) {
    claims.rechargeSoc.push('SUPPLEMENTAL_WINDOW_EVENTS');
  }

  return claims;
}

export interface RecoveryCapabilityResolution {
  powertrain: RecoveryPowertrainClass;
  relativeFuelAvailable: boolean;
  absoluteFuelAvailable: boolean;
  rechargeSocAvailable: boolean;
  capabilityLookupStatus: CapabilityLookupStatus;
  capabilityEvidence: RecoveryCapabilityEvidence;
}

export function resolveRecoveryVehicleCapabilities(input: {
  row: RecoveryVehicleDbLoad;
  availableSignals: string[] | null;
  mode: 'full' | 'quick';
}): RecoveryCapabilityResolution {
  const powertrain = toRecoveryPowertrain(input.row.fuelType);
  const applicability = resolveEnergyMechanismApplicability(powertrain);
  const claims = collectAvailabilityClaims({
    row: input.row,
    availableSignals: input.availableSignals,
  });

  const fuelBlocked = isBlocked(applicability.refuel);
  const rechargeBlocked = isBlocked(applicability.recharge);

  const relativeFuelAvailable = !fuelBlocked && claims.relativeFuel.length > 0;
  const absoluteFuelAvailable = !fuelBlocked && claims.absoluteFuel.length > 0;
  const rechargeSocAvailable = !rechargeBlocked && claims.rechargeSoc.length > 0;

  const fuelClaimSources = uniqueSources([
    ...claims.relativeFuel,
    ...claims.absoluteFuel,
  ]);
  const rechargeClaimSources = uniqueSources(claims.rechargeSoc);

  const availableSignalsProbeStatus: RecoveryCapabilityEvidence['availableSignalsProbeStatus'] =
    !input.row.dimoAccessAvailable
      ? 'not_attempted'
      : input.availableSignals != null
        ? 'ok'
        : 'failed';

  const capabilityEvidence: RecoveryCapabilityEvidence = {
    applicability,
    confirmedFuelSources: fuelBlocked ? [] : fuelClaimSources,
    confirmedRechargeSources: rechargeBlocked ? [] : rechargeClaimSources,
    suppressedFuelSources: fuelBlocked ? fuelClaimSources : [],
    suppressedRechargeSources: rechargeBlocked ? rechargeClaimSources : [],
    availableSignalsProbeStatus,
  };

  const capabilityLookupStatus = resolveCapabilityLookupStatus({
    mode: input.mode,
    dimoAccessAvailable: input.row.dimoAccessAvailable,
    probeOk: input.availableSignals != null,
    powertrain,
    applicability,
    relativeFuelAvailable,
    absoluteFuelAvailable,
    rechargeSocAvailable,
  });

  return {
    powertrain,
    relativeFuelAvailable,
    absoluteFuelAvailable,
    rechargeSocAvailable,
    capabilityLookupStatus,
    capabilityEvidence,
  };
}

function uniqueSources(
  sources: CapabilityEvidenceSource[],
): CapabilityEvidenceSource[] {
  return CAPABILITY_EVIDENCE_SOURCES.filter((source) => sources.includes(source));
}

/**
 * Fail closed when applicability or availability could not be established from a
 * canonical source. A `failed` lookup classifies the vehicle CAPABILITY_UNKNOWN
 * and blocks the FULL backfill gate — it never silently degrades to
 * NO_ENERGY_SIGNAL.
 */
function resolveCapabilityLookupStatus(input: {
  mode: 'full' | 'quick';
  dimoAccessAvailable: boolean;
  probeOk: boolean;
  powertrain: RecoveryPowertrainClass;
  applicability: EnergyMechanismApplicabilityMatrix;
  relativeFuelAvailable: boolean;
  absoluteFuelAvailable: boolean;
  rechargeSocAvailable: boolean;
}): CapabilityLookupStatus {
  if (input.mode === 'quick') return 'ok';
  // No provider access: the vehicle is classified DIMO_ACCESS_FAILED, which is
  // itself a determinate outcome — capability is not the blocking dimension.
  if (!input.dimoAccessAvailable) return 'ok';
  // The runtime probe is the authoritative availability source. When it succeeds
  // the signal set is known exactly, including "no energy signals at all".
  if (input.probeOk) return 'ok';

  // Probe failed. Without a canonical powertrain class we cannot even decide
  // which mechanisms would apply, so fail closed.
  if (input.powertrain === 'UNKNOWN') return 'failed';

  // Probe failed but applicability is canonical: accept only when a canonical DB
  // source still supplies availability for at least one applicable mechanism.
  const fuelEvidence =
    input.applicability.refuel === 'APPLICABLE' &&
    (input.relativeFuelAvailable || input.absoluteFuelAvailable);
  const rechargeEvidence =
    input.applicability.recharge === 'APPLICABLE' && input.rechargeSocAvailable;

  return fuelEvidence || rechargeEvidence ? 'ok' : 'failed';
}

export function buildRecoveryVehicleInput(
  row: RecoveryVehicleDbLoad,
  availableSignals: string[] | null,
  mode: 'full' | 'quick',
): RecoveryVehicleInput {
  const resolution = resolveRecoveryVehicleCapabilities({
    row,
    availableSignals,
    mode,
  });

  return {
    vehicleId: row.vehicleId,
    label: row.label,
    tokenId: row.tokenId,
    provider: row.provider,
    dimoAccessAvailable: row.dimoAccessAvailable,
    dbVehicleMapped: true,
    existingEvents: row.existingEvents,
    powertrain: resolution.powertrain,
    relativeFuelAvailable: resolution.relativeFuelAvailable,
    absoluteFuelAvailable: resolution.absoluteFuelAvailable,
    rechargeSocAvailable: resolution.rechargeSocAvailable,
    capabilityLookupStatus: resolution.capabilityLookupStatus,
    capabilityEvidence: resolution.capabilityEvidence,
  };
}

export function applyDimoAccessToRecoveryVehicles(
  vehicles: RecoveryVehicleInput[],
  dimoAccessByTokenId: Record<number, boolean>,
): RecoveryVehicleInput[] {
  return vehicles.map((vehicle) => ({
    ...vehicle,
    dimoAccessAvailable:
      dimoAccessByTokenId[vehicle.tokenId] ?? vehicle.dimoAccessAvailable,
  }));
}

function emptySourceCounts(): Record<CapabilityEvidenceSource, number> {
  return {
    DIMO_AVAILABLE_SIGNALS: 0,
    VEHICLE_BATTERY_CAPABILITY: 0,
    SUPPLEMENTAL_WINDOW_EVENTS: 0,
  };
}

/**
 * Repository-safe aggregate provenance: how many vehicles had each capability
 * source confirm or get suppressed by canonical applicability.
 */
export function buildCapabilityEvidenceAggregate(
  vehicles: RecoveryVehicleInput[],
): CapabilityEvidenceAggregate {
  const aggregate: CapabilityEvidenceAggregate = {
    vehiclesByPowertrain: { ICE: 0, EV: 0, PHEV: 0, UNKNOWN: 0 },
    confirmedFuelSourceCounts: emptySourceCounts(),
    confirmedRechargeSourceCounts: emptySourceCounts(),
    suppressedFuelSourceCounts: emptySourceCounts(),
    suppressedRechargeSourceCounts: emptySourceCounts(),
    vehiclesWithSuppressedRechargeEvidence: 0,
    vehiclesWithSuppressedFuelEvidence: 0,
    availableSignalsProbeOk: 0,
    availableSignalsProbeFailed: 0,
    availableSignalsProbeNotAttempted: 0,
  };

  for (const vehicle of vehicles) {
    aggregate.vehiclesByPowertrain[vehicle.powertrain] += 1;

    const evidence = vehicle.capabilityEvidence;
    if (!evidence) continue;

    for (const source of evidence.confirmedFuelSources) {
      aggregate.confirmedFuelSourceCounts[source] += 1;
    }
    for (const source of evidence.confirmedRechargeSources) {
      aggregate.confirmedRechargeSourceCounts[source] += 1;
    }
    for (const source of evidence.suppressedFuelSources) {
      aggregate.suppressedFuelSourceCounts[source] += 1;
    }
    for (const source of evidence.suppressedRechargeSources) {
      aggregate.suppressedRechargeSourceCounts[source] += 1;
    }
    if (evidence.suppressedRechargeSources.length > 0) {
      aggregate.vehiclesWithSuppressedRechargeEvidence += 1;
    }
    if (evidence.suppressedFuelSources.length > 0) {
      aggregate.vehiclesWithSuppressedFuelEvidence += 1;
    }

    if (evidence.availableSignalsProbeStatus === 'ok') {
      aggregate.availableSignalsProbeOk += 1;
    } else if (evidence.availableSignalsProbeStatus === 'failed') {
      aggregate.availableSignalsProbeFailed += 1;
    } else {
      aggregate.availableSignalsProbeNotAttempted += 1;
    }
  }

  return aggregate;
}

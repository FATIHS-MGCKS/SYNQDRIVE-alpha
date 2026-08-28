import type { BatteryCapabilityStatus } from '@prisma/client';
import { resolveFleetPowertrainClass } from '@modules/vehicles/fleet-data-coverage';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '@modules/vehicle-intelligence/battery-health/capability-preflight/battery-capability-signals.registry';
import type { RecoveryExistingEnergyEvent } from './energy-events-recovery-read.repository';
import { inferFleetCapabilitiesFromEvents } from './energy-events-recovery-fleet-inference';
import type { RecoveryVehicleInput } from './energy-events-recovery-runner';

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

const LISTED_BATTERY_CAPABILITY_STATUSES = new Set<BatteryCapabilityStatus>([
  'AVAILABLE',
  'AVAILABLE_STALE',
  'AVAILABLE_NULL',
  'DEGRADED',
]);

export const SYNTHETIC_QUICK_TOKEN_ID_MIN = 100_001;
export const SYNTHETIC_QUICK_TOKEN_ID_MAX = 100_099;

export function isSyntheticQuickTokenId(tokenId: number): boolean {
  return tokenId >= SYNTHETIC_QUICK_TOKEN_ID_MIN && tokenId <= SYNTHETIC_QUICK_TOKEN_ID_MAX;
}

export function toRecoveryPowertrain(
  fuelType: string | null | undefined,
): RecoveryVehicleInput['powertrain'] {
  const fleetClass = resolveFleetPowertrainClass(fuelType);
  if (fleetClass === 'EV') return 'EV';
  if (fleetClass === 'ICE' || fleetClass === 'PHEV') return 'ICE';
  return 'UNKNOWN';
}

function resolveRechargeFromBatteryCapability(
  rows: RecoveryVehicleDbLoad['batteryCapabilities'],
): boolean {
  return rows.some(
    (row) =>
      RECHARGE_CAPABILITY_SIGNAL_KEYS.has(row.signalKey) &&
      LISTED_BATTERY_CAPABILITY_STATUSES.has(row.status),
  );
}

function resolveFromAvailableSignals(availableSignals: string[]): {
  relativeFuel: boolean;
  absoluteFuel: boolean;
  rechargeSoc: boolean;
} {
  return {
    relativeFuel: availableSignals.includes(FUEL_RELATIVE_SIGNAL),
    absoluteFuel: availableSignals.includes(FUEL_ABSOLUTE_SIGNAL),
    rechargeSoc:
      availableSignals.includes(RECHARGE_SEGMENTS_SIGNAL_KEY) ||
      availableSignals.includes(SOC_SIGNAL),
  };
}

export function resolveRecoveryVehicleCapabilities(input: {
  row: RecoveryVehicleDbLoad;
  availableSignals: string[] | null;
  mode: 'full' | 'quick';
}): Pick<
  RecoveryVehicleInput,
  | 'relativeFuelAvailable'
  | 'absoluteFuelAvailable'
  | 'rechargeSocAvailable'
  | 'powertrain'
  | 'capabilityLookupStatus'
> {
  const supplemental = inferFleetCapabilitiesFromEvents(input.row.existingEvents);
  const fromBattery = resolveRechargeFromBatteryCapability(
    input.row.batteryCapabilities,
  );
  const probeOk = input.availableSignals != null;
  const fromProbe = probeOk
    ? resolveFromAvailableSignals(input.availableSignals!)
    : {
        relativeFuel: false,
        absoluteFuel: false,
        rechargeSoc: false,
      };

  const relativeFuelAvailable =
    fromProbe.relativeFuel || supplemental.relativeFuel;
  const absoluteFuelAvailable =
    fromProbe.absoluteFuel || supplemental.absoluteFuel;
  const rechargeSocAvailable =
    fromBattery || fromProbe.rechargeSoc || supplemental.rechargeSoc;

  const powertrain =
    toRecoveryPowertrain(input.row.fuelType) !== 'UNKNOWN'
      ? toRecoveryPowertrain(input.row.fuelType)
      : supplemental.powertrain === 'EV'
        ? 'EV'
        : supplemental.powertrain === 'ICE'
          ? 'ICE'
          : 'UNKNOWN';

  const capabilityLookupStatus = resolveCapabilityLookupStatus({
    mode: input.mode,
    dimoAccessAvailable: input.row.dimoAccessAvailable,
    probeOk,
    fromBattery,
    relativeFuelAvailable,
    absoluteFuelAvailable,
    rechargeSocAvailable,
    powertrain,
  });

  return {
    relativeFuelAvailable,
    absoluteFuelAvailable,
    rechargeSocAvailable,
    powertrain,
    capabilityLookupStatus,
  };
}

function resolveCapabilityLookupStatus(input: {
  mode: 'full' | 'quick';
  dimoAccessAvailable: boolean;
  probeOk: boolean;
  fromBattery: boolean;
  relativeFuelAvailable: boolean;
  absoluteFuelAvailable: boolean;
  rechargeSocAvailable: boolean;
  powertrain: RecoveryVehicleInput['powertrain'];
}): CapabilityLookupStatus {
  if (input.mode === 'quick') return 'ok';
  if (!input.dimoAccessAvailable) return 'ok';
  if (input.probeOk) return 'ok';

  const fuelKnown = input.relativeFuelAvailable || input.absoluteFuelAvailable;
  const rechargeKnown = input.rechargeSocAvailable;

  if (input.fromBattery && rechargeKnown) {
    if (input.powertrain === 'EV') {
      return 'ok';
    }
    if (input.powertrain === 'ICE' && fuelKnown) {
      return 'ok';
    }
    if (input.powertrain === 'UNKNOWN' && (fuelKnown || rechargeKnown)) {
      return 'ok';
    }
  }

  return 'failed';
}

export function buildRecoveryVehicleInput(
  row: RecoveryVehicleDbLoad,
  availableSignals: string[] | null,
  mode: 'full' | 'quick',
): RecoveryVehicleInput {
  const capabilities = resolveRecoveryVehicleCapabilities({
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
    ...capabilities,
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

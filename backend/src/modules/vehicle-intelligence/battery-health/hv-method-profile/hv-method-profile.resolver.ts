import { BatteryCapabilityStatus } from '../battery-v2-domain';
import {
  presentBatteryDataQuality,
  type BatteryDataQualityStatus,
} from '../battery-data-quality';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '../capability-preflight/battery-capability-signals.registry';
import {
  HV_CAPACITY_METHODS,
  HV_METHOD_PROFILE_RESOLVER_VERSION,
  type HvCapacityMethod,
  type HvMethodProfile,
  type HvMethodProfileCapabilityInput,
  type HvMethodProfileUnsupportedReason,
  type ResolveHvMethodProfileInput,
} from './hv-method-profile.types';

export {
  HV_CAPACITY_METHODS,
  HV_METHOD_PROFILE_RESOLVER_VERSION,
  type HvCapacityMethod,
  type HvMethodProfile,
} from './hv-method-profile.types';

const HV_PROFILE_SIGNAL_KEYS = {
  soc: 'hv.soc',
  currentEnergy: 'hv.current_energy',
  addedEnergy: 'hv.added_energy',
  rechargeSegments: RECHARGE_SEGMENTS_SIGNAL_KEY,
  isCharging: 'hv.is_charging',
  chargingCableConnected: 'hv.cable_connected',
  providerSoh: 'hv.provider_soh',
  grossCapacity: 'hv.gross_capacity',
  packTemperature: 'hv.pack_temperature',
  chargingPower: 'hv.charging_power',
  currentPower: 'hv.current_power',
} as const;

function reason(
  code: string,
  labelDe: string,
  extra?: Partial<HvMethodProfileUnsupportedReason>,
): HvMethodProfileUnsupportedReason {
  return { code, labelDe, ...extra };
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function findCapability(
  capabilities: HvMethodProfileCapabilityInput[],
  signalKey: string,
): HvMethodProfileCapabilityInput | null {
  return capabilities.find((row) => row.signalKey === signalKey) ?? null;
}

function capabilityHasData(
  row: HvMethodProfileCapabilityInput | null,
): boolean {
  if (!row) return false;
  return (
    row.status === BatteryCapabilityStatus.AVAILABLE ||
    row.status === BatteryCapabilityStatus.AVAILABLE_STALE
  );
}

function capabilityListed(
  row: HvMethodProfileCapabilityInput | null,
): boolean {
  if (!row) return false;
  return (
    row.status === BatteryCapabilityStatus.AVAILABLE ||
    row.status === BatteryCapabilityStatus.AVAILABLE_STALE ||
    row.status === BatteryCapabilityStatus.AVAILABLE_NULL
  );
}

function unsupportedReasonForSignal(
  signalKey: string,
  row: HvMethodProfileCapabilityInput | null,
): HvMethodProfileUnsupportedReason | null {
  if (!row) {
    return reason('signal_not_preflighted', 'Signal nicht preflighted', {
      signalKey,
    });
  }
  switch (row.status) {
    case BatteryCapabilityStatus.NOT_LISTED:
      return reason('signal_not_listed', 'Signal bei Provider nicht gelistet', {
        signalKey,
      });
    case BatteryCapabilityStatus.UNAVAILABLE:
      return reason('signal_unavailable', 'Signal dauerhaft nicht verfügbar', {
        signalKey,
      });
    case BatteryCapabilityStatus.DEGRADED:
      return reason('signal_degraded', 'Signal vorübergehend degraded', {
        signalKey,
      });
    case BatteryCapabilityStatus.QUERY_ERROR:
      return reason('signal_query_error', 'Preflight-Abfrage fehlgeschlagen', {
        signalKey,
      });
    case BatteryCapabilityStatus.AVAILABLE_NULL:
      return reason('signal_null_value', 'Signal gelistet, aber ohne Wert', {
        signalKey,
      });
    default:
      return null;
  }
}

function mapCapabilityStatusToDataQuality(
  status: BatteryCapabilityStatus,
): BatteryDataQualityStatus {
  switch (status) {
    case BatteryCapabilityStatus.AVAILABLE:
      return 'VERIFIED';
    case BatteryCapabilityStatus.AVAILABLE_STALE:
      return 'STALE';
    case BatteryCapabilityStatus.AVAILABLE_NULL:
      return 'MISSED';
    case BatteryCapabilityStatus.DEGRADED:
      return 'STALE';
    case BatteryCapabilityStatus.NOT_LISTED:
    case BatteryCapabilityStatus.UNAVAILABLE:
      return 'UNAVAILABLE';
    case BatteryCapabilityStatus.QUERY_ERROR:
      return 'UNAVAILABLE';
    default:
      return 'UNAVAILABLE';
  }
}

function aggregateDataQuality(
  capabilities: HvMethodProfileCapabilityInput[],
): BatteryDataQualityStatus {
  const hvRows = capabilities.filter(
    (row) =>
      (row.signalKey.startsWith('hv.') ||
        row.signalKey === RECHARGE_SEGMENTS_SIGNAL_KEY) &&
      row.status !== BatteryCapabilityStatus.NOT_LISTED,
  );
  if (hvRows.length === 0) return 'UNAVAILABLE';

  const rank: Record<BatteryDataQualityStatus, number> = {
    VERIFIED: 0,
    ESTIMATED: 1,
    PROXY: 2,
    EXPERIMENTAL: 3,
    STALE: 4,
    MISSED: 5,
    UNAVAILABLE: 6,
    UNSUPPORTED: 7,
    LEGACY_UNVERIFIED: 8,
  };

  let worst: BatteryDataQualityStatus = 'VERIFIED';
  for (const row of hvRows) {
    const mapped = mapCapabilityStatusToDataQuality(row.status);
    if (rank[mapped] > rank[worst]) {
      worst = mapped;
    }
  }
  return worst;
}

function pushUnsupportedMethod(
  method: HvCapacityMethod,
  labelDe: string,
  bucket: HvMethodProfileUnsupportedReason[],
) {
  if (bucket.some((row) => row.method === method)) return;
  bucket.push(reason('capacity_method_unsupported', labelDe, { method }));
}

function resolveSupportedCapacityMethods(input: {
  socAvailable: boolean;
  currentEnergyAvailable: boolean;
  addedEnergyAvailable: boolean;
  rechargeSegmentsAvailable: boolean;
  providerSohAvailable: boolean;
  grossCapacityAvailable: boolean;
  unsupportedReasons: HvMethodProfileUnsupportedReason[];
}): HvCapacityMethod[] {
  const supported: HvCapacityMethod[] = [];

  if (input.socAvailable && input.currentEnergyAvailable) {
    supported.push('M2_CURRENT_ENERGY_SOC');
  } else {
    pushUnsupportedMethod(
      'M2_CURRENT_ENERGY_SOC',
      'M2 benötigt SOC und Current Energy mit Daten',
      input.unsupportedReasons,
    );
  }

  if (
    input.rechargeSegmentsAvailable &&
    input.addedEnergyAvailable &&
    input.socAvailable
  ) {
    supported.push('M3_ADDED_ENERGY_DELTA_SOC');
  } else {
    pushUnsupportedMethod(
      'M3_ADDED_ENERGY_DELTA_SOC',
      'M3 benötigt Recharge-Segmente, Added Energy und SOC',
      input.unsupportedReasons,
    );
  }

  if (input.providerSohAvailable) {
    supported.push('PROVIDER_HV_SOH');
  } else {
    pushUnsupportedMethod(
      'PROVIDER_HV_SOH',
      'Provider-SOH nicht verfügbar',
      input.unsupportedReasons,
    );
  }

  if (input.rechargeSegmentsAvailable && input.addedEnergyAvailable) {
    supported.push('SESSION_CHARGE_CAPACITY');
  } else {
    pushUnsupportedMethod(
      'SESSION_CHARGE_CAPACITY',
      'Session-Capacity benötigt Recharge-Segmente und Added Energy',
      input.unsupportedReasons,
    );
  }

  if (input.grossCapacityAvailable) {
    supported.push('GROSS_CAPACITY_REFERENCE');
  } else {
    pushUnsupportedMethod(
      'GROSS_CAPACITY_REFERENCE',
      'Gross-Capacity-Signal nicht verfügbar',
      input.unsupportedReasons,
    );
  }

  return supported;
}

/**
 * Builds canonical HV method profile from persisted VehicleBatteryCapability rows.
 * No capacity calculation — capability truth only.
 */
export function resolveHvMethodProfile(
  input: ResolveHvMethodProfileInput,
): HvMethodProfile {
  const now = input.now ?? new Date();
  const capabilities = input.capabilities;
  const unsupported: HvMethodProfileUnsupportedReason[] = [];

  const socRow = findCapability(capabilities, HV_PROFILE_SIGNAL_KEYS.soc);
  const currentEnergyRow = findCapability(
    capabilities,
    HV_PROFILE_SIGNAL_KEYS.currentEnergy,
  );
  const addedEnergyRow = findCapability(
    capabilities,
    HV_PROFILE_SIGNAL_KEYS.addedEnergy,
  );
  const rechargeRow = findCapability(
    capabilities,
    HV_PROFILE_SIGNAL_KEYS.rechargeSegments,
  );
  const isChargingRow = findCapability(
    capabilities,
    HV_PROFILE_SIGNAL_KEYS.isCharging,
  );
  const cableRow = findCapability(
    capabilities,
    HV_PROFILE_SIGNAL_KEYS.chargingCableConnected,
  );
  const providerSohRow = findCapability(
    capabilities,
    HV_PROFILE_SIGNAL_KEYS.providerSoh,
  );
  const grossCapacityRow = findCapability(
    capabilities,
    HV_PROFILE_SIGNAL_KEYS.grossCapacity,
  );
  const packTemperatureRow = findCapability(
    capabilities,
    HV_PROFILE_SIGNAL_KEYS.packTemperature,
  );
  const chargingPowerRow = findCapability(
    capabilities,
    HV_PROFILE_SIGNAL_KEYS.chargingPower,
  );
  const currentPowerRow = findCapability(
    capabilities,
    HV_PROFILE_SIGNAL_KEYS.currentPower,
  );

  const socAvailable = capabilityHasData(socRow);
  const currentEnergyAvailable = capabilityHasData(currentEnergyRow);
  const addedEnergyAvailable = capabilityHasData(addedEnergyRow);
  const rechargeSegmentsAvailable = capabilityHasData(rechargeRow);
  const isChargingAvailable = capabilityHasData(isChargingRow);
  const chargingCableConnectedAvailable = capabilityHasData(cableRow);
  const providerSohAvailable = capabilityHasData(providerSohRow);
  const grossCapacityAvailable = capabilityHasData(grossCapacityRow);
  const packTemperatureAvailable = capabilityHasData(packTemperatureRow);
  const chargingPowerAvailable = capabilityHasData(chargingPowerRow);
  const currentPowerAvailable = capabilityHasData(currentPowerRow);

  const signalChecks: Array<[string, HvMethodProfileCapabilityInput | null]> = [
    [HV_PROFILE_SIGNAL_KEYS.soc, socRow],
    [HV_PROFILE_SIGNAL_KEYS.currentEnergy, currentEnergyRow],
    [HV_PROFILE_SIGNAL_KEYS.addedEnergy, addedEnergyRow],
    [HV_PROFILE_SIGNAL_KEYS.rechargeSegments, rechargeRow],
    [HV_PROFILE_SIGNAL_KEYS.isCharging, isChargingRow],
    [HV_PROFILE_SIGNAL_KEYS.chargingCableConnected, cableRow],
    [HV_PROFILE_SIGNAL_KEYS.providerSoh, providerSohRow],
    [HV_PROFILE_SIGNAL_KEYS.grossCapacity, grossCapacityRow],
    [HV_PROFILE_SIGNAL_KEYS.packTemperature, packTemperatureRow],
    [HV_PROFILE_SIGNAL_KEYS.chargingPower, chargingPowerRow],
    [HV_PROFILE_SIGNAL_KEYS.currentPower, currentPowerRow],
  ];

  for (const [signalKey, row] of signalChecks) {
    if (capabilityHasData(row) || capabilityListed(row)) continue;
    const unsupportedReason = unsupportedReasonForSignal(signalKey, row);
    if (unsupportedReason) {
      unsupported.push(unsupportedReason);
    }
  }

  const supportedCapacityMethods = resolveSupportedCapacityMethods({
    socAvailable,
    currentEnergyAvailable,
    addedEnergyAvailable,
    rechargeSegmentsAvailable,
    providerSohAvailable,
    grossCapacityAvailable,
    unsupportedReasons: unsupported,
  });

  const checkedAtTimes = capabilities
    .map((row) => parseDate(row.checkedAt)?.getTime())
    .filter((ms): ms is number => ms != null);
  const lastCheckedAt =
    checkedAtTimes.length > 0
      ? new Date(Math.max(...checkedAtTimes)).toISOString()
      : null;

  const aggregateQuality = aggregateDataQuality(capabilities);

  return {
    resolverVersion: HV_METHOD_PROFILE_RESOLVER_VERSION,
    vehicleId: input.vehicleId,
    resolvedAt: now.toISOString(),
    socAvailable,
    currentEnergyAvailable,
    addedEnergyAvailable,
    rechargeSegmentsAvailable,
    isChargingAvailable,
    chargingCableConnectedAvailable,
    providerSohAvailable,
    grossCapacityAvailable,
    packTemperatureAvailable,
    chargingPowerAvailable,
    currentPowerAvailable,
    supportedCapacityMethods,
    unsupportedReasons: unsupported,
    lastCheckedAt,
    dataQuality: presentBatteryDataQuality(aggregateQuality, lastCheckedAt),
  };
}

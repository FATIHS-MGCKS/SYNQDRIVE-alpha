import type { BatteryCapabilityStatus } from '../battery-v2-domain';
import type { BatteryDataQualityPresentation } from '../battery-data-quality';

export const HV_METHOD_PROFILE_RESOLVER_VERSION = '1.0.0';

export const HV_CAPACITY_METHODS = [
  'M2_CURRENT_ENERGY_SOC',
  'M3_ADDED_ENERGY_DELTA_SOC',
  'PROVIDER_HV_SOH',
  'SESSION_CHARGE_CAPACITY',
  'GROSS_CAPACITY_REFERENCE',
] as const;

export type HvCapacityMethod = (typeof HV_CAPACITY_METHODS)[number];

export interface HvMethodProfileUnsupportedReason {
  code: string;
  labelDe: string;
  signalKey?: string;
  method?: HvCapacityMethod;
}

export interface HvMethodProfileCapabilityInput {
  signalKey: string;
  status: BatteryCapabilityStatus;
  checkedAt: Date | string;
  lastSeenAt?: Date | string | null;
  sourceTimestamp?: Date | string | null;
  lastValue?: number | null;
}

export interface ResolveHvMethodProfileInput {
  vehicleId: string;
  capabilities: HvMethodProfileCapabilityInput[];
  now?: Date;
}

export interface HvMethodProfile {
  resolverVersion: string;
  vehicleId: string;
  resolvedAt: string;
  socAvailable: boolean;
  currentEnergyAvailable: boolean;
  addedEnergyAvailable: boolean;
  rechargeSegmentsAvailable: boolean;
  isChargingAvailable: boolean;
  chargingCableConnectedAvailable: boolean;
  providerSohAvailable: boolean;
  grossCapacityAvailable: boolean;
  packTemperatureAvailable: boolean;
  chargingPowerAvailable: boolean;
  currentPowerAvailable: boolean;
  supportedCapacityMethods: HvCapacityMethod[];
  unsupportedReasons: HvMethodProfileUnsupportedReason[];
  lastCheckedAt: string | null;
  dataQuality: BatteryDataQualityPresentation;
}

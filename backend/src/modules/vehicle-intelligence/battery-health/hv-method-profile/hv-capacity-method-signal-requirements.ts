import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '../capability-preflight/battery-capability-signals.registry';
import { HV_ERD_SIGNAL_KEYS } from '../hv-erd-capability-signal-keys';
import { HV_CAPACITY_METHODS, type HvCapacityMethod } from './hv-method-profile.types';

/**
 * Single authority for which capability signal keys each HV capacity method requires.
 * Must stay aligned with `resolveSupportedCapacityMethods()` in hv-method-profile.resolver.ts.
 */
export const HV_CAPACITY_METHOD_REQUIRED_SIGNAL_KEYS: Record<
  HvCapacityMethod,
  readonly string[]
> = {
  M2_CURRENT_ENERGY_SOC: [HV_ERD_SIGNAL_KEYS.soc, 'hv.current_energy'],
  M3_ADDED_ENERGY_DELTA_SOC: [
    HV_ERD_SIGNAL_KEYS.rechargeSegments,
    HV_ERD_SIGNAL_KEYS.addedEnergy,
    HV_ERD_SIGNAL_KEYS.soc,
  ],
  PROVIDER_HV_SOH: ['hv.provider_soh'],
  SESSION_CHARGE_CAPACITY: [HV_ERD_SIGNAL_KEYS.rechargeSegments, HV_ERD_SIGNAL_KEYS.addedEnergy],
  GROSS_CAPACITY_REFERENCE: ['hv.gross_capacity'],
};

export function assertHvCapacityMethodRequirementParity(): void {
  for (const method of HV_CAPACITY_METHODS) {
    const keys = HV_CAPACITY_METHOD_REQUIRED_SIGNAL_KEYS[method];
    if (!keys || keys.length === 0) {
      throw new Error(`Missing required signal keys for method ${method}`);
    }
  }
}

export function hvCapacityMethodsRequiringSignal(signalKey: string): HvCapacityMethod[] {
  return HV_CAPACITY_METHODS.filter((method) =>
    HV_CAPACITY_METHOD_REQUIRED_SIGNAL_KEYS[method].includes(signalKey),
  );
}

export function methodRequiresSignal(method: HvCapacityMethod, signalKey: string): boolean {
  return HV_CAPACITY_METHOD_REQUIRED_SIGNAL_KEYS[method].includes(signalKey);
}

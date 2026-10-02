import {
  evaluateErdReconcileEligibility,
  vehicleHasErdFallbackTelemetryFromCapabilityKeys,
  HV_ERD_SOC_SIGNAL_KEY,
  HV_ERD_FALLBACK_CORROBORATING_SIGNAL_KEYS,
} from './hv-erd-reconcile-eligibility.policy';
import { HV_ERD_SIGNAL_KEYS } from '../hv-erd-capability-signal-keys';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '../capability-preflight/battery-capability-signals.registry';

describe('hv-erd-reconcile-eligibility.policy (E4)', () => {
  it('ongoing session is always eligible', () => {
    const result = evaluateErdReconcileEligibility({
      fuelType: 'ELECTRIC',
      hasOngoingHvChargeSession: true,
      nativeRechargeCapable: false,
      capabilityKeysAvailable: new Set(),
    });
    expect(result).toEqual({ eligible: true, category: 'ongoing_hv_charge_session' });
  });

  it('native-capable EV is eligible without is_charging', () => {
    const result = evaluateErdReconcileEligibility({
      fuelType: 'ELECTRIC',
      hasOngoingHvChargeSession: false,
      nativeRechargeCapable: true,
      capabilityKeysAvailable: new Set([RECHARGE_SEGMENTS_SIGNAL_KEY]),
    });
    expect(result).toEqual({ eligible: true, category: 'native_recharge_capability' });
  });

  it('SOC + cable without is_charging is fallback-eligible', () => {
    expect(
      vehicleHasErdFallbackTelemetryFromCapabilityKeys(
        new Set([HV_ERD_SOC_SIGNAL_KEY, HV_ERD_SIGNAL_KEYS.cableConnected]),
      ),
    ).toBe(true);
  });

  it('SOC + hv.charging_power is periodically fallback-eligible (E3 authority)', () => {
    expect(
      vehicleHasErdFallbackTelemetryFromCapabilityKeys(
        new Set([HV_ERD_SOC_SIGNAL_KEY, HV_ERD_SIGNAL_KEYS.chargingPower]),
      ),
    ).toBe(true);
    expect(HV_ERD_FALLBACK_CORROBORATING_SIGNAL_KEYS).toContain(HV_ERD_SIGNAL_KEYS.chargingPower);
    expect(HV_ERD_FALLBACK_CORROBORATING_SIGNAL_KEYS).not.toContain(HV_ERD_SIGNAL_KEYS.currentPower);
  });

  it('SOC + hv.current_power only is NOT fallback-eligible under E3 authority', () => {
    expect(
      vehicleHasErdFallbackTelemetryFromCapabilityKeys(
        new Set([HV_ERD_SOC_SIGNAL_KEY, HV_ERD_SIGNAL_KEYS.currentPower]),
      ),
    ).toBe(false);
  });

  it('SOC alone is not fallback-eligible', () => {
    const result = evaluateErdReconcileEligibility({
      fuelType: 'ELECTRIC',
      hasOngoingHvChargeSession: false,
      nativeRechargeCapable: false,
      capabilityKeysAvailable: new Set([HV_ERD_SOC_SIGNAL_KEY]),
    });
    expect(result).toEqual({ eligible: false, reason: 'insufficient_telemetry_capability' });
  });

  it('ICE-only is excluded from fallback eligibility', () => {
    const result = evaluateErdReconcileEligibility({
      fuelType: 'DIESEL',
      hasOngoingHvChargeSession: false,
      nativeRechargeCapable: false,
      capabilityKeysAvailable: new Set([
        HV_ERD_SOC_SIGNAL_KEY,
        HV_ERD_SIGNAL_KEYS.isCharging,
      ]),
    });
    expect(result).toEqual({ eligible: false, reason: 'ice_only' });
  });
});

import {
  evaluateErdReconcileEligibility,
  vehicleHasErdFallbackTelemetryFromCapabilityKeys,
  HV_ERD_SOC_SIGNAL_KEY,
} from './hv-erd-reconcile-eligibility.policy';
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
        new Set([HV_ERD_SOC_SIGNAL_KEY, 'hv.cable_connected']),
      ),
    ).toBe(true);
    const result = evaluateErdReconcileEligibility({
      fuelType: 'ELECTRIC',
      hasOngoingHvChargeSession: false,
      nativeRechargeCapable: false,
      capabilityKeysAvailable: new Set([
        HV_ERD_SOC_SIGNAL_KEY,
        'hv.cable_connected',
      ]),
    });
    expect(result).toEqual({
      eligible: true,
      category: 'telemetry_fallback_capability',
    });
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
        'hv.is_charging',
      ]),
    });
    expect(result).toEqual({ eligible: false, reason: 'ice_only' });
  });
});

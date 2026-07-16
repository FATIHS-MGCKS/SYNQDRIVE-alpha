import { buildDrivingImpactSourceProvenance } from './driving-impact-provenance';
import {
  buildDrivingImpactLoadComponents,
  DRIVING_IMPACT_LOAD_COMPONENTS_VERSION,
  resolvePowertrainIsEv,
} from './driving-impact-load-components';
import type { BrakingProvenanceSummary } from './driving-impact-braking-provenance';

describe('driving-impact-load-components', () => {
  const brakingProvenanceClean: BrakingProvenanceSummary = {
    version: 'braking-provenance-v1',
    p95NegativeDecelMeasured: 6.2,
    p95NegativeDecelProxy: 0,
    meanBrakeEnergyProxyPerKm: 0,
    proxyKinematicShare: 0.1,
    reconstructedKinematicCount: 0,
    measuredDeltaKinematicCount: 8,
    proxyKinematicCount: 1,
  };

  const brakingProvenanceProxyHeavy: BrakingProvenanceSummary = {
    version: 'braking-provenance-v1',
    p95NegativeDecelMeasured: 0,
    p95NegativeDecelProxy: 7.8,
    meanBrakeEnergyProxyPerKm: 120,
    proxyKinematicShare: 0.85,
    reconstructedKinematicCount: 1,
    measuredDeltaKinematicCount: 0,
    proxyKinematicCount: 12,
  };

  function completeIceInput() {
    const provenance = buildDrivingImpactSourceProvenance({
      hardwareProfile: 'LTE_R1',
      capabilityVersion: 'cap-preflight-v1',
      modelVersion: 'v1.1.0',
      nativeEventCount: 24,
      hfEventCount: 0,
      estimatedProxyEventCount: 0,
      contextOnlyEventCount: 0,
      hasMeasuredRouteContext: true,
      measurementCoverage: 0.92,
    });

    return {
      provenance,
      brakingProvenance: brakingProvenanceClean,
      scores: {
        longitudinalStressScore: 42,
        brakingStressScore: 55,
        stopGoStressScore: 38,
        highSpeedStressScore: 28,
        thermalBrakeStressScore: 48,
      },
      routeContext: { citySharePct: 35, highwaySharePct: 45 },
      engineSignals: {
        avgEngineLoad: 48,
        avgRpm: 2200,
        avgThrottlePosition: 32,
        kickdownPer100Km: 1.2,
        launchLikePer100Km: 0.4,
      },
      powertrain: { fuelType: 'PETROL', isEv: false },
      eventCounts: { nativeEventCount: 24, hfEventCount: 0 },
    };
  }

  it('builds all components for a complete ICE vehicle', () => {
    const result = buildDrivingImpactLoadComponents(completeIceInput());

    expect(result.version).toBe(DRIVING_IMPACT_LOAD_COMPONENTS_VERSION);
    expect(result.longitudinalLoad.score).toBe(42);
    expect(result.longitudinalLoad.assessability).toBe('ASSESSABLE');
    expect(result.brakingLoad.score).toBe(55);
    expect(result.engineLoad.assessability).toBe('ASSESSABLE');
    expect(result.engineLoad.reasons).toContain('ICE_ENGINE_SIGNALS_PRESENT');
    expect(result.transmissionLoad?.assessability).toBe('LIMITED');
    expect(result.tireLoad.score).not.toBeNull();
    expect(result.dataQuality.score).toBeGreaterThan(50);

    expect(result.vehicleLoad.score).not.toBeNull();
    expect(result.vehicleLoad.coverage).toBe(1);
    expect(result.vehicleLoad.essentialComponentsAssessed).toBe(4);
    expect(result.vehicleLoad.assessability).not.toBe('INSUFFICIENT_DATA');
  });

  it('marks engine and transmission unsupported for BEV', () => {
    const base = completeIceInput();
    const result = buildDrivingImpactLoadComponents({
      ...base,
      powertrain: { fuelType: 'ELECTRIC', isEv: true },
      engineSignals: {
        avgEngineLoad: null,
        avgRpm: null,
        avgThrottlePosition: null,
        kickdownPer100Km: 0,
        launchLikePer100Km: 0,
      },
    });

    expect(result.engineLoad.assessability).toBe('UNSUPPORTED');
    expect(result.engineLoad.sourceQuality).toBe('UNSUPPORTED');
    expect(result.engineLoad.score).toBeNull();
    expect(result.transmissionLoad?.assessability).toBe('UNSUPPORTED');

    expect(result.vehicleLoad.score).not.toBeNull();
    expect(result.vehicleLoad.coverage).toBe(1);
    expect(result.longitudinalLoad.score).toBe(42);
  });

  it('limits restricted vehicle with proxy braking and low coverage', () => {
    const provenance = buildDrivingImpactSourceProvenance({
      hardwareProfile: 'SMART5',
      capabilityVersion: 'cap-preflight-v1',
      modelVersion: 'v1.1.0',
      nativeEventCount: 0,
      hfEventCount: 6,
      estimatedProxyEventCount: 10,
      contextOnlyEventCount: 0,
      hasMeasuredRouteContext: false,
      measurementCoverage: 0.18,
    });

    const result = buildDrivingImpactLoadComponents({
      provenance,
      brakingProvenance: brakingProvenanceProxyHeavy,
      scores: {
        longitudinalStressScore: 18,
        brakingStressScore: 62,
        stopGoStressScore: 22,
        highSpeedStressScore: 8,
        thermalBrakeStressScore: 40,
      },
      routeContext: { citySharePct: null, highwaySharePct: null },
      engineSignals: {
        avgEngineLoad: null,
        avgRpm: null,
        avgThrottlePosition: null,
        kickdownPer100Km: 0,
        launchLikePer100Km: 0,
      },
      powertrain: { fuelType: 'DIESEL', isEv: false },
      eventCounts: { nativeEventCount: 0, hfEventCount: 6 },
    });

    expect(result.brakingLoad.assessability).toBe('LIMITED');
    expect(result.brakingLoad.reasons).toContain('BRAKING_PROXY_KINEMATICS');
    expect(result.speedLoad.assessability).toBe('LIMITED');
    expect(result.engineLoad.assessability).toBe('INSUFFICIENT_DATA');
    expect(result.dataQuality.assessability).toBe('LIMITED');
    expect(result.dataQuality.reasons).toContain('LOW_MEASUREMENT_COVERAGE');

    expect(result.vehicleLoad.score).not.toBeNull();
    expect(result.vehicleLoad.coverage).toBe(1);
    expect(result.vehicleLoad.assessability).toBe('LIMITED');
  });

  it('does not fabricate vehicle load when essential components are insufficient', () => {
    const provenance = buildDrivingImpactSourceProvenance({
      hardwareProfile: 'UNKNOWN',
      capabilityVersion: null,
      modelVersion: 'v1.1.0',
      nativeEventCount: 0,
      hfEventCount: 0,
      estimatedProxyEventCount: 0,
      contextOnlyEventCount: 0,
      hasMeasuredRouteContext: false,
      measurementCoverage: null,
    });

    expect(provenance.healthEligibility).toBe('NONE');

    const result = buildDrivingImpactLoadComponents({
      provenance,
      brakingProvenance: brakingProvenanceProxyHeavy,
      scores: {
        longitudinalStressScore: 0,
        brakingStressScore: 0,
        stopGoStressScore: 0,
        highSpeedStressScore: 0,
        thermalBrakeStressScore: 0,
      },
      routeContext: { citySharePct: null, highwaySharePct: null },
      engineSignals: {
        avgEngineLoad: null,
        avgRpm: null,
        avgThrottlePosition: null,
        kickdownPer100Km: 0,
        launchLikePer100Km: 0,
      },
      powertrain: { fuelType: 'PETROL', isEv: false },
      eventCounts: { nativeEventCount: 0, hfEventCount: 0 },
    });

    expect(result.longitudinalLoad.assessability).toBe('INSUFFICIENT_DATA');
    expect(result.brakingLoad.assessability).toBe('INSUFFICIENT_DATA');
    expect(result.vehicleLoad.score).toBeNull();
    expect(result.vehicleLoad.coverage).toBe(0);
    expect(result.vehicleLoad.reasons).toContain('ESSENTIAL_COMPONENT_MISSING');
  });

  it('resolvePowertrainIsEv detects electric fuel types', () => {
    expect(resolvePowertrainIsEv('ELECTRIC')).toBe(true);
    expect(resolvePowertrainIsEv('BEV')).toBe(true);
    expect(resolvePowertrainIsEv('PETROL')).toBe(false);
  });

  it('never encodes driver conduct in component reasons', () => {
    const result = buildDrivingImpactLoadComponents(completeIceInput());
    const allReasons = [
      ...result.longitudinalLoad.reasons,
      ...result.brakingLoad.reasons,
      ...result.vehicleLoad.reasons,
    ];
    for (const reason of allReasons) {
      expect(reason).not.toMatch(/driver|conduct|fahrer/i);
    }
  });
});

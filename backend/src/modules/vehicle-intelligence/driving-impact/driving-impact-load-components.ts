/**
 * Driving Impact structured load components (P43).
 *
 * Separates vehicle load into assessable components with explicit provenance,
 * coverage, and no driver-conduct inference.
 */

import { DRIVING_IMPACT_CONFIG as C } from './driving-impact.config';
import type { BrakingProvenanceSummary } from './driving-impact-braking-provenance';
import type { DrivingImpactSourceProvenance } from './driving-impact-provenance';
import { classifyStressLevel, type StressLevel } from './stress-level.util';
import { capLinear, computeDrivingStressScore } from './driving-impact-scorer';

export const DRIVING_IMPACT_LOAD_COMPONENTS_VERSION = 'impact-load-components-v1';

export type LoadComponentEvidenceStrength = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
export type LoadComponentSourceQuality =
  | 'MEASURED'
  | 'PROVIDER_CLASSIFIED'
  | 'RECONSTRUCTED'
  | 'ESTIMATED_PROXY'
  | 'CONTEXT_ONLY'
  | 'UNSUPPORTED';
export type LoadComponentAssessability =
  | 'ASSESSABLE'
  | 'LIMITED'
  | 'INSUFFICIENT_DATA'
  | 'UNSUPPORTED'
  | 'NOT_APPLICABLE';

export type LoadComponentReasonCode =
  | 'PROVIDER_CLASSIFIED_EVENTS'
  | 'RECONSTRUCTED_EVENTS'
  | 'MIXED_EVENT_SOURCES'
  | 'ESTIMATED_PROXY_DOMINANT'
  | 'LOW_MEASUREMENT_COVERAGE'
  | 'NO_ROUTE_ENRICHMENT'
  | 'ICE_ENGINE_SIGNALS_PRESENT'
  | 'NO_ENGINE_SIGNALS'
  | 'POWERTRAIN_NOT_APPLICABLE'
  | 'KICKDOWN_TRANSMISSION_PROXY'
  | 'BEHAVIORAL_STRESS_ONLY'
  | 'COMPOSITE_RENORMALIZED'
  | 'ESSENTIAL_COMPONENT_MISSING'
  | 'HIGH_NATIVE_COVERAGE'
  | 'BRAKING_PROXY_KINEMATICS';

export type DrivingImpactLoadComponent = {
  level: StressLevel | null;
  score: number | null;
  evidenceStrength: LoadComponentEvidenceStrength;
  sourceQuality: LoadComponentSourceQuality;
  assessability: LoadComponentAssessability;
  reasons: LoadComponentReasonCode[];
};

export type DrivingImpactVehicleLoadSummary = {
  level: StressLevel | null;
  score: number | null;
  coverage: number;
  essentialComponentsAssessed: number;
  essentialComponentsTotal: number;
  evidenceStrength: LoadComponentEvidenceStrength;
  assessability: LoadComponentAssessability;
  reasons: LoadComponentReasonCode[];
};

export type DrivingImpactLoadComponents = {
  version: string;
  longitudinalLoad: DrivingImpactLoadComponent;
  brakingLoad: DrivingImpactLoadComponent;
  stopGoLoad: DrivingImpactLoadComponent;
  speedLoad: DrivingImpactLoadComponent;
  thermalLoad: DrivingImpactLoadComponent;
  engineLoad: DrivingImpactLoadComponent;
  transmissionLoad?: DrivingImpactLoadComponent;
  tireLoad: DrivingImpactLoadComponent;
  dataQuality: DrivingImpactLoadComponent;
  vehicleLoad: DrivingImpactVehicleLoadSummary;
};

export type DrivingImpactLoadComponentsInput = {
  provenance: DrivingImpactSourceProvenance;
  brakingProvenance: BrakingProvenanceSummary;
  scores: {
    longitudinalStressScore: number;
    brakingStressScore: number;
    stopGoStressScore: number;
    highSpeedStressScore: number;
    thermalBrakeStressScore: number;
  };
  routeContext: {
    citySharePct: number | null;
    highwaySharePct: number | null;
  };
  engineSignals: {
    avgEngineLoad: number | null;
    avgRpm: number | null;
    avgThrottlePosition: number | null;
    kickdownPer100Km: number;
    launchLikePer100Km: number;
  };
  powertrain: {
    fuelType: string | null;
    isEv: boolean;
  };
  eventCounts: {
    nativeEventCount: number;
    hfEventCount: number;
  };
};

const ESSENTIAL_COMPONENT_KEYS = [
  'longitudinalLoad',
  'brakingLoad',
  'stopGoLoad',
  'speedLoad',
] as const;

type EssentialComponentKey = (typeof ESSENTIAL_COMPONENT_KEYS)[number];

const ESSENTIAL_WEIGHTS: Record<EssentialComponentKey, number> = {
  longitudinalLoad: C.DRIVING_STRESS_WEIGHTS.longitudinal,
  brakingLoad: C.DRIVING_STRESS_WEIGHTS.braking,
  stopGoLoad: C.DRIVING_STRESS_WEIGHTS.stopGo,
  speedLoad: C.DRIVING_STRESS_WEIGHTS.highSpeed,
};

function isEvPowertrain(fuelType: string | null | undefined): boolean {
  if (!fuelType) return false;
  const normalized = fuelType.toUpperCase();
  return normalized === 'ELECTRIC' || normalized === 'BEV' || normalized === 'EV';
}

function resolveEvidenceStrength(
  provenance: DrivingImpactSourceProvenance,
  componentProxyShare?: number,
): LoadComponentEvidenceStrength {
  if (provenance.healthEligibility === 'NONE') return 'NONE';
  if (componentProxyShare != null && componentProxyShare >= 0.5) return 'LOW';
  if (provenance.healthEligibility === 'HIGH') return 'HIGH';
  if (provenance.healthEligibility === 'MEDIUM') return 'MEDIUM';
  return 'LOW';
}

function resolveBehavioralSourceQuality(
  provenance: DrivingImpactSourceProvenance,
): LoadComponentSourceQuality {
  if (provenance.primarySource === 'PROVIDER_CLASSIFIED') return 'PROVIDER_CLASSIFIED';
  if (provenance.primarySource === 'RECONSTRUCTED') return 'RECONSTRUCTED';
  if (provenance.primarySource === 'MIXED') return 'RECONSTRUCTED';
  if (provenance.primarySource === 'MEASURED') return 'MEASURED';
  if (provenance.primarySource === 'ESTIMATED_PROXY') return 'ESTIMATED_PROXY';
  if (provenance.estimatedProxyShare >= 0.5) return 'ESTIMATED_PROXY';
  return 'CONTEXT_ONLY';
}

function behavioralReasons(
  provenance: DrivingImpactSourceProvenance,
  hasRouteEnrichment: boolean,
): LoadComponentReasonCode[] {
  const reasons: LoadComponentReasonCode[] = [];
  if (provenance.primarySource === 'PROVIDER_CLASSIFIED') {
    reasons.push('PROVIDER_CLASSIFIED_EVENTS');
  } else if (provenance.primarySource === 'RECONSTRUCTED') {
    reasons.push('RECONSTRUCTED_EVENTS');
  } else if (provenance.primarySource === 'MIXED') {
    reasons.push('MIXED_EVENT_SOURCES');
  } else if (provenance.primarySource === 'STRESS_ONLY') {
    reasons.push('BEHAVIORAL_STRESS_ONLY');
  }
  if (provenance.estimatedProxyShare >= 0.5) {
    reasons.push('ESTIMATED_PROXY_DOMINANT');
  }
  if (
    provenance.measurementCoverage != null &&
    provenance.measurementCoverage < 0.5
  ) {
    reasons.push('LOW_MEASUREMENT_COVERAGE');
  }
  if (!hasRouteEnrichment) {
    reasons.push('NO_ROUTE_ENRICHMENT');
  }
  if (provenance.nativeEventCount > 0 && provenance.healthEligibility === 'HIGH') {
    reasons.push('HIGH_NATIVE_COVERAGE');
  }
  return reasons;
}

function assessBehavioralComponent(
  score: number,
  provenance: DrivingImpactSourceProvenance,
  hasRouteEnrichment: boolean,
  extraReasons: LoadComponentReasonCode[] = [],
  proxyShare?: number,
): DrivingImpactLoadComponent {
  const sourceQuality = resolveBehavioralSourceQuality(provenance);
  const evidenceStrength = resolveEvidenceStrength(provenance, proxyShare);
  const reasons = [...behavioralReasons(provenance, hasRouteEnrichment), ...extraReasons];

  let assessability: LoadComponentAssessability = 'ASSESSABLE';
  if (provenance.primarySource === 'STRESS_ONLY' && provenance.contextOnlyShare >= 0.9) {
    assessability = 'LIMITED';
  }
  if (evidenceStrength === 'LOW' || provenance.healthEligibility === 'LOW') {
    assessability = 'LIMITED';
  }
  if (evidenceStrength === 'NONE') {
    assessability = 'INSUFFICIENT_DATA';
  }

  return {
    level: classifyStressLevel(score),
    score,
    evidenceStrength,
    sourceQuality,
    assessability,
    reasons,
  };
}

function buildLongitudinalLoad(
  input: DrivingImpactLoadComponentsInput,
  hasRouteEnrichment: boolean,
): DrivingImpactLoadComponent {
  return assessBehavioralComponent(
    input.scores.longitudinalStressScore,
    input.provenance,
    hasRouteEnrichment,
  );
}

function buildBrakingLoad(
  input: DrivingImpactLoadComponentsInput,
  hasRouteEnrichment: boolean,
): DrivingImpactLoadComponent {
  const proxyShare = input.brakingProvenance.proxyKinematicShare;
  const extraReasons: LoadComponentReasonCode[] = [];
  if (proxyShare >= 0.5) {
    extraReasons.push('BRAKING_PROXY_KINEMATICS');
  }
  const component = assessBehavioralComponent(
    input.scores.brakingStressScore,
    input.provenance,
    hasRouteEnrichment,
    extraReasons,
    proxyShare,
  );
  if (proxyShare >= 0.5 && component.assessability === 'ASSESSABLE') {
    return { ...component, assessability: 'LIMITED' };
  }
  return component;
}

function buildStopGoLoad(
  input: DrivingImpactLoadComponentsInput,
  hasRouteEnrichment: boolean,
): DrivingImpactLoadComponent {
  const limitedRoute = !hasRouteEnrichment || input.routeContext.citySharePct == null;
  const component = assessBehavioralComponent(
    input.scores.stopGoStressScore,
    input.provenance,
    hasRouteEnrichment,
  );
  if (limitedRoute && component.assessability === 'ASSESSABLE') {
    return { ...component, assessability: 'LIMITED' };
  }
  return component;
}

function buildSpeedLoad(
  input: DrivingImpactLoadComponentsInput,
  hasRouteEnrichment: boolean,
): DrivingImpactLoadComponent {
  const component = assessBehavioralComponent(
    input.scores.highSpeedStressScore,
    input.provenance,
    hasRouteEnrichment,
  );
  if (!hasRouteEnrichment && component.assessability === 'ASSESSABLE') {
    return { ...component, assessability: 'LIMITED' };
  }
  return component;
}

function buildThermalLoad(
  input: DrivingImpactLoadComponentsInput,
  hasRouteEnrichment: boolean,
): DrivingImpactLoadComponent {
  const proxyShare = input.brakingProvenance.proxyKinematicShare;
  return assessBehavioralComponent(
    input.scores.thermalBrakeStressScore,
    input.provenance,
    hasRouteEnrichment,
    proxyShare >= 0.5 ? ['BRAKING_PROXY_KINEMATICS'] : [],
    proxyShare,
  );
}

function computeEngineLoadScore(input: DrivingImpactLoadComponentsInput): number | null {
  const { avgEngineLoad, avgRpm, avgThrottlePosition, kickdownPer100Km, launchLikePer100Km } =
    input.engineSignals;
  if (avgEngineLoad != null) {
    return Math.round(capLinear(avgEngineLoad, 100) * 10) / 10;
  }
  if (avgRpm != null || avgThrottlePosition != null) {
    const rpmFactor = avgRpm != null ? capLinear(avgRpm, 4500) : 0;
    const throttleFactor =
      avgThrottlePosition != null ? capLinear(avgThrottlePosition, 100) : 0;
    return Math.round(((rpmFactor + throttleFactor) / 2) * 10) / 10;
  }
  if (kickdownPer100Km > 0 || launchLikePer100Km > 0) {
    const proxyRaw =
      C.LONGITUDINAL_WEIGHTS.kickdown * kickdownPer100Km +
      C.LONGITUDINAL_WEIGHTS.launchLike * launchLikePer100Km;
    return Math.round(capLinear(proxyRaw, C.LONGITUDINAL_RAW_MAX * 0.6) * 10) / 10;
  }
  return null;
}

function buildEngineLoad(input: DrivingImpactLoadComponentsInput): DrivingImpactLoadComponent {
  if (input.powertrain.isEv) {
    return {
      level: null,
      score: null,
      evidenceStrength: 'NONE',
      sourceQuality: 'UNSUPPORTED',
      assessability: 'UNSUPPORTED',
      reasons: ['POWERTRAIN_NOT_APPLICABLE'],
    };
  }

  const score = computeEngineLoadScore(input);
  const hasDirectSignal =
    input.engineSignals.avgEngineLoad != null ||
    input.engineSignals.avgRpm != null ||
    input.engineSignals.avgThrottlePosition != null;

  if (score == null) {
    return {
      level: null,
      score: null,
      evidenceStrength: 'NONE',
      sourceQuality: 'CONTEXT_ONLY',
      assessability: 'INSUFFICIENT_DATA',
      reasons: ['NO_ENGINE_SIGNALS'],
    };
  }

  const reasons: LoadComponentReasonCode[] = hasDirectSignal
    ? ['ICE_ENGINE_SIGNALS_PRESENT']
    : ['KICKDOWN_TRANSMISSION_PROXY', 'BEHAVIORAL_STRESS_ONLY'];

  return {
    level: classifyStressLevel(score),
    score,
    evidenceStrength: hasDirectSignal
      ? resolveEvidenceStrength(input.provenance)
      : 'LOW',
    sourceQuality: hasDirectSignal ? 'MEASURED' : 'ESTIMATED_PROXY',
    assessability: hasDirectSignal ? 'ASSESSABLE' : 'LIMITED',
    reasons,
  };
}

function buildTransmissionLoad(
  input: DrivingImpactLoadComponentsInput,
): DrivingImpactLoadComponent | undefined {
  if (input.powertrain.isEv) {
    return {
      level: null,
      score: null,
      evidenceStrength: 'NONE',
      sourceQuality: 'UNSUPPORTED',
      assessability: 'UNSUPPORTED',
      reasons: ['POWERTRAIN_NOT_APPLICABLE'],
    };
  }

  const { kickdownPer100Km, launchLikePer100Km } = input.engineSignals;
  if (kickdownPer100Km <= 0 && launchLikePer100Km <= 0) {
    return {
      level: null,
      score: null,
      evidenceStrength: 'NONE',
      sourceQuality: 'CONTEXT_ONLY',
      assessability: 'INSUFFICIENT_DATA',
      reasons: ['NO_ENGINE_SIGNALS'],
    };
  }

  const proxyRaw =
    C.LONGITUDINAL_WEIGHTS.kickdown * kickdownPer100Km +
    C.LONGITUDINAL_WEIGHTS.launchLike * launchLikePer100Km;
  const score = Math.round(capLinear(proxyRaw, C.LONGITUDINAL_RAW_MAX * 0.5) * 10) / 10;

  return {
    level: classifyStressLevel(score),
    score,
    evidenceStrength: 'LOW',
    sourceQuality: 'ESTIMATED_PROXY',
    assessability: 'LIMITED',
    reasons: ['KICKDOWN_TRANSMISSION_PROXY'],
  };
}

function buildTireLoad(
  input: DrivingImpactLoadComponentsInput,
  longitudinal: DrivingImpactLoadComponent,
  braking: DrivingImpactLoadComponent,
  stopGo: DrivingImpactLoadComponent,
): DrivingImpactLoadComponent {
  const assessable =
    longitudinal.assessability !== 'INSUFFICIENT_DATA' &&
    braking.assessability !== 'INSUFFICIENT_DATA' &&
    stopGo.assessability !== 'INSUFFICIENT_DATA';

  if (!assessable) {
    return {
      level: null,
      score: null,
      evidenceStrength: 'NONE',
      sourceQuality: 'CONTEXT_ONLY',
      assessability: 'INSUFFICIENT_DATA',
      reasons: ['ESSENTIAL_COMPONENT_MISSING'],
    };
  }

  const score = Math.round(
    (0.35 * (braking.score ?? 0) +
      0.35 * (stopGo.score ?? 0) +
      0.3 * (longitudinal.score ?? 0)) *
      10,
  ) / 10;

  const limited =
    longitudinal.assessability === 'LIMITED' ||
    braking.assessability === 'LIMITED' ||
    stopGo.assessability === 'LIMITED';

  return {
    level: classifyStressLevel(score),
    score,
    evidenceStrength: limited ? 'MEDIUM' : resolveEvidenceStrength(input.provenance),
    sourceQuality: resolveBehavioralSourceQuality(input.provenance),
    assessability: limited ? 'LIMITED' : 'ASSESSABLE',
    reasons: ['COMPOSITE_RENORMALIZED'],
  };
}

function buildDataQuality(input: DrivingImpactLoadComponentsInput): DrivingImpactLoadComponent {
  const coverage = input.provenance.measurementCoverage;
  const score =
    coverage != null
      ? Math.round(coverage * 100 * 10) / 10
      : input.provenance.provenanceMaturity === 'FULL'
        ? 80
        : input.provenance.provenanceMaturity === 'PARTIAL'
          ? 50
          : 20;

  const reasons: LoadComponentReasonCode[] = [];
  if (coverage != null && coverage < 0.5) reasons.push('LOW_MEASUREMENT_COVERAGE');
  if (input.provenance.estimatedProxyShare >= 0.5) reasons.push('ESTIMATED_PROXY_DOMINANT');
  if (input.provenance.primarySource === 'STRESS_ONLY') reasons.push('BEHAVIORAL_STRESS_ONLY');
  if (input.provenance.nativeEventCount > 0) reasons.push('PROVIDER_CLASSIFIED_EVENTS');
  if (input.provenance.hfEventCount > 0) reasons.push('RECONSTRUCTED_EVENTS');

  const evidenceStrength = resolveEvidenceStrength(input.provenance);
  let assessability: LoadComponentAssessability = 'ASSESSABLE';
  if (evidenceStrength === 'NONE') assessability = 'INSUFFICIENT_DATA';
  else if (evidenceStrength === 'LOW') assessability = 'LIMITED';

  return {
    level: classifyStressLevel(100 - score),
    score,
    evidenceStrength,
    sourceQuality:
      input.provenance.measuredShare >= 0.5
        ? 'MEASURED'
        : resolveBehavioralSourceQuality(input.provenance),
    assessability,
    reasons,
  };
}

function isEssentialAssessed(component: DrivingImpactLoadComponent): boolean {
  return (
    component.assessability === 'ASSESSABLE' || component.assessability === 'LIMITED'
  );
}

function buildVehicleLoadSummary(
  components: Pick<
    DrivingImpactLoadComponents,
    'longitudinalLoad' | 'brakingLoad' | 'stopGoLoad' | 'speedLoad'
  >,
  provenance: DrivingImpactSourceProvenance,
): DrivingImpactVehicleLoadSummary {
  const essentialEntries = ESSENTIAL_COMPONENT_KEYS.map((key) => ({
    key,
    component: components[key],
    weight: ESSENTIAL_WEIGHTS[key],
  }));

  const assessed = essentialEntries.filter((e) => isEssentialAssessed(e.component));
  const missing = essentialEntries.filter((e) => !isEssentialAssessed(e.component));
  const coverage =
    Math.round(
      (assessed.reduce((sum, e) => sum + e.weight, 0) /
        ESSENTIAL_COMPONENT_KEYS.reduce((sum, k) => sum + ESSENTIAL_WEIGHTS[k], 0)) *
        1000,
    ) / 1000;

  const reasons: LoadComponentReasonCode[] = [];
  if (missing.length > 0) {
    reasons.push('ESSENTIAL_COMPONENT_MISSING');
  }
  if (assessed.length < essentialEntries.length) {
    reasons.push('COMPOSITE_RENORMALIZED');
  }

  if (missing.length > 0) {
    return {
      level: null,
      score: null,
      coverage,
      essentialComponentsAssessed: assessed.length,
      essentialComponentsTotal: essentialEntries.length,
      evidenceStrength: resolveEvidenceStrength(provenance),
      assessability: 'INSUFFICIENT_DATA',
      reasons,
    };
  }

  const totalWeight = assessed.reduce((sum, e) => sum + e.weight, 0);
  const renormalizedScore = Math.round(
    assessed.reduce(
      (sum, e) => sum + (e.component.score ?? 0) * (e.weight / totalWeight),
      0,
    ) * 10,
  ) / 10;

  const legacyComposite = computeDrivingStressScore({
    longitudinalStressScore: components.longitudinalLoad.score ?? 0,
    brakingStressScore: components.brakingLoad.score ?? 0,
    stopGoStressScore: components.stopGoLoad.score ?? 0,
    highSpeedStressScore: components.speedLoad.score ?? 0,
  });

  const score =
    assessed.length === essentialEntries.length ? legacyComposite : renormalizedScore;

  const limited = assessed.some((e) => e.component.assessability === 'LIMITED');
  const evidenceStrength = limited
    ? 'MEDIUM'
    : resolveEvidenceStrength(provenance);

  return {
    level: classifyStressLevel(score),
    score,
    coverage,
    essentialComponentsAssessed: assessed.length,
    essentialComponentsTotal: essentialEntries.length,
    evidenceStrength,
    assessability: limited ? 'LIMITED' : 'ASSESSABLE',
    reasons,
  };
}

/** Build structured load components from computed trip impact inputs. */
export function buildDrivingImpactLoadComponents(
  input: DrivingImpactLoadComponentsInput,
): DrivingImpactLoadComponents {
  const hasRouteEnrichment =
    input.routeContext.citySharePct != null && input.routeContext.highwaySharePct != null;

  const longitudinalLoad = buildLongitudinalLoad(input, hasRouteEnrichment);
  const brakingLoad = buildBrakingLoad(input, hasRouteEnrichment);
  const stopGoLoad = buildStopGoLoad(input, hasRouteEnrichment);
  const speedLoad = buildSpeedLoad(input, hasRouteEnrichment);
  const thermalLoad = buildThermalLoad(input, hasRouteEnrichment);
  const engineLoad = buildEngineLoad(input);
  const transmissionLoad = buildTransmissionLoad(input);
  const tireLoad = buildTireLoad(input, longitudinalLoad, brakingLoad, stopGoLoad);
  const dataQuality = buildDataQuality(input);

  const vehicleLoad = buildVehicleLoadSummary(
    { longitudinalLoad, brakingLoad, stopGoLoad, speedLoad },
    input.provenance,
  );

  return {
    version: DRIVING_IMPACT_LOAD_COMPONENTS_VERSION,
    longitudinalLoad,
    brakingLoad,
    stopGoLoad,
    speedLoad,
    thermalLoad,
    engineLoad,
    transmissionLoad,
    tireLoad,
    dataQuality,
    vehicleLoad,
  };
}

/** Convenience for EV detection from fuel type string. */
export function resolvePowertrainIsEv(fuelType: string | null | undefined): boolean {
  return isEvPowertrain(fuelType);
}

import type {
  DrivingImpactModelProfileDefinition,
  DrivingImpactModelProfileId,
} from './driving-impact-model-profile.types';

const ALL_STRESS: DrivingImpactModelProfileDefinition['availableStressComponents'] = [
  'longitudinal',
  'braking',
  'stopGo',
  'highSpeed',
  'thermal',
];

const HF_LOAD: DrivingImpactModelProfileDefinition['availableLoadComponents'] = [
  'longitudinalLoad',
  'brakingLoad',
  'stopGoLoad',
  'speedLoad',
  'thermalLoad',
  'tireLoad',
  'dataQuality',
  'vehicleLoad',
];

const ICE_LOAD: DrivingImpactModelProfileDefinition['availableLoadComponents'] = [
  ...HF_LOAD,
  'engineLoad',
  'transmissionLoad',
];

export const DRIVING_IMPACT_MODEL_PROFILES: Record<
  DrivingImpactModelProfileId,
  DrivingImpactModelProfileDefinition
> = {
  LTE_R1_NATIVE: {
    profile: 'LTE_R1_NATIVE',
    comparabilityGroup: 'NATIVE_LTE',
    behavioralIngestionPath: 'TELEMETRY_EVENTS',
    nativeEventCapable: true,
    engineContextCapable: false,
    zeroEventsWithoutNativeCapabilityIsUnknown: false,
    availableStressComponents: ALL_STRESS,
    availableLoadComponents: HF_LOAD,
    crossFleetComparableProfiles: ['LTE_R1_NATIVE', 'ICE_SIGNAL_CONTEXT'],
    label: 'LTE R1 (native events)',
    comparabilityHintDe:
      'Native DIMO-Ereignisse — vergleichbar mit anderen LTE-R1-Profilen, nicht mit HF-Rekonstruktion.',
  },
  ICE_SIGNAL_CONTEXT: {
    profile: 'ICE_SIGNAL_CONTEXT',
    comparabilityGroup: 'NATIVE_LTE',
    behavioralIngestionPath: 'TELEMETRY_EVENTS',
    nativeEventCapable: true,
    engineContextCapable: true,
    zeroEventsWithoutNativeCapabilityIsUnknown: false,
    availableStressComponents: ALL_STRESS,
    availableLoadComponents: ICE_LOAD,
    crossFleetComparableProfiles: ['LTE_R1_NATIVE', 'ICE_SIGNAL_CONTEXT'],
    label: 'LTE R1 ICE (native + engine context)',
    comparabilityHintDe:
      'Native Ereignisse mit Motor-Kontext — Fleet-Vergleich nur mit LTE-R1-Profilen, nicht mit HF-Proxy.',
  },
  SMART5_LIMITED: {
    profile: 'SMART5_LIMITED',
    comparabilityGroup: 'HF_LIMITED',
    behavioralIngestionPath: 'HF_DERIVED',
    nativeEventCapable: false,
    engineContextCapable: false,
    zeroEventsWithoutNativeCapabilityIsUnknown: true,
    availableStressComponents: ALL_STRESS,
    availableLoadComponents: HF_LOAD,
    crossFleetComparableProfiles: ['SMART5_LIMITED', 'UNKNOWN_LIMITED'],
    label: 'SMART5 (HF reconstruction)',
    comparabilityHintDe:
      'HF-Rekonstruktion ohne native Ereignisse — nicht mit LTE-R1 oder EV-Profilen vergleichen.',
  },
  TESLA_LIMITED: {
    profile: 'TESLA_LIMITED',
    comparabilityGroup: 'EV_LIMITED',
    behavioralIngestionPath: 'HF_DERIVED',
    nativeEventCapable: false,
    engineContextCapable: false,
    zeroEventsWithoutNativeCapabilityIsUnknown: true,
    availableStressComponents: ALL_STRESS,
    availableLoadComponents: HF_LOAD,
    crossFleetComparableProfiles: ['TESLA_LIMITED'],
    label: 'EV / Tesla (limited signals)',
    comparabilityHintDe:
      'EV-Profil ohne Verbrenner-Signale — nur mit anderen EV-Profilen vergleichen; HF ≠ native Events.',
  },
  UNKNOWN_LIMITED: {
    profile: 'UNKNOWN_LIMITED',
    comparabilityGroup: 'HF_LIMITED',
    behavioralIngestionPath: 'HF_DERIVED',
    nativeEventCapable: false,
    engineContextCapable: false,
    zeroEventsWithoutNativeCapabilityIsUnknown: true,
    availableStressComponents: ALL_STRESS,
    availableLoadComponents: HF_LOAD,
    crossFleetComparableProfiles: ['SMART5_LIMITED', 'UNKNOWN_LIMITED'],
    label: 'Unknown hardware (HF fallback)',
    comparabilityHintDe:
      'Unklassifizierte Hardware mit HF-Fallback — Fleet-Vergleich nur innerhalb HF_LIMITED.',
  },
};

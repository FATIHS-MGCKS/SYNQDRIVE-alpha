import type {
  DrivingDetectorKey,
  DrivingDetectorRequirementKind,
  DrivingDetectorSupportStatus,
} from './driving-detector-capability.types';

export type DrivingDetectorRequirement = {
  kind: DrivingDetectorRequirementKind;
  name: string;
};

export type DrivingDetectorDefinition = {
  key: DrivingDetectorKey;
  label: string;
  requirements: readonly DrivingDetectorRequirement[];
  iceOnly?: boolean;
  evOnly?: boolean;
  /** Status ceiling when signals exist — never auto PRODUCTION unless native-event rule applies. */
  maxAutomaticStatus: DrivingDetectorSupportStatus;
  productionRequiresNativeEvents?: boolean;
  /** Satisfy any one listed native event (for OR-native detectors). */
  requireAnyNativeEvent?: boolean;
  /** Satisfy any one listed signal name (for OR-signal detectors). */
  requireAnySignal?: readonly string[];
  minCoverage?: number;
  maxEffectiveCadenceMs?: number;
  maxP95CadenceMs?: number;
};

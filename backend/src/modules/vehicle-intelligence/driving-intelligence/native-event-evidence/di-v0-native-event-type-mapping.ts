import { normalizeDimoNativeEventKey } from '../../dimo-native-driving-events/dimo-native-driving-event-mapper';
import type { DiV0NativeNormalizedEventType } from './di-v0-native-event-evidence.types';

const EXPLICIT_MAP: Readonly<Record<string, DiV0NativeNormalizedEventType>> = {
  harshbraking: 'HARSH_BRAKING',
  extremebraking: 'EXTREME_BRAKING',
  extremeemergency: 'EXTREME_BRAKING',
  extremeemergencybraking: 'EXTREME_BRAKING',
  harshacceleration: 'HARSH_ACCELERATION',
  extremeacceleration: 'HARSH_ACCELERATION',
  harshcornering: 'HARSH_CORNERING',
  collision: 'SAFETY_COLLISION',
  speeding: 'SPEEDING',
};

export function mapProviderNativeEventType(providerEventName: string): DiV0NativeNormalizedEventType {
  const key = normalizeDimoNativeEventKey(providerEventName);
  return EXPLICIT_MAP[key] ?? 'UNKNOWN_NATIVE_EVENT';
}

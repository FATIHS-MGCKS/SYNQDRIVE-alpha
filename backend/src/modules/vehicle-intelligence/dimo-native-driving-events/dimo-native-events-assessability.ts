import type {
  NativeEventsCapabilityContext,
  ZeroNativeEventsConductAssessment,
} from './dimo-native-driving-event-mapper.types';

/**
 * Whether zero native DIMO events may contribute to an „unauffällig“ conduct rating.
 * Tesla/EV and capability-unsupported vehicles must never read as unremarkable
 * solely because the native channel returned no events.
 */
export function assessZeroNativeEventsConduct(
  ctx: NativeEventsCapabilityContext,
): ZeroNativeEventsConductAssessment {
  if (ctx.nativeEventCount > 0) {
    return { mayRateUnremarkable: true, reason: 'has_native_events' };
  }
  if (!ctx.nativeQuerySucceeded) {
    return { mayRateUnremarkable: false, reason: 'native_query_not_confirmed' };
  }
  if (ctx.isEvPowertrain && ctx.nativeBehaviorSupported !== true) {
    return { mayRateUnremarkable: false, reason: 'ev_no_native_events' };
  }
  if (ctx.nativeBehaviorSupported === false) {
    return { mayRateUnremarkable: false, reason: 'native_capability_unsupported' };
  }
  if (ctx.nativeBehaviorSupported === true) {
    return { mayRateUnremarkable: false, reason: 'supported_but_zero_events' };
  }
  return { mayRateUnremarkable: false, reason: 'zero_native_events' };
}

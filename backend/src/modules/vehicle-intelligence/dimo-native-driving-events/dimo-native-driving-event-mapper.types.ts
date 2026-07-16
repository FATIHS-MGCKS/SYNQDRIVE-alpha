import type { DrivingEventType, DrivingEvidenceSourceType } from '@prisma/client';

/** Versioned mapping table for DIMO-native driving events (Driving Intelligence V2 P23). */
export const DIMO_NATIVE_DRIVING_EVENT_MAPPING_VERSION = '2026-07-16.1';

/** Provider channel for capability probes and mapped event provenance. */
export const DIMO_NATIVE_EVENT_PROVIDER_SOURCE = 'DIMO_TELEMETRY';

/**
 * Classification carried in DrivingEvent.metadataJson for native DIMO events.
 * Subset of Prisma BehaviorEventClassification — matches controller surfacing.
 */
export type DimoNativeEventClassification = 'MODERATE' | 'HARD' | 'EXTREME';

/** Full mapping contract for one DIMO-native driving event. */
export interface DimoNativeDrivingEventMapping {
  providerEventName: string;
  canonicalEventType: DrivingEventType;
  classification: DimoNativeEventClassification;
  severity: number;
  providerSource: string;
  evidenceSourceType: DrivingEvidenceSourceType;
  mappingVersion: string;
  /** `true` when the provider name matched a known taxonomy entry. */
  isKnownMapping: boolean;
}

export type NativeEventsCapabilityContext = {
  nativeBehaviorSupported: boolean | null;
  nativeEventAvailable: boolean | null;
  isEvPowertrain: boolean;
  nativeQuerySucceeded: boolean;
  nativeEventCount: number;
};

export type ZeroNativeEventsConductAssessment = {
  mayRateUnremarkable: boolean;
  reason:
    | 'has_native_events'
    | 'native_query_not_confirmed'
    | 'ev_no_native_events'
    | 'native_capability_unsupported'
    | 'supported_but_zero_events'
    | 'zero_native_events';
};

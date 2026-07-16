import { DrivingEventType } from '@prisma/client';
import {
  DIMO_NATIVE_DRIVING_EVENT_MAPPING_VERSION,
  DIMO_NATIVE_EVENT_PROVIDER_SOURCE,
  type DimoNativeDrivingEventMapping,
  type DimoNativeEventClassification,
} from './dimo-native-driving-event-mapper.types';

const EVIDENCE_SOURCE_TYPE = 'PROVIDER_CLASSIFIED_EVENT' as const;

const EXTREME_SEVERITY_FLOOR = 0.9;

const EVENT_SEVERITY: Record<DrivingEventType, number> = {
  HARSH_BRAKING: 0.6,
  EXTREME_BRAKING: 0.9,
  HARSH_ACCELERATION: 0.6,
  HARSH_CORNERING: 0.5,
  SPEEDING: 0.4,
  IDLE_EXCESSIVE: 0.2,
  UNMAPPED_PROVIDER_EVENT: 0.3,
  SAFETY_COLLISION: 0.95,
};

type KnownMapping = {
  canonicalEventType: DrivingEventType;
  classification: DimoNativeEventClassification;
};

/**
 * Normalize DIMO provider event names for lookup.
 * Case-insensitive; tolerates `behavior.` / `safety.` prefixes and separators.
 */
export function normalizeDimoNativeEventKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^behavior\./, '')
    .replace(/^safety\./, '')
    .replace(/[\s_\-]+/g, '');
}

/**
 * Known DIMO-native event keys → canonical taxonomy.
 * Audit names: docs/audits/dimo-driving-signals-capability.md §5.2.
 */
const KNOWN_DIMO_NATIVE_EVENT_MAP: Readonly<Record<string, KnownMapping>> = {
  harshbraking: {
    canonicalEventType: DrivingEventType.HARSH_BRAKING,
    classification: 'HARD',
  },
  extremebraking: {
    canonicalEventType: DrivingEventType.EXTREME_BRAKING,
    classification: 'EXTREME',
  },
  extremeemergency: {
    canonicalEventType: DrivingEventType.EXTREME_BRAKING,
    classification: 'EXTREME',
  },
  extremeemergencybraking: {
    canonicalEventType: DrivingEventType.EXTREME_BRAKING,
    classification: 'EXTREME',
  },
  harshacceleration: {
    canonicalEventType: DrivingEventType.HARSH_ACCELERATION,
    classification: 'HARD',
  },
  extremeacceleration: {
    canonicalEventType: DrivingEventType.HARSH_ACCELERATION,
    classification: 'EXTREME',
  },
  harshcornering: {
    canonicalEventType: DrivingEventType.HARSH_CORNERING,
    classification: 'MODERATE',
  },
  collision: {
    canonicalEventType: DrivingEventType.SAFETY_COLLISION,
    classification: 'EXTREME',
  },
};

/**
 * Map a DIMO-native driving event name to SynqDrive's versioned taxonomy.
 * Unknown names are preserved as `UNMAPPED_PROVIDER_EVENT` — never discarded.
 */
export function mapDimoNativeDrivingEvent(providerEventName: string): DimoNativeDrivingEventMapping {
  const trimmed = providerEventName.trim();
  const key = normalizeDimoNativeEventKey(trimmed);
  const known = key.length > 0 ? KNOWN_DIMO_NATIVE_EVENT_MAP[key] : undefined;

  if (known) {
    return buildMapping(trimmed, known.canonicalEventType, known.classification, true);
  }

  return buildMapping(
    trimmed || providerEventName,
    DrivingEventType.UNMAPPED_PROVIDER_EVENT,
    'MODERATE',
    false,
  );
}

function buildMapping(
  providerEventName: string,
  canonicalEventType: DrivingEventType,
  classification: DimoNativeEventClassification,
  isKnownMapping: boolean,
): DimoNativeDrivingEventMapping {
  return {
    providerEventName,
    canonicalEventType,
    classification,
    severity: resolveDimoNativeEventSeverity(canonicalEventType, classification),
    providerSource: DIMO_NATIVE_EVENT_PROVIDER_SOURCE,
    evidenceSourceType: EVIDENCE_SOURCE_TYPE,
    mappingVersion: DIMO_NATIVE_DRIVING_EVENT_MAPPING_VERSION,
    isKnownMapping,
  };
}

/**
 * Severity for a mapped native event. Provider EXTREME classifications are
 * floored so extreme acceleration (persisted as HARSH_ACCELERATION) outranks
 * normal harsh acceleration — provider classification is never overwritten.
 */
export function resolveDimoNativeEventSeverity(
  eventType: DrivingEventType,
  classification: DimoNativeEventClassification,
): number {
  const base = EVENT_SEVERITY[eventType];
  return classification === 'EXTREME' ? Math.max(base, EXTREME_SEVERITY_FLOOR) : base;
}

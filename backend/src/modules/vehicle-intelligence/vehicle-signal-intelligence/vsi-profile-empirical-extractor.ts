import { getVsiCanonicalSignalDefinition } from './canonical-signal-keys';
import type { VsiProfileMaterializationKey } from './vsi-profile.types';
import {
  readRawLocationCoordinates,
  readRawScalarSignal,
  resolveSignalTimestampEvidence,
} from './vsi-raw-payload-signals.util';
import type { VsiDtcConfirmedCompleteEvidence } from './vsi-dtc-complete-evidence.util';
import { resolveVsiDiagnosticTroubleCodeEmpirical } from './vsi-dtc-complete-evidence.util';
import type { VsiLatestStateSnapshot } from './vsi-readonly-composer.types';
import { VsiEmpiricalObservationStatus } from './vehicle-signal-evidence.contract';

export type VsiProfileEmpiricalExtraction = {
  providerNativeSignalName: string;
  empiricalObservation: VsiEmpiricalObservationStatus;
  lastValidObservationAt: Date | null;
  lastSourceTimestamp: Date | null;
  freshnessClassification: 'FRESH' | 'STALE' | 'UNKNOWN';
  evidenceProvenance: Array<'VEHICLE_LATEST_STATE'>;
  limitations: string[];
};

const IMPLEMENTED_EXTRACTOR_KEYS = new Set<VsiProfileMaterializationKey>([
  'vehicle_speed',
  'odometer',
  'fuel_level_relative',
  'diagnostic_trouble_code',
  'position_coordinates',
  'accelerator_pedal_position',
]);

export function isProfileEmpiricalExtractorImplemented(
  key: VsiProfileMaterializationKey,
): boolean {
  return IMPLEMENTED_EXTRACTOR_KEYS.has(key);
}

export function extractProfileSignalEmpirical(input: {
  key: VsiProfileMaterializationKey;
  latestState: VsiLatestStateSnapshot | null;
  stateAttributed: boolean;
  projectionAsOf: Date;
  providerSourceLinkId?: string;
  dtcConfirmedComplete?: VsiDtcConfirmedCompleteEvidence | null;
}): VsiProfileEmpiricalExtraction | null {
  if (!IMPLEMENTED_EXTRACTOR_KEYS.has(input.key)) {
    return null;
  }
  if (!input.latestState || !input.stateAttributed) {
    const def = getVsiCanonicalSignalDefinition(input.key);
    return {
      providerNativeSignalName: def.primaryDimoSignalName ?? input.key,
      empiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
      lastValidObservationAt: null,
      lastSourceTimestamp: null,
      freshnessClassification: 'UNKNOWN',
      evidenceProvenance: [],
      limitations: [],
    };
  }

  const projectionAsOfMs = input.projectionAsOf.getTime();
  const raw = input.latestState.rawPayloadJson;
  const def = getVsiCanonicalSignalDefinition(input.key);
  const native = def.primaryDimoSignalName ?? input.key;
  const limitations: string[] = [];
  const provenance: Array<'VEHICLE_LATEST_STATE'> = ['VEHICLE_LATEST_STATE'];

  switch (input.key) {
    case 'vehicle_speed': {
      const rawSignal = readRawScalarSignal(raw, native);
      return finalizeScalarExtraction({
        native,
        rawSignal,
        projectionAsOfMs,
        limitations,
        provenance,
      });
    }
    case 'odometer': {
      const rawSignal = readRawScalarSignal(raw, native);
      limitations.push('ODOMETER_DIMO_SIGNAL_MAY_BE_TRIP_RELATIVE_ON_SOME_VEHICLES');
      return finalizeScalarExtraction({
        native,
        rawSignal,
        projectionAsOfMs,
        limitations,
        provenance,
      });
    }
    case 'fuel_level_relative': {
      const rawSignal = readRawScalarSignal(raw, native);
      return finalizeScalarExtraction({
        native,
        rawSignal,
        projectionAsOfMs,
        limitations,
        provenance,
      });
    }
    case 'accelerator_pedal_position': {
      const rawSignal = readRawScalarSignal(raw, native);
      return finalizeScalarExtraction({
        native,
        rawSignal,
        projectionAsOfMs,
        limitations,
        provenance,
        allowZero: true,
      });
    }
    case 'position_coordinates': {
      const loc = readRawLocationCoordinates(raw);
      if (!loc.keyPresent) {
        return {
          providerNativeSignalName: 'currentLocationCoordinates',
          empiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
          lastValidObservationAt: null,
          lastSourceTimestamp: null,
          freshnessClassification: 'UNKNOWN',
          evidenceProvenance: provenance,
          limitations,
        };
      }
      const coordsValid = loc.latitude != null && loc.longitude != null;
      const tsEvidence = resolveSignalTimestampEvidence({
        signalSourceMs: loc.sourceMs,
        projectionAsOfMs,
      });
      limitations.push(...tsEvidence.limitations);
      if (limitations.includes('FUTURE_SIGNAL_TIMESTAMP_REJECTED')) {
        return {
          providerNativeSignalName: 'currentLocationCoordinates',
          empiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
          lastValidObservationAt: null,
          lastSourceTimestamp: null,
          freshnessClassification: 'UNKNOWN',
          evidenceProvenance: provenance,
          limitations,
        };
      }
      if (!coordsValid) {
        limitations.push('LOCATION_KEY_PRESENT_WITHOUT_VALID_LAT_LON_PAIR');
        return {
          providerNativeSignalName: 'currentLocationCoordinates',
          empiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
          lastValidObservationAt: null,
          lastSourceTimestamp: tsEvidence.source,
          freshnessClassification: tsEvidence.freshness,
          evidenceProvenance: provenance,
          limitations,
        };
      }
      return {
        providerNativeSignalName: 'currentLocationCoordinates',
        empiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
        lastValidObservationAt: tsEvidence.observed,
        lastSourceTimestamp: tsEvidence.source,
        freshnessClassification: tsEvidence.freshness,
        evidenceProvenance: provenance,
        limitations,
      };
    }
    case 'diagnostic_trouble_code': {
      if (!input.providerSourceLinkId) {
        limitations.push('DTC_EVIDENCE_REQUIRES_PROVIDER_SOURCE_LINK');
        return {
          providerNativeSignalName: native,
          empiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
          lastValidObservationAt: null,
          lastSourceTimestamp: null,
          freshnessClassification: 'UNKNOWN',
          evidenceProvenance: provenance,
          limitations,
        };
      }
      return resolveVsiDiagnosticTroubleCodeEmpirical({
        providerSourceLinkId: input.providerSourceLinkId,
        nativeSignalName: native,
        rawPayloadJson: raw,
        obdDtcList: input.latestState.obdDtcList,
        lastDtcSuccessfulCheckAt: input.latestState.lastDtcSuccessfulCheckAt ?? null,
        confirmedComplete: input.dtcConfirmedComplete ?? null,
        projectionAsOf: input.projectionAsOf,
      });
    }
    default:
      return null;
  }
}

function finalizeScalarExtraction(input: {
  native: string;
  rawSignal: ReturnType<typeof readRawScalarSignal>;
  projectionAsOfMs: number;
  limitations: string[];
  provenance: Array<'VEHICLE_LATEST_STATE'>;
  allowZero?: boolean;
}): VsiProfileEmpiricalExtraction {
  const limitations = [...input.limitations];
  if (!input.rawSignal.keyPresent) {
    return {
      providerNativeSignalName: input.native,
      empiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
      lastValidObservationAt: null,
      lastSourceTimestamp: null,
      freshnessClassification: 'UNKNOWN',
      evidenceProvenance: input.provenance,
      limitations,
    };
  }
  const tsEvidence = resolveSignalTimestampEvidence({
    signalSourceMs: input.rawSignal.sourceMs,
    projectionAsOfMs: input.projectionAsOfMs,
  });
  limitations.push(...tsEvidence.limitations);
  if (limitations.includes('FUTURE_SIGNAL_TIMESTAMP_REJECTED')) {
    return {
      providerNativeSignalName: input.native,
      empiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
      lastValidObservationAt: null,
      lastSourceTimestamp: null,
      freshnessClassification: 'UNKNOWN',
      evidenceProvenance: input.provenance,
      limitations,
    };
  }
  const hasValue =
    input.rawSignal.value != null &&
    Number.isFinite(input.rawSignal.value) &&
    (input.allowZero || input.rawSignal.value !== 0);
  if (!hasValue) {
    if (input.rawSignal.keyPresent) {
      limitations.push('RAW_SNAPSHOT_KEY_NULL_VALUE_NOT_PHYSICAL_OBSERVATION');
    }
    return {
      providerNativeSignalName: input.native,
      empiricalObservation: VsiEmpiricalObservationStatus.NEVER_OBSERVED,
      lastValidObservationAt: null,
      lastSourceTimestamp: tsEvidence.source,
      freshnessClassification: tsEvidence.freshness,
      evidenceProvenance: input.provenance,
      limitations,
    };
  }
  return {
    providerNativeSignalName: input.native,
    empiricalObservation: VsiEmpiricalObservationStatus.OBSERVED,
    lastValidObservationAt: tsEvidence.observed,
    lastSourceTimestamp: tsEvidence.source,
    freshnessClassification: tsEvidence.freshness,
    evidenceProvenance: input.provenance,
    limitations,
  };
}

import {
  BatteryEvidenceScope,
  BatteryGroundTruthSourceAuthority,
  BatteryGroundTruthType,
  BatteryEvidenceSourceType,
  ServiceEventType,
} from '@prisma/client';
import { M3_3G_GROUND_TRUTH_ADMISSION_CONTRACT } from './ground-truth.constants';

export const GROUND_TRUTH_ADMISSION_LEVEL = {
  ADMIT_VALIDATION_GROUND_TRUTH: 'ADMIT_VALIDATION_GROUND_TRUTH',
  SUPPORTING_EVIDENCE: 'SUPPORTING_EVIDENCE',
  UNVERIFIED_EVIDENCE: 'UNVERIFIED_EVIDENCE',
  EXCLUDED: 'EXCLUDED',
} as const;

export type GroundTruthAdmissionLevel =
  (typeof GROUND_TRUTH_ADMISSION_LEVEL)[keyof typeof GROUND_TRUTH_ADMISSION_LEVEL];

export const GROUND_TRUTH_ADMISSION_REASON = {
  ADMITTED: 'ADMITTED',
  EFFECTIVE_TIME_REQUIRED: 'EFFECTIVE_TIME_REQUIRED',
  SCOPE_REQUIRED: 'SCOPE_REQUIRED',
  SOURCE_TENANT_MISMATCH: 'SOURCE_TENANT_MISMATCH',
  SOURCE_VEHICLE_MISMATCH: 'SOURCE_VEHICLE_MISMATCH',
  SOURCE_MISSING: 'SOURCE_MISSING',
  SOURCE_TENANT_UNBOUND: 'SOURCE_TENANT_UNBOUND',
  SOURCE_VEHICLE_UNBOUND: 'SOURCE_VEHICLE_UNBOUND',
  SOURCE_PROVENANCE_MISMATCH: 'SOURCE_PROVENANCE_MISMATCH',
  REPLACEMENT_SCOPE_AMBIGUOUS: 'REPLACEMENT_SCOPE_AMBIGUOUS',
  REPLACEMENT_WITHOUT_CONFIRMATION: 'REPLACEMENT_WITHOUT_CONFIRMATION',
  DOCUMENT_UNCONFIRMED: 'DOCUMENT_UNCONFIRMED',
  TELEMETRY_DERIVED_EXCLUDED: 'TELEMETRY_DERIVED_EXCLUDED',
  MODEL_DERIVED_EXCLUDED: 'MODEL_DERIVED_EXCLUDED',
  MANUAL_ORIGIN_NOT_CONFIRMED: 'MANUAL_ORIGIN_NOT_CONFIRMED',
  UNSUPPORTED_SOURCE_TYPE: 'UNSUPPORTED_SOURCE_TYPE',
  CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
  GROUND_TRUTH_SOURCE_PREVIOUSLY_REVOKED: 'GROUND_TRUTH_SOURCE_PREVIOUSLY_REVOKED',
  GROUND_TRUTH_SOURCE_SUPERSEDED: 'GROUND_TRUTH_SOURCE_SUPERSEDED',
} as const;

export type GroundTruthAdmissionReason =
  (typeof GROUND_TRUTH_ADMISSION_REASON)[keyof typeof GROUND_TRUTH_ADMISSION_REASON];

export type GroundTruthAdmissionDecisionV1 = {
  contractVersion: typeof M3_3G_GROUND_TRUTH_ADMISSION_CONTRACT;
  level: GroundTruthAdmissionLevel;
  reasons: GroundTruthAdmissionReason[];
};

export type GroundTruthSourceIdentityV1 = {
  serviceEvent?: {
    id: string;
    eventType: ServiceEventType;
    eventDateIso: string;
    origin: string;
    organizationId: string;
    vehicleId: string;
  } | null;
  documentExtraction?: {
    id: string;
    effectiveDocumentType: string | null;
    status: string;
    organizationId: string;
    vehicleId: string;
    contentSha256?: string | null;
  } | null;
  batteryEvidence?: {
    id: string;
    scope: BatteryEvidenceScope;
    sourceType: BatteryEvidenceSourceType;
    valueType: string;
    observedAtIso: string;
    numericValue: number;
    unit: string | null;
    confidence: string | null;
    quality: string | null;
    measurementId: string | null;
    serviceEventId: string | null;
    documentExtractionId: string | null;
    vehicleId: string;
  } | null;
  measurement?: {
    id: string;
    scope: BatteryEvidenceScope;
    type: string;
    observedAtIso: string;
    numericValue: number | null;
    textValue: string | null;
    unit: string | null;
    quality: string;
    providerTimestampIso: string | null;
    idempotencyKey: string;
    supersededById: string | null;
    organizationId: string;
    vehicleId: string;
  } | null;
};

export type GroundTruthFingerprintInputV1 = {
  organizationId: string;
  vehicleId: string;
  groundTruthType: BatteryGroundTruthType;
  batteryScope: BatteryEvidenceScope;
  effectiveAt: Date;
  sourceAuthority: BatteryGroundTruthSourceAuthority;
  sourceServiceEventId?: string | null;
  sourceDocumentExtractionId?: string | null;
  sourceBatteryEvidenceId?: string | null;
  sourceMeasurementId?: string | null;
  confirmedByUserId?: string | null;
  confirmedAt?: Date | null;
  sourceIdentity: GroundTruthSourceIdentityV1;
};

export type GroundTruthAdmissionContextV1 = {
  organizationId: string;
  vehicleId: string;
  vehicleOrganizationId: string;
  groundTruthType: BatteryGroundTruthType;
  batteryScope: BatteryEvidenceScope;
  effectiveAt: Date | null;
  sourceAuthority: BatteryGroundTruthSourceAuthority;
  confirmedByUserId?: string | null;
  confirmedAt?: Date | null;
  manualConfirmationTrusted: boolean;
  sourceIdentity: GroundTruthSourceIdentityV1;
};

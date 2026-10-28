import type { DiV0MotionCoreShadowPayloadV1 } from '../motion-core-shadow-worker/di-v0-motion-core-shadow.types';
import {
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V1_LEGACY,
  DI_V0_MOTION_CORE_SHADOW_EVENT_ROW_CONTRACT_V2_INTENSITY,
  isMotionCoreShadowIntensityConsumptionAllowed,
  readPersistedMotionEventIntensityForPayload,
  resolveMotionCoreShadowEventRowContract,
} from '../motion-core-shadow-worker/di-v0-motion-core-shadow-event-row.contract';
import { evaluateDs4AssessmentFleetAdmissionV1 } from './ds4-assessment-fleet-admission.v1';
import {
  DS4_TRIP_ASSESSMENT_VERSION_V1,
  type Ds4SpeedAuthorityPartitionV1,
  type Ds4TripAssessmentReasonCodeV1,
  type Ds4TripAssessmentStatusV1,
} from './ds4-trip-assessment-v1.contract';
import {
  DS4_ASSESSMENT_QUALITY_POLICY_V1_DEFAULT,
  evaluateDs4AssessmentQualityFromMotionPayload,
  type Ds4AssessmentQualityPolicyV1,
} from './ds4-assessment-quality-policy.v1';
import {
  computeDs4AssessmentInputFingerprint,
  computeDs4AssessmentInputFingerprintFromMotionSource,
  resolveCanonicalEventRowContractForDs4Assessment,
} from './ds4-assessment-input-fingerprint';

export type Ds4AssessmentMotionRunSourceV1 = {
  id: string;
  organizationId: string;
  vehicleId: string;
  tripId: string;
  shadowStatus: string;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  contentFingerprint: string;
  createdAt: Date;
  summaryContentFingerprint?: string | null;
};

export type Ds4TripAssessmentEventSummariesV1 = {
  acceptedAccelerationCount: number;
  acceptedDecelerationCount: number;
  artefactSuspectCount: number;
  ratedEventCount: number;
  unratedEventCount: number;
  accelerationOrdinalValues: number[];
  decelerationOrdinalValues: number[];
  usableTemporalCoverage: {
    labelCount: number;
    directFsmLabelCount: number;
    speedNumericCount: number;
  };
};

export type Ds4TripAssessmentCompletenessV1 = {
  motionRunSucceeded: boolean;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  eventRowContract: string | null;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  qualityPolicyVersion: string;
};

export type Ds4TripAssessmentComputeResultV1 = {
  assessmentVersion: typeof DS4_TRIP_ASSESSMENT_VERSION_V1;
  assessmentStatus: Ds4TripAssessmentStatusV1;
  evidenceQuality: string | null;
  reasonCodes: Ds4TripAssessmentReasonCodeV1[];
  completeness: Ds4TripAssessmentCompletenessV1;
  eventSummaries: Ds4TripAssessmentEventSummariesV1;
  speedAuthority: Ds4SpeedAuthorityPartitionV1 | null;
  eventRowContract: string | null;
  inputFingerprint: string;
  sourceMotionRunId: string;
  processingError: { code: string; message: string } | null;
};

function emptySummaries(): Ds4TripAssessmentEventSummariesV1 {
  return {
    acceptedAccelerationCount: 0,
    acceptedDecelerationCount: 0,
    artefactSuspectCount: 0,
    ratedEventCount: 0,
    unratedEventCount: 0,
    accelerationOrdinalValues: [],
    decelerationOrdinalValues: [],
    usableTemporalCoverage: { labelCount: 0, directFsmLabelCount: 0, speedNumericCount: 0 },
  };
}

function classifyEventKind(kind: string): 'ACCELERATION' | 'DECELERATION' | 'OTHER' {
  const k = kind.toUpperCase();
  if (k.includes('DECEL') || k === 'BRAKING') return 'DECELERATION';
  if (k.includes('ACCEL')) return 'ACCELERATION';
  return 'OTHER';
}

export function computeDs4TripAssessmentV1(input: {
  scope: { organizationId: string; vehicleId: string; tripId: string };
  motionRun: Ds4AssessmentMotionRunSourceV1 | null;
  payload: DiV0MotionCoreShadowPayloadV1 | null;
  qualityPolicy?: Ds4AssessmentQualityPolicyV1;
  now?: Date;
}): Ds4TripAssessmentComputeResultV1 {
  const qualityPolicy = input.qualityPolicy ?? DS4_ASSESSMENT_QUALITY_POLICY_V1_DEFAULT;
  const qualityPolicyVersion = qualityPolicy.policyVersion;
  const admission = evaluateDs4AssessmentFleetAdmissionV1(input.scope);
  if (!admission.admitted) {
    const reason: Ds4TripAssessmentReasonCodeV1 =
      admission.reason === 'ORGANIZATION_TENANCY_MISMATCH'
        ? 'ORGANIZATION_TENANCY_MISMATCH'
        : 'VEHICLE_NOT_IN_ASSESSMENT_FLEET';
    return {
      assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
      assessmentStatus: 'UNSUPPORTED',
      evidenceQuality: null,
      reasonCodes: [reason],
      completeness: {
        motionRunSucceeded: false,
        pinnedSnapshotHash: input.motionRun?.pinnedSnapshotHash ?? '',
        combinedInputIdentity: input.motionRun?.combinedInputIdentity ?? '',
        eventRowContract: null,
        speedAuthority: null,
        qualityPolicyVersion: qualityPolicy.policyVersion,
      },
      eventSummaries: emptySummaries(),
      speedAuthority: null,
      eventRowContract: null,
      inputFingerprint: computeDs4AssessmentInputFingerprint({
        sourceMotionRunId: input.motionRun?.id ?? 'none',
        pinnedSnapshotHash: input.motionRun?.pinnedSnapshotHash ?? 'none',
        combinedInputIdentity: input.motionRun?.combinedInputIdentity ?? 'none',
        contentFingerprint: input.motionRun?.contentFingerprint ?? 'none',
        eventRowContract: null,
        qualityPolicyVersion,
      }),
      sourceMotionRunId: input.motionRun?.id ?? '',
      processingError: null,
    };
  }

  if (!input.motionRun) {
    return {
      assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
      assessmentStatus: 'PENDING',
      evidenceQuality: null,
      reasonCodes: ['MOTION_RUN_MISSING'],
      completeness: {
        motionRunSucceeded: false,
        pinnedSnapshotHash: '',
        combinedInputIdentity: '',
        eventRowContract: null,
        speedAuthority: null,
        qualityPolicyVersion: qualityPolicy.policyVersion,
      },
      eventSummaries: emptySummaries(),
      speedAuthority: null,
      eventRowContract: null,
      inputFingerprint: computeDs4AssessmentInputFingerprint({
        sourceMotionRunId: 'pending',
        pinnedSnapshotHash: 'pending',
        combinedInputIdentity: 'pending',
        contentFingerprint: 'pending',
        eventRowContract: null,
        qualityPolicyVersion,
      }),
      sourceMotionRunId: '',
      processingError: null,
    };
  }

  if (input.motionRun.shadowStatus !== 'SUCCEEDED') {
    return {
      assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
      assessmentStatus: 'FAILED',
      evidenceQuality: null,
      reasonCodes: ['MOTION_RUN_NOT_SUCCEEDED'],
      completeness: {
        motionRunSucceeded: false,
        pinnedSnapshotHash: input.motionRun.pinnedSnapshotHash,
        combinedInputIdentity: input.motionRun.combinedInputIdentity,
        eventRowContract: null,
        speedAuthority: null,
        qualityPolicyVersion: qualityPolicy.policyVersion,
      },
      eventSummaries: emptySummaries(),
      speedAuthority: null,
      eventRowContract: null,
      inputFingerprint: computeDs4AssessmentInputFingerprint({
        sourceMotionRunId: input.motionRun.id,
        pinnedSnapshotHash: input.motionRun.pinnedSnapshotHash,
        combinedInputIdentity: input.motionRun.combinedInputIdentity,
        contentFingerprint: input.motionRun.contentFingerprint,
        eventRowContract: null,
        qualityPolicyVersion,
      }),
      sourceMotionRunId: input.motionRun.id,
      processingError: { code: 'MOTION_RUN_NOT_SUCCEEDED', message: input.motionRun.shadowStatus },
    };
  }

  if (!input.payload) {
    return {
      assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
      assessmentStatus: 'FAILED',
      evidenceQuality: null,
      reasonCodes: ['PROCESSING_ERROR'],
      completeness: {
        motionRunSucceeded: true,
        pinnedSnapshotHash: input.motionRun.pinnedSnapshotHash,
        combinedInputIdentity: input.motionRun.combinedInputIdentity,
        eventRowContract: null,
        speedAuthority: null,
        qualityPolicyVersion: qualityPolicy.policyVersion,
      },
      eventSummaries: emptySummaries(),
      speedAuthority: null,
      eventRowContract: null,
      inputFingerprint: computeDs4AssessmentInputFingerprint({
        sourceMotionRunId: input.motionRun.id,
        pinnedSnapshotHash: input.motionRun.pinnedSnapshotHash,
        combinedInputIdentity: input.motionRun.combinedInputIdentity,
        contentFingerprint: input.motionRun.contentFingerprint,
        eventRowContract: null,
        qualityPolicyVersion,
      }),
      sourceMotionRunId: input.motionRun.id,
      processingError: { code: 'PAYLOAD_DECODE_FAILED', message: 'missing payload' },
    };
  }

  const reasonCodes: Ds4TripAssessmentReasonCodeV1[] = [];
  const summaryFingerprint = (input.payload.summary as { contentFingerprint?: string } | undefined)
    ?.contentFingerprint;
  if (summaryFingerprint && summaryFingerprint !== input.motionRun.contentFingerprint) {
    reasonCodes.push('SOURCE_IDENTITY_MISMATCH');
  }
  if (input.motionRun.summaryContentFingerprint && input.motionRun.summaryContentFingerprint !== input.motionRun.contentFingerprint) {
    reasonCodes.push('SOURCE_IDENTITY_MISMATCH');
  }

  const qualityEval = evaluateDs4AssessmentQualityFromMotionPayload(input.payload);
  for (const code of qualityEval.reasonCodes) {
    if (!reasonCodes.includes(code)) reasonCodes.push(code);
  }

  const contractResolution = resolveMotionCoreShadowEventRowContract(input.payload);
  const canonicalFingerprint = computeDs4AssessmentInputFingerprintFromMotionSource({
    sourceMotionRunId: input.motionRun.id,
    pinnedSnapshotHash: input.motionRun.pinnedSnapshotHash,
    combinedInputIdentity: input.motionRun.combinedInputIdentity,
    contentFingerprint: input.motionRun.contentFingerprint,
    summaryJson: input.motionRun.summaryContentFingerprint
      ? { contentFingerprint: input.motionRun.summaryContentFingerprint }
      : null,
    payload: input.payload,
    qualityPolicyVersion,
  });
  if (!canonicalFingerprint.ok && canonicalFingerprint.code === 'SOURCE_IDENTITY_MISMATCH') {
    if (!reasonCodes.includes('SOURCE_IDENTITY_MISMATCH')) {
      reasonCodes.push('SOURCE_IDENTITY_MISMATCH');
    }
  }

  const eventRowContract = canonicalFingerprint.ok
    ? canonicalFingerprint.eventRowContract
    : resolveCanonicalEventRowContractForDs4Assessment(input.payload);

  const speedAuthority: Ds4SpeedAuthorityPartitionV1 | null =
    qualityEval.speedAuthority === 'AMBIGUOUS' ? null : qualityEval.speedAuthority;

  const summaries = emptySummaries();
  summaries.usableTemporalCoverage = {
    labelCount: qualityEval.labelCount,
    directFsmLabelCount: qualityEval.usableFsmDirectLabelCount,
    speedNumericCount: input.payload.summary?.speedNumericCount ?? input.payload.speeds?.filter((s) => s.speedKmh != null).length ?? 0,
  };

  for (const ev of input.payload.events ?? []) {
    if (ev.quality === 'ARTEFACT_SUSPECT') {
      summaries.artefactSuspectCount += 1;
      continue;
    }
    const kindClass = classifyEventKind(ev.kind);
    if (kindClass === 'ACCELERATION') summaries.acceptedAccelerationCount += 1;
    if (kindClass === 'DECELERATION') summaries.acceptedDecelerationCount += 1;

    const intensity = readPersistedMotionEventIntensityForPayload(input.payload, ev);
    if (intensity && isMotionCoreShadowIntensityConsumptionAllowed(contractResolution)) {
      summaries.ratedEventCount += 1;
      const magnitude = intensity.meanAccelMps2;
      if (kindClass === 'ACCELERATION') summaries.accelerationOrdinalValues.push(magnitude);
      if (kindClass === 'DECELERATION') summaries.decelerationOrdinalValues.push(magnitude);
    } else {
      summaries.unratedEventCount += 1;
    }
  }

  summaries.accelerationOrdinalValues.sort((a, b) => a - b);
  summaries.decelerationOrdinalValues.sort((a, b) => a - b);

  const inputFingerprint = canonicalFingerprint.ok
    ? canonicalFingerprint.inputFingerprint
    : computeDs4AssessmentInputFingerprint({
        sourceMotionRunId: input.motionRun.id,
        pinnedSnapshotHash: input.motionRun.pinnedSnapshotHash,
        combinedInputIdentity: input.motionRun.combinedInputIdentity,
        contentFingerprint: input.motionRun.contentFingerprint,
        eventRowContract,
        qualityPolicyVersion,
      });

  const completeness: Ds4TripAssessmentCompletenessV1 = {
    motionRunSucceeded: true,
    pinnedSnapshotHash: input.motionRun.pinnedSnapshotHash,
    combinedInputIdentity: input.motionRun.combinedInputIdentity,
    eventRowContract,
    speedAuthority,
    qualityPolicyVersion: qualityPolicy.policyVersion,
  };

  if (reasonCodes.includes('SOURCE_IDENTITY_MISMATCH')) {
    return {
      assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
      assessmentStatus: 'FAILED',
      evidenceQuality: input.payload.contract?.sparse?.channelOutcome ?? null,
      reasonCodes,
      completeness,
      eventSummaries: summaries,
      speedAuthority,
      eventRowContract,
      inputFingerprint,
      sourceMotionRunId: input.motionRun.id,
      processingError: { code: 'SOURCE_IDENTITY_MISMATCH', message: 'content fingerprint mismatch' },
    };
  }

  if (reasonCodes.includes('EVENT_ROW_CONTRACT_UNKNOWN')) {
    return {
      assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
      assessmentStatus: 'FAILED',
      evidenceQuality: input.payload.contract?.sparse?.channelOutcome ?? null,
      reasonCodes,
      completeness,
      eventSummaries: summaries,
      speedAuthority,
      eventRowContract,
      inputFingerprint,
      sourceMotionRunId: input.motionRun.id,
      processingError: { code: 'EVENT_ROW_CONTRACT_UNKNOWN', message: 'unknown event row contract' },
    };
  }

  if (reasonCodes.includes('SPEED_AUTHORITY_AMBIGUOUS') || speedAuthority == null) {
    return {
      assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
      assessmentStatus: 'INSUFFICIENT_EVIDENCE',
      evidenceQuality: input.payload.contract?.sparse?.channelOutcome ?? null,
      reasonCodes,
      completeness,
      eventSummaries: summaries,
      speedAuthority: null,
      eventRowContract,
      inputFingerprint,
      sourceMotionRunId: input.motionRun.id,
      processingError: null,
    };
  }

  if (reasonCodes.includes('INSUFFICIENT_TEMPORAL_LABELS')) {
    return {
      assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
      assessmentStatus: 'INSUFFICIENT_EVIDENCE',
      evidenceQuality: input.payload.contract?.sparse?.channelOutcome ?? null,
      reasonCodes,
      completeness,
      eventSummaries: summaries,
      speedAuthority,
      eventRowContract,
      inputFingerprint,
      sourceMotionRunId: input.motionRun.id,
      processingError: null,
    };
  }

  const acceptedTotal = summaries.acceptedAccelerationCount + summaries.acceptedDecelerationCount;
  if (acceptedTotal === 0) {
    reasonCodes.push('NO_ACCEPTED_MANOEUVRES_UNDER_OBSERVATION');
    return {
      assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
      assessmentStatus: 'UNRATED_COUNTS_ONLY',
      evidenceQuality: input.payload.contract?.sparse?.channelOutcome ?? null,
      reasonCodes,
      completeness,
      eventSummaries: summaries,
      speedAuthority,
      eventRowContract,
      inputFingerprint,
      sourceMotionRunId: input.motionRun.id,
      processingError: null,
    };
  }

  if (!qualityPolicy.ordinalTripRatingApproved) {
    if (summaries.ratedEventCount > 0) {
      reasonCodes.push('INTENSITY_ORDINAL_POLICY_NOT_APPROVED');
    }
    return {
      assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
      assessmentStatus: 'UNRATED_COUNTS_ONLY',
      evidenceQuality: input.payload.contract?.sparse?.channelOutcome ?? null,
      reasonCodes,
      completeness,
      eventSummaries: summaries,
      speedAuthority,
      eventRowContract,
      inputFingerprint,
      sourceMotionRunId: input.motionRun.id,
      processingError: null,
    };
  }

  if (summaries.ratedEventCount === 0) {
    return {
      assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
      assessmentStatus: 'UNRATED_COUNTS_ONLY',
      evidenceQuality: input.payload.contract?.sparse?.channelOutcome ?? null,
      reasonCodes,
      completeness,
      eventSummaries: summaries,
      speedAuthority,
      eventRowContract,
      inputFingerprint,
      sourceMotionRunId: input.motionRun.id,
      processingError: null,
    };
  }

  return {
    assessmentVersion: DS4_TRIP_ASSESSMENT_VERSION_V1,
    assessmentStatus: 'RATED',
    evidenceQuality: input.payload.contract?.sparse?.channelOutcome ?? null,
    reasonCodes,
    completeness,
    eventSummaries: summaries,
    speedAuthority,
    eventRowContract,
    inputFingerprint,
    sourceMotionRunId: input.motionRun.id,
    processingError: null,
  };
}

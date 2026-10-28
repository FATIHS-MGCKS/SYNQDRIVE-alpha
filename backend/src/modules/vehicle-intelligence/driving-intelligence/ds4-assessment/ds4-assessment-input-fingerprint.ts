import { createHash } from 'crypto';
import { DS4_TRIP_ASSESSMENT_VERSION_V1 } from './ds4-trip-assessment-v1.contract';

export function computeDs4AssessmentInputFingerprint(input: {
  sourceMotionRunId: string;
  pinnedSnapshotHash: string;
  combinedInputIdentity: string;
  contentFingerprint: string;
  eventRowContract: string | null;
  assessmentVersion?: string;
}): string {
  const payload = {
    assessmentVersion: input.assessmentVersion ?? DS4_TRIP_ASSESSMENT_VERSION_V1,
    sourceMotionRunId: input.sourceMotionRunId,
    pinnedSnapshotHash: input.pinnedSnapshotHash,
    combinedInputIdentity: input.combinedInputIdentity,
    contentFingerprint: input.contentFingerprint,
    eventRowContract: input.eventRowContract,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

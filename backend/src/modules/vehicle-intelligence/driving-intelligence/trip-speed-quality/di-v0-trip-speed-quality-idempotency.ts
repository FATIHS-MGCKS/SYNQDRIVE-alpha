import { createHash } from 'crypto';

export function buildDiV0TripSpeedQualityIdempotencyKey(input: {
  workItemId: string;
  shadowRunId: string;
  pinnedSnapshotHash: string;
  boundaryFingerprint: string;
  qcPolicyVersion: string;
  projectionVersion: string;
}): string {
  const material = [
    input.workItemId,
    input.shadowRunId,
    input.pinnedSnapshotHash,
    input.boundaryFingerprint,
    input.qcPolicyVersion,
    input.projectionVersion,
  ].join('|');
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

export function buildDiV0TripSpeedQualityContentFingerprint(projectionJson: string): string {
  return createHash('sha256').update(projectionJson, 'utf8').digest('hex');
}

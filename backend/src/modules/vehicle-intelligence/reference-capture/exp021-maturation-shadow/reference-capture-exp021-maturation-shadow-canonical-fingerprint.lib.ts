import { createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';

export type Exp021MaturationShadowCanonicalFingerprint = {
  referenceCaptureObservationCount: number;
  referenceCaptureSessionCount: number;
  exp021StudyRunCount: number;
  exp021StudyEnrollmentCount: number;
  settlementShadowExperimentCount: number;
  settlementShadowObservationCount: number;
};

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export async function captureCanonicalStateFingerprint(
  prisma: PrismaClient,
  scope: { organizationId: string; vehicleId: string },
): Promise<Exp021MaturationShadowCanonicalFingerprint> {
  const [
    referenceCaptureObservationCount,
    referenceCaptureSessionCount,
    exp021StudyRunCount,
    exp021StudyEnrollmentCount,
    settlementShadowExperimentCount,
    settlementShadowObservationCount,
  ] = await Promise.all([
    prisma.referenceCaptureObservation.count({
      where: { organizationId: scope.organizationId, vehicleId: scope.vehicleId },
    }),
    prisma.referenceCaptureSession.count({
      where: { organizationId: scope.organizationId, vehicleId: scope.vehicleId },
    }),
    prisma.exp021StudyRun.count({
      where: { organizationId: scope.organizationId, vehicleId: scope.vehicleId },
    }),
    prisma.exp021StudyEnrollment.count({
      where: { organizationId: scope.organizationId, vehicleId: scope.vehicleId },
    }),
    prisma.referenceCaptureSettlementShadowExperiment.count({
      where: { organizationId: scope.organizationId, vehicleId: scope.vehicleId },
    }),
    prisma.referenceCaptureSettlementShadowObservation.count({
      where: { organizationId: scope.organizationId, vehicleId: scope.vehicleId },
    }),
  ]);

  return {
    referenceCaptureObservationCount,
    referenceCaptureSessionCount,
    exp021StudyRunCount,
    exp021StudyEnrollmentCount,
    settlementShadowExperimentCount,
    settlementShadowObservationCount,
  };
}

export function fingerprintDigest(
  fingerprint: Exp021MaturationShadowCanonicalFingerprint,
): string {
  return sha256Hex(JSON.stringify(fingerprint));
}

export function fingerprintsIdentical(
  left: Exp021MaturationShadowCanonicalFingerprint,
  right: Exp021MaturationShadowCanonicalFingerprint,
): boolean {
  return fingerprintDigest(left) === fingerprintDigest(right);
}

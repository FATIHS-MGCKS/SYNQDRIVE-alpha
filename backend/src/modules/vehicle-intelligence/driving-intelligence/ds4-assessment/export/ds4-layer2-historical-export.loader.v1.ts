import type { PrismaClient } from '@prisma/client';
import { loadDs4LongitudinalEvidenceQualityContextV1 } from '../ds4-longitudinal-evidence-quality-context.loader.v1';
import {
  buildAssessmentExportRowV1,
  type Ds4Layer2HistoricalExportAssessmentRowV1,
  Ds4Layer2HistoricalExportIntegrityErrorV1,
  type Ds4Layer2HistoricalExportMotionPinV1,
} from './ds4-layer2-historical-export.v1';

export async function loadPersistedDs4Layer2HistoricalExportRowsV1(
  prisma: PrismaClient,
  organizationId: string,
): Promise<Ds4Layer2HistoricalExportAssessmentRowV1[]> {
  const assessments = await prisma.diV0Ds4TripAssessmentV1.findMany({
    where: { organizationId },
    orderBy: [{ vehicleId: 'asc' }, { tripId: 'asc' }, { inputFingerprint: 'asc' }],
  });

  const rows: Ds4Layer2HistoricalExportAssessmentRowV1[] = [];
  for (const assessment of assessments) {
    const motion = await prisma.diV0MotionCoreShadowRunV1.findUnique({
      where: { id: assessment.sourceMotionRunId },
      select: {
        id: true,
        organizationId: true,
        vehicleId: true,
        tripId: true,
        pinnedSnapshotHash: true,
        combinedInputIdentity: true,
        shadowBundleVersion: true,
        contentFingerprint: true,
        workItemId: true,
        shadowStatus: true,
      },
    });
    if (!motion) {
      throw new Ds4Layer2HistoricalExportIntegrityErrorV1(
        `Missing motion run ${assessment.sourceMotionRunId} for assessment ${assessment.id}`,
      );
    }
    if (motion.shadowStatus !== 'SUCCEEDED') {
      throw new Ds4Layer2HistoricalExportIntegrityErrorV1(
        `Motion run ${motion.id} status=${motion.shadowStatus} (expected SUCCEEDED)`,
      );
    }

    const workItem = await prisma.diV0S4WorkItem.findUnique({
      where: { id: motion.workItemId },
      select: { sourceFamily: true, organizationId: true, tripId: true },
    });
    if (workItem && workItem.organizationId !== organizationId) {
      throw new Ds4Layer2HistoricalExportIntegrityErrorV1(
        `Work item tenancy mismatch for motion ${motion.id}`,
      );
    }

    const motionPin: Ds4Layer2HistoricalExportMotionPinV1 = {
      motionRunId: motion.id,
      organizationId: motion.organizationId,
      vehicleId: motion.vehicleId,
      tripId: motion.tripId,
      pinnedSnapshotHash: motion.pinnedSnapshotHash,
      combinedInputIdentity: motion.combinedInputIdentity,
      shadowBundleVersion: motion.shadowBundleVersion,
      contentFingerprint: motion.contentFingerprint,
      workItemId: motion.workItemId,
      sourceFamily: workItem?.sourceFamily ?? null,
    };

    const evidenceQualityContext = await loadDs4LongitudinalEvidenceQualityContextV1(prisma, {
      organizationId: assessment.organizationId,
      tripId: assessment.tripId,
      pinnedSnapshotHash: assessment.pinnedSnapshotHash,
      sparseChannelOutcome: assessment.evidenceQuality,
    });

    rows.push(
      buildAssessmentExportRowV1({
        assessment,
        motionPin,
        evidenceQualityContext,
      }),
    );
  }
  return rows;
}

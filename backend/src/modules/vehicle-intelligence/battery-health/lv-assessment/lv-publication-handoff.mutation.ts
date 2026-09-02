import type { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { mergePublicationHandoffIntoAssessmentSummary } from './lv-publication-handoff.metadata';

export class LvPublicationHandoffMetadataConflictError extends Error {
  constructor(message = 'lv_publication_handoff_metadata_update_conflict_exhausted') {
    super(message);
    this.name = 'LvPublicationHandoffMetadataConflictError';
  }
}

const DEFAULT_MAX_ATTEMPTS = 8;

interface AssessmentInputSummaryRow {
  input_summary: Prisma.JsonValue;
}

/**
 * Row-locked mutation over BatteryAssessment.input_summary.publicationHandoff.
 * Uses SELECT … FOR UPDATE so producer/worker/reconcile races converge without
 * regressing MISSING → ENQUEUED → EXECUTED or clobbering unrelated summary keys.
 */
export async function mutateBatteryAssessmentPublicationHandoff(
  prisma: PrismaService,
  input: {
    assessmentId: string;
    organizationId: string;
    mutate: (inputSummary: Record<string, unknown>) => Prisma.InputJsonValue;
    maxAttempts?: number;
  },
): Promise<Prisma.InputJsonValue> {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<AssessmentInputSummaryRow[]>`
          SELECT input_summary
          FROM battery_assessments
          WHERE id = ${input.assessmentId}::uuid
            AND organization_id = ${input.organizationId}
          FOR UPDATE
        `;
        if (!rows.length) {
          throw new Error('lv_publication_handoff_assessment_not_found');
        }

        const current = rows[0].input_summary;
        const base =
          current && typeof current === 'object' && !Array.isArray(current)
            ? (current as Record<string, unknown>)
            : {};
        const nextInputSummary = input.mutate(base);

        const updated = await tx.batteryAssessment.updateMany({
          where: {
            id: input.assessmentId,
            organizationId: input.organizationId,
          },
          data: {
            inputSummary: nextInputSummary,
          },
        });

        if (updated.count !== 1) {
          return null;
        }

        return nextInputSummary;
      });

      if (result !== null) {
        return result;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'lv_publication_handoff_assessment_not_found'
      ) {
        throw error;
      }
      if (attempt === maxAttempts - 1) {
        throw error;
      }
    }
  }

  throw new LvPublicationHandoffMetadataConflictError();
}

export function mergePublicationHandoffPatchIntoSummary(
  inputSummary: Record<string, unknown>,
  handoffPatch: Parameters<typeof mergePublicationHandoffIntoAssessmentSummary>[1],
): Prisma.InputJsonValue {
  return mergePublicationHandoffIntoAssessmentSummary(
    inputSummary,
    handoffPatch,
  ) as Prisma.InputJsonValue;
}

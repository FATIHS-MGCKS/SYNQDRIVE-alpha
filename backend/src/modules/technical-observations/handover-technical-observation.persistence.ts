import {
  resolveObservationBlocksRental,
  handoverObservationIdempotencyKey,
  mapApiSeverityToUrgency,
} from '@shared/technical-observations/technical-observation-policy.util';
import {
  parseAffectedArea,
  parseCategory,
} from '@modules/technical-observations/technical-observations.mapper';
import type { HandoverTechnicalObservationDraft } from '@modules/bookings/handover.types';
import type { ComplaintSource, Prisma } from '@prisma/client';

export interface PersistHandoverObservationsInput {
  organizationId: string;
  vehicleId: string;
  bookingId: string;
  customerId: string;
  handoverProtocolId: string;
  stationId: string | null;
  createdByUserId: string;
  source: Extract<ComplaintSource, 'OPERATOR_HANDOVER' | 'OPERATOR_RETURN'>;
  drafts: HandoverTechnicalObservationDraft[];
}

export interface PersistHandoverObservationsResult {
  createdIds: string[];
  skippedDuplicateIds: string[];
}

export async function persistHandoverTechnicalObservationsInTransaction(
  tx: Prisma.TransactionClient,
  input: PersistHandoverObservationsInput,
): Promise<PersistHandoverObservationsResult> {
  const createdIds: string[] = [];
  const skippedDuplicateIds: string[] = [];
  const seenInBatch = new Set<string>();

  for (const draft of input.drafts) {
    const description = typeof draft.description === 'string' ? draft.description.trim() : '';
    if (description.length < 3) continue;

    const batchKey = handoverObservationIdempotencyKey(input.handoverProtocolId, description);
    if (seenInBatch.has(batchKey)) {
      continue;
    }
    seenInBatch.add(batchKey);

    const existing = await tx.vehicleComplaint.findFirst({
      where: {
        organizationId: input.organizationId,
        handoverProtocolId: input.handoverProtocolId,
        description: { equals: description, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existing) {
      skippedDuplicateIds.push(existing.id);
      continue;
    }

    const row = await tx.vehicleComplaint.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        createdByUserId: input.createdByUserId,
        description,
        urgency: mapApiSeverityToUrgency(draft.severity),
        category: parseCategory(draft.category),
        affectedArea: parseAffectedArea(draft.affectedArea),
        status: 'ACTIVE',
        source: input.source,
        blocksRental: resolveObservationBlocksRental(draft.blocksRental),
        bookingId: input.bookingId,
        customerId: input.customerId,
        handoverProtocolId: input.handoverProtocolId,
        stationId: input.stationId,
      },
      select: { id: true },
    });
    createdIds.push(row.id);
  }

  return { createdIds, skippedDuplicateIds };
}

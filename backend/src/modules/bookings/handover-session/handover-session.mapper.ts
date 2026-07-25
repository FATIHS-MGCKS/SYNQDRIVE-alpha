import type { BookingHandoverSession } from '@prisma/client';
import type { HandoverSessionBlocker, HandoverSessionDto } from './handover-session.types';

export function mapHandoverSessionRow(row: BookingHandoverSession): HandoverSessionDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    bookingId: row.bookingId,
    vehicleId: row.vehicleId,
    kind: row.kind,
    status: row.status,
    version: row.version,
    payload:
      row.payloadJson && typeof row.payloadJson === 'object' && !Array.isArray(row.payloadJson)
        ? (row.payloadJson as Record<string, unknown>)
        : null,
    blockingRequirements: parseBlockers(row.blockingRequirements),
    lockedByUserId: row.lockedByUserId,
    lockedAt: row.lockedAt?.toISOString() ?? null,
    scopeOverrideReason: row.scopeOverrideReason,
    cancelReason: row.cancelReason,
    supersededById: row.supersededById,
    completedProtocolId: row.completedProtocolId,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseBlockers(raw: unknown): HandoverSessionBlocker[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (b): b is HandoverSessionBlocker =>
      Boolean(b) &&
      typeof b === 'object' &&
      typeof (b as HandoverSessionBlocker).code === 'string' &&
      typeof (b as HandoverSessionBlocker).message === 'string',
  );
}

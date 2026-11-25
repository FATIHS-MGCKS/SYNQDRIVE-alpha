import { randomUUID } from 'node:crypto';

import type { PrismaService } from '@shared/database/prisma.service';
import {
  P4C_FORWARD_RAW_ARCHIVE_MAX_BYTES_V1,
  type P4cForwardRawArchiveV1,
  verifyP4cForwardRawArchive,
} from './start-proxy-pilot-raw-archive.v1';

export type PersistP4cForwardRawArchiveOutcomeV1 =
  | { ok: true; archiveId: string }
  | { ok: false; reason: 'integrity_failed' | 'too_large' | 'duplicate' | 'db_error' };

export async function persistP4cForwardRawArchiveV1(
  prisma: PrismaService,
  input: {
    organizationId: string;
    vehicleId: string;
    archive: P4cForwardRawArchiveV1;
    retentionDays: number;
    capturedAt: Date;
  },
): Promise<PersistP4cForwardRawArchiveOutcomeV1> {
  const integrity = verifyP4cForwardRawArchive(input.archive);
  if (!integrity.ok) {
    return { ok: false, reason: 'integrity_failed' };
  }

  const serialized = JSON.stringify(input.archive);
  if (serialized.length > P4C_FORWARD_RAW_ARCHIVE_MAX_BYTES_V1) {
    return { ok: false, reason: 'too_large' };
  }

  const retentionExpiresAt = new Date(
    input.capturedAt.getTime() + input.retentionDays * 24 * 60 * 60 * 1000,
  );

  try {
    const row = await prisma.batteryStartProxyPilotRawArchive.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tripId: input.archive.trip.tripId,
        pilotEpoch: input.archive.pilotEpoch,
        schemaVersion: input.archive.schemaVersion,
        queryFingerprint: input.archive.query.queryFingerprint,
        integritySha256: input.archive.integrity.digest,
        archiveJson: input.archive as object,
        requestLedgerTripId: input.archive.trip.tripId,
        capturedAt: input.capturedAt,
        retentionExpiresAt,
      },
      select: { id: true },
    });
    return { ok: true, archiveId: row.id };
  } catch (err: unknown) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? String((err as { code: string }).code)
        : '';
    if (code === 'P2002') {
      return { ok: false, reason: 'duplicate' };
    }
    return { ok: false, reason: 'db_error' };
  }
}

export async function loadP4cForwardRawArchiveForTripV1(
  prisma: PrismaService,
  input: { pilotEpoch: string; tripId: string },
): Promise<P4cForwardRawArchiveV1 | null> {
  const row = await prisma.batteryStartProxyPilotRawArchive.findUnique({
    where: {
      pilotEpoch_tripId: {
        pilotEpoch: input.pilotEpoch,
        tripId: input.tripId,
      },
    },
    select: { archiveJson: true },
  });
  if (!row?.archiveJson) return null;
  return row.archiveJson as P4cForwardRawArchiveV1;
}

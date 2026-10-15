import type { VehicleDtcSourceHead } from '@prisma/client';
import type { DtcSnapshotStoredHead } from './dtc-snapshot.types';

export function mapSourceHeadRow(row: VehicleDtcSourceHead | null): DtcSnapshotStoredHead {
  if (!row) {
    return {
      lastAcceptedSourceAtMs: null,
      lastAcceptedCodesHash: null,
      lastAcceptedBindingId: null,
      bindingEpoch: 0,
      dimoTokenId: null,
      lastConfirmedCompleteSourceAtMs: null,
      lastPartialWebhookSourceAtMs: null,
      lastPartialWebhookCodesHash: null,
    };
  }
  return {
    lastAcceptedSourceAtMs: row.lastAcceptedSourceAt
      ? row.lastAcceptedSourceAt.getTime()
      : null,
    lastAcceptedCodesHash: row.lastAcceptedCodesHash,
    lastAcceptedBindingId: row.providerBindingId,
    bindingEpoch: row.bindingEpoch,
    dimoTokenId: row.dimoTokenId,
    lastConfirmedCompleteSourceAtMs: row.lastConfirmedCompleteSourceAt
      ? row.lastConfirmedCompleteSourceAt.getTime()
      : null,
    lastPartialWebhookSourceAtMs: row.lastPartialWebhookSourceAt
      ? row.lastPartialWebhookSourceAt.getTime()
      : null,
    lastPartialWebhookCodesHash: row.lastPartialWebhookCodesHash,
  };
}

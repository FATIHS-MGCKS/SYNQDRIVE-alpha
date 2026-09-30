import type { DiV0S4fReadDb } from './di-v0-s4f-read-db';

/** Keyset cursor for bounded S4F diagnostic scans (beyond-horizon + work-item pagination). */
export interface DiV0S4fKeysetScanCursor {
  scanWatermarkCreatedAt: Date | null;
  settlementAnchorAt: Date | null;
  workItemId: string | null;
}

export const DI_V0_S4F_KEYSET_CURSOR_AUTHORITY =
  'SCAN_WATERMARK_CREATED_AT_THEN_SETTLEMENT_ANCHOR_AT_THEN_WORK_ITEM_ID' as const;

export function emptyDiV0S4fKeysetScanCursor(): DiV0S4fKeysetScanCursor {
  return { scanWatermarkCreatedAt: null, settlementAnchorAt: null, workItemId: null };
}

/**
 * Freezes scan population at first page: rows with created_at after the watermark belong to a later traversal.
 */
export async function resolveDiV0S4fScanWatermark(
  db: DiV0S4fReadDb,
  cursor: DiV0S4fKeysetScanCursor,
): Promise<{ watermark: Date; cursor: DiV0S4fKeysetScanCursor }> {
  if (cursor.scanWatermarkCreatedAt) {
    return { watermark: cursor.scanWatermarkCreatedAt, cursor };
  }
  const rows = await db.$queryRaw<Array<{ ts: Date }>>`SELECT clock_timestamp() AS ts`;
  const watermark = rows[0]?.ts ?? new Date();
  return {
    watermark,
    cursor: { ...cursor, scanWatermarkCreatedAt: watermark },
  };
}

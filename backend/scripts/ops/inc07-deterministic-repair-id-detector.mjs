/**
 * INC-07 deterministic INTRA_TRIP_GAP_SPLIT repair ID detector.
 *
 * CANONICAL_SOURCE: backend/src/modules/vehicle-intelligence/trips/reconciliation/intra-trip-gap-split-repair-id.util.ts
 * (`buildIntraTripGapSplitRepairAuditId`) — byte-for-byte equivalent semantics.
 *
 * Identity = SHA256(vehicleId|INTRA_TRIP_GAP_SPLIT|firstEndAt.toISOString()|secondStartAt.toISOString())
 * then first 32 hex chars formatted 8-4-4-4-12. NOT full 64-char SHA256 hex.
 */
import { createHash } from 'node:crypto';

export const REPAIR_TYPE_INTRA_TRIP_GAP_SPLIT = 'INTRA_TRIP_GAP_SPLIT';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalize PostgreSQL / JS timestamp inputs to UTC ISO milliseconds (Date.toISOString).
 *
 * @param {string | Date | number | null | undefined} value
 * @returns {string}
 */
export function canonicalizePostgresTimestampToUtcIso(value) {
  if (value == null || value === '') {
    throw new TypeError('timestamp value is required');
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError('invalid Date');
    }
    return value.toISOString();
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new TypeError('invalid epoch milliseconds');
    }
    return d.toISOString();
  }
  const raw = String(value).trim();
  if (!raw) {
    throw new TypeError('timestamp value is empty');
  }
  // Accept already-canonical ISO with Z.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw)) {
    return raw;
  }
  // Postgres text without TZ: treat as UTC (psql AT TIME ZONE 'UTC' output).
  const pgUtc =
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?$/.test(raw);
  if (pgUtc) {
    const normalized = raw.replace(' ', 'T');
    const withMs = normalized.includes('.')
      ? normalized
      : `${normalized}.000`;
    const ms = withMs.match(/\.(\d+)/)?.[1] ?? '000';
    const ms3 = ms.padEnd(3, '0').slice(0, 3);
    const base = withMs.replace(/\.\d+$/, '');
    const d = new Date(`${base}.${ms3}Z`);
    if (Number.isNaN(d.getTime())) {
      throw new TypeError(`unparseable postgres timestamp: ${raw}`);
    }
    return d.toISOString();
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`unparseable timestamp: ${raw}`);
  }
  return d.toISOString();
}

/**
 * @param {string} vehicleId
 * @param {string | Date} gapFirstEndAt window_from / first segment end
 * @param {string | Date} gapSecondStartAt window_to / second segment start
 * @returns {string}
 */
export function buildIntraTripGapSplitRepairAuditId(
  vehicleId,
  gapFirstEndAt,
  gapSecondStartAt,
) {
  const firstEndIso =
    gapFirstEndAt instanceof Date
      ? gapFirstEndAt.toISOString()
      : canonicalizePostgresTimestampToUtcIso(gapFirstEndAt);
  const secondStartIso =
    gapSecondStartAt instanceof Date
      ? gapSecondStartAt.toISOString()
      : canonicalizePostgresTimestampToUtcIso(gapSecondStartAt);

  const digest = createHash('sha256')
    .update(
      [
        vehicleId,
        REPAIR_TYPE_INTRA_TRIP_GAP_SPLIT,
        firstEndIso,
        secondStartIso,
      ].join('|'),
    )
    .digest('hex');

  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join('-');
}

/**
 * @param {string} repairId
 * @param {string} vehicleId
 * @param {string | Date} windowFrom
 * @param {string | Date} windowTo
 * @returns {boolean}
 */
export function isDeterministicIntraTripGapSplitRepairId(
  repairId,
  vehicleId,
  windowFrom,
  windowTo,
) {
  if (!UUID_RE.test(repairId)) {
    return false;
  }
  const expected = buildIntraTripGapSplitRepairAuditId(
    vehicleId,
    windowFrom,
    windowTo,
  );
  return repairId.toLowerCase() === expected.toLowerCase();
}

/**
 * @param {Array<{ id: string; vehicle_id: string; window_from: string | Date; window_to: string | Date }>} rows
 * @returns {number}
 */
export function countDeterministicIntraTripGapSplitRepairIds(rows) {
  let count = 0;
  for (const row of rows) {
    if (
      isDeterministicIntraTripGapSplitRepairId(
        row.id,
        row.vehicle_id,
        row.window_from,
        row.window_to,
      )
    ) {
      count += 1;
    }
  }
  return count;
}

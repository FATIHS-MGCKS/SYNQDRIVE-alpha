/**
 * Raw payload size guard.
 *
 * Several "latest state" tables persist a raw provider payload JSON
 * (`vehicle_latest_states.raw_payload_json`, `hm_latest_*.raw_signals_json`).
 * These are upserted (one row per vehicle) and the HM ingestion path *merges*
 * accumulated signal groups, so a payload can grow over time.
 *
 * `capRawPayload` is an OPT-IN safety valve: when `RAW_PAYLOAD_MAX_BYTES` is set
 * to a value > 0, payloads whose serialized size exceeds the cap are replaced
 * with a small truncation marker instead of being stored verbatim. This keeps a
 * pathological payload from bloating the row without changing default behavior.
 *
 * Default (`RAW_PAYLOAD_MAX_BYTES` unset or 0) = disabled = unchanged behavior.
 */

const RAW_PAYLOAD_MAX_BYTES = (() => {
  const n = parseInt(process.env.RAW_PAYLOAD_MAX_BYTES || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
})();

export interface TruncatedPayloadMarker {
  __truncated: true;
  reason: 'raw_payload_exceeds_cap';
  bytes: number;
  maxBytes: number;
  at: string;
}

/**
 * Returns the value unchanged when the size cap is disabled or not exceeded;
 * otherwise returns a compact truncation marker.
 */
export function capRawPayload<T>(value: T): T | TruncatedPayloadMarker {
  if (RAW_PAYLOAD_MAX_BYTES <= 0 || value == null) return value;

  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    // Non-serializable (circular, etc.) — leave as-is; Prisma will reject if invalid.
    return value;
  }

  if (bytes <= RAW_PAYLOAD_MAX_BYTES) return value;

  return {
    __truncated: true,
    reason: 'raw_payload_exceeds_cap',
    bytes,
    maxBytes: RAW_PAYLOAD_MAX_BYTES,
    at: new Date().toISOString(),
  };
}

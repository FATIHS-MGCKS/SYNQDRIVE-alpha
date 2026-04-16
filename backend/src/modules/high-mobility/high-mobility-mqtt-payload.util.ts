/**
 * Safe helpers for HM MQTT V2 JSON payloads (structure varies by vehicle / package).
 */

/** Dot/bracket path, e.g. "data.diagnostics" */
export function getNestedValue(obj: unknown, path: string): unknown {
  if (obj == null || typeof obj !== 'object' || !path) return undefined;
  const parts = path.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function hasNestedPath(obj: unknown, path: string): boolean {
  return getNestedValue(obj, path) !== undefined;
}

/** HM signal id -> nested MQTT V2 path (diagnostics.get.x -> diagnostics.x) */
export function toHmSignalPath(signalId: string): string {
  return signalId.replace('.get.', '.');
}

/** MQTT V2 arrays carry samples; we read the newest/first item */
export function unwrapHmSignalSample(entry: unknown): unknown {
  if (Array.isArray(entry)) {
    return entry.length > 0 ? entry[0] : null;
  }
  return entry;
}

/**
 * Returns the payload "data" object for a signal entry.
 * Supports both:
 *   - { value, unit, timestamp }
 *   - { data: { value, ... }, timestamp }
 */
export function extractHmSignalData(entry: unknown): unknown {
  const sample = unwrapHmSignalSample(entry);
  if (sample == null || typeof sample !== 'object') return sample;
  const record = sample as Record<string, unknown>;
  if (record.data !== undefined && record.data !== null) return record.data;
  return sample;
}

/** Returns the scalar signal value where available, otherwise the data object */
export function extractHmSignalValue(entry: unknown): unknown {
  const data = extractHmSignalData(entry);
  if (data == null || typeof data !== 'object') return data;
  const record = data as Record<string, unknown>;
  if (record.value !== undefined) return record.value;
  return data;
}

/**
 * Resolve a signal entry from heterogeneous HM payload shapes.
 * Search order:
 *   1) payload.properties[signalId|alias]
 *   2) payload.data.<convertedPath>
 *   3) payload.<convertedPath>
 */
export function resolveHmSignalEntry(
  payload: Record<string, unknown> | null | undefined,
  signalId: string,
  aliases: string[] = [],
): unknown {
  if (!payload) return null;

  const lookupIds = [signalId, ...aliases];
  const properties = payload.properties;
  if (properties && typeof properties === 'object') {
    const props = properties as Record<string, unknown>;
    for (const id of lookupIds) {
      const direct = props[id];
      if (direct !== undefined && direct !== null) return direct;
    }
  }

  const dataObj = payload.data;
  if (dataObj && typeof dataObj === 'object') {
    const data = dataObj as Record<string, unknown>;
    for (const id of lookupIds) {
      const direct = data[id];
      if (direct !== undefined && direct !== null) return direct;

      const nested = getNestedValue(data, toHmSignalPath(id));
      if (nested !== undefined && nested !== null) return nested;
    }
  }

  for (const id of lookupIds) {
    const rootNested = getNestedValue(payload, toHmSignalPath(id));
    if (rootNested !== undefined && rootNested !== null) return rootNested;
  }

  return null;
}

export interface HmMqttJsonPreview {
  messageId: string | null;
  vin: string | null;
  version: string | null;
  dataTopLevelKeys: string[];
  topLevelKeys: string[];
  parseError?: string;
  emptyData: boolean;
}

/**
 * Lightweight parse for logging — never throws.
 */
export function extractHmMqttJsonPreview(payload: Buffer): HmMqttJsonPreview {
  try {
    const parsed = JSON.parse(payload.toString('utf-8')) as Record<string, unknown>;
    const data = parsed?.data;
    const dataKeys =
      data != null && typeof data === 'object' && !Array.isArray(data)
        ? Object.keys(data as object)
        : [];
    const topLevelKeys = Object.keys(parsed);
    return {
      messageId: (parsed.message_id as string) ?? (parsed.messageId as string) ?? null,
      vin: (parsed.vin as string) ?? (parsed.vehicleVin as string) ?? null,
      version:
        (parsed.version as string) ??
        (parsed.api_version as string) ??
        (parsed.schema_version as string) ??
        null,
      dataTopLevelKeys: dataKeys,
      topLevelKeys,
      emptyData: dataKeys.length === 0,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      messageId: null,
      vin: null,
      version: null,
      dataTopLevelKeys: [],
      topLevelKeys: [],
      parseError: msg,
      emptyData: true,
    };
  }
}

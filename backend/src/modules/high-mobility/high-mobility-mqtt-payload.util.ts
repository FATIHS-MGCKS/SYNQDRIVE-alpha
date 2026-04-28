/**
 * Safe helpers for HM MQTT V2 JSON payloads (structure varies by vehicle / package).
 *
 * Reference: https://docs.high-mobility.com/docs/vehicle-data/mqtt-v2
 * Real-world payload shape (Mercedes fleet clearance, verified 2026-04-17):
 *
 *   {
 *     "version": 2,
 *     "application_id": "...",
 *     "message_id": "...",
 *     "vin": "...",
 *     "data": {
 *       "maintenance":       { "time_to_next_service": [ { "data": { "value": N, "unit": "days" },     "timestamp": "..." } ] },
 *       "diagnostics":       { "battery_voltage":      [ { "data": { "value": N, "unit": "volts" },    "timestamp": "..." } ] },
 *       "diagnostics":       { "tire_pressures":      [ { "data": { "location": "front_left",
 *                                                                    "pressure": { "value": 275, "unit": "kilopascals" } } } ] },
 *       "vehicle_location":  { "coordinates":         [ { "data": { "latitude": 11.5, "longitude": 8.4 }, "timestamp": "..." } ] }
 *     }
 *   }
 *
 * HM publishes ONE capability group per message (often ONE signal), not a fat snapshot.
 * Consumers must therefore be additive (merge incoming deltas into cached state).
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
 * Return ALL array samples of an HM signal entry (newest-first convention
 * not guaranteed by HM; callers that need ordering should sort by timestamp).
 * For non-array entries returns a single-element array so callers can iterate
 * uniformly.
 */
export function unwrapHmSignalSamples(entry: unknown): unknown[] {
  if (entry === null || entry === undefined) return [];
  if (Array.isArray(entry)) return entry;
  return [entry];
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

export type HmWheelPosition = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';

const HM_WHEEL_KEY_MAP: Record<string, HmWheelPosition> = {
  front_left: 'frontLeft',
  frontleft: 'frontLeft',
  'front-left': 'frontLeft',
  fl: 'frontLeft',
  front_right: 'frontRight',
  frontright: 'frontRight',
  'front-right': 'frontRight',
  fr: 'frontRight',
  rear_left: 'rearLeft',
  rearleft: 'rearLeft',
  'rear-left': 'rearLeft',
  rl: 'rearLeft',
  rear_right: 'rearRight',
  rearright: 'rearRight',
  'rear-right': 'rearRight',
  rr: 'rearRight',
};

function normalizeWheelKey(raw: unknown): HmWheelPosition | null {
  if (typeof raw !== 'string') return null;
  return HM_WHEEL_KEY_MAP[raw.toLowerCase().trim()] ?? null;
}

function kilopascalToBar(val: number): number {
  return Math.round((val / 100) * 100) / 100;
}

export interface HmNormalizedTirePressures {
  frontLeft: number | null;
  frontRight: number | null;
  rearLeft: number | null;
  rearRight: number | null;
  unit: 'bar';
  /** Source data shape detected: "legacy" (object keyed by wheel) or "array" (MQTT V2 per-wheel samples) */
  shape: 'legacy' | 'array' | 'unknown';
}

/**
 * Normalize HM tire pressures to the canonical `{ frontLeft, frontRight, rearLeft, rearRight, unit: "bar" }`
 * shape the UI expects — supports BOTH observed wire formats:
 *
 * 1. "array" (MQTT V2 per-wheel samples, Mercedes fleet-clearance, verified 2026-04-14):
 *    [
 *      { data: { location: "front_left",  pressure: { value: 275, unit: "kilopascals" } } },
 *      { data: { location: "front_right", pressure: { value: 285, unit: "kilopascals" } } },
 *      …
 *    ]
 *
 * 2. "legacy" (pre-existing object shape — still produced by REST command / older payloads):
 *    { front_left: { value: 2.75, unit: "bar" }, front_right: { value: 2.85 }, … }
 *      OR
 *    { frontLeft: 2.75, frontRight: 2.85, rearLeft: 2.77, rearRight: 2.82 }
 *
 * Always returns values in **bar** (kilopascals are divided by 100). Missing wheels → null.
 */
export function normalizeHmTirePressures(raw: unknown): HmNormalizedTirePressures | null {
  if (raw === null || raw === undefined) return null;

  const result: HmNormalizedTirePressures = {
    frontLeft: null,
    frontRight: null,
    rearLeft: null,
    rearRight: null,
    unit: 'bar',
    shape: 'unknown',
  };

  const samples = unwrapHmSignalSamples(raw);

  const looksLikeArrayShape =
    samples.length > 0 &&
    samples.every((s) => {
      if (s === null || typeof s !== 'object') return false;
      const data = (s as Record<string, unknown>).data ?? s;
      if (!data || typeof data !== 'object') return false;
      return 'location' in (data as Record<string, unknown>) && 'pressure' in (data as Record<string, unknown>);
    });

  if (looksLikeArrayShape) {
    result.shape = 'array';
    for (const sample of samples) {
      const data = ((sample as Record<string, unknown>).data ?? sample) as Record<string, unknown>;
      const pos = normalizeWheelKey(data.location);
      if (!pos) continue;
      const pressure = data.pressure as Record<string, unknown> | undefined;
      const valueRaw = pressure?.value;
      const unit = (pressure?.unit as string | undefined)?.toLowerCase();
      if (typeof valueRaw !== 'number' || !Number.isFinite(valueRaw)) continue;
      const valueBar = unit === 'kilopascals' || unit === 'kpa' ? kilopascalToBar(valueRaw) : valueRaw;
      result[pos] = valueBar;
    }
    return result;
  }

  if (typeof raw === 'object') {
    result.shape = 'legacy';
    const obj = raw as Record<string, unknown>;
    const readWheel = (aliases: string[]): number | null => {
      for (const a of aliases) {
        const v = obj[a];
        if (v === undefined || v === null) continue;
        if (typeof v === 'number' && Number.isFinite(v)) return v;
        if (typeof v === 'object') {
          const nested = (v as Record<string, unknown>).value;
          if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
        }
      }
      return null;
    };
    result.frontLeft = readWheel(['frontLeft', 'front_left', 'FL', 'fl']);
    result.frontRight = readWheel(['frontRight', 'front_right', 'FR', 'fr']);
    result.rearLeft = readWheel(['rearLeft', 'rear_left', 'RL', 'rl']);
    result.rearRight = readWheel(['rearRight', 'rear_right', 'RR', 'rr']);

    // Some legacy payloads come in kilopascals — heuristic: values > 50 almost certainly kPa
    const values = [result.frontLeft, result.frontRight, result.rearLeft, result.rearRight].filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v),
    );
    const looksLikeKpa = values.length > 0 && values.every((v) => v > 50);
    if (looksLikeKpa) {
      result.frontLeft = result.frontLeft !== null ? kilopascalToBar(result.frontLeft) : null;
      result.frontRight = result.frontRight !== null ? kilopascalToBar(result.frontRight) : null;
      result.rearLeft = result.rearLeft !== null ? kilopascalToBar(result.rearLeft) : null;
      result.rearRight = result.rearRight !== null ? kilopascalToBar(result.rearRight) : null;
    }
    return result;
  }

  return null;
}

export interface HmNormalizedTirePressureStatuses {
  frontLeft: string | null;
  frontRight: string | null;
  rearLeft: string | null;
  rearRight: string | null;
  shape: 'legacy' | 'array' | 'unknown';
}

/**
 * Normalize HM tire_pressure_statuses to canonical {frontLeft, …} object.
 * Supports array-with-location shape AND legacy keyed-object shape.
 */
export function normalizeHmTirePressureStatuses(raw: unknown): HmNormalizedTirePressureStatuses | null {
  if (raw === null || raw === undefined) return null;
  const result: HmNormalizedTirePressureStatuses = {
    frontLeft: null,
    frontRight: null,
    rearLeft: null,
    rearRight: null,
    shape: 'unknown',
  };

  const samples = unwrapHmSignalSamples(raw);
  const looksLikeArrayShape =
    samples.length > 0 &&
    samples.every((s) => {
      if (s === null || typeof s !== 'object') return false;
      const data = (s as Record<string, unknown>).data ?? s;
      if (!data || typeof data !== 'object') return false;
      const d = data as Record<string, unknown>;
      return 'location' in d && ('status' in d || 'tire_pressure_status' in d);
    });

  if (looksLikeArrayShape) {
    result.shape = 'array';
    for (const sample of samples) {
      const data = ((sample as Record<string, unknown>).data ?? sample) as Record<string, unknown>;
      const pos = normalizeWheelKey(data.location);
      if (!pos) continue;
      const status = (data.status ?? data.tire_pressure_status) as unknown;
      if (typeof status === 'string' && status.length > 0) result[pos] = status;
    }
    return result;
  }

  if (typeof raw === 'object') {
    result.shape = 'legacy';
    const obj = raw as Record<string, unknown>;
    const readWheel = (aliases: string[]): string | null => {
      for (const a of aliases) {
        const v = obj[a];
        if (typeof v === 'string' && v.length > 0) return v;
      }
      return null;
    };
    result.frontLeft = readWheel(['frontLeft', 'front_left']);
    result.frontRight = readWheel(['frontRight', 'front_right']);
    result.rearLeft = readWheel(['rearLeft', 'rear_left']);
    result.rearRight = readWheel(['rearRight', 'rear_right']);
    return result;
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

import type { HfSignalGroup } from './clickhouse-hf.types';

/**
 * HF signal → signal-group mapping / normalization.
 *
 * Pure, side-effect-free helper. It does NOT call DIMO or change any polling.
 * It only classifies DIMO/internal signal names into coarse analytics groups
 * used by the HF ClickHouse layer.
 */

/** Normalize a signal name to a comparable key (lowercase, alphanumeric only). */
function normalizeKey(signalName: string): string {
  return signalName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Exact, authoritative mappings for known DIMO / internal signal names.
 * Keys are pre-normalized (lowercase, alphanumeric only).
 */
const EXACT_GROUP_MAP: Record<string, HfSignalGroup> = {
  // speed
  speed: 'speed',
  // gps
  latitude: 'gps',
  longitude: 'gps',
  currentlocationlatitude: 'gps',
  currentlocationlongitude: 'gps',
  // powertrain
  odometer: 'powertrain',
  powertraintransmissiontraveleddistance: 'powertrain',
  tractionpower: 'powertrain',
  power: 'powertrain',
  powertraintractionbatterycurrentpower: 'powertrain',
  powertraincombustionenginespeed: 'powertrain',
  powertraincombustionengineect: 'powertrain',
  obdenginecoolanttemperature: 'powertrain',
  obdthrottleposition: 'powertrain',
  obdengineload: 'powertrain',
  // battery (state-of-charge / energy level)
  evsoc: 'battery',
  stateofcharge: 'battery',
  powertraintractionbatterystateofchargecurrent: 'battery',
  powertraintractionbatterystateofcharge: 'battery',
  // charging
  chargingpower: 'charging',
  powertraintractionbatterychargingchargecurrent: 'charging',
  powertraintractionbatterycharginingisstopped: 'charging',
  // tire
  tirepressure: 'tire',
  // environment
  exteriorairtemperature: 'environment',
};

/**
 * Resolve the analytics signal group for a given signal name.
 * Falls back to keyword heuristics, then 'unknown'.
 *
 * Ordering of heuristics is deliberate to avoid mis-classification, e.g.
 * `chargingPower` → 'charging' (not 'powertrain'), and
 * `powertrainCombustionEngineSpeed` (RPM) → 'powertrain' (not 'speed').
 */
export function resolveSignalGroup(
  signalName: string | null | undefined,
): HfSignalGroup {
  if (!signalName) return 'unknown';

  const key = normalizeKey(signalName);
  if (!key) return 'unknown';

  const exact = EXACT_GROUP_MAP[key];
  if (exact) return exact;

  // Keyword heuristics (ordered).
  if (key.includes('soc') || key.includes('stateofcharge')) return 'battery';
  if (key.includes('charg')) return 'charging';
  if (key.includes('tire') || key.includes('tyre')) return 'tire';
  if (key.includes('brake')) return 'brake';
  if (
    key.includes('latitude') ||
    key.includes('longitude') ||
    key.includes('gps') ||
    key.includes('location')
  ) {
    return 'gps';
  }
  if (
    key.includes('power') ||
    key.includes('traction') ||
    key.includes('rpm') ||
    key.includes('engine') ||
    key.includes('odometer') ||
    key.includes('throttle') ||
    key.includes('load') ||
    key.includes('torque') ||
    key.includes('fuel')
  ) {
    return 'powertrain';
  }
  if (key.includes('battery')) return 'battery';
  if (
    key.includes('temp') ||
    key.includes('ambient') ||
    key.includes('air') ||
    key.includes('environment')
  ) {
    return 'environment';
  }
  if (key.includes('speed')) return 'speed';

  return 'unknown';
}

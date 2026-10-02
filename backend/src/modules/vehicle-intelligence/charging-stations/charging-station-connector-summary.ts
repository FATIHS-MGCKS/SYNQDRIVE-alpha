import type { ChargingStationConnectorSummary } from './charging-station-location.types';

const SOCKET_PREFIX = 'socket:';
const OUTPUT_SUFFIX = ':output';

/** Conservative parse of OSM power strings (e.g. "22 kW", "350 kW;90 kW"). */
export function parsePowerKwValues(raw: string | undefined | null): number[] {
  if (raw == null) return [];
  const text = String(raw).trim();
  if (!text) return [];
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*kW/gi)];
  const values: number[] = [];
  for (const match of matches) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 2000) {
      values.push(parsed);
    }
  }
  return values;
}

export function parseSinglePowerKw(raw: string | undefined | null): number | undefined {
  const values = parsePowerKwValues(raw);
  if (values.length === 0) return undefined;
  return Math.max(...values);
}

export function summarizeConnectorsFromTags(
  tags: Record<string, string> | null | undefined,
): ChargingStationConnectorSummary[] {
  if (!tags) return [];

  const byType = new Map<string, ChargingStationConnectorSummary>();

  for (const [key, rawValue] of Object.entries(tags)) {
    if (!key.startsWith(SOCKET_PREFIX)) continue;
    if (key.endsWith(OUTPUT_SUFFIX)) continue;

    const type = key.slice(SOCKET_PREFIX.length).trim();
    if (!type) continue;

    const countText = String(rawValue).trim();
    let count: number | undefined;
    if (/^\d+$/.test(countText)) {
      const parsed = Number(countText);
      if (parsed > 0) count = parsed;
    }

    const outputKey = `${key}${OUTPUT_SUFFIX}`;
    const maxOutputKw = parseSinglePowerKw(tags[outputKey] ?? tags[`${SOCKET_PREFIX}${type}${OUTPUT_SUFFIX}`]);

    const existing = byType.get(type);
    if (existing) {
      const mergedCount = (existing.count ?? 0) + (count ?? 0);
      byType.set(type, {
        type,
        count: mergedCount > 0 ? mergedCount : undefined,
        maxOutputKw: maxOutputKw ?? existing.maxOutputKw,
      });
    } else {
      byType.set(type, { type, count, maxOutputKw });
    }
  }

  return [...byType.values()].sort((a, b) => a.type.localeCompare(b.type));
}

export function deriveStationMaxOutputKw(
  connectors: ChargingStationConnectorSummary[],
  tags: Record<string, string> | null | undefined,
): number | undefined {
  const fromConnectors = connectors
    .map((c) => c.maxOutputKw)
    .filter((v): v is number => typeof v === 'number');
  if (fromConnectors.length > 0) {
    return Math.max(...fromConnectors);
  }
  if (!tags) return undefined;
  return (
    parseSinglePowerKw(tags['charging_station:output']) ??
    parseSinglePowerKw(tags['maxpower']) ??
    undefined
  );
}

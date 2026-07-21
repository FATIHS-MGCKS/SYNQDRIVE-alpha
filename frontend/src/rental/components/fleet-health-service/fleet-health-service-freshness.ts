import type { VehicleHealthResponse } from '../../../lib/api';

export interface FleetHealthServiceFreshnessInput {
  healthFetchedAt: string | null;
  healthMap: Map<string, VehicleHealthResponse>;
  vehicleIds: string[];
  tasksFetchedAt: string | null;
  vendorsFetchedAt: string | null;
  serviceCasesFetchedAt: string | null;
}

export interface FleetHealthServiceFreshness {
  healthFetchedAt: string | null;
  oldestRelevantHealthSourceAt: string | null;
  tasksFetchedAt: string | null;
  vendorsFetchedAt: string | null;
  serviceCasesFetchedAt: string | null;
  partialHealthVehicleCount: number;
  unavailableHealthVehicleCount: number;
  staleModuleCount: number;
}

export interface FleetHealthServiceFreshnessDetailRow {
  key: string;
  label: string;
  value: string;
}

export function parseTimestampMs(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== 'string') return null;
  const trimmed = iso.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

export function toIsoTimestamp(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function formatRelativeTimeAt(
  iso: string | null | undefined,
  nowMs: number,
  locale: 'de' | 'en' = 'en',
): string {
  const parsed = parseTimestampMs(iso);
  if (parsed == null) return locale === 'de' ? 'unbekannt' : 'unknown';

  const diffMs = nowMs - parsed;
  if (!Number.isFinite(diffMs)) return locale === 'de' ? 'unbekannt' : 'unknown';

  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return locale === 'de' ? 'gerade eben' : 'just now';
  if (mins < 60) return locale === 'de' ? `vor ${mins} Min.` : `${mins}m ago`;

  const hours = Math.round(mins / 60);
  if (hours < 48) return locale === 'de' ? `vor ${hours} Std.` : `${hours}h ago`;

  const days = Math.round(hours / 24);
  return locale === 'de' ? `vor ${days} T.` : `${days}d ago`;
}

function isTrackableHealthModule(
  mod: VehicleHealthResponse['modules'][keyof VehicleHealthResponse['modules']],
): boolean {
  return mod.state !== 'n_a';
}

function oldestMeasurementForVehicle(health: VehicleHealthResponse): string | null {
  let oldestMs: number | null = null;
  let oldestIso: string | null = null;

  for (const mod of Object.values(health.modules)) {
    if (!isTrackableHealthModule(mod)) continue;
    const ms = parseTimestampMs(mod.last_updated_at);
    if (ms == null) continue;
    if (oldestMs == null || ms < oldestMs) {
      oldestMs = ms;
      oldestIso = mod.last_updated_at;
    }
  }

  if (oldestIso) return oldestIso;

  return parseTimestampMs(health.generated_at) != null ? health.generated_at : null;
}

export function computeOldestRelevantHealthSourceAt(
  healthMap: Map<string, VehicleHealthResponse>,
  vehicleIds: string[],
): string | null {
  let oldestMs: number | null = null;
  let oldestIso: string | null = null;

  for (const vehicleId of vehicleIds) {
    const health = healthMap.get(vehicleId);
    if (!health) continue;
    const vehicleOldest = oldestMeasurementForVehicle(health);
    const ms = parseTimestampMs(vehicleOldest);
    if (ms == null) continue;
    if (oldestMs == null || ms < oldestMs) {
      oldestMs = ms;
      oldestIso = vehicleOldest;
    }
  }

  return oldestIso;
}

export function countFleetHealthAvailability(
  healthMap: Map<string, VehicleHealthResponse>,
  vehicleIds: string[],
): { partialHealthVehicleCount: number; unavailableHealthVehicleCount: number } {
  let partialHealthVehicleCount = 0;
  let unavailableHealthVehicleCount = 0;

  for (const vehicleId of vehicleIds) {
    const health = healthMap.get(vehicleId);
    if (!health) continue;
    if (health.availability === 'partial') partialHealthVehicleCount += 1;
    if (health.availability === 'unavailable') unavailableHealthVehicleCount += 1;
  }

  return { partialHealthVehicleCount, unavailableHealthVehicleCount };
}

export function countFleetStaleModules(
  healthMap: Map<string, VehicleHealthResponse>,
  vehicleIds: string[],
): number {
  let staleModuleCount = 0;

  for (const vehicleId of vehicleIds) {
    const health = healthMap.get(vehicleId);
    if (!health) continue;
    for (const mod of Object.values(health.modules)) {
      if (!isTrackableHealthModule(mod)) continue;
      if (mod.data_stale) staleModuleCount += 1;
    }
  }

  return staleModuleCount;
}

export function buildFleetHealthServiceFreshness(
  input: FleetHealthServiceFreshnessInput,
): FleetHealthServiceFreshness {
  const { partialHealthVehicleCount, unavailableHealthVehicleCount } = countFleetHealthAvailability(
    input.healthMap,
    input.vehicleIds,
  );

  return {
    healthFetchedAt: input.healthFetchedAt,
    oldestRelevantHealthSourceAt: computeOldestRelevantHealthSourceAt(
      input.healthMap,
      input.vehicleIds,
    ),
    tasksFetchedAt: input.tasksFetchedAt,
    vendorsFetchedAt: input.vendorsFetchedAt,
    serviceCasesFetchedAt: input.serviceCasesFetchedAt,
    partialHealthVehicleCount,
    unavailableHealthVehicleCount,
    staleModuleCount: countFleetStaleModules(input.healthMap, input.vehicleIds),
  };
}

export function formatFleetHealthServiceCompactLabel(
  freshness: FleetHealthServiceFreshness,
  locale: 'de' | 'en',
  nowMs = Date.now(),
): string | null {
  const parts: string[] = [];

  const fetchLabels = [
    freshness.healthFetchedAt,
    freshness.tasksFetchedAt,
    freshness.vendorsFetchedAt,
    freshness.serviceCasesFetchedAt,
  ]
    .map((iso) => parseTimestampMs(iso))
    .filter((ms): ms is number => ms != null);

  if (fetchLabels.length > 0) {
    const oldestFetchMs = Math.min(...fetchLabels);
    const loadedLabel =
      locale === 'de'
        ? `Geladen ${formatRelativeTimeAt(toIsoTimestamp(oldestFetchMs), nowMs, locale)}`
        : `Loaded ${formatRelativeTimeAt(toIsoTimestamp(oldestFetchMs), nowMs, locale)}`;
    parts.push(loadedLabel);
  }

  if (freshness.oldestRelevantHealthSourceAt) {
    const measurementLabel =
      locale === 'de'
        ? `Älteste Messung ${formatRelativeTimeAt(freshness.oldestRelevantHealthSourceAt, nowMs, locale)}`
        : `Oldest measurement ${formatRelativeTimeAt(freshness.oldestRelevantHealthSourceAt, nowMs, locale)}`;
    parts.push(measurementLabel);
  }

  const degradedCount =
    freshness.partialHealthVehicleCount + freshness.unavailableHealthVehicleCount;
  if (degradedCount > 0) {
    parts.push(
      locale === 'de'
        ? `${degradedCount} Fahrz. eingeschränkt`
        : `${degradedCount} vehicles limited`,
    );
  }

  if (freshness.staleModuleCount > 0) {
    parts.push(
      locale === 'de'
        ? `${freshness.staleModuleCount} Module veraltet`
        : `${freshness.staleModuleCount} stale modules`,
    );
  }

  return parts.length > 0 ? parts.join(' · ') : null;
}

export function buildFleetHealthServiceFreshnessDetailRows(
  freshness: FleetHealthServiceFreshness,
  locale: 'de' | 'en',
  nowMs = Date.now(),
): FleetHealthServiceFreshnessDetailRow[] {
  const fetchRow = (key: string, labelDe: string, labelEn: string, iso: string | null) => ({
    key,
    label: locale === 'de' ? labelDe : labelEn,
    value: formatRelativeTimeAt(iso, nowMs, locale),
  });

  return [
    fetchRow(
      'healthFetchedAt',
      'Health geladen',
      'Health loaded',
      freshness.healthFetchedAt,
    ),
    {
      key: 'oldestRelevantHealthSourceAt',
      label: locale === 'de' ? 'Älteste Messung (Flotte)' : 'Oldest fleet measurement',
      value: formatRelativeTimeAt(freshness.oldestRelevantHealthSourceAt, nowMs, locale),
    },
    fetchRow('tasksFetchedAt', 'Aufgaben geladen', 'Tasks loaded', freshness.tasksFetchedAt),
    fetchRow('vendorsFetchedAt', 'Partner geladen', 'Vendors loaded', freshness.vendorsFetchedAt),
    fetchRow(
      'serviceCasesFetchedAt',
      'Servicefälle geladen',
      'Service cases loaded',
      freshness.serviceCasesFetchedAt,
    ),
    {
      key: 'partialHealthVehicleCount',
      label: locale === 'de' ? 'Fahrzeuge partial' : 'Partial vehicles',
      value: String(freshness.partialHealthVehicleCount),
    },
    {
      key: 'unavailableHealthVehicleCount',
      label: locale === 'de' ? 'Fahrzeuge unavailable' : 'Unavailable vehicles',
      value: String(freshness.unavailableHealthVehicleCount),
    },
    {
      key: 'staleModuleCount',
      label: locale === 'de' ? 'Veraltete Module' : 'Stale modules',
      value: String(freshness.staleModuleCount),
    },
  ];
}

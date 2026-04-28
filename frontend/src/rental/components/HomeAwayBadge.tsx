import { Home as HomeIcon, HelpCircle } from 'lucide-react';
import type { Station } from '../../lib/api';
import { isVehicleAtHomeStation } from '../../lib/geospatial';
import type { VehicleData } from '../data/vehicles';

// V4.7.06 — Shared `HomeAwayBadge` consumed by both `StatInlineDetail`
// (Dashboard popups) and `FleetView` (Operations → Fleet status cards).
// Extracting the chip into its own module guarantees that every surface
// renders the exact same three-state visual language (HOME / AWAY /
// UNKNOWN) and reads from the exact same geofence helper
// (`lib/geospatial.ts > isVehicleAtHomeStation`). When that helper
// returns `null` (station has no coordinates yet, station has no radius,
// or vehicle has no GPS fix), the chip falls into the UNKNOWN state and
// surfaces the exact reason via its `title` tooltip — operators discover
// the missing config inline instead of staring at an empty slot.

export interface StationLookup {
  byId: Map<string, Station>;
  byName: Map<string, Station>;
}

/**
 * Build a `StationLookup` from a `Station[]` snapshot. Cheap O(n) pass;
 * call from a single `useMemo(() => buildStationLookup(stations), [stations])`
 * per consumer to avoid rebuilding it on every render.
 */
export function buildStationLookup(stations: readonly Station[] | null | undefined): StationLookup | null {
  if (!stations || stations.length === 0) return null;
  const byId = new Map<string, Station>();
  const byName = new Map<string, Station>();
  for (const s of stations) {
    if (s.id) byId.set(s.id, s);
    if (s.name) byName.set(s.name, s);
  }
  return { byId, byName };
}

/**
 * Resolve a vehicle's assigned station — preferring UUID match
 * (`v.stationId`) which is robust against renames, falling back to
 * name match (`v.station`) for legacy payloads that pre-date V4.6.96.
 */
export function resolveVehicleStation(v: VehicleData, lookup: StationLookup | null): Station | null {
  if (!lookup) return null;
  if (v.stationId) {
    const byId = lookup.byId.get(v.stationId);
    if (byId) return byId;
  }
  if (v.station) {
    const byName = lookup.byName.get(v.station);
    if (byName) return byName;
  }
  return null;
}

interface HomeAwayBadgeProps {
  v: VehicleData;
  stationLookup: StationLookup | null;
  isDarkMode: boolean;
  /**
   * V4.7.06 — Compact mode strips the text label so the chip becomes a
   * pure icon (44px → 22px). Used by FleetView where the row is dense
   * and the address already eats most of the horizontal budget. The
   * tooltip continues to spell out HOME / AWAY / UNKNOWN explicitly.
   */
  compact?: boolean;
}

export function HomeAwayBadge({ v, stationLookup, isDarkMode, compact = false }: HomeAwayBadgeProps) {
  const station = resolveVehicleStation(v, stationLookup);
  const stationName = station?.name ?? v.station ?? null;

  if (!stationName) return null;

  const isHome = isVehicleAtHomeStation(
    { latitude: v.lat ?? null, longitude: v.lng ?? null },
    station
      ? {
          latitude: station.latitude,
          longitude: station.longitude,
          radiusMeters: station.radiusMeters,
        }
      : null,
  );

  type ChipState = 'home' | 'away' | 'unknown';
  let state: ChipState;
  let label: string;
  let title: string;
  if (isHome === true) {
    state = 'home';
    label = 'Home';
    title = `Im Umkreis von „${stationName}"`;
  } else if (isHome === false) {
    state = 'away';
    label = 'Away';
    title = `Außerhalb des Umkreises von „${stationName}"`;
  } else {
    state = 'unknown';
    label = '—';
    if (!station) {
      title = `Station „${stationName}" konnte nicht aufgelöst werden`;
    } else if (station.latitude == null || station.longitude == null) {
      title = `„${stationName}" hat noch keine Koordinaten — Standort bearbeiten und Adresse setzen, um den Geofence zu aktivieren`;
    } else if (station.radiusMeters == null || station.radiusMeters <= 0) {
      title = `„${stationName}" hat keinen Geofence-Radius`;
    } else if (v.lat == null || v.lng == null) {
      title = `Keine GPS-Position für ${v.license}`;
    } else {
      title = `Geofence-Status für „${stationName}" unbekannt`;
    }
  }

  const palette =
    state === 'home'
      ? isDarkMode
        ? 'bg-emerald-500/15 text-emerald-400'
        : 'bg-emerald-50 text-emerald-700'
      : state === 'away'
        ? isDarkMode
          ? 'bg-neutral-700/60 text-gray-300'
          : 'bg-gray-100 text-gray-600'
        : isDarkMode
          ? 'bg-amber-500/10 text-amber-400'
          : 'bg-amber-50 text-amber-700';

  const Icon = state === 'unknown' ? HelpCircle : HomeIcon;

  if (compact) {
    return (
      <span
        className={`shrink-0 inline-flex items-center justify-center w-[22px] h-[16px] rounded-md ${palette}`}
        title={`${label === '—' ? 'Geofence-Status unbekannt' : label} — ${title}`}
        aria-label={`Geofence: ${label === '—' ? 'unbekannt' : label}`}
      >
        <Icon className="w-3 h-3 shrink-0" strokeWidth={2.5} />
      </span>
    );
  }

  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center gap-0.5 w-[56px] px-1 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide ${palette}`}
      title={title}
    >
      <Icon className="w-2.5 h-2.5 shrink-0" strokeWidth={2.5} />
      <span className="leading-none">{label}</span>
    </span>
  );
}

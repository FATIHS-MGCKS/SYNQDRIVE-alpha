
import { Icon, type IconName } from './ui/Icon';
import { useLanguage } from '../../i18n/LanguageContext';
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

type ChipState = 'home' | 'away' | 'unknown';

export function HomeAwayBadge({ v, stationLookup, isDarkMode, compact = false }: HomeAwayBadgeProps) {
  const { t } = useLanguage();
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

  let state: ChipState;
  let detailTitle: string;
  if (isHome === true) {
    state = 'home';
    detailTitle = t('fleet.geofence.tooltip.home', { stationName });
  } else if (isHome === false) {
    state = 'away';
    detailTitle = t('fleet.geofence.tooltip.away', { stationName });
  } else {
    state = 'unknown';
    if (!station) {
      detailTitle = t('fleet.geofence.tooltip.stationUnresolved', { stationName });
    } else if (station.latitude == null || station.longitude == null) {
      detailTitle = t('fleet.geofence.tooltip.missingCoordinates', { stationName });
    } else if (station.radiusMeters == null || station.radiusMeters <= 0) {
      detailTitle = t('fleet.geofence.tooltip.missingRadius', { stationName });
    } else if (v.lat == null || v.lng == null) {
      detailTitle = t('fleet.geofence.tooltip.missingGps', { license: v.license });
    } else {
      detailTitle = t('fleet.geofence.tooltip.unknown', { stationName });
    }
  }

  const stateLabel =
    state === 'home'
      ? t('fleet.geofence.state.home')
      : state === 'away'
        ? t('fleet.geofence.state.away')
        : '—';

  const ariaStatus = state === 'unknown' ? t('fleet.geofence.statusUnknown') : stateLabel;
  const compactTitle =
    state === 'unknown'
      ? `${t('fleet.geofence.statusUnknown')} — ${detailTitle}`
      : `${stateLabel} — ${detailTitle}`;

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

  const iconName: IconName = state === 'unknown' ? 'help-circle' : 'home';

  if (compact) {
    return (
      <span
        className={`shrink-0 inline-flex items-center justify-center w-[22px] h-[16px] rounded-md ${palette}`}
        title={compactTitle}
        aria-label={t('fleet.geofence.ariaLabel', { status: ariaStatus })}
      >
        <Icon name={iconName} className="w-3 h-3 shrink-0" />
      </span>
    );
  }

  return (
    <span
      className={`shrink-0 inline-flex items-center justify-center gap-0.5 w-[56px] px-1 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide ${palette}`}
      title={detailTitle}
    >
      <Icon name={iconName} className="w-2.5 h-2.5 shrink-0" />
      <span className="leading-none">{stateLabel}</span>
    </span>
  );
}

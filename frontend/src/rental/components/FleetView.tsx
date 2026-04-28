import { MapPin, ChevronDown, ChevronRight, Car, Heart, AlertTriangle, OctagonAlert, RefreshCw, Fuel, Gauge, Clock, Wrench, Calendar, TrendingUp } from 'lucide-react';
import { useState, useRef, useMemo, useEffect, Component, type ReactNode, type ErrorInfo } from 'react';
import { MapboxMap } from '../../components/MapboxMap';
import { VehicleData, getShortModel } from '../data/vehicles';
import { getStatusColor } from '../../lib/vehicleMarker';
import { BrandLogo, getBrandFromModel } from './BrandLogo';
import { useRentalOrg } from '../RentalContext';
// V4.6.76 Rental Health V1 � surface the rental_blocked pill inline so
// dispatchers see at-a-glance which "Available" vehicles the backend gate
// would actually reject.
import { useFleetHealthMap } from '../hooks/useVehicleHealth';
import { RentalHealthBadge } from './rental-health/RentalHealthBadge';
import {
  formatOdometerKmFloor,
  formatFuelPercentCeil,
  formatFleetDateTime,
  formatKmAllowance,
  formatMaintenanceReason,
} from '../../lib/formatVehicleDisplay';
import { useAddress } from '../../lib/useAddress';
// V4.7.06 — Reuse the dashboard's HOME/AWAY/UNKNOWN geofence chip in the
// Operations → Fleet "Available" card. Same component, same canonical
// `isVehicleAtHomeStation` helper — single source of truth across the
// product. Fleet rows are denser than Dashboard popups, so we render the
// chip in `compact` mode (icon-only, 22px slot) per operator request
// ("statt namen von der station sollte ein icon zeigen").
import { HomeAwayBadge, buildStationLookup } from './HomeAwayBadge';
import { api, type Station } from '../../lib/api';
import {
  ALL_STATIONS_FILTER,
  selectFleetMapError,
  selectFleetMapLastFetchedAt,
  selectFleetMapLoading,
  selectFleetMapRefreshInterval,
  selectFleetMapSelectedVehicleId,
  selectFleetMapVehicles,
  useFleetMapStore,
} from '../stores/useFleetMapStore';

interface MapSafetyBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

class MapSafetyBoundary extends Component<
  { children: ReactNode; isDarkMode?: boolean },
  MapSafetyBoundaryState
> {
  state: MapSafetyBoundaryState = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error): MapSafetyBoundaryState {
    return { hasError: true, errorMessage: error?.message ?? 'Map failed' };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[MapSafetyBoundary] Map render crash', { error, info });
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted/30 rounded-xl">
        <div className="text-center px-4">
          <p className="text-xs font-semibold text-muted-foreground">Map unavailable</p>
          {this.state.errorMessage && (
            <p className="mt-1 text-[10px] font-mono text-red-500 break-all max-w-xs">
              {this.state.errorMessage}
            </p>
          )}
        </div>
      </div>
    );
  }
}

interface FleetViewProps {
  isDarkMode: boolean;
  onVehicleSelect?: (vehicle: VehicleData) => void;
}

const KASSEL_CENTER: [number, number] = [9.4797, 51.3127];

function fleetVehicleTitle(v: VehicleData): string {
  const model = typeof v.model === 'string' ? v.model : '';
  const shortModel = model ? getShortModel(model) : '';
  return [v.make, shortModel].filter(Boolean).join(' ') || model || 'Unknown vehicle';
}

function VehicleThumb({ v, isDarkMode }: { v: VehicleData; isDarkMode?: boolean }) {
  if (v.imageUrl) {
    return <img src={v.imageUrl} alt="" className="w-8 h-8 rounded object-cover" />;
  }
  // Derive brand slug from make field, fallback to model string
  const brandKey = getBrandFromModel(v.make ?? v.model ?? '');
  if (brandKey !== 'generic') {
    return (
      <div className="w-8 h-8 rounded flex items-center justify-center bg-muted p-1">
        <BrandLogo brand={brandKey} size={24} isDarkMode={isDarkMode} />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded flex items-center justify-center bg-muted text-muted-foreground">
      <Car className="w-4 h-4" />
    </div>
  );
}

function HealthFleetIcon({ status }: { status?: string }) {
  if (status === 'Good Health') return <Heart className="w-3.5 h-3.5 text-[color:var(--status-positive)]" />;
  if (status === 'Warning') return <AlertTriangle className="w-3.5 h-3.5 text-[color:var(--status-attention)]" />;
  if (status === 'Critical') return <OctagonAlert className="w-3.5 h-3.5 text-[color:var(--status-critical)]" />;
  return <span className="text-[10px] text-muted-foreground">�</span>;
}

function StatusDot({ status }: { status: string }) {
  const sc = getStatusColor(status);
  return (
    <span
      className="inline-block w-2 h-2 rounded-full mr-1.5 shrink-0"
      style={{ backgroundColor: sc.primary }}
    />
  );
}

// V4.6.84/85 � shared compact cell renderers so every Fleet-status tab
// uses the same visual language for fuel/SoC and odometer. `0` is a
// valid telemetry reading ("empty tank"); missing telemetry renders
// "�" by reading the nullable canonical fields (`fuelPercent`,
// `odometerKm`, `evSoc`) directly.
function FuelCell({ v }: { v: VehicleData }) {
  const canonical = v.isElectric
    ? v.evSoc ?? v.fuelPercent ?? null
    : v.fuelPercent ?? v.evSoc ?? null;
  if (canonical == null || !Number.isFinite(canonical)) {
    return (
      <div className="flex items-center gap-1.5">
        <Fuel className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-[10px] text-muted-foreground">�</span>
      </div>
    );
  }
  const pct = Math.max(0, Math.min(100, Math.round(canonical)));
  const barColor =
    pct > 50
      ? 'var(--status-positive)'
      : pct > 25
        ? 'var(--status-attention)'
        : 'var(--status-critical)';
  // V4.7.11 — At <20% fuel/SoC the canonical fuel icon picks up the
  // critical tone *and* a soft red drop-shadow halo so the operator's
  // eye is drawn to the row even on a long list. We deliberately avoid
  // animation here (no flashing) — the static glow is enough signal
  // without becoming a visual distraction. The percentage chip and the
  // bar already carry the same critical colour at <=25%, so the icon
  // glow is the *third* coherent cue at the most urgent end of the
  // scale.
  const isCriticallyLow = pct < 20;
  const fuelLabel = v.isElectric ? 'SoC' : 'Tank';
  return (
    <div className="flex items-center gap-1.5">
      <Fuel
        className={`w-3 h-3 shrink-0 transition-colors ${
          isCriticallyLow
            ? 'text-[color:var(--status-critical)] drop-shadow-[0_0_4px_color-mix(in_srgb,var(--status-critical)_55%,transparent)]'
            : 'text-muted-foreground'
        }`}
        aria-label={isCriticallyLow ? `${fuelLabel} kritisch unter 20%` : undefined}
      />
      <div className="w-10 h-1 rounded-full overflow-hidden bg-muted/70 shrink-0">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
      <span
        className={`text-[10px] font-semibold tabular-nums ${
          isCriticallyLow ? 'text-[color:var(--status-critical)]' : 'text-foreground/80'
        }`}
      >
        {formatFuelPercentCeil(canonical)}
      </span>
    </div>
  );
}

function OdometerCell({ v }: { v: VehicleData }) {
  const km = v.odometerKm ?? null;
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Gauge className="w-3 h-3 text-muted-foreground shrink-0" />
      <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
        {formatOdometerKmFloor(km)}
      </span>
    </div>
  );
}

// V4.7.02 — Compact health pill mirroring `StatInlineDetail`'s 9px/700
// uppercase chip rhythm so the FleetView cards read with the same
// typographic weight as the Dashboard's Fleet Status box. Returns null
// when the canonical `healthStatus` is unknown so we don't print an
// empty chip slot.
function HealthPill({ status }: { status?: string }) {
  if (status === 'Good Health') {
    return (
      <span className="sq-chip sq-chip-success text-[9px] font-bold uppercase tracking-wide">
        Healthy
      </span>
    );
  }
  if (status === 'Warning') {
    return (
      <span className="sq-chip sq-chip-warning text-[9px] font-bold uppercase tracking-wide">
        Warning
      </span>
    );
  }
  if (status === 'Critical') {
    return (
      <span className="sq-chip sq-chip-critical text-[9px] font-bold uppercase tracking-wide">
        Alert
      </span>
    );
  }
  return null;
}

function MaintenanceReasonCell({ v }: { v: VehicleData }) {
  const reason = formatMaintenanceReason(
    v.maintenanceReasonCode,
    v.maintenanceReason ?? 'Maintenance',
  );
  const isUrgent = v.maintenanceUrgency === 'urgent';
  return (
    <div className="flex items-center gap-1.5">
      <Wrench
        className={`w-3 h-3 shrink-0 ${
          isUrgent ? 'text-[color:var(--status-critical)]' : 'text-[color:var(--status-attention)]'
        }`}
      />
      <span
        className={`text-[11px] font-medium ${
          isUrgent ? 'text-[color:var(--status-critical)]' : 'text-foreground'
        }`}
      >
        {reason}
      </span>
    </div>
  );
}

// V4.6.85 � last-known-address cell. Uses the shared `useAddress` hook
// which is memoized in-memory via `addressService.CACHE`, so repeated
// rows resolve instantly on every re-render. Renders `"�"` while the
// reverse geocoder is in flight or when the vehicle has no coordinates.
function AddressCell({ v }: { v: VehicleData }) {
  const lat = typeof v.lat === 'number' ? v.lat : null;
  const lng = typeof v.lng === 'number' ? v.lng : null;
  const { address, loading } = useAddress(lat, lng);
  const text = address?.formatted && address.formatted !== '�'
    ? address.formatted
    : loading
      ? 'Wird geladen �'
      : '�';
  return (
    <div
      className="flex items-center gap-1.5 text-[11px] text-muted-foreground max-w-[180px]"
      title={text}
    >
      <MapPin className="w-3 h-3 shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
}

// V4.7.06 — Inline last-known-address text used inside the Fleet
// "Available" row footer. Differs from `AddressCell` above in that it
// (a) renders a flexible `flex-1 min-w-0` slot so the address truncates
// gracefully next to the HOME/AWAY chip and the FuelCell/OdometerCell
// dividers, and (b) drops the leading `MapPin` icon because the row
// already carries one to the left of this span. Falls back to the
// station name when reverse-geocoding has not resolved yet so the row
// is never empty (the operator still gets a textual hint, the chip
// gives the geofence verdict).
function FleetAvailableAddressText({ v }: { v: VehicleData }) {
  const lat = typeof v.lat === 'number' ? v.lat : null;
  const lng = typeof v.lng === 'number' ? v.lng : null;
  const { address, loading } = useAddress(lat, lng);
  const formatted = address?.formatted && address.formatted !== '�' ? address.formatted : null;
  const text = formatted ?? (loading ? 'Wird geladen �' : v.station || '�');
  return (
    <span
      className="truncate min-w-0 flex-1 text-[10px] text-muted-foreground"
      title={text}
    >
      {text}
    </span>
  );
}

export function FleetView({ isDarkMode, onVehicleSelect }: FleetViewProps) {
  const { orgId } = useRentalOrg();

  const vehicles = useFleetMapStore(selectFleetMapVehicles);
  const stationId = useFleetMapStore((s) => s.filters.stationId);
  const loading = useFleetMapStore(selectFleetMapLoading);
  const error = useFleetMapStore(selectFleetMapError);
  const refreshIntervalMs = useFleetMapStore(selectFleetMapRefreshInterval);
  const lastFetchedAt = useFleetMapStore(selectFleetMapLastFetchedAt);
  const selectedVehicleId = useFleetMapStore(selectFleetMapSelectedVehicleId);
  const setStationFilter = useFleetMapStore((state) => state.setStationFilter);
  const setSelectedVehicleId = useFleetMapStore(
    (state) => state.setSelectedVehicleId,
  );
  const fetchFleetMap = useFleetMapStore((state) => state.fetchFleetMap);

  const filtered = useMemo(() => {
    if (stationId === ALL_STATIONS_FILTER) return vehicles;
    return vehicles.filter((v) => v.stationId === stationId);
  }, [vehicles, stationId]);

  // V4.6.76 Rental Health V1 � fetch the canonical health for the current
  // station filter. Same map drives the "Nicht vermietbar" pill below and
  // a subtle warning icon for Fleet-wide critical states.
  const fleetVehicleIds = useMemo(
    () => filtered.map((v) => v.id).filter(Boolean),
    [filtered],
  );
  const { map: healthMap } = useFleetHealthMap(orgId, fleetVehicleIds);

  // V4.7.06 — Fetch the org's station catalogue (with `latitude`,
  // `longitude` and `radiusMeters`) so we can render the HOME/AWAY/UNKNOWN
  // geofence chip on every "Available" row. Mirrors the loader pattern
  // already used in `DashboardView.tsx > useEffect (api.stations.list)`.
  // The list is small (typically < 20 stations per org), so we keep it
  // entirely in component state — no shared store needed.
  const [stationsApi, setStationsApi] = useState<Station[]>([]);
  useEffect(() => {
    if (!orgId) {
      setStationsApi([]);
      return;
    }
    let cancelled = false;
    api.stations
      .list(orgId)
      .then((rows) => {
        if (!cancelled) setStationsApi(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setStationsApi([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);
  const stationLookup = useMemo(() => buildStationLookup(stationsApi), [stationsApi]);

  const stationOptions = useMemo(() => {
    const map = new Map<string, string>();
    vehicles.forEach((v) => {
      if (v.stationId && v.stationName) map.set(v.stationId, v.stationName);
    });
    return [
      { id: ALL_STATIONS_FILTER, label: 'All Stations' },
      ...[...map.entries()]
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [vehicles]);

  const fleetGeoJson = useMemo(() => {
    const features = filtered
      .filter(
        (v) =>
          typeof v.lat === 'number' &&
          typeof v.lng === 'number' &&
          Number.isFinite(v.lat) &&
          Number.isFinite(v.lng),
      )
      .map((v) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [v.lng!, v.lat!],
        },
        properties: {
          vehicleId: v.id,
          label: v.license || v.model,
          status: v.status,
          heading: v.heading ?? 0,
          stationId: v.stationId,
        },
      }));
    return { type: 'FeatureCollection' as const, features };
  }, [filtered]);

  const [countdown, setCountdown] = useState(
    Math.ceil(refreshIntervalMs / 1000),
  );
  const [isStationOpen, setIsStationOpen] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const selectedStation = stationId || ALL_STATIONS_FILTER;

  useEffect(() => {
    if (!orgId) return;
    fetchFleetMap(orgId);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchFleetMap(orgId);
      }
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [orgId, fetchFleetMap, refreshIntervalMs]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!lastFetchedAt) {
        setCountdown(Math.ceil(refreshIntervalMs / 1000));
        return;
      }
      const elapsed = Date.now() - lastFetchedAt;
      setCountdown(Math.max(0, Math.ceil((refreshIntervalMs - elapsed) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastFetchedAt, refreshIntervalMs]);

  const vehiclesWithCoords = filtered.filter(
    (v) => Number.isFinite(v.lat) && Number.isFinite(v.lng),
  );

  const mapCenter: [number, number] = vehiclesWithCoords.length > 0
    ? [
        vehiclesWithCoords.reduce((s, v) => s + v.lng!, 0) / vehiclesWithCoords.length,
        vehiclesWithCoords.reduce((s, v) => s + v.lat!, 0) / vehiclesWithCoords.length,
      ]
    : KASSEL_CENTER;

  const availableVehicles = filtered.filter(v => v.status === 'Available');
  const activeRented = filtered.filter(v => v.status === 'Active Rented');
  const reserved = filtered.filter(v => v.status === 'Reserved');
  const maintenance = filtered.filter(v => v.status === 'Maintenance');

  // V4.7.08 — Tabbed right column. Mirrors the Dashboard's
  // `Fleet Status` box (`DashboardView.tsx > sq-tab-bar`): exactly one
  // status list visible at a time, switched via a 4-pill tab bar.
  // Replaces the previous 2x2 grid of fixed cards which forced excessive
  // vertical scroll on the page itself. Active tab persists across
  // re-renders — no URL state because the same view is always reachable
  // via the sidebar.
  type FleetTab = 'Available' | 'Active Rented' | 'Reserved' | 'Maintenance';
  const [activeTab, setActiveTab] = useState<FleetTab>('Available');

  // V4.7.08 — Per-tab "warn" pills (tiny amber count to the right of the
  // status count). Same semantics as the Dashboard tab bar: surfaces
  // dispatcher-actionable conditions without forcing a tab switch.
  const availableBlocked = useMemo(
    () => availableVehicles.filter((v) => !!healthMap.get(v.id)?.rental_blocked).length,
    [availableVehicles, healthMap],
  );
  const activeOverdue = useMemo(
    () => activeRented.filter((v) => !!v.activeIsOverdue).length,
    [activeRented],
  );
  const reservedOverdue = useMemo(
    () => reserved.filter((v) => !!v.reservedIsOverdue).length,
    [reserved],
  );
  const maintenanceUrgent = useMemo(
    () => maintenance.filter((v) => v.maintenanceUrgency === 'urgent').length,
    [maintenance],
  );

  const TAB_DEFS: Array<{
    key: FleetTab;
    label: string;
    count: number;
    tone: 'success' | 'brand' | 'warning' | 'critical';
    warn: number;
    warnTitle: string;
    Icon: typeof Car;
    subtitle: string;
  }> = [
    {
      key: 'Available',
      label: 'Available',
      count: availableVehicles.length,
      tone: 'success',
      warn: availableBlocked,
      warnTitle: `${availableBlocked} nicht vermietbar`,
      Icon: Car,
      subtitle: `${availableVehicles.length} ready for rental`,
    },
    {
      key: 'Active Rented',
      label: 'Active Rented',
      count: activeRented.length,
      tone: 'brand',
      warn: activeOverdue,
      warnTitle: `${activeOverdue} überfällig`,
      Icon: TrendingUp,
      subtitle: `${activeRented.length} currently in flight`,
    },
    {
      key: 'Reserved',
      label: 'Reserved',
      count: reserved.length,
      tone: 'warning',
      warn: reservedOverdue,
      warnTitle: `${reservedOverdue} Pickup überfällig`,
      Icon: Calendar,
      subtitle: `${reserved.length} reservations pending`,
    },
    {
      key: 'Maintenance',
      label: 'Maintenance',
      count: maintenance.length,
      tone: 'critical',
      warn: maintenanceUrgent,
      warnTitle: `${maintenanceUrgent} dringend`,
      Icon: Wrench,
      subtitle: `${maintenance.length} ${maintenance.length === 1 ? 'vehicle' : 'vehicles'} in service`,
    },
  ];
  const activeTabDef = TAB_DEFS.find((t) => t.key === activeTab) ?? TAB_DEFS[0];
  const ActiveTabIcon = activeTabDef.Icon;

  const selectedStationLabel = useMemo(
    () =>
      stationOptions.find((option) => option.id === selectedStation)?.label ??
      'All Stations',
    [selectedStation, stationOptions],
  );

  // V4.7.02 � count pill matched to the dashboard's Fleet Status tab pills
  // (`text-[11px] min-w-[24px] h-[20px] px-1.5 rounded-full font-bold`).
  // Tone-tinted via the same `sq-tone-*` utilities so each card's count
  // colour-codes the bucket at a glance, identical to the dashboard.
  const CountBadge = ({
    count,
    tone,
  }: {
    count: number;
    tone: 'success' | 'brand' | 'warning' | 'critical';
  }) => (
    <span
      className={`sq-tone-${tone} inline-flex items-center justify-center min-w-[24px] h-[20px] px-1.5 rounded-full text-[11px] font-bold tabular-nums shrink-0`}
    >
      {count}
    </span>
  );

  const handleRowClick = (vehicle: VehicleData) => {
    setSelectedVehicleId(vehicle.id);
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (onVehicleSelect) {
      onVehicleSelect(vehicle);
    }
  };

  const handleDetailClick = (e: React.MouseEvent, vehicle: VehicleData) => {
    e.stopPropagation();
    setSelectedVehicleId(vehicle.id);
    if (onVehicleSelect) {
      onVehicleSelect(vehicle);
    }
  };

  const handleMapVehicleClick = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    const vehicle = filtered.find((entry) => entry.id === vehicleId);
    if (vehicle && onVehicleSelect) {
      onVehicleSelect(vehicle);
    }
  };

  return (
    <div className="space-y-5">
      {/* V4.7.10 — Header rhythm matched 1:1 to the Dashboard
          (`DashboardView.tsx > grid sm:items-end gap-2 sm:gap-3 mb-5`):
          • `items-end` → H1 baseline now sits flush with the station
            pill's text baseline, giving the band the same anchored
            feel as the Dashboard greeting + station selector row.
          • `gap-2 sm:gap-3` → identical inter-element gap profile.
          • Outer `space-y-5` already mirrors Dashboard's `mb-5`
            spacing under the header band, so no double-spacing here. */}
      <div className="flex flex-wrap items-end justify-between gap-2 sm:gap-3">
        <div className="animate-fade-up min-w-0">
          <h1 className="text-[18px] leading-[1.12] font-bold tracking-[-0.02em] text-foreground truncate">
            Fleet Overview
          </h1>
        </div>
        <div className="relative">
          <button
            onClick={() => setIsStationOpen(!isStationOpen)}
            className="sq-press flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card text-[12px] font-medium text-foreground transition-all hover:bg-muted hover:border-border"
            aria-haspopup="listbox"
            aria-expanded={isStationOpen}
          >
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Station</span>
            <span className="text-foreground">{selectedStationLabel}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${isStationOpen ? 'rotate-180' : ''}`} />
          </button>
          {isStationOpen && (
            <div className="sq-overlay animate-fade-up absolute top-full mt-2 right-0 z-50 min-w-[220px] p-1 rounded-xl">
              {stationOptions.map((station) => (
                <button
                  key={station.id}
                  onClick={() => {
                    setStationFilter(station.id);
                    setIsStationOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-[12px] font-medium rounded-lg transition-colors ${
                    station.id === selectedStation
                      ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {station.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="sq-tone-critical rounded-xl px-3 py-2 text-[12px] font-medium animate-fade-up">
          Fleet data could not be loaded: {error}
        </div>
      )}

      {/* V4.7.08 — Restructured page layout: 2-column grid (map left,
          tabbed vehicle list right). Replaces the previous "map on top,
          4 status cards underneath" layout, which forced a lot of
          vertical scrolling on the page itself. Both columns share the
          same height profile (`lg:h-[640px]`) so the map always
          right-sizes against the list, and the list scrolls *inside*
          its own card instead of the page. On <lg viewports the grid
          collapses to a single column (map first, list second), keeping
          the experience usable on tablets. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:items-stretch">
        {/* Left: Map (stretches to grid row height on lg+). */}
        <div
          ref={mapRef}
          className="bg-card border border-border/70 rounded-2xl overflow-hidden relative shadow-[var(--shadow-1)] h-[280px] lg:h-[640px] animate-fade-up"
        >
          <MapSafetyBoundary isDarkMode={isDarkMode}>
            <MapboxMap
              center={mapCenter}
              zoom={vehiclesWithCoords.length > 0 ? 12 : 5}
              fleetGeoJson={fleetGeoJson}
              selectedVehicleId={selectedVehicleId}
              onVehicleClick={handleMapVehicleClick}
              className="w-full h-full"
              isDarkMode={isDarkMode}
            />
          </MapSafetyBoundary>
          {/* Refresh countdown overlay */}
          <div className="sq-overlay absolute top-3 right-3 z-10 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-muted-foreground">
            <RefreshCw className={`w-3 h-3 text-[color:var(--brand)] ${loading ? 'animate-spin' : ''}`} />
            <span className="text-[10px] font-semibold tabular-nums">
              {loading ? 'Updating…' : `${countdown}s`}
            </span>
          </div>
          {/* Status legend */}
          <div className="sq-overlay absolute bottom-3 left-3 z-10 flex items-center gap-3 px-3 py-1.5 rounded-full">
            {(['Available', 'Active Rented', 'Reserved', 'Maintenance'] as const).map((s) => {
              const sc = getStatusColor(s);
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.6)]"
                    style={{ backgroundColor: sc.primary }}
                  />
                  <span className="text-[10px] font-medium text-foreground/70">{sc.label}</span>
                </div>
              );
            })}
          </div>
          {vehiclesWithCoords.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="sq-overlay px-5 py-4 rounded-2xl max-w-[280px] text-center">
                <p className="text-[12px] font-semibold text-foreground">No vehicle locations available</p>
                <p className="text-[11px] mt-1 text-muted-foreground">
                  Location data will appear once vehicles report their position
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: tabbed Fleet Status panel. Mirrors the Dashboard's
            `Fleet Status` box rhythm — tone-icon header + sq-tab-bar
            with count + amber warn pills. Only the active tab's vehicle
            list renders below; the list scrolls internally so the
            outer page stays at a fixed height. */}
        <div className="sq-card overflow-hidden flex flex-col lg:h-[640px] animate-fade-up">
          <div className="p-4 pb-0">
            <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`sq-tone-${activeTabDef.tone} w-7 h-7 rounded-xl flex items-center justify-center shrink-0`}
                >
                  <ActiveTabIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[12px] font-semibold tracking-[-0.005em] text-foreground">
                    Fleet Status
                  </h3>
                  <p className="text-[10.5px] text-muted-foreground truncate">
                    {activeTabDef.subtitle}
                  </p>
                </div>
              </div>
              <CountBadge count={activeTabDef.count} tone={activeTabDef.tone} />
            </div>

            {/* V4.7.08 — Tab bar matched 1:1 to the Dashboard's Fleet
                Status switcher: `sq-tab-bar` shell, tone-tinted count
                pill per tab, optional amber warn pill for actionable
                states (rental_blocked / overdue / urgent). Active tab
                gets the elevated `bg-card + shadow-1 + brand ring`
                treatment so the current selection stays unmistakable. */}
            <div className="sq-tab-bar p-1 flex items-stretch w-full">
              {TAB_DEFS.map((tab) => {
                const isActive = activeTab === tab.key;
                const toneCls = `sq-tone-${tab.tone}`;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 min-w-0 px-2 py-1.5 rounded-[calc(var(--radius-md)-2px)] text-[12px] font-semibold tracking-[-0.003em] whitespace-nowrap transition-all duration-200 flex items-center justify-center gap-1.5 ${
                      isActive
                        ? 'bg-card text-foreground shadow-[var(--shadow-1)] ring-1 ring-[color:color-mix(in_srgb,var(--brand)_12%,transparent)]'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="truncate text-[11.5px]">{tab.label}</span>
                    <span
                      className={`text-[11px] min-w-[20px] h-[19px] px-1.5 flex items-center justify-center rounded-full font-bold tabular-nums shrink-0 ${toneCls} ${
                        isActive
                          ? 'ring-1 ring-[color:color-mix(in_srgb,currentColor_35%,transparent)] shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                          : ''
                      }`}
                    >
                      {tab.count}
                    </span>
                    {tab.warn > 0 && (
                      <span
                        title={tab.warnTitle}
                        className="text-[10px] min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full font-bold tabular-nums bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0"
                      >
                        {tab.warn}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active-tab content. The single visible list owns its own
              vertical scroll on lg+ so the outer page stops growing. */}
          <div className="px-3 pt-3 pb-3 flex-1 lg:overflow-y-auto">
            {activeTab === 'Available' && (
              <div className="space-y-1.5">
                {availableVehicles.length === 0 ? (
                  <p className="text-center text-[10.5px] text-muted-foreground py-4">
                    No available vehicles
                  </p>
                ) : null}
                {availableVehicles.map((v) => {
              const health = healthMap.get(v.id) ?? null;
              const isBlocked = !!health?.rental_blocked;
              return (
                <div
                  key={v.id}
                  onClick={() => handleRowClick(v)}
                  className="rounded-xl p-2.5 border border-border/60 bg-card hover:bg-muted/40 hover:border-border transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0 flex-1">
                      <StatusDot status={v.status} />
                      <span className="text-[10.5px] font-bold leading-tight shrink-0 text-foreground">{v.license}</span>
                      <span className="text-[10px] font-medium tracking-wide truncate text-muted-foreground">
                        {fleetVehicleTitle(v)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <HealthPill status={v.healthStatus} />
                      {isBlocked ? (
                        <RentalHealthBadge
                          health={health!}
                          isDarkMode={isDarkMode}
                          size="sm"
                          showBlockingLabel
                        />
                      ) : (
                        <span className="sq-chip sq-chip-success text-[9px] font-bold uppercase tracking-wide">
                          Ready
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDetailClick(e, v)}
                        className="p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="Open vehicle details"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {/* V4.7.06 / V4.7.09 — Footer-Zeile zeigt jetzt die
                      letzte bekannte Adresse (Reverse-Geocode aus
                      `useAddress(lat, lng)`) statt des statischen
                      Stations-Namens; rechts daneben rendert die
                      `HomeAwayBadge` im Full-Label-Mode (Icon + HOME/
                      AWAY/— Text, 56px breite Pille — 1:1 dieselbe
                      Variante wie der Dashboard-Fleet-Status-Box, sodass
                      die operative Sprache Dashboard ↔ FleetView
                      identisch bleibt. Damit erkennt der Disponent auf
                      einen Blick, wo das Fahrzeug physisch steht und ob
                      es in seiner zugewiesenen Station ist. */}
                  <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/40 min-w-0 overflow-hidden">
                    <MapPin className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />
                    <FleetAvailableAddressText v={v} />
                    <HomeAwayBadge
                      v={v}
                      stationLookup={stationLookup}
                      isDarkMode={isDarkMode}
                    />
                    <span className="w-px h-3 shrink-0 bg-border/60" />
                    <FuelCell v={v} />
                    <span className="w-px h-3 shrink-0 bg-border/60" />
                    <OdometerCell v={v} />
                  </div>
                </div>
              );
            })}
              </div>
            )}

            {activeTab === 'Active Rented' && (
              <div className="space-y-1.5">
                {activeRented.length === 0 ? (
                  <p className="text-center text-[10.5px] text-muted-foreground py-4">No active rentals</p>
                ) : null}
                {activeRented.map((v) => {
              const overdue = !!v.activeIsOverdue;
              const customer = v.activeCustomerName ?? 'Nicht zugeordnet';
              const returnText = v.activeReturnAt ? formatFleetDateTime(v.activeReturnAt) : '�';
              const returnStation = v.activeReturnStationName ?? '';
              const kmText = formatKmAllowance(v.activeKmIncluded, v.activeKmDriven);
              return (
                <div
                  key={v.id}
                  onClick={() => handleRowClick(v)}
                  className="rounded-xl p-2.5 border border-border/60 bg-card hover:bg-muted/40 hover:border-border transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0 flex-1">
                      <StatusDot status={v.status} />
                      <span className="text-[10.5px] font-bold leading-tight shrink-0 text-foreground">{v.license}</span>
                      <span
                        className="text-[10px] font-medium tracking-wide truncate text-muted-foreground"
                        title={customer}
                      >
                        {customer}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <HealthPill status={v.healthStatus} />
                      {overdue ? (
                        <span className="sq-chip sq-chip-critical text-[9px] font-bold uppercase tracking-wide">
                          <Clock className="w-2.5 h-2.5" />
                          Overdue
                        </span>
                      ) : (
                        <span className="sq-chip sq-chip-success text-[9px] font-bold uppercase tracking-wide">
                          On Time
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDetailClick(e, v)}
                        className="p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="Open vehicle details"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/40 min-w-0 overflow-hidden">
                    <Clock className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />
                    <span
                      className="truncate min-w-0 flex-1 text-[10px] text-muted-foreground"
                      title={[returnText, returnStation, kmText].filter(Boolean).join(' � ')}
                    >
                      {returnText}{returnStation ? ` � ${returnStation}` : ''}
                    </span>
                    <span className="w-px h-3 shrink-0 bg-border/60" />
                    <FuelCell v={v} />
                    <span className="w-px h-3 shrink-0 bg-border/60" />
                    <OdometerCell v={v} />
                  </div>
                </div>
              );
            })}
              </div>
            )}

            {activeTab === 'Reserved' && (
              <div className="space-y-1.5">
                {reserved.length === 0 ? (
                  <p className="text-center text-[10.5px] text-muted-foreground py-4">No reservations</p>
                ) : null}
                {reserved.map((v) => {
              const health = healthMap.get(v.id) ?? null;
              const customer = v.reservedCustomerName ?? 'Nicht zugeordnet';
              const pickupOverdue = !!v.reservedIsOverdue;
              const isBlocked = !!health?.rental_blocked;
              const pickupText = v.reservedPickupAt ? formatFleetDateTime(v.reservedPickupAt) : '�';
              const stationLabel = v.reservedPickupStationName || v.station || '';
              return (
                <div
                  key={v.id}
                  onClick={() => handleRowClick(v)}
                  className="rounded-xl p-2.5 border border-border/60 bg-card hover:bg-muted/40 hover:border-border transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0 flex-1">
                      <StatusDot status={v.status} />
                      <span className="text-[10.5px] font-bold leading-tight shrink-0 text-foreground">{v.license}</span>
                      <span
                        className="text-[10px] font-medium tracking-wide truncate text-muted-foreground"
                        title={customer}
                      >
                        {customer}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <HealthPill status={v.healthStatus} />
                      {isBlocked ? (
                        <RentalHealthBadge
                          health={health!}
                          isDarkMode={isDarkMode}
                          size="sm"
                          showBlockingLabel
                        />
                      ) : pickupOverdue ? (
                        <span className="sq-chip sq-chip-critical text-[9px] font-bold uppercase tracking-wide">
                          <Clock className="w-2.5 h-2.5" />
                          Pickup f�llig
                        </span>
                      ) : (
                        <span className="sq-chip sq-chip-warning text-[9px] font-bold uppercase tracking-wide">
                          Reserved
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => handleDetailClick(e, v)}
                        className="p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="Open vehicle details"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/40 min-w-0 overflow-hidden">
                    <Clock className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />
                    <span
                      className="truncate min-w-0 flex-1 text-[10px] text-muted-foreground"
                      title={[pickupText, stationLabel].filter(Boolean).join(' � ')}
                    >
                      {pickupText}{stationLabel ? ` � ${stationLabel}` : ''}
                    </span>
                    <span className="w-px h-3 shrink-0 bg-border/60" />
                    <FuelCell v={v} />
                    <span className="w-px h-3 shrink-0 bg-border/60" />
                    <OdometerCell v={v} />
                  </div>
                </div>
              );
            })}
              </div>
            )}

            {activeTab === 'Maintenance' && (
              <div className="space-y-1.5">
                {maintenance.length === 0 ? (
                  <p className="text-center text-[10.5px] text-muted-foreground py-4">No vehicles in maintenance</p>
                ) : null}
                {maintenance.map((v) => {
              const isUrgent = v.maintenanceUrgency === 'urgent';
              const reason = formatMaintenanceReason(
                v.maintenanceReasonCode,
                v.maintenanceReason ?? 'Maintenance',
              );
              return (
                <div
                  key={v.id}
                  onClick={() => handleRowClick(v)}
                  className="rounded-xl p-2.5 border border-border/60 bg-card hover:bg-muted/40 hover:border-border transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
                    <div className="flex items-baseline gap-2 min-w-0 flex-1">
                      <StatusDot status={v.status} />
                      <span className="text-[10.5px] font-bold leading-tight shrink-0 text-foreground">{v.license}</span>
                      <span className="text-[10px] font-medium tracking-wide truncate text-muted-foreground">
                        {fleetVehicleTitle(v)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <HealthPill status={v.healthStatus} />
                      <span
                        className={`sq-chip ${isUrgent ? 'sq-chip-critical' : 'sq-chip-warning'} text-[9px] font-bold uppercase tracking-wide`}
                      >
                        <Wrench className="w-2.5 h-2.5" />
                        {isUrgent ? 'Urgent' : 'Service'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDetailClick(e, v)}
                        className="p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="Open vehicle details"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/40 min-w-0 overflow-hidden">
                    <span
                      className={`truncate min-w-0 flex-1 text-[10px] font-medium ${
                        isUrgent ? 'text-[color:var(--status-critical)]' : 'text-foreground'
                      }`}
                      title={reason}
                    >
                      {reason}
                    </span>
                    <span className="w-px h-3 shrink-0 bg-border/60" />
                    <FuelCell v={v} />
                    <span className="w-px h-3 shrink-0 bg-border/60" />
                    <OdometerCell v={v} />
                  </div>
                </div>
              );
            })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

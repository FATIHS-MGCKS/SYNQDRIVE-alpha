import { MapPin, ChevronDown, ChevronRight, Car, Heart, AlertTriangle, OctagonAlert, RefreshCw } from 'lucide-react';
import { useState, useRef, useMemo, useEffect, Component, type ReactNode, type ErrorInfo } from 'react';
import { MapboxMap } from '../../components/MapboxMap';
import { VehicleData, getShortModel } from '../data/vehicles';
import { getStatusColor } from '../../lib/vehicleMarker';
import { BrandLogo, getBrandFromModel } from './BrandLogo';
import { useRentalOrg } from '../RentalContext';
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
  if (status === 'Good Health') return <Heart className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === 'Warning') return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
  if (status === 'Critical') return <OctagonAlert className="w-3.5 h-3.5 text-red-500" />;
  return <span className="text-[10px] text-muted-foreground">â€”</span>;
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

  const cardClass = 'rounded-lg bg-card border border-border shadow-sm';

  const thClass = 'text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-2';

  const tdClass = 'py-1.5 text-[11px] text-foreground';

  const selectedStationLabel = useMemo(
    () =>
      stationOptions.find((option) => option.id === selectedStation)?.label ??
      'All Stations',
    [selectedStation, stationOptions],
  );

  const readyBadge = (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide bg-blue-500/15 text-blue-500">
      Ready for Rent
    </span>
  );

  const CountBadge = ({ count, status }: { count: number; status: string }) => {
    const sc = getStatusColor(status);
    return (
      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-white`} style={{ backgroundColor: sc.primary }}>
        {count}
      </span>
    );
  };

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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">Fleet Overview</h1>
          <p className="text-xs mt-1 text-muted-foreground">Monitor vehicles, stations, availability and maintenance status</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setIsStationOpen(!isStationOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-xs font-medium text-foreground transition-all hover:bg-muted"
          >
            <MapPin className="w-5 h-5" />
            <span>Station: {selectedStationLabel}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isStationOpen ? 'rotate-180' : ''}`} />
          </button>
          {isStationOpen && (
            <div className="absolute top-full mt-2 right-0 z-50 min-w-[200px] rounded-lg border border-border bg-card shadow-md overflow-hidden">
              {stationOptions.map((station) => (
                <button
                  key={station.id}
                  onClick={() => {
                    setStationFilter(station.id);
                    setIsStationOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors ${
                    station.id === selectedStation
                      ? 'bg-primary/10 text-primary'
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
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">
          Fleet data could not be loaded: {error}
        </div>
      )}

      {/* Map */}
      <div ref={mapRef} className="bg-card border border-border rounded-xl overflow-hidden relative" style={{ height: '320px', minHeight: '320px' }}>
        <MapSafetyBoundary isDarkMode={isDarkMode}>
          <MapboxMap
            center={mapCenter}
            zoom={vehiclesWithCoords.length > 0 ? 12 : 5}
            fleetGeoJson={fleetGeoJson}
            selectedVehicleId={selectedVehicleId}
            onVehicleClick={handleMapVehicleClick}
            className="w-full h-full min-h-[320px]"
            isDarkMode={isDarkMode}
          />
        </MapSafetyBoundary>
        {/* Refresh countdown overlay */}
        <div
          className="absolute top-3 right-12 z-10 flex items-center gap-1.5 px-2.5 py-1.5 bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg shadow-md text-muted-foreground"
        >
          <RefreshCw className={`w-3 h-3 text-purple-500 ${loading ? 'animate-spin' : ''}`} />
          <span className="text-[10px] font-semibold tabular-nums">
            {loading ? 'Updating...' : `${countdown}s`}
          </span>
        </div>
        {/* Status legend */}
        <div
          className="absolute bottom-3 left-3 z-10 flex items-center gap-3 px-2.5 py-1.5 bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg shadow-md"
        >
          {(['Available', 'Active Rented', 'Reserved', 'Maintenance'] as const).map((s) => {
            const sc = getStatusColor(s);
            return (
              <div key={s} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: sc.primary }} />
                <span className="text-[9px] font-semibold text-muted-foreground">{sc.label}</span>
              </div>
            );
          })}
        </div>
        {vehiclesWithCoords.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="px-4 py-3 bg-card/85 backdrop-blur-sm border border-border rounded-lg shadow-md text-muted-foreground">
              <p className="text-xs font-medium text-center">No vehicle locations available</p>
              <p className="text-[10px] mt-0.5 text-center opacity-70">Location data will appear once vehicles report their position</p>
            </div>
          </div>
        )}
      </div>

      {/* Tables Grid: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Available */}
        <div className={`${cardClass} p-4`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-xs font-semibold text-muted-foreground uppercase tracking-wider`}>Available</h3>
            <CountBadge count={availableVehicles.length} status="Available" />
          </div>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={thClass} aria-hidden />
                <th className={thClass}>License</th>
                <th className={thClass}>Model</th>
                <th className={thClass}>Station</th>
                <th className={thClass}>Health</th>
                <th className={thClass}>Ready</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-border`}>
              {availableVehicles.length === 0 && (
                <tr><td colSpan={7} className={`${tdClass} text-center text-muted-foreground`}>No available vehicles</td></tr>
              )}
              {availableVehicles.map((v) => (
                <tr key={v.id} onClick={() => handleRowClick(v)} className={`cursor-pointer transition-colors hover:bg-muted/50`}>
                  <td className={`${tdClass} w-10`}><VehicleThumb v={v} isDarkMode={isDarkMode} /></td>
                  <td className={`${tdClass} font-semibold`}><StatusDot status={v.status} />{v.license}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{fleetVehicleTitle(v)}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{v.station}</td>
                  <td className={tdClass}><HealthFleetIcon status={v.healthStatus} /></td>
                  <td className={tdClass}>{readyBadge}</td>
                  <td className={`${tdClass} text-right`}>
                    <button type="button" onClick={(e) => handleDetailClick(e, v)} className={`p-1.5 rounded-lg transition-all hover:bg-muted text-muted-foreground hover:text-foreground`}>
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {/* Active Rented */}
        <div className={`${cardClass} p-4`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-xs font-semibold text-muted-foreground uppercase tracking-wider`}>Active Rented</h3>
            <CountBadge count={activeRented.length} status="Active Rented" />
          </div>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={thClass} aria-hidden />
                <th className={thClass}>License</th>
                <th className={thClass}>Model</th>
                <th className={thClass}>Station</th>
                <th className={thClass}>Driver</th>
                <th className={thClass}>Health</th>
                <th className={thClass}>ERT</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-border`}>
              {activeRented.length === 0 && (
                <tr><td colSpan={8} className={`${tdClass} text-center text-muted-foreground`}>No active rentals</td></tr>
              )}
              {activeRented.map((v) => (
                <tr key={v.id} onClick={() => handleRowClick(v)} className={`cursor-pointer transition-colors hover:bg-muted/50`}>
                  <td className={`${tdClass} w-10`}><VehicleThumb v={v} isDarkMode={isDarkMode} /></td>
                  <td className={`${tdClass} font-semibold`}><StatusDot status={v.status} />{v.license}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{fleetVehicleTitle(v)}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{v.station}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{v.driver ?? '--'}</td>
                  <td className={tdClass}><HealthFleetIcon status={v.healthStatus} /></td>
                  <td className={`${tdClass} text-muted-foreground`}>{v.ert ?? '--'}</td>
                  <td className={`${tdClass} text-right`}>
                    <button onClick={(e) => handleDetailClick(e, v)} className={`p-1.5 rounded-lg transition-all hover:bg-muted text-muted-foreground hover:text-foreground`}>
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {/* Reserved */}
        <div className={`${cardClass} p-4`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-xs font-semibold text-muted-foreground uppercase tracking-wider`}>Reserved</h3>
            <CountBadge count={reserved.length} status="Reserved" />
          </div>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={thClass} aria-hidden />
                <th className={thClass}>License</th>
                <th className={thClass}>Model</th>
                <th className={thClass}>Station</th>
                <th className={thClass}>Driver</th>
                <th className={thClass}>Health</th>
                <th className={thClass}>Pickup</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-border`}>
              {reserved.length === 0 && (
                <tr><td colSpan={8} className={`${tdClass} text-center text-muted-foreground`}>No reservations</td></tr>
              )}
              {reserved.map((v) => (
                <tr key={v.id} onClick={() => handleRowClick(v)} className={`cursor-pointer transition-colors hover:bg-muted/50`}>
                  <td className={`${tdClass} w-10`}><VehicleThumb v={v} isDarkMode={isDarkMode} /></td>
                  <td className={`${tdClass} font-semibold`}><StatusDot status={v.status} />{v.license}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{fleetVehicleTitle(v)}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{v.station}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{v.customer ?? '--'}</td>
                  <td className={tdClass}><HealthFleetIcon status={v.healthStatus} /></td>
                  <td className={`${tdClass} text-muted-foreground`}>{v.pickup ?? '--'}</td>
                  <td className={`${tdClass} text-right`}>
                    <button type="button" onClick={(e) => handleDetailClick(e, v)} className={`p-1.5 rounded-lg transition-all hover:bg-muted text-muted-foreground hover:text-foreground`}>
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>

        {/* Maintenance */}
        <div className={`${cardClass} p-4`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-xs font-semibold text-muted-foreground uppercase tracking-wider`}>Maintenance</h3>
            <CountBadge count={maintenance.length} status="Maintenance" />
          </div>
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className={thClass} aria-hidden />
                <th className={thClass}>License</th>
                <th className={thClass}>Model</th>
                <th className={thClass}>Station</th>
                <th className={thClass}>Reason</th>
                <th className={thClass}>Health</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-border`}>
              {maintenance.length === 0 && (
                <tr><td colSpan={7} className={`${tdClass} text-center text-muted-foreground`}>No vehicles in maintenance</td></tr>
              )}
              {maintenance.map((v) => (
                <tr key={v.id} onClick={() => handleRowClick(v)} className={`cursor-pointer transition-colors hover:bg-muted/50`}>
                  <td className={`${tdClass} w-10`}><VehicleThumb v={v} isDarkMode={isDarkMode} /></td>
                  <td className={`${tdClass} font-semibold`}><StatusDot status={v.status} />{v.license}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{fleetVehicleTitle(v)}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{v.station}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{v.reason ?? '--'}</td>
                  <td className={tdClass}><HealthFleetIcon status={v.healthStatus} /></td>
                  <td className={`${tdClass} text-right`}>
                    <button type="button" onClick={(e) => handleDetailClick(e, v)} className={`p-1.5 rounded-lg transition-all hover:bg-muted text-muted-foreground hover:text-foreground`}>
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}

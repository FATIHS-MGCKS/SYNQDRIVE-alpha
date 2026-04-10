import { MapPin, ChevronDown, ChevronRight, Car, Heart, AlertTriangle, OctagonAlert, RefreshCw } from 'lucide-react';
import { useState, useRef, useMemo } from 'react';
import { MapboxMap } from '../../components/MapboxMap';
import type { FleetMapMarker } from '../../components/MapboxMap';
import { VehicleData, getShortModel } from '../data/vehicles';
import { useFleetVehicles } from '../FleetContext';
import { getStatusColor } from '../../lib/vehicleMarker';
import { BrandLogo, getBrandFromModel } from './BrandLogo';

interface FleetViewProps {
  isDarkMode: boolean;
  onVehicleSelect?: (vehicle: VehicleData) => void;
}

const KASSEL_CENTER: [number, number] = [9.4797, 51.3127];

function fleetVehicleTitle(v: VehicleData): string {
  return [v.make, getShortModel(v.model)].filter(Boolean).join(' ') || v.model;
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
  const { fleetVehicles, countdown, loading } = useFleetVehicles();
  const [selectedStation, setSelectedStation] = useState('All Stations');
  const [isStationOpen, setIsStationOpen] = useState(false);
  const [focusedVehicleId, setFocusedVehicleId] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const uniqueStations = [...new Set(fleetVehicles.map(v => v.station).filter(Boolean))];
  const stations = ['All Stations', ...uniqueStations];

  const filtered = selectedStation === 'All Stations'
    ? fleetVehicles
    : fleetVehicles.filter(v => v.station === selectedStation);

  const vehiclesWithCoords = filtered.filter(v => v.lat != null && v.lng != null);

  const mapMarkers: FleetMapMarker[] = useMemo(() =>
    vehiclesWithCoords.map((v) => ({
      id: v.id,
      lng: v.lng!,
      lat: v.lat!,
      label: v.license,
      status: v.status,
      heading: 0,
    })),
    [vehiclesWithCoords],
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
    setFocusedVehicleId(vehicle.id);
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (onVehicleSelect) {
      onVehicleSelect(vehicle);
    }
  };

  const handleDetailClick = (e: React.MouseEvent, vehicle: VehicleData) => {
    e.stopPropagation();
    if (onVehicleSelect) {
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
            <span>Station: {selectedStation}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isStationOpen ? 'rotate-180' : ''}`} />
          </button>
          {isStationOpen && (
            <div className="absolute top-full mt-2 right-0 z-50 min-w-[200px] rounded-lg border border-border bg-card shadow-md overflow-hidden">
              {stations.map((s) => (
                <button
                  key={s}
                  onClick={() => { setSelectedStation(s); setIsStationOpen(false); }}
                  className={`w-full px-3 py-2 text-left text-xs font-medium transition-colors ${
                    s === selectedStation
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div ref={mapRef} className="bg-card border border-border rounded-xl overflow-hidden relative" style={{ height: '320px', minHeight: '320px' }}>
        <MapboxMap
          center={mapCenter}
          zoom={vehiclesWithCoords.length > 0 ? 12 : 5}
          markers={mapMarkers}
          className="w-full h-full min-h-[320px]"
          isDarkMode={isDarkMode}
        />
        {/* Refresh countdown overlay */}
        <div
          className="absolute top-3 right-12 z-10 flex items-center gap-1.5 px-2.5 py-1.5 bg-card/80 backdrop-blur-sm border border-border/50 rounded-lg shadow-md text-muted-foreground"
        >
          <RefreshCw className={`w-3 h-3 text-purple-500 ${loading ? 'animate-spin' : ''}`} />
          <span className="text-[10px] font-semibold tabular-nums">
            {loading ? 'Updatingâ€¦' : `${countdown}s`}
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
                  <td className={`${tdClass} text-muted-foreground`}>{v.driver ?? 'â€”'}</td>
                  <td className={tdClass}><HealthFleetIcon status={v.healthStatus} /></td>
                  <td className={`${tdClass} text-muted-foreground`}>{v.ert ?? 'â€”'}</td>
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
                  <td className={`${tdClass} text-muted-foreground`}>{v.customer ?? 'â€”'}</td>
                  <td className={tdClass}><HealthFleetIcon status={v.healthStatus} /></td>
                  <td className={`${tdClass} text-muted-foreground`}>{v.pickup ?? 'â€”'}</td>
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
                  <td className={`${tdClass} text-muted-foreground`}>{v.reason ?? 'â€”'}</td>
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

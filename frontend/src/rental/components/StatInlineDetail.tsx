import { Car, Calendar, TrendingUp, Clock, Wrench, AlertTriangle, CheckCircle, ChevronRight, MapPin, Fuel, Users, Sparkles, ShieldAlert, Gauge, X, Heart, OctagonAlert } from 'lucide-react';
import { VehicleData } from '../data/vehicles';
import { useFleetVehicles } from '../FleetContext';
import { useAddress } from '../../lib/useAddress';
import { formatOdometerKmFloor, formatFuelPercentCeil } from '../../lib/formatVehicleDisplay';

function VehicleAddress({ v, isDarkMode }: { v: VehicleData; isDarkMode: boolean }) {
  const { address } = useAddress(v.lat, v.lng);
  const label = address?.formatted && address.formatted !== '—' ? address.formatted : v.station;
  return <span className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>;
}

interface StatInlineDetailProps {
  activePopup: string;
  isDarkMode: boolean;
  onClose: () => void;
  onVehicleSelect?: (vehicle: VehicleData) => void;
  onItemHover?: (vehicleName: string | null) => void;
  pickupItems: { time: string; vehicle: string; plate: string; customer: string; station: string; done: boolean; vehicleId: string; needsCleaning: boolean; hasAlert: boolean; hasError: boolean }[];
  returnItems: { time: string; vehicle: string; plate: string; customer: string; station: string; done: boolean; vehicleId: string; hasError: boolean; kmExceeded: boolean; hasAlert: boolean }[];
  pickupNeedsCleaning: number;
  pickupAlerts: number;
  returnErrors: number;
  returnKmExceeded: number;
  returnAlerts: number;
  borderColor: string;
  hideHeader?: boolean;
}

export function StatInlineDetail({ activePopup, isDarkMode, onClose, onVehicleSelect, onItemHover, pickupItems, returnItems, pickupNeedsCleaning, pickupAlerts, returnErrors, returnKmExceeded, returnAlerts, borderColor, hideHeader }: StatInlineDetailProps) {
  const { fleetVehicles } = useFleetVehicles();
  const closeBtn = (
    <button onClick={(e) => { e.stopPropagation(); onClose(); }} className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-neutral-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}>
      <X className="w-4 h-4" />
    </button>
  );

  const vehicleClick = (v: VehicleData) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onVehicleSelect?.(v);
    onClose();
  };

  const cardClass = isDarkMode ? 'bg-neutral-800/60 border-neutral-700/50 hover:border-neutral-600' : 'bg-gray-50/80 border-gray-200/60 hover:border-gray-300';

  const fleetTitle = (v: VehicleData) => {
    const y = v.year ? String(v.year) : '';
    return [v.make, v.model, y].filter(Boolean).join(' ').trim() || v.model;
  };

  const HealthFleetIcon = ({ status }: { status: VehicleData['healthStatus'] }) => {
    const cls = 'w-4 h-4 shrink-0';
    if (status === 'Good Health') return <Heart className={`${cls} ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} fill="currentColor" />;
    if (status === 'Warning') return <AlertTriangle className={`${cls} ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`} />;
    return <OctagonAlert className={`${cls} ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} />;
  };

  return (
    <div className={`mt-0.5 rounded-2xl border p-5 ${borderColor} ${isDarkMode ? 'bg-neutral-900/60' : 'bg-white'}`}>
      {/* Available */}
      {activePopup === 'Available' && (() => {
        const vehicles = fleetVehicles.filter(v => v.status === 'Available');
        return (
          <>
            {!hideHeader && <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center"><Car className="w-4 h-4 text-blue-600" /></div>
                <div>
                  <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Available Vehicles</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{vehicles.length} vehicles ready for rental</p>
                </div>
              </div>
              {closeBtn}
            </div>}
            <div
              className="overflow-y-auto space-y-2 pr-0.5"
              style={{ maxHeight: '318px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(156,163,175,0.4) transparent' }}
            >
              {vehicles.map((v) => (
                <div key={v.id} onClick={vehicleClick(v)} onMouseEnter={() => onItemHover?.(v.model)} onMouseLeave={() => onItemHover?.(null)} className={`rounded-xl p-3 border transition-all hover:shadow-sm cursor-pointer ${cardClass}`}>
                  {/* Row 1: License plate + health & cleaning icons */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[10px] font-mono font-semibold tracking-wide ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{v.license}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Sparkles
                        className={`w-3.5 h-3.5 ${v.cleaningStatus === 'Clean' ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-500') : (isDarkMode ? 'text-amber-400' : 'text-amber-500')}`}
                        title={v.cleaningStatus === 'Clean' ? 'Clean' : 'Needs cleaning'}
                      />
                      <HealthFleetIcon status={v.healthStatus} />
                    </div>
                  </div>
                  {/* Row 2: Vehicle name + chevron */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-[12px] font-bold leading-tight truncate flex-1 min-w-0 mr-1 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{fleetTitle(v)}</span>
                    <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  </div>
                  {/* Row 3: Location · Fuel · Odometer · Ready — all in one compact footer */}
                  <div className={`flex items-center gap-1.5 pt-1.5 border-t min-w-0 overflow-hidden ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-100'}`}>
                    <MapPin className={`w-2.5 h-2.5 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                    <div className="truncate min-w-0 flex-1 text-[10px]">
                      <VehicleAddress v={v} isDarkMode={isDarkMode} />
                    </div>
                    <div className={`w-px h-3 shrink-0 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
                    <Fuel className={`w-2.5 h-2.5 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                    <div className={`w-8 h-1 rounded-full overflow-hidden shrink-0 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`}>
                      <div className={`h-full rounded-full ${v.fuel > 50 ? 'bg-green-500' : v.fuel > 25 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, v.fuel)}%` }} />
                    </div>
                    <span className={`text-[10px] font-semibold shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatFuelPercentCeil(v.fuel)}</span>
                    <div className={`w-px h-3 shrink-0 ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
                    <span className={`text-[10px] shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatOdometerKmFloor(v.odometer)}</span>
                    <span className={`ml-auto shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide ${isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>
                      Ready
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {vehicles.length > 3 && (
              <div className={`flex items-center justify-center gap-1 pt-2 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                <div className="flex gap-1">
                  {Array.from({ length: Math.ceil(vehicles.length / 3) }).map((_, i) => (
                    <div key={i} className={`rounded-full transition-all ${i === 0 ? (isDarkMode ? 'w-3 h-1.5 bg-gray-400' : 'w-3 h-1.5 bg-gray-500') : (isDarkMode ? 'w-1.5 h-1.5 bg-gray-700' : 'w-1.5 h-1.5 bg-gray-300')}`} />
                  ))}
                </div>
                <span className={`text-[10px] ml-1 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>{vehicles.length - 3} more</span>
              </div>
            )}
          </>
        );
      })()}

      {/* Reserved */}
      {activePopup === 'Reserved' && (() => {
        const vehicles = fleetVehicles.filter(v => v.status === 'Reserved');
        const alertCount = vehicles.filter(v => v.healthStatus !== 'Good Health' || v.alert).length;
        return (
          <>
            {!hideHeader && <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center"><Calendar className="w-4 h-4 text-purple-600" /></div>
                <div>
                  <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Reserved Vehicles</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{vehicles.length} reserved{alertCount > 0 ? ` · ${alertCount} with alerts` : ''}</p>
                </div>
              </div>
              {closeBtn}
            </div>}
            <div className="space-y-2">
              {vehicles.map((v) => {
                const hasAlert = v.healthStatus !== 'Good Health' || !!v.alert;
                const isClean = v.cleaningStatus === 'Clean';
                return (
                  <div key={v.id} onClick={vehicleClick(v)} onMouseEnter={() => onItemHover?.(v.model)} onMouseLeave={() => onItemHover?.(null)} className={`rounded-xl p-3.5 border transition-all hover:shadow-sm cursor-pointer ${cardClass}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`text-[13px] font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{v.license}</span>
                        <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{v.model}</span>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap mb-2.5">
                      <div className="flex items-center gap-1"><Users className={`w-3 h-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} /><span className={`text-[11px] font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{v.customer || 'N/A'}</span></div>
                      <div className="flex items-center gap-1"><MapPin className={`w-3 h-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} /><VehicleAddress v={v} isDarkMode={isDarkMode} /></div>
                      <span className={`ml-auto text-[11px] font-semibold ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>Pickup: {v.pickup || 'TBD'}</span>
                    </div>
                    <div className={`flex items-center gap-2 flex-wrap pt-2 border-t ${isDarkMode ? 'border-neutral-700/40' : 'border-gray-100'}`}>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${isClean ? (isDarkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600') : (isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600')}`}><Sparkles className="w-3 h-3" />{isClean ? 'Clean' : 'Needs Cleaning'}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${v.healthStatus === 'Good Health' ? (isDarkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600') : v.healthStatus === 'Warning' ? (isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600') : (isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600')}`}>{v.healthStatus === 'Good Health' ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}{v.healthStatus}</span>
                      {hasAlert && v.alert && <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md ${isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'}`}><ShieldAlert className="w-3 h-3" />{v.alert}</span>}
                      <div className="ml-auto flex items-center gap-1.5">
                        <div className={`w-12 h-1 rounded-full overflow-hidden ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-100'}`}><div className={`h-full rounded-full ${v.fuel > 50 ? 'bg-green-500' : v.fuel > 25 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, v.fuel)}%` }} /></div>
                        <span className={`text-[10px] font-semibold ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatFuelPercentCeil(v.fuel)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Active Rented */}
      {activePopup === 'Active Rented' && (() => {
        const vehicles = fleetVehicles.filter(v => v.status === 'Active Rented');
        return (
          <>
            {!hideHeader && <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-green-600" /></div>
                <div>
                  <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Active Rentals</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{vehicles.length} vehicles currently rented</p>
                </div>
              </div>
              {closeBtn}
            </div>}
            <div className="space-y-2">
              {vehicles.map((v) => (
                  <div key={v.id} onClick={vehicleClick(v)} onMouseEnter={() => onItemHover?.(v.model)} onMouseLeave={() => onItemHover?.(null)} className={`rounded-xl p-3.5 border transition-all hover:shadow-sm cursor-pointer ${cardClass}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex flex-col min-w-0 gap-0.5">
                        <span className={`text-[10px] font-mono font-semibold ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{v.license}</span>
                        <span className={`text-[12px] font-bold leading-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{fleetTitle(v)}</span>
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1"><Users className={`w-3 h-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} /><span className={`text-[11px] font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{v.driver || '—'}</span></div>
                      <div className="flex items-center gap-1"><MapPin className={`w-3 h-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} /><VehicleAddress v={v} isDarkMode={isDarkMode} /></div>
                      <span className={`ml-auto text-[11px] font-semibold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>ERT: {v.ert || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2.5 mt-2.5">
                      <Fuel className={`w-3 h-3 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <div className={`flex-1 h-1 rounded-full overflow-hidden ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-100'}`}><div className={`h-full rounded-full ${v.fuel > 50 ? 'bg-green-500' : v.fuel > 25 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, v.fuel)}%` }} /></div>
                      <span className={`text-[10px] font-semibold min-w-[36px] text-right ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatFuelPercentCeil(v.fuel)}</span>
                    </div>
                    <div className="flex items-center gap-2.5 mt-1.5">
                      <Gauge className={`w-3 h-3 shrink-0 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                      <span className={`text-[10px] font-semibold ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{formatOdometerKmFloor(v.odometer)}</span>
                    </div>
                  </div>
              ))}
            </div>
          </>
        );
      })()}

      {/* Pick Up Today */}
      {activePopup === 'Pick Up Today' && (() => {
        return (
          <>
            {!hideHeader && <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center"><Clock className="w-4 h-4 text-orange-600" /></div>
                <div>
                  <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Pick Ups Today</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{pickupItems.filter(p => p.done).length} of {pickupItems.length} completed</p>
                </div>
              </div>
              {closeBtn}
            </div>}
            {(pickupNeedsCleaning > 0 || pickupAlerts > 0) && (
              <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-amber-900/20 border border-amber-800/30' : 'bg-amber-50 border border-amber-200/60'}`}>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className={`text-[11px] font-medium ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                  {pickupNeedsCleaning > 0 && `${pickupNeedsCleaning} vehicle${pickupNeedsCleaning > 1 ? 's' : ''} needs cleaning`}
                  {pickupNeedsCleaning > 0 && pickupAlerts > 0 && ' · '}
                  {pickupAlerts > 0 && `${pickupAlerts} active alert${pickupAlerts > 1 ? 's' : ''}`}
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              {pickupItems.map((p, i) => {
                const hasIssues = p.needsCleaning || p.hasAlert || p.hasError;
                const hasAlertOrError = p.hasAlert || p.hasError;
                const linkedVehicle = p.vehicleId ? fleetVehicles.find(v => v.id === p.vehicleId) : null;
                return (
                  <div key={i} onClick={(e) => { e.stopPropagation(); if (linkedVehicle) { onVehicleSelect?.(linkedVehicle); onClose(); } }} onMouseEnter={() => onItemHover?.(p.vehicle)} onMouseLeave={() => onItemHover?.(null)} className={`rounded-lg p-3 border transition-all ${linkedVehicle ? 'cursor-pointer hover:shadow-sm' : ''} ${!p.done && hasAlertOrError ? 'border-l-[3px]' : ''} ${p.done ? (isDarkMode ? 'bg-green-900/10 border-green-800/30' : 'bg-green-50/60 border-green-200/50') : hasAlertOrError ? (isDarkMode ? 'bg-red-900/10 border-red-800/30 border-l-red-500' : 'bg-red-50/40 border-red-200/60 border-l-red-500') : hasIssues ? (isDarkMode ? 'bg-amber-900/10 border-amber-800/30' : 'bg-amber-50/40 border-amber-200/60') : cardClass}`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-[12px] font-bold w-10 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{p.time}</span>
                      {p.done ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> : hasAlertOrError ? <div className="relative shrink-0"><AlertTriangle className="w-3.5 h-3.5 text-red-500" /><div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-ping opacity-75" /></div> : <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${isDarkMode ? 'border-neutral-600' : 'border-gray-300'}`} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[12px] font-semibold ${p.done ? (isDarkMode ? 'text-gray-500 line-through' : 'text-gray-400 line-through') : hasAlertOrError ? (isDarkMode ? 'text-red-400' : 'text-red-700') : (isDarkMode ? 'text-white' : 'text-gray-900')}`}>{p.vehicle} ({p.plate})</span>
                          {!p.done && hasAlertOrError && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                        </div>
                        <div className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{p.customer} · {p.station}</div>
                        {!p.done && hasIssues && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {p.needsCleaning && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-amber-100 text-amber-700"><Sparkles className="w-2.5 h-2.5" />Cleaning</span>}
                            {p.hasAlert && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-100 text-red-700"><AlertTriangle className="w-2.5 h-2.5" />Alert</span>}
                            {p.hasError && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-100 text-red-700"><ShieldAlert className="w-2.5 h-2.5" />Error</span>}
                          </div>
                        )}
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${linkedVehicle ? (isDarkMode ? 'text-gray-500' : 'text-gray-400') : (isDarkMode ? 'text-gray-700' : 'text-gray-200')}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Return Today */}
      {activePopup === 'Return Today' && (() => {
        return (
          <>
            {!hideHeader && <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center"><Clock className="w-4 h-4 text-orange-600" /></div>
                <div>
                  <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Returns Today</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{returnItems.filter(r => r.done).length} of {returnItems.length} completed</p>
                </div>
              </div>
              {closeBtn}
            </div>}
            {(returnErrors > 0 || returnKmExceeded > 0 || returnAlerts > 0) && (
              <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-xl ${isDarkMode ? 'bg-red-900/20 border border-red-800/30' : 'bg-red-50 border border-red-200/60'}`}>
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span className={`text-[11px] font-medium ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>
                  {returnErrors > 0 && `${returnErrors} error code${returnErrors > 1 ? 's' : ''}`}
                  {returnErrors > 0 && returnKmExceeded > 0 && ' · '}
                  {returnKmExceeded > 0 && `${returnKmExceeded} km exceeded`}
                  {(returnErrors > 0 || returnKmExceeded > 0) && returnAlerts > 0 && ' · '}
                  {returnAlerts > 0 && `${returnAlerts} alert${returnAlerts > 1 ? 's' : ''}`}
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              {returnItems.map((r, i) => {
                const hasIssues = r.hasError || r.kmExceeded || r.hasAlert;
                const hasAlertOrError = r.hasAlert || r.hasError;
                const linkedVehicle = r.vehicleId ? fleetVehicles.find(v => v.id === r.vehicleId) : null;
                return (
                  <div key={i} onClick={(e) => { e.stopPropagation(); if (linkedVehicle) { onVehicleSelect?.(linkedVehicle); onClose(); } }} onMouseEnter={() => onItemHover?.(r.vehicle)} onMouseLeave={() => onItemHover?.(null)} className={`rounded-lg p-3 border transition-all ${linkedVehicle ? 'cursor-pointer hover:shadow-sm' : ''} ${!r.done && hasAlertOrError ? 'border-l-[3px]' : ''} ${r.done ? (isDarkMode ? 'bg-green-900/10 border-green-800/30' : 'bg-green-50/60 border-green-200/50') : hasAlertOrError ? (isDarkMode ? 'bg-red-900/10 border-red-800/30 border-l-red-500' : 'bg-red-50/40 border-red-200/60 border-l-red-500') : hasIssues ? (isDarkMode ? 'bg-amber-900/10 border-amber-800/30' : 'bg-amber-50/40 border-amber-200/60') : cardClass}`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-[12px] font-bold w-10 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{r.time}</span>
                      {r.done ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> : hasAlertOrError ? <div className="relative shrink-0"><AlertTriangle className="w-3.5 h-3.5 text-red-500" /><div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-ping opacity-75" /></div> : <div className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${isDarkMode ? 'border-neutral-600' : 'border-gray-300'}`} />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[12px] font-semibold ${r.done ? (isDarkMode ? 'text-gray-500 line-through' : 'text-gray-400 line-through') : hasAlertOrError ? (isDarkMode ? 'text-red-400' : 'text-red-700') : (isDarkMode ? 'text-white' : 'text-gray-900')}`}>{r.vehicle} ({r.plate})</span>
                          {!r.done && hasAlertOrError && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                        </div>
                        <div className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{r.customer} · {r.station}</div>
                        {!r.done && hasIssues && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {r.hasError && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-100 text-red-700"><ShieldAlert className="w-2.5 h-2.5" />Error</span>}
                            {r.kmExceeded && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-red-100 text-red-700"><Gauge className="w-2.5 h-2.5" />km exceeded</span>}
                            {r.hasAlert && <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-orange-100 text-orange-700"><AlertTriangle className="w-2.5 h-2.5" />Alert</span>}
                          </div>
                        )}
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${linkedVehicle ? (isDarkMode ? 'text-gray-500' : 'text-gray-400') : (isDarkMode ? 'text-gray-700' : 'text-gray-200')}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* In Maintenance */}
      {activePopup === 'In Maintenance' && (() => {
        const vehicles = fleetVehicles.filter(v => v.status === 'Maintenance');
        return (
          <>
            {!hideHeader && <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center"><Wrench className="w-4 h-4 text-red-600" /></div>
                <div>
                  <h3 className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>In Maintenance</h3>
                  <p className={`text-[11px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{vehicles.length} vehicles in workshop</p>
                </div>
              </div>
              {closeBtn}
            </div>}
            <div className="space-y-2">
              {vehicles.map((v) => (
                <div key={v.id} onClick={vehicleClick(v)} onMouseEnter={() => onItemHover?.(v.model)} onMouseLeave={() => onItemHover?.(null)} className={`rounded-xl p-3.5 border transition-all hover:shadow-sm cursor-pointer ${cardClass}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <span className={`text-[13px] font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{v.license}</span>
                      <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{v.model}</span>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div><p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Reason</p><p className={`text-[11px] font-semibold ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}>{v.reason || 'General Service'}</p></div>
                    <div><p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Workshop</p><p className={`text-[11px] font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{v.workshop || 'N/A'}</p></div>
                    <div><p className={`text-[10px] uppercase tracking-wider font-semibold mb-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>ETA</p><p className={`text-[11px] font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{v.eta || 'N/A'}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}
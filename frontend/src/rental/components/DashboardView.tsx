import { Car, TrendingUp, Calendar, Clock, Wrench, AlertTriangle, Award, CheckCircle, ChevronDown, ChevronUp, Sparkles, TrendingDown, Zap, Target, Users, ArrowRight, DollarSign, Percent, TrendingUp as TrendingUpIcon, Euro, X, MapPin, Fuel, ChevronRight, ShieldAlert, Gauge, FileText, Ban, Hammer, MessageSquare, Bell, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { VehicleData } from '../data/vehicles';
import { useFleetVehicles } from '../FleetContext';
import { StatInlineDetail } from './StatInlineDetail';
import { useLanguage } from '../i18n/LanguageContext';
import { BusinessInsightsBox } from './BusinessInsightsBox';

interface DashboardViewProps {
  isDarkMode: boolean;
  onVehicleSelect?: (vehicle: VehicleData) => void;
  onItemHover?: (vehicleName: string | null) => void;
}

export function DashboardView({ isDarkMode, onVehicleSelect, onItemHover }: DashboardViewProps) {
  const { t, locale } = useLanguage();
  const { fleetVehicles } = useFleetVehicles();
  const [activeTab, setActiveTab] = useState<'business' | 'finances'>('business');
  const [selectedStation, setSelectedStation] = useState('All Stations');
  const [isStationDropdownOpen, setIsStationDropdownOpen] = useState(false);
  const [activePopup, setActivePopup] = useState<string | null>(null);
  const [activeFinancePopup, setActiveFinancePopup] = useState<string | null>(null);
  const [revenueExpandedDay, setRevenueExpandedDay] = useState<string | null>(null);
  const [costsExpandedDay, setCostsExpandedDay] = useState<string | null>(null);
  const [fleetStatusTab, setFleetStatusTab] = useState<'Available' | 'Reserved' | 'Active Rented' | 'In Maintenance'>('Available');
  const [todayTab, setTodayTab] = useState<'Pick Up Today' | 'Return Today'>('Pick Up Today');

  // Compute warning indicators for stat boxes
  const availableVehicles = fleetVehicles.filter(v => v.status === 'Available');
  const reservedVehicles = fleetVehicles.filter(v => v.status === 'Reserved');
  const activeRentedVehicles = fleetVehicles.filter(v => v.status === 'Active Rented');

  const availableNeedsCleaning = availableVehicles.filter(v => v.cleaningStatus !== 'Clean').length;
  const availableAlerts = availableVehicles.filter(v => !!v.alert).length;
  const reservedNeedsCleaning = reservedVehicles.filter(v => v.cleaningStatus !== 'Clean').length;
  const reservedAlerts = reservedVehicles.filter(v => !!v.alert).length;

  const activeRentedKmData: Record<string, { included: number; driven: number }> = {};
  const activeRentedOverKm = activeRentedVehicles.filter(v => {
    const km = activeRentedKmData[v.id] || { included: 1500, driven: 900 };
    return km.driven > km.included;
  }).length;

  // Pick Up Today / Return Today - from API (bookings) when available, empty for now
  const pickupItems: { time: string; vehicle: string; plate: string; customer: string; station: string; done: boolean; vehicleId: string; needsCleaning: boolean; hasAlert: boolean; hasError: boolean }[] = [];
  const pickupNeedsCleaning = pickupItems.filter(p => p.needsCleaning).length;
  const pickupAlerts = pickupItems.filter(p => p.hasAlert).length;

  const returnItems: { time: string; vehicle: string; plate: string; customer: string; station: string; done: boolean; vehicleId: string; hasError: boolean; kmExceeded: boolean; hasAlert: boolean }[] = [];
  const returnErrors = returnItems.filter(r => r.hasError).length;
  const returnKmExceeded = returnItems.filter(r => r.kmExceeded).length;
  const returnAlerts = returnItems.filter(r => r.hasAlert).length;

  // Mock data
  const stats = [
    { label: t('dashboard.available'), value: String(availableVehicles.length), icon: Car, color: 'blue' },
    { label: t('dashboard.reserved'), value: String(reservedVehicles.length), icon: Calendar, color: 'purple' },
    { label: t('status.rented'), value: String(activeRentedVehicles.length), icon: TrendingUp, color: 'green' },
    { label: t('dashboard.pickUpToday'), value: String(pickupItems.length), icon: Clock, color: 'orange' },
    { label: t('dashboard.returnToday'), value: String(returnItems.length), icon: Clock, color: 'orange' },
    { label: t('dashboard.inMaintenance'), value: String(fleetVehicles.filter(v => v.status === 'Maintenance').length), icon: Wrench, color: 'red' },
  ];

  // Finance data (populated from API when available)
  const financeKPIs: {
    label: string;
    value: string;
    change: string;
    icon: LucideIcon;
    color: string;
    trend: string;
  }[] = [];

  const upcomingMonthData: { day: string; revenue: number; costs: number }[] = [];

  const topVehicles: {
    rank: number;
    vehicle: string;
    plate: string;
    revenue: string;
    utilization: string;
    trips: number;
  }[] = [];

  // Detailed Revenue MTD data
  const VAT_RATE = 0.19;
  const revenueDetailData: {
    date: string;
    weekday: string;
    completed: { vehicle: string; gross: number; type: string }[];
    reserved: { vehicle: string; gross: number; type: string; cancellable?: boolean }[];
    extras: { vehicle: string; gross: number; type: string }[];
    total: number;
  }[] = [];

  const revenueSummary = {
    completed: revenueDetailData.reduce((sum, d) => sum + d.completed.reduce((s, c) => s + c.gross, 0), 0),
    reserved: revenueDetailData.reduce((sum, d) => sum + d.reserved.reduce((s, r) => s + r.gross, 0), 0),
    extraKm: revenueDetailData.reduce((sum, d) => sum + d.extras.filter(e => e.type === 'Extra Mileage').reduce((s, e) => s + e.gross, 0), 0),
    damages: revenueDetailData.reduce((sum, d) => sum + d.extras.filter(e => e.type === 'Damage Fee').reduce((s, e) => s + e.gross, 0), 0),
  };
  const revenueTotalGross = revenueSummary.completed + revenueSummary.reserved + revenueSummary.extraKm + revenueSummary.damages;
  const revenueTotalNet = Math.round(revenueTotalGross / (1 + VAT_RATE) * 100) / 100;
  const revenueTotalVat = Math.round((revenueTotalGross - revenueTotalNet) * 100) / 100;

  // Detailed Costs MTD data
  const costsFixedMonthly: { label: string; gross: number; type: string }[] = [];
  const costsFixedTotal = costsFixedMonthly.reduce((s, c) => s + c.gross, 0);

  const costsDetailData: {
    date: string;
    weekday: string;
    variable: { vehicle: string; gross: number; type: string }[];
    maintenance: { vehicle: string; gross: number; type: string }[];
    damages: { vehicle: string; gross: number; type: string }[];
    total: number;
  }[] = [];

  const costsSummary = {
    variable: costsDetailData.reduce((sum, d) => sum + d.variable.reduce((s, c) => s + c.gross, 0), 0),
    maintenance: costsDetailData.reduce((sum, d) => sum + d.maintenance.reduce((s, c) => s + c.gross, 0), 0),
    damages: costsDetailData.reduce((sum, d) => sum + d.damages.reduce((s, c) => s + c.gross, 0), 0),
    fixed: costsFixedTotal,
  };
  const costsTotalGross = costsSummary.variable + costsSummary.maintenance + costsSummary.damages + costsSummary.fixed;
  const costsTotalNet = Math.round(costsTotalGross / (1 + VAT_RATE) * 100) / 100;
  const costsTotalVat = Math.round((costsTotalGross - costsTotalNet) * 100) / 100;

  const flopVehicles: {
    rank: number;
    vehicle: string;
    plate: string;
    revenue: string;
    utilization: string;
    trips: number;
  }[] = [];

  const dashboardNotifications: {
    type: 'alert' | 'booking' | 'return' | 'maintenance' | 'feedback' | 'system';
    title: string;
    desc: string;
    time: string;
    unread: boolean;
  }[] = [];

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            {(() => { const lm: Record<string, string> = { en: 'en-US', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL', es: 'es-ES', it: 'it-IT', pl: 'pl-PL', cs: 'cs-CZ' }; const loc = lm[locale] || 'en-US'; return activeTab === 'finances' ? new Date().toLocaleDateString(loc, { month: 'long', year: 'numeric' }) : new Date().toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); })()}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg p-1 bg-muted">
            <button onClick={() => setActiveTab('business')} className={`px-3 py-2 rounded-lg font-medium text-xs transition-all duration-200 ${activeTab === 'business' ? ('bg-card text-foreground shadow-sm') : ('text-muted-foreground hover:text-foreground')}`}>{t('dashboard.business')}</button>
            <button onClick={() => setActiveTab('finances')} className={`px-3 py-2 rounded-lg font-medium text-xs transition-all duration-200 ${activeTab === 'finances' ? ('bg-card text-foreground shadow-sm') : ('text-muted-foreground hover:text-foreground')}`}>{t('dashboard.finances')}</button>
          </div>
          <div className="relative">
            <button onClick={() => setIsStationDropdownOpen(!isStationDropdownOpen)} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all duration-200 bg-card border-border hover:bg-muted text-foreground">
              <span className="text-[10px] font-medium">{selectedStation}</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {isStationDropdownOpen && (
              <div className="absolute top-full mt-2 right-0 z-50 min-w-[200px] rounded-lg border shadow-xl overflow-hidden bg-card border-border">
                {['All Stations'].map((station) => (
                  <button key={station} onClick={() => { setSelectedStation(station); setIsStationDropdownOpen(false); }} className={`w-full px-3 py-2.5 text-left text-xs font-medium transition-colors border-b last:border-b-0 ${selectedStation === station ? 'bg-blue-500/10 text-blue-500 border-border' : 'text-foreground/80 hover:bg-muted border-border'}`}>{station}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Conditional rendering based on active tab */}
      {activeTab === 'business' ? (
        <div className="flex gap-3">
          {/* ===== MAIN CONTENT ===== */}
          <div className="flex-1 min-w-0 space-y-3">
          {/* Row 1: AI Business Insights (left) + Fleet Status (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Left: AI Business Insights */}
            <BusinessInsightsBox isDarkMode={isDarkMode} />

            {/* Right: Fleet Status with tab switcher */}
            <div className="rounded-lg border overflow-hidden shadow-sm bg-card border-border">
              <div className="p-4 pb-0">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-blue-600/20' : 'bg-blue-100/80'}`}><Car className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} /></div>
                  <div><h3 className="text-base font-semibold text-foreground">{t('dashboard.fleetStatus')}</h3><p className="text-xs text-muted-foreground">{t('dashboard.vehiclesTotal', { count: fleetVehicles.length })}</p></div>
                </div>
                <div className="flex rounded-lg p-1 bg-muted">
                  {([
                    { key: 'Available' as const, label: t('dashboard.available'), count: availableVehicles.length, color: 'blue' },
                    { key: 'Reserved' as const, label: t('dashboard.reserved'), count: reservedVehicles.length, color: 'purple' },
                    { key: 'Active Rented' as const, label: t('dashboard.rented'), count: activeRentedVehicles.length, color: 'green' },
                    { key: 'In Maintenance' as const, label: t('dashboard.maintenanceTab'), count: fleetVehicles.filter(v => v.status === 'Maintenance').length, color: 'red' },
                  ]).map(tab => {
                    const isActive = fleetStatusTab === tab.key;
                    const cm: Record<string, { bg: string; text: string; bbg: string; bt: string }> = {
                      blue:   { bg: isDarkMode ? 'bg-blue-500/15' : 'bg-blue-50', text: isDarkMode ? 'text-blue-400' : 'text-blue-700', bbg: isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100', bt: isDarkMode ? 'text-blue-300' : 'text-blue-700' },
                      purple: { bg: isDarkMode ? 'bg-violet-500/15' : 'bg-violet-50', text: isDarkMode ? 'text-violet-400' : 'text-violet-700', bbg: isDarkMode ? 'bg-violet-500/20' : 'bg-violet-100', bt: isDarkMode ? 'text-violet-300' : 'text-violet-700' },
                      green:  { bg: isDarkMode ? 'bg-emerald-500/15' : 'bg-emerald-50', text: isDarkMode ? 'text-emerald-400' : 'text-emerald-700', bbg: isDarkMode ? 'bg-emerald-500/20' : 'bg-emerald-100', bt: isDarkMode ? 'text-emerald-300' : 'text-emerald-700' },
                      red:    { bg: isDarkMode ? 'bg-red-500/15' : 'bg-red-50', text: isDarkMode ? 'text-red-400' : 'text-red-700', bbg: isDarkMode ? 'bg-red-500/20' : 'bg-red-100', bt: isDarkMode ? 'text-red-300' : 'text-red-700' },
                    };
                    const c = cm[tab.color];
                    return (
                      <button key={tab.key} onClick={() => setFleetStatusTab(tab.key)} className={`flex-1 px-2 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 ${
                        isActive
                          ? `${c.bg} ${c.text} shadow-sm`
                          : 'text-muted-foreground hover:text-foreground'
                      }`}>
                        {tab.label}
                        <span className={`text-xs min-w-[16px] h-[16px] flex items-center justify-center rounded-full font-bold ${
                          isActive
                            ? `${c.bbg} ${c.bt}`
                            : 'bg-muted text-muted-foreground'
                        }`}>{tab.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="px-1 pb-1">
                <StatInlineDetail
                  activePopup={fleetStatusTab}
                  isDarkMode={isDarkMode}
                  onClose={() => {}}
                  onVehicleSelect={onVehicleSelect}
                  onItemHover={onItemHover}
                  pickupItems={pickupItems}
                  returnItems={returnItems}
                  pickupNeedsCleaning={pickupNeedsCleaning}
                  pickupAlerts={pickupAlerts}
                  returnErrors={returnErrors}
                  returnKmExceeded={returnKmExceeded}
                  returnAlerts={returnAlerts}
                  borderColor="border-transparent"
                  hideHeader
                />
              </div>
            </div>
          </div>

          {/* Row 2: Today's Activity (left) + Vehicle Alerts & Driver Behavior (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Right: Today's Activity with tab switcher */}
            <div className="rounded-lg border overflow-hidden order-2 shadow-sm bg-card border-border">
              <div className="p-4 pb-0">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-amber-600/20' : 'bg-amber-100/80'}`}><Clock className={`w-5 h-5 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`} /></div>
                  <div><h3 className="text-base font-semibold text-foreground">Today's Activity</h3><p className="text-xs text-muted-foreground">{pickupItems.length + returnItems.length} scheduled</p></div>
                </div>
                <div className="flex rounded-lg p-1 bg-muted">
                  {([
                    { key: 'Pick Up Today' as const, label: 'Pick Up', count: pickupItems.length, done: pickupItems.filter(p => p.done).length },
                    { key: 'Return Today' as const, label: 'Return', count: returnItems.length, done: returnItems.filter(r => r.done).length },
                  ]).map(tab => (
                    <button key={tab.key} onClick={() => setTodayTab(tab.key)} className={`flex-1 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 ${
                      todayTab === tab.key
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}>
                      {tab.label}
                      <span className={`text-xs min-w-[16px] h-[16px] flex items-center justify-center rounded-full font-bold ${
                        todayTab === tab.key
                          ? 'bg-foreground/10 text-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}>{tab.done}/{tab.count}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-1 pb-1">
                <StatInlineDetail
                  activePopup={todayTab}
                  isDarkMode={isDarkMode}
                  onClose={() => {}}
                  onVehicleSelect={onVehicleSelect}
                  onItemHover={onItemHover}
                  pickupItems={pickupItems}
                  returnItems={returnItems}
                  pickupNeedsCleaning={pickupNeedsCleaning}
                  pickupAlerts={pickupAlerts}
                  returnErrors={returnErrors}
                  returnKmExceeded={returnKmExceeded}
                  returnAlerts={returnAlerts}
                  borderColor="border-transparent"
                  hideHeader
                />
              </div>
            </div>

            {/* Left: Vehicle Alerts + Driver Behavior stacked */}
            <div className="grid grid-cols-2 gap-3 order-1">
              {/* Vehicle Alerts */}
              <div onClick={() => setActivePopup(activePopup === 'Vehicle Alerts' ? null : 'Vehicle Alerts')} className={`rounded-lg p-4 border cursor-pointer transition-all duration-200 group shadow-sm ${activePopup === 'Vehicle Alerts' ? (isDarkMode ? 'bg-neutral-800/60 border-red-400/40 ring-1 ring-red-400/20' : 'bg-red-50/50 border-red-300/60 ring-1 ring-red-200/40') : ('bg-card border-border hover:border-border/80')}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-red-500/15' : 'bg-red-100/80'}`}><AlertTriangle className={`w-5 h-5 ${isDarkMode ? 'text-red-400' : 'text-red-500'}`} /></div>
                  <span className={`text-xs font-bold ${isDarkMode ? 'text-red-400' : 'text-red-500'}`}>{fleetVehicles.filter(v => v.alert).length}</span>
                </div>
                <div className="text-xs font-semibold text-foreground">Vehicle Alerts</div>
                <div className="text-xs mt-0.5 text-muted-foreground">{fleetVehicles.filter(v => v.alert).length} vehicles affected</div>
              </div>

              {/* Driver Behavior */}
              <div onClick={() => setActivePopup(activePopup === 'Driver Behavior' ? null : 'Driver Behavior')} className={`rounded-lg p-4 border cursor-pointer transition-all duration-200 group shadow-sm ${activePopup === 'Driver Behavior' ? (isDarkMode ? 'bg-neutral-800/60 border-amber-400/40 ring-1 ring-amber-400/20' : 'bg-amber-50/50 border-amber-300/60 ring-1 ring-amber-200/40') : ('bg-card border-border hover:border-border/80')}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-amber-500/15' : 'bg-amber-100/80'}`}><Award className={`w-5 h-5 ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`} /></div>
                  <span className={`text-xs font-bold ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`}>{fleetVehicles.filter(v => v.status === 'Active Rented').length}</span>
                </div>
                <div className="text-xs font-semibold text-foreground">Driver Behavior</div>
                <div className="text-xs mt-0.5 text-muted-foreground">Driving scores</div>
              </div>

              {/* Driver Feedback */}
              <div onClick={() => setActivePopup(activePopup === 'Driver Feedback' ? null : 'Driver Feedback')} className={`rounded-lg p-4 border cursor-pointer transition-all duration-200 group shadow-sm ${activePopup === 'Driver Feedback' ? (isDarkMode ? 'bg-neutral-800/60 border-blue-400/40 ring-1 ring-blue-400/20' : 'bg-blue-50/50 border-blue-300/60 ring-1 ring-blue-200/40') : ('bg-card border-border hover:border-border/80')}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-blue-500/15' : 'bg-blue-100/80'}`}><MessageSquare className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} /></div>
                  <span className={`text-xs font-bold ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`}>8</span>
                </div>
                <div className="text-xs font-semibold text-foreground">Driver Feedback</div>
                <div className="text-xs mt-0.5 text-muted-foreground">3 new today</div>
              </div>

              {/* Notifications */}
              <div onClick={() => setActivePopup(activePopup === 'Notifications' ? null : 'Notifications')} className={`rounded-lg p-4 border cursor-pointer transition-all duration-200 group shadow-sm ${activePopup === 'Notifications' ? (isDarkMode ? 'bg-neutral-800/60 border-violet-400/40 ring-1 ring-violet-400/20' : 'bg-violet-50/50 border-violet-300/60 ring-1 ring-violet-200/40') : ('bg-card border-border hover:border-border/80')}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-violet-500/15' : 'bg-violet-100/80'}`}><Bell className={`w-5 h-5 ${isDarkMode ? 'text-violet-400' : 'text-violet-500'}`} /></div>
                  <span className={`text-xs font-bold ${isDarkMode ? 'text-violet-400' : 'text-violet-500'}`}>{dashboardNotifications.length}</span>
                </div>
                <div className="text-xs font-semibold text-foreground">{t('dashboard.notifications')}</div>
                <div className="text-xs mt-0.5 text-muted-foreground">{t('dashboard.unread', { count: dashboardNotifications.filter((n) => n.unread).length })}</div>
              </div>

              {/* Expanded panels spanning full width */}
              {activePopup === 'Vehicle Alerts' && (() => {
                const alertVehicles = fleetVehicles.filter(v => v.alert);
                const alertDetails: Record<string, { severity: 'critical' | 'warning' | 'info'; description: string; code: string; system: string; recommendation: string }[]> = {
                  'v1': [{ severity: 'warning', code: 'P0420', system: 'Emission', description: 'Catalyst System Efficiency Below Threshold  –  Der Katalysator arbeitet unterhalb der Effizienzgrenze.', recommendation: 'Lambdasonde prüfen und ggf. Katalysator austauschen.' }],
                  'v3': [{ severity: 'warning', code: 'P0171', system: 'Fuel System', description: 'System Too Lean (Bank 1)  –  Das Kraftstoffgemisch ist zu mager.', recommendation: 'Luftmassenmesser und Einspritzdüsen prüfen.' }, { severity: 'critical', code: 'C0035', system: 'Brakes / ABS', description: 'Left Front Wheel Speed Sensor  –  ABS und ESP könnten eingeschränkt funktionieren.', recommendation: 'Sofort Werkstatt aufsuchen. Raddrehzahlsensor prüfen.' }],
                  'v5': [{ severity: 'info', code: 'P0456', system: 'EVAP', description: 'Evaporative Emission System Leak (Small)  –  Kleines Leck im Kraftstoffdampf-Rückhaltesystem.', recommendation: 'Tankdeckel prüfen und fest verschließen.' }],
                  'v7': [{ severity: 'warning', code: 'B1234', system: 'Tire Pressure', description: 'Reifendruck-Warnung  –  Der Reifendruck ist unter dem empfohlenen Wert.', recommendation: 'Reifendruck an allen vier Reifen prüfen.' }, { severity: 'warning', code: 'P0301', system: 'Engine', description: 'Cylinder 1 Misfire Detected  –  Zündaussetzer in Zylinder 1 erkannt.', recommendation: 'Zündkerzen und Zündspulen prüfen.' }],
                  'v9': [{ severity: 'critical', code: 'P0217', system: 'Cooling', description: 'Engine Coolant Over Temperature  –  Kritische Kühlmitteltemperatur.', recommendation: 'Fahrzeug sofort abstellen! Kühlmittelstand prüfen.' }],
                };
                return (
                  <div className={`col-span-2 rounded-lg border p-4 space-y-3 bg-card ${isDarkMode ? 'border-red-800/30' : 'border-red-200/40'}`}>
                    {alertVehicles.map((v) => {
                      const errors = alertDetails[v.id] || [{ severity: 'warning' as const, code: 'UNKNOWN', system: 'General', description: 'Unbekannter Fehler erkannt.', recommendation: 'Werkstatttermin vereinbaren.' }];
                      return (
                        <div key={v.id} className="rounded-lg border overflow-hidden bg-card border-border">
                          <div className={`px-3 py-2 flex items-center justify-between ${isDarkMode ? 'border-b border-neutral-700/50' : 'border-b border-gray-100'}`}>
                            <div className="flex items-center gap-3"><span className="text-xs font-bold text-foreground">{v.license}</span><span className="text-xs text-muted-foreground">{v.model}</span></div>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${errors.some(e => e.severity === 'critical') ? (isDarkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700') : errors.some(e => e.severity === 'warning') ? (isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700') : (isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700')}`}>{errors.length} {errors.length === 1 ? 'Error' : 'Errors'}</span>
                          </div>
                          <div className="px-3 py-2 space-y-2">
                            {errors.map((err, ei) => (
                              <div key={ei} className={`rounded-lg p-3 border ${err.severity === 'critical' ? (isDarkMode ? 'bg-red-900/15 border-red-800/30' : 'bg-red-50 border-red-200/60') : err.severity === 'warning' ? (isDarkMode ? 'bg-amber-900/15 border-amber-800/30' : 'bg-amber-50 border-amber-200/60') : (isDarkMode ? 'bg-blue-900/15 border-blue-800/30' : 'bg-blue-50 border-blue-200/60')}`}>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${err.severity === 'critical' ? 'bg-red-500 text-white' : err.severity === 'warning' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'}`}>{err.severity}</span>
                                  <span className={`text-xs font-mono font-bold text-foreground/80`}>{err.code}</span>
                                  <span className={`text-xs uppercase tracking-wider font-semibold ml-auto text-muted-foreground`}>{err.system}</span>
                                </div>
                                <p className="text-xs leading-relaxed text-foreground/80">{err.description}</p>
                                <div className={`flex items-start gap-1.5 mt-2 pt-2 border-t ${err.severity === 'critical' ? (isDarkMode ? 'border-red-800/30' : 'border-red-200/60') : err.severity === 'warning' ? (isDarkMode ? 'border-amber-800/30' : 'border-amber-200/60') : (isDarkMode ? 'border-blue-800/30' : 'border-blue-200/60')}`}>
                                  <Wrench className={`w-3 h-3 mt-0.5 shrink-0 ${err.severity === 'critical' ? (isDarkMode ? 'text-red-400' : 'text-red-500') : err.severity === 'warning' ? (isDarkMode ? 'text-amber-400' : 'text-amber-500') : (isDarkMode ? 'text-blue-400' : 'text-blue-500')}`} />
                                  <p className={`text-[11px] leading-relaxed text-muted-foreground`}>{err.recommendation}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {activePopup === 'Driver Behavior' && (() => {
                const activeRentals = fleetVehicles.filter(v => v.status === 'Active Rented');
                const driverScores: Record<string, { overall: number; acceleration: number; braking: number; cornering: number; speeding: number; abuses: { type: string; time: string; severity: 'high' | 'medium' | 'low' }[] }> = {
                  'v4': { overall: 92, acceleration: 95, braking: 88, cornering: 94, speeding: 91, abuses: [] },
                  'v5': { overall: 64, acceleration: 58, braking: 52, cornering: 70, speeding: 68, abuses: [{ type: 'Harsh Braking', time: 'Heute, 14:22', severity: 'medium' }, { type: 'Excessive Speed (142 km/h)', time: 'Heute, 13:05', severity: 'high' }, { type: 'Harsh Acceleration', time: 'Heute, 11:38', severity: 'low' }] },
                  'v6': { overall: 78, acceleration: 82, braking: 74, cornering: 76, speeding: 80, abuses: [{ type: 'Harsh Cornering', time: 'Heute, 15:10', severity: 'medium' }] },
                  'v7': { overall: 45, acceleration: 40, braking: 38, cornering: 52, speeding: 50, abuses: [{ type: 'Excessive Speed (168 km/h)', time: 'Heute, 16:45', severity: 'high' }, { type: 'Harsh Braking (Emergency)', time: 'Heute, 16:44', severity: 'high' }, { type: 'Excessive Speed (155 km/h)', time: 'Heute, 14:30', severity: 'high' }, { type: 'Harsh Acceleration', time: 'Heute, 12:15', severity: 'medium' }, { type: 'Harsh Cornering', time: 'Heute, 10:50', severity: 'medium' }] },
                };
                const getScoreColor = (score: number) => {
                  if (score >= 80) return { bg: 'bg-green-500', text: isDarkMode ? 'text-green-400' : 'text-green-600', ring: 'ring-green-500/20' };
                  if (score >= 60) return { bg: 'bg-amber-500', text: isDarkMode ? 'text-amber-400' : 'text-amber-600', ring: 'ring-amber-500/20' };
                  return { bg: 'bg-red-500', text: isDarkMode ? 'text-red-400' : 'text-red-600', ring: 'ring-red-500/20' };
                };
                const getScoreLabel = (score: number) => score >= 80 ? 'Good' : score >= 60 ? 'Fair' : 'Poor';
                return (
                  <div className={`col-span-2 rounded-lg border p-4 space-y-3 bg-card ${isDarkMode ? 'border-amber-800/30' : 'border-amber-200/40'}`}>
                    <div className={`grid grid-cols-3 gap-3 p-3 rounded-lg border bg-muted border-border`}>
                      <div className="text-center"><div className={`text-base font-bold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>{Object.values(driverScores).filter(d => d.overall >= 80).length}</div><div className="text-xs font-semibold uppercase tracking-wider mt-0.5 text-muted-foreground">Good</div></div>
                      <div className="text-center"><div className={`text-base font-bold ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>{Object.values(driverScores).filter(d => d.overall >= 60 && d.overall < 80).length}</div><div className="text-xs font-semibold uppercase tracking-wider mt-0.5 text-muted-foreground">Fair</div></div>
                      <div className="text-center"><div className={`text-base font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>{Object.values(driverScores).filter(d => d.overall < 60).length}</div><div className="text-xs font-semibold uppercase tracking-wider mt-0.5 text-muted-foreground">Poor</div></div>
                    </div>
                    {activeRentals.map((v) => {
                      const scores = driverScores[v.id] || { overall: 75, acceleration: 78, braking: 72, cornering: 74, speeding: 76, abuses: [] };
                      const color = getScoreColor(scores.overall);
                      const categories = [{ label: 'Accel', value: scores.acceleration }, { label: 'Brake', value: scores.braking }, { label: 'Corner', value: scores.cornering }, { label: 'Speed', value: scores.speeding }];
                      return (
                        <div key={v.id} className="rounded-lg border overflow-hidden bg-card border-border">
                          <div className={`px-3 py-2 flex items-center gap-3 ${isDarkMode ? 'border-b border-neutral-700/50' : 'border-b border-gray-100'}`}>
                            <div className={`relative w-5 h-5 rounded-full flex items-center justify-center ring-4 ${color.ring} bg-muted`}><span className={`text-xs font-bold ${color.text}`}>{scores.overall}</span></div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2"><span className="text-xs font-bold text-foreground">{v.driver || 'Unknown'}</span><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${scores.overall >= 80 ? (isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700') : scores.overall >= 60 ? (isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700') : (isDarkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700')}`}>{getScoreLabel(scores.overall)}</span></div>
                              <div className="text-xs mt-0.5 text-muted-foreground">{v.license} · {v.model}</div>
                            </div>
                            {scores.abuses.length > 0 && (<div className="flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5 text-red-500" /><span className={`text-xs font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>{scores.abuses.length}</span></div>)}
                          </div>
                          <div className="px-3 py-2">
                            <div className="grid grid-cols-4 gap-2 mb-2">
                              {categories.map((cat) => { const catColor = getScoreColor(cat.value); return (<div key={cat.label}><div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold text-muted-foreground">{cat.label}</span><span className={`text-xs font-bold ${catColor.text}`}>{cat.value}</span></div><div className={`h-1.5 rounded-full overflow-hidden bg-muted`}><div className={`h-full rounded-full ${catColor.bg}`} style={{ width: `${cat.value}%` }} /></div></div>); })}
                            </div>
                            {scores.abuses.length > 0 && (<div className={`mt-2 pt-2 border-t border-border`}><div className="space-y-1">{scores.abuses.map((abuse, ai) => (<div key={ai} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${abuse.severity === 'high' ? (isDarkMode ? 'bg-red-900/15' : 'bg-red-50') : abuse.severity === 'medium' ? (isDarkMode ? 'bg-amber-900/15' : 'bg-amber-50') : 'bg-muted'}`}><div className={`w-1.5 h-1.5 rounded-full shrink-0 ${abuse.severity === 'high' ? 'bg-red-500' : abuse.severity === 'medium' ? 'bg-amber-500' : 'bg-gray-400'}`} /><span className={`text-xs flex-1 text-foreground/80`}>{abuse.type}</span><span className="text-xs text-muted-foreground">{abuse.time}</span></div>))}</div></div>)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {activePopup === 'Driver Feedback' && (
                <div className={`col-span-2 rounded-lg border p-4 space-y-3 bg-card ${isDarkMode ? 'border-blue-800/30' : 'border-blue-200/40'}`}>
                  {[
                    { driver: 'Thomas Müller', vehicle: 'M-AB 1234', rating: 5, comment: 'Fahrzeug war in einwandfreiem Zustand, sehr zufrieden!', time: 'Heute, 16:30' },
                    { driver: 'Anna Schmidt', vehicle: 'M-CD 5678', rating: 3, comment: 'Klimaanlage hat nicht richtig funktioniert. Ansonsten okay.', time: 'Heute, 14:15' },
                    { driver: 'Max Weber', vehicle: 'M-EF 9012', rating: 4, comment: 'Gutes Auto, aber leichte Kratzer am Seitenspiegel bemerkt.', time: 'Heute, 11:45' },
                    { driver: 'Lisa Bauer', vehicle: 'B-GH 3456', rating: 2, comment: 'Navi war veraltet und Sitz ließ sich nicht richtig einstellen.', time: 'Gestern, 18:20' },
                    { driver: 'Felix Wagner', vehicle: 'HH-IJ 7890', rating: 5, comment: 'Top Fahrzeug, gerne wieder!', time: 'Gestern, 15:00' },
                  ].map((fb, i) => (
                    <div key={i} className={`rounded-lg border p-4 bg-card border-border`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{fb.driver}</span>
                          <span className="text-xs text-muted-foreground">{fb.vehicle}</span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          {[1,2,3,4,5].map(s => (
                            <div key={s} className={`w-2 h-2 rounded-full ${s <= fb.rating ? (fb.rating >= 4 ? 'bg-green-500' : fb.rating >= 3 ? 'bg-amber-500' : 'bg-red-500') : 'bg-muted'}`} />
                          ))}
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed text-foreground/80">{fb.comment}</p>
                      <div className={`text-xs mt-2 text-muted-foreground`}>{fb.time}</div>
                    </div>
                  ))}
                </div>
              )}

              {activePopup === 'Notifications' && (
                <div className={`col-span-2 rounded-lg border p-4 space-y-2 bg-card ${isDarkMode ? 'border-violet-800/30' : 'border-violet-200/40'}`}>
                  {dashboardNotifications.length === 0 && (
                    <p className={`text-xs text-center py-8 text-muted-foreground`}>{t('common.noData')}</p>
                  )}
                  {dashboardNotifications.map((n, i) => (
                    <div key={i} className={`flex items-start gap-3 rounded-lg p-3 transition-all ${n.unread ? (isDarkMode ? 'bg-violet-900/10 border border-violet-800/20' : 'bg-violet-50/60 border border-violet-200/40') : 'bg-muted/50'}`}>
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        n.type === 'alert' ? (isDarkMode ? 'bg-red-500/15' : 'bg-red-100') :
                        n.type === 'booking' ? (isDarkMode ? 'bg-blue-500/15' : 'bg-blue-100') :
                        n.type === 'return' ? (isDarkMode ? 'bg-green-500/15' : 'bg-green-100') :
                        n.type === 'maintenance' ? (isDarkMode ? 'bg-amber-500/15' : 'bg-amber-100') :
                        n.type === 'feedback' ? (isDarkMode ? 'bg-violet-500/15' : 'bg-violet-100') :
                        'bg-muted'
                      }`}>
                        {n.type === 'alert' ? <AlertTriangle className={`w-3.5 h-3.5 ${isDarkMode ? 'text-red-400' : 'text-red-500'}`} /> :
                         n.type === 'booking' ? <Calendar className={`w-3.5 h-3.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} /> :
                         n.type === 'return' ? <CheckCircle className={`w-3.5 h-3.5 ${isDarkMode ? 'text-green-400' : 'text-green-500'}`} /> :
                         n.type === 'maintenance' ? <Wrench className={`w-3.5 h-3.5 ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`} /> :
                         n.type === 'feedback' ? <MessageSquare className={`w-3.5 h-3.5 ${isDarkMode ? 'text-violet-400' : 'text-violet-500'}`} /> :
                         <Zap className={`w-3.5 h-3.5 text-muted-foreground`} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground">{n.title}</span>
                          {n.unread && <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />}
                        </div>
                        <p className="text-[11px] mt-0.5 leading-relaxed text-muted-foreground">{n.desc}</p>
                      </div>
                      <span className={`text-xs shrink-0 mt-0.5 text-muted-foreground`}>{n.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
        {/* end main content */}
        </div>
      ) : (
        <>
          {/* FINANCES TAB CONTENT */}
          {/* Top KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            {financeKPIs.length === 0 ? (
              <div className="col-span-2 lg:col-span-4 rounded-lg border p-4 text-center text-xs border-border bg-card text-muted-foreground">
                {t('common.noData')}
              </div>
            ) : (
            financeKPIs.map((kpi, index) => {
              const Icon = kpi.icon;
              if (kpi.label === t('dashboard.keyKpis')) {
                const estimatedProfit = revenueTotalGross - costsTotalGross;
                const estimatedProfitNet = Math.round(estimatedProfit / (1 + VAT_RATE) * 100) / 100;
                const estimatedTaxBurden = Math.round(estimatedProfit * 0.30 * 100) / 100;
                const utilization = 78;
                const totalBookings = revenueDetailData.reduce((s, d) => s + d.completed.length + d.reserved.length, 0);
                const stornoCount = 3;
                const stornoRate = totalBookings > 0 ? Math.round((stornoCount / totalBookings) * 100 * 10) / 10 : 0;

                return (
                  <div
                    key={index}
                    className="rounded-lg p-4 border transition-all duration-300 shadow-sm bg-card border-border"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                        <Target className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                      </div>
                      <span className="text-xs font-semibold text-foreground">{t('dashboard.keyKpis')}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <div>
                        <div className="text-xs font-medium mb-0.5 text-muted-foreground">Est. Profit</div>
                        <div className={`text-xs font-bold ${estimatedProfit >= 0 ? (isDarkMode ? 'text-green-400' : 'text-green-600') : (isDarkMode ? 'text-red-400' : 'text-red-600')}`}>
                          €{Math.abs(estimatedProfit).toLocaleString('de-DE')}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-medium mb-0.5 text-muted-foreground">Utilization</div>
                        <div className="flex items-end gap-1">
                          <span className={`text-xs font-bold ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>{utilization}%</span>
                          <span className="text-[10px] font-medium text-green-500 mb-0.5">+3.1%</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-medium mb-0.5 text-muted-foreground">Cancellations</div>
                        <div className="flex items-end gap-1">
                          <span className={`text-xs font-bold ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>{stornoCount}</span>
                          <span className="text-xs font-medium mb-0.5 text-muted-foreground">this month</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-medium mb-0.5 text-muted-foreground">Cancel Rate</div>
                        <div className="flex items-end gap-1">
                          <span className={`text-xs font-bold ${stornoRate > 10 ? (isDarkMode ? 'text-red-400' : 'text-red-600') : (isDarkMode ? 'text-amber-400' : 'text-amber-600')}`}>{stornoRate}%</span>
                          <span className={`text-xs font-medium mb-0.5 ${stornoRate > 10 ? 'text-red-500' : 'text-green-500'}`}>{stornoRate > 10 ? 'high' : 'normal'}</span>
                        </div>
                      </div>
                      <div className="col-span-2 mt-1 pt-2 border-t border-dashed" style={{ borderColor: isDarkMode ? 'rgba(115,115,115,0.3)' : 'rgba(200,200,200,0.6)' }}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-medium mb-0.5 text-muted-foreground">Est. Tax Burden (~30%)</div>
                            <div className={`text-xs font-bold text-foreground/80`}>€{estimatedTaxBurden.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-medium mb-0.5 text-muted-foreground">Net Profit (after VAT)</div>
                            <div className="text-xs font-semibold text-muted-foreground">€{estimatedProfitNet.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={index}
                  onClick={() => { if (kpi.label === t('dashboard.revenueMtd')) setActiveFinancePopup('Revenue MTD'); if (kpi.label === t('dashboard.costsMtd')) setActiveFinancePopup('Costs MTD'); }}
                  className="rounded-lg p-4 border transition-all duration-300 cursor-pointer group flex flex-col shadow-sm bg-card border-border hover:border-border/80"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${
                      kpi.color === 'green' ? (isDarkMode ? 'bg-green-500/20' : 'bg-green-100') :
                      kpi.color === 'red' ? (isDarkMode ? 'bg-red-500/20' : 'bg-red-100') :
                      kpi.color === 'blue' ? (isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100') :
                      (isDarkMode ? 'bg-purple-500/20' : 'bg-purple-100')
                    }`}>
                      <Icon className={`w-5 h-5 ${
                        kpi.color === 'green' ? (isDarkMode ? 'text-green-400' : 'text-green-600') :
                        kpi.color === 'red' ? (isDarkMode ? 'text-red-400' : 'text-red-600') :
                        kpi.color === 'blue' ? (isDarkMode ? 'text-blue-400' : 'text-blue-600') :
                        (isDarkMode ? 'text-purple-400' : 'text-purple-600')
                      }`} />
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      kpi.trend === 'up' && kpi.color === 'green' ? (isDarkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700') :
                      kpi.trend === 'up' && kpi.color === 'red' ? (isDarkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700') :
                      (isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700')
                    }`}>
                      {kpi.change}
                    </span>
                  </div>
                  <div className={`text-xs font-bold mb-1 text-foreground`}>
                    {kpi.value}
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">
                    {kpi.label}
                  </div>
                  {(kpi.label === t('dashboard.revenueMtd') || kpi.label === t('dashboard.costsMtd')) && (
                    <div className="mt-auto pt-3">
                      <div className={`border-t border-border`} />
                      <div className="flex items-center justify-end mt-2">
                        <span className={`text-xs font-medium mr-1 text-muted-foreground group-hover:text-foreground transition-colors`}>Details</span>
                        <ArrowRight className={`w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-all group-hover:translate-x-0.5`} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
            )}

            {/* Revenue by Category Box */}
            {(() => {
              const categoryData = [
                { name: 'SUV', revenue: 14200, color: 'bg-blue-500' },
                { name: 'Sedan', revenue: 11350, color: 'bg-emerald-500' },
                { name: 'Compact', revenue: 8900, color: 'bg-amber-500' },
                { name: 'Luxury', revenue: 7100, color: 'bg-purple-500' },
                { name: 'Sport', revenue: 4500, color: 'bg-rose-500' },
                { name: 'Van', revenue: 2700, color: 'bg-cyan-500' },
              ];
              const maxRevenue = Math.max(...categoryData.map(c => c.revenue));
              const totalRevenue = categoryData.reduce((s, c) => s + c.revenue, 0);

              return (
                <div
                  className="rounded-lg p-4 border transition-all duration-300 shadow-sm bg-card border-border"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Car className="w-5 h-5 text-emerald-600" />
                    </div>
                    <span className="text-xs font-semibold text-foreground">Revenue by Category</span>
                  </div>
                  <div className="space-y-2">
                    {categoryData.map((cat) => {
                      const pct = Math.round((cat.revenue / totalRevenue) * 100);
                      const barWidth = Math.round((cat.revenue / maxRevenue) * 100);
                      return (
                        <div key={cat.name}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-medium text-muted-foreground">{cat.name}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-muted-foreground">{pct}%</span>
                              <span className={`text-[11px] font-bold text-foreground`}>€{cat.revenue.toLocaleString('de-DE')}</span>
                            </div>
                          </div>
                          <div className={`w-full h-1.5 rounded-full overflow-hidden bg-muted`}>
                            <div
                              className={`h-full rounded-full ${cat.color} transition-all duration-500`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Middle Section: Chart Left, AI Insights Right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
            {/* Upcoming This Month Chart */}
            {(() => {
              const dailyData = Array.from({ length: 28 }, (_, i) => {
                const day = i + 1;
                const baseRevenue = 800 + Math.sin(day * 0.3) * 400 + Math.random() * 300;
                const baseCosts = 300 + Math.sin(day * 0.25) * 150 + Math.random() * 120;
                const isWeekend = (day % 7 === 0 || day % 7 === 6);
                return {
                  day: String(day),
                  revenue: Math.round(isWeekend ? baseRevenue * 1.4 : baseRevenue),
                  costs: Math.round(isWeekend ? baseCosts * 0.8 : baseCosts),
                  profit: Math.round((isWeekend ? baseRevenue * 1.4 : baseRevenue) - (isWeekend ? baseCosts * 0.8 : baseCosts)),
                };
              });
              const totalRevDaily = dailyData.reduce((s, d) => s + d.revenue, 0);
              const totalCostDaily = dailyData.reduce((s, d) => s + d.costs, 0);
              const totalProfitDaily = totalRevDaily - totalCostDaily;
              const avgDaily = Math.round(totalRevDaily / dailyData.length);

              return (
                <div className="rounded-lg p-4 border shadow-sm bg-card border-border">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-base font-semibold text-foreground">
                        Daily Revenue & Costs
                      </h3>
                      <p className="text-xs mt-0.5 text-muted-foreground">
                        {(() => { const lm: Record<string, string> = { en: 'en-US', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL', es: 'es-ES', it: 'it-IT', pl: 'pl-PL', cs: 'cs-CZ' }; const loc = lm[locale] || 'en-US'; return `${new Date().toLocaleDateString(loc, { month: 'long', year: 'numeric' })} – daily breakdown`; })()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs font-medium text-muted-foreground">Avg/Day</div>
                        <div className="text-xs font-bold text-foreground">€{avgDaily.toLocaleString('de-DE')}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-medium text-muted-foreground">Net Profit</div>
                        <div className={`text-xs font-bold ${totalProfitDaily >= 0 ? 'text-green-600' : 'text-red-600'}`}>€{totalProfitDaily.toLocaleString('de-DE')}</div>
                      </div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={dailyData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gradCosts" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid 
                        strokeDasharray="3 3" 
                        stroke={isDarkMode ? 'rgba(55,65,81,0.4)' : 'rgba(229,231,235,0.6)'}
                        vertical={false}
                      />
                      <XAxis 
                        dataKey="day" 
                        stroke={isDarkMode ? '#6b7280' : '#9ca3af'}
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        interval={1}
                        tick={({ x, y, payload, index }: any) => {
                          const d = Number(payload.value);
                          const show = d === 1 || d === 5 || d === 10 || d === 15 || d === 20 || d === 25 || d === 28;
                          return show ? (
                            <text key={`tick-${index}`} x={x} y={y + 12} textAnchor="middle" fill={isDarkMode ? '#6b7280' : '#9ca3af'} fontSize={10}>{d}</text>
                          ) : <text key={`tick-empty-${index}`} />;
                        }}
                      />
                      <YAxis 
                        stroke={isDarkMode ? '#6b7280' : '#9ca3af'}
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `€${(v / 1000).toFixed(1)}k`}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: isDarkMode ? 'rgba(23,23,23,0.95)' : 'rgba(255,255,255,0.95)',
                          border: 'none',
                          borderRadius: '14px',
                          boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                          backdropFilter: 'blur(20px)',
                          padding: '10px 14px',
                        }}
                        labelStyle={{ color: isDarkMode ? '#fff' : '#111', fontWeight: 700, fontSize: 12, marginBottom: 4 }}
                        itemStyle={{ fontSize: 11, padding: '1px 0' }}
                        labelFormatter={(label: string) => `Day ${label}`}
                        formatter={(value: number, name: string) => [
                          `€${value.toLocaleString('de-DE')}`,
                          name === 'revenue' ? 'Revenue' : name === 'costs' ? 'Costs' : 'Profit'
                        ]}
                        cursor={{ stroke: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', strokeWidth: 1 }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="revenue" 
                        stroke="#3b82f6" 
                        strokeWidth={2} 
                        fill="url(#gradRevenue)" 
                        dot={false}
                        activeDot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="costs" 
                        stroke="#ef4444" 
                        strokeWidth={1.5} 
                        fill="url(#gradCosts)" 
                        dot={false}
                        activeDot={{ r: 4, fill: '#ef4444', stroke: '#fff', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-[3px] rounded-full bg-blue-500" />
                        <span className="text-xs font-medium text-muted-foreground">Revenue</span>
                        <span className={`text-xs font-bold text-foreground/80`}>€{totalRevDaily.toLocaleString('de-DE')}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-[3px] rounded-full bg-red-500" />
                        <span className="text-xs font-medium text-muted-foreground">Costs</span>
                        <span className={`text-xs font-bold text-foreground/80`}>€{totalCostDaily.toLocaleString('de-DE')}</span>
                      </div>
                    </div>
                    <div className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      totalProfitDaily >= 0 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-red-100 text-red-700'
                    }`}>
                      Margin {Math.round((totalProfitDaily / totalRevDaily) * 100)}%
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* AI Financial Insights */}
            <div className="rounded-lg p-4 border shadow-sm bg-card border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  isDarkMode ? 'bg-blue-600/30' : 'bg-blue-100'
                }`}>
                  <Sparkles className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    AI Financial Insights
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Real-time financial analytics
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Revenue Growth */}
                <div className={`rounded-lg p-4 border ${
                  isDarkMode 
                    ? 'bg-green-900/20 border-green-700/30' 
                    : 'bg-green-50/50 border-green-200/50'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isDarkMode ? 'bg-green-600/30' : 'bg-green-100'
                    }`}>
                      <TrendingUpIcon className={`w-5 h-5 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold uppercase tracking-wide ${
                          isDarkMode ? 'text-green-400' : 'text-green-700'
                        }`}>
                          Revenue Growth
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-600 font-semibold">
                          Strong
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-foreground/80">
                        Monthly revenue up 12.5% with Tesla Model 3 leading performance. Premium segment showing highest growth.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Cost Efficiency */}
                <div className={`rounded-lg p-4 border ${
                  isDarkMode 
                    ? 'bg-orange-900/20 border-orange-700/30' 
                    : 'bg-orange-50/50 border-orange-200/50'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isDarkMode ? 'bg-orange-600/30' : 'bg-orange-100'
                    }`}>
                      <TrendingDown className={`w-5 h-5 ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold uppercase tracking-wide ${
                          isDarkMode ? 'text-orange-400' : 'text-orange-700'
                        }`}>
                          Cost Optimization
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-600 font-semibold">
                          Attention
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-foreground/80">
                        Maintenance costs increased 5.2%. Consider bulk servicing contracts to reduce per-vehicle expenses.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Profit Margin */}
                <div className={`rounded-lg p-4 border ${
                  isDarkMode 
                    ? 'bg-blue-900/20 border-blue-700/30' 
                    : 'bg-blue-50/50 border-blue-200/50'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isDarkMode ? 'bg-blue-600/30' : 'bg-blue-100'
                    }`}>
                      <DollarSign className={`w-5 h-5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-bold uppercase tracking-wide ${
                          isDarkMode ? 'text-blue-400' : 'text-blue-700'
                        }`}>
                          Profit Margin
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-600 font-semibold">
                          Excellent
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-foreground/80">
                        62.7% profit margin maintained. Dynamic pricing strategy optimizing revenue per booking day.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Section: Top & Flop Vehicles */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Top Vehicles */}
            <div className="rounded-lg p-4 border shadow-sm bg-card border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-5 h-5 rounded-lg bg-green-100 flex items-center justify-center">
                  <TrendingUpIcon className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Top Vehicles
                </h3>
              </div>

              <div className="space-y-3">
                {topVehicles.length === 0 && (
                  <p className={`text-xs text-center py-6 text-muted-foreground`}>{t('common.noData')}</p>
                )}
                {topVehicles.map((vehicle) => (
                  <div
                    key={vehicle.rank}
                    className="p-4 rounded-lg border transition-all duration-200 hover:shadow-md cursor-pointer bg-muted border-border hover:border-green-500/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs ${
                        vehicle.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                        vehicle.rank === 2 ? 'bg-gray-200 text-gray-700' :
                        vehicle.rank === 3 ? 'bg-orange-100 text-orange-700' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {vehicle.rank}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-xs mb-1 text-foreground">
                          {vehicle.vehicle}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {vehicle.plate} · {vehicle.trips} Bookings
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold text-xs mb-1 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                          {vehicle.revenue}
                        </div>
                        <div className="text-xs font-medium text-muted-foreground">
                          {vehicle.utilization}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Flop Vehicles */}
            <div className="rounded-lg p-4 border shadow-sm bg-card border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-5 h-5 rounded-lg bg-red-100 flex items-center justify-center">
                  <TrendingDown className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Flop Vehicles
                </h3>
              </div>

              <div className="space-y-3">
                {flopVehicles.length === 0 && (
                  <p className={`text-xs text-center py-6 text-muted-foreground`}>{t('common.noData')}</p>
                )}
                {flopVehicles.map((vehicle) => (
                  <div
                    key={vehicle.rank}
                    className="p-4 rounded-lg border transition-all duration-200 hover:shadow-md cursor-pointer bg-muted border-border hover:border-red-500/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs ${
                        'bg-muted text-muted-foreground'
                      }`}>
                        {vehicle.rank}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-xs mb-1 text-foreground">
                          {vehicle.vehicle}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {vehicle.plate} · {vehicle.trips} Bookings
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold text-xs mb-1 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                          {vehicle.revenue}
                        </div>
                        <div className="text-xs font-medium text-muted-foreground">
                          {vehicle.utilization}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Revenue MTD Popup */}
      {activeFinancePopup === 'Revenue MTD' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setActiveFinancePopup(null); setRevenueExpandedDay(null); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl p-5 shadow-2xl ${
              'bg-card border border-border'
            }`}
          >
            <button
              onClick={() => { setActiveFinancePopup(null); setRevenueExpandedDay(null); }}
              className="absolute top-4 right-5 p-1.5 rounded-full transition-colors z-10 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                <Euro className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Revenue MTD</h2>
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · Detailed Breakdown
                </p>
              </div>
            </div>

            {/* Summary Bar */}
            <div className={`grid grid-cols-4 gap-3 mb-3 p-4 rounded-lg border ${
              'bg-card border-border'
            }`}>
              <div className="text-center">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Completed</div>
                <div className={`text-base font-bold text-green-600`}>€{revenueSummary.completed.toLocaleString('de-DE')}</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Reservations</div>
                <div className={`text-base font-bold text-blue-600`}>€{revenueSummary.reserved.toLocaleString('de-DE')}</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Extra Mileage</div>
                <div className={`text-base font-bold text-amber-600`}>€{revenueSummary.extraKm.toLocaleString('de-DE')}</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Damages</div>
                <div className={`text-base font-bold text-red-600`}>€{revenueSummary.damages.toLocaleString('de-DE')}</div>
              </div>
            </div>

            {/* Tax Summary */}
            <div className="grid grid-cols-3 gap-3 mb-3 p-4 rounded-lg border bg-muted border-border">
              <div className="text-center">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Net Revenue</div>
                <div className="text-base font-bold text-foreground">€{revenueTotalNet.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-medium mb-1 text-muted-foreground">VAT (19%)</div>
                <div className="text-base font-bold text-foreground">€{revenueTotalVat.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Gross Revenue</div>
                <div className="text-base font-bold text-foreground">€{revenueTotalGross.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>

            {/* Day-by-day breakdown */}
            <div className="space-y-2">
              {revenueDetailData.length === 0 && (
                <p className={`text-xs text-center py-8 text-muted-foreground`}>{t('common.noData')}</p>
              )}
              {revenueDetailData.map((day) => {
                const isExpanded = revenueExpandedDay === day.date;
                return (
                  <div key={day.date} className={`rounded-lg border transition-all duration-200 ${
                    'bg-muted border-border hover:border-border/80'
                  }`}>
                    {/* Day header row */}
                    <button
                      onClick={() => setRevenueExpandedDay(isExpanded ? null : day.date)}
                      className="w-full flex items-center justify-between p-4 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-lg flex flex-col items-center justify-center bg-muted">
                          <span className="text-xs font-semibold uppercase leading-none text-muted-foreground">{day.weekday}</span>
                          <span className="text-xs font-bold leading-tight text-foreground">{day.date.split('.')[0]}</span>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-foreground">{day.date}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {day.completed.length > 0 && (
                              <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">
                                <CheckCircle className="w-2.5 h-2.5" />{day.completed.length}
                              </span>
                            )}
                            {day.reserved.length > 0 && (
                              <span className="flex items-center gap-1 text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                                <Calendar className="w-2.5 h-2.5" />{day.reserved.length}
                              </span>
                            )}
                            {day.extras.length > 0 && (
                              <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                                <AlertTriangle className="w-2.5 h-2.5" />{day.extras.length}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-base font-bold text-foreground">€{day.total.toLocaleString('de-DE')}</span>
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className={`px-3 pb-4 space-y-3 border-t border-border`}>
                        {/* Completed Rentals */}
                        {day.completed.length > 0 && (
                          <div className="pt-3">
                            <div className="flex items-center gap-1.5 mb-2">
                              <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                              <span className={`text-xs font-semibold ${isDarkMode ? 'text-green-400' : 'text-green-700'}`}>Completed Rentals</span>
                            </div>
                            <div className="space-y-1.5">
                              {day.completed.map((item, i) => {
                                const net = Math.round(item.gross / (1 + VAT_RATE) * 100) / 100;
                                const vat = Math.round((item.gross - net) * 100) / 100;
                                return (
                                  <div key={i} className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${
                                    isDarkMode ? 'bg-green-900/20' : 'bg-green-50/80'
                                  }`}>
                                    <span className="text-xs font-medium text-foreground/80">{item.vehicle}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">Net €{net.toFixed(2)} + VAT €{vat.toFixed(2)}</span>
                                      <span className="text-[10px] font-bold text-green-600">€{item.gross.toLocaleString('de-DE')}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Reservations */}
                        {day.reserved.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <Calendar className="w-3.5 h-3.5 text-blue-500" />
                              <span className={`text-xs font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-700'}`}>Reservations</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${isDarkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>cancellable</span>
                            </div>
                            <div className="space-y-1.5">
                              {day.reserved.map((item, i) => {
                                const net = Math.round(item.gross / (1 + VAT_RATE) * 100) / 100;
                                const vat = Math.round((item.gross - net) * 100) / 100;
                                return (
                                  <div key={i} className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${
                                    isDarkMode ? 'bg-blue-900/20' : 'bg-blue-50/80'
                                  }`}>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-foreground/80">{item.vehicle}</span>
                                      <Ban className="w-3 h-3 text-amber-500" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">Net €{net.toFixed(2)} + VAT €{vat.toFixed(2)}</span>
                                      <span className="text-[10px] font-bold text-blue-600">€{item.gross.toLocaleString('de-DE')}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Extras (km + damages) */}
                        {day.extras.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <FileText className="w-3.5 h-3.5 text-amber-500" />
                              <span className={`text-xs font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>Additional Charges</span>
                            </div>
                            <div className="space-y-1.5">
                              {day.extras.map((item, i) => {
                                const net = Math.round(item.gross / (1 + VAT_RATE) * 100) / 100;
                                const vat = Math.round((item.gross - net) * 100) / 100;
                                return (
                                  <div key={i} className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${
                                    item.type === 'Damage Fee'
                                      ? isDarkMode ? 'bg-red-900/20' : 'bg-red-50/80'
                                      : isDarkMode ? 'bg-amber-900/20' : 'bg-amber-50/80'
                                  }`}>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-foreground/80">{item.vehicle}</span>
                                      {item.type === 'Damage Fee' ? (
                                        <span className="text-[10px] font-medium text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">Damage</span>
                                      ) : (
                                        <span className="text-[10px] font-medium text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">km</span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">Net €{net.toFixed(2)} + VAT €{vat.toFixed(2)}</span>
                                      <span className={`text-xs font-bold ${item.type === 'Damage Fee' ? 'text-red-600' : 'text-amber-600'}`}>€{item.gross.toLocaleString('de-DE')}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Total bar with tax breakdown */}
            <div className={`mt-4 p-4 rounded-lg border ${
              isDarkMode ? 'bg-green-900/20 border-green-800/30' : 'bg-green-50 border-green-200/60'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium ${isDarkMode ? 'text-green-400/70' : 'text-green-600/80'}`}>Net Total</span>
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-green-400/80' : 'text-green-700/80'}`}>€{revenueTotalNet.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium ${isDarkMode ? 'text-green-400/70' : 'text-green-600/80'}`}>VAT (19%)</span>
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-green-400/80' : 'text-green-700/80'}`}>€{revenueTotalVat.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className={`pt-2 border-t ${isDarkMode ? 'border-green-800/40' : 'border-green-300/60'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${isDarkMode ? 'text-green-400' : 'text-green-700'}`}>Total Revenue MTD (Gross)</span>
                  <span className={`text-base font-bold ${isDarkMode ? 'text-green-400' : 'text-green-700'}`}>€{revenueTotalGross.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Costs MTD Popup */}
      {activeFinancePopup === 'Costs MTD' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setActiveFinancePopup(null); setCostsExpandedDay(null); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl p-5 shadow-2xl ${
              'bg-card border border-border'
            }`}
          >
            <button
              onClick={() => { setActiveFinancePopup(null); setCostsExpandedDay(null); }}
              className="absolute top-4 right-5 p-1.5 rounded-full transition-colors z-10 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Costs MTD</h2>
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · Detailed Breakdown
                </p>
              </div>
            </div>

            {/* Summary Bar */}
            <div className={`grid grid-cols-4 gap-3 mb-3 p-4 rounded-lg border ${
              'bg-card border-border'
            }`}>
              <div className="text-center">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Fixed Costs</div>
                <div className="text-base font-bold text-purple-600">€{costsSummary.fixed.toLocaleString('de-DE')}</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Variable</div>
                <div className="text-base font-bold text-orange-600">€{costsSummary.variable.toLocaleString('de-DE')}</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Maintenance</div>
                <div className="text-base font-bold text-amber-600">€{costsSummary.maintenance.toLocaleString('de-DE')}</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Damage Repairs</div>
                <div className="text-base font-bold text-red-600">€{costsSummary.damages.toLocaleString('de-DE')}</div>
              </div>
            </div>

            {/* Tax Summary */}
            <div className="grid grid-cols-3 gap-3 mb-3 p-4 rounded-lg border bg-muted border-border">
              <div className="text-center">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Net Costs</div>
                <div className="text-base font-bold text-foreground">€{costsTotalNet.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-medium mb-1 text-muted-foreground">VAT (19%)</div>
                <div className="text-base font-bold text-foreground">€{costsTotalVat.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-medium mb-1 text-muted-foreground">Gross Costs</div>
                <div className="text-base font-bold text-foreground">€{costsTotalGross.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</div>
              </div>
            </div>

            {/* Fixed Costs Section */}
            <div className={`mb-3 rounded-lg border p-4 ${
              isDarkMode ? 'bg-purple-900/15 border-purple-800/30' : 'bg-purple-50/60 border-purple-200/50'
            }`}>
              <div className="flex items-center gap-1.5 mb-3">
                <Target className="w-3.5 h-3.5 text-purple-500" />
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-purple-400' : 'text-purple-700'}`}>Monthly Fixed Costs</span>
              </div>
              <div className="space-y-1.5">
                {costsFixedMonthly.map((item, i) => {
                  const net = Math.round(item.gross / (1 + VAT_RATE) * 100) / 100;
                  const vat = Math.round((item.gross - net) * 100) / 100;
                  return (
                    <div key={i} className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${
                      isDarkMode ? 'bg-purple-900/20' : 'bg-purple-50/80'
                    }`}>
                      <span className="text-xs font-medium text-foreground/80">{item.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Net €{net.toFixed(2)} + VAT €{vat.toFixed(2)}</span>
                        <span className="text-[10px] font-bold text-purple-600">€{item.gross.toLocaleString('de-DE')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className={`flex items-center justify-between mt-2 pt-2 border-t ${isDarkMode ? 'border-purple-800/30' : 'border-purple-200/50'}`}>
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-purple-400' : 'text-purple-700'}`}>Subtotal Fixed</span>
                <span className={`text-xs font-bold ${isDarkMode ? 'text-purple-400' : 'text-purple-700'}`}>€{costsFixedTotal.toLocaleString('de-DE')}</span>
              </div>
            </div>

            {/* Day-by-day variable costs breakdown */}
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-3.5 h-3.5 text-orange-500" />
              <span className={`text-xs font-semibold ${isDarkMode ? 'text-orange-400' : 'text-orange-700'}`}>Daily Variable Costs</span>
            </div>
            <div className="space-y-2">
              {costsDetailData.length === 0 && (
                <p className={`text-xs text-center py-8 text-muted-foreground`}>{t('common.noData')}</p>
              )}
              {costsDetailData.map((day) => {
                const isExpanded = costsExpandedDay === day.date;
                return (
                  <div key={day.date} className={`rounded-lg border transition-all duration-200 ${
                    'bg-muted border-border hover:border-border/80'
                  }`}>
                    {/* Day header row */}
                    <button
                      onClick={() => setCostsExpandedDay(isExpanded ? null : day.date)}
                      className="w-full flex items-center justify-between p-4 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-5 h-5 rounded-lg flex flex-col items-center justify-center bg-muted">
                          <span className="text-xs font-semibold uppercase leading-none text-muted-foreground">{day.weekday}</span>
                          <span className="text-xs font-bold leading-tight text-foreground">{day.date.split('.')[0]}</span>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-foreground">{day.date}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {day.variable.length > 0 && (
                              <span className="flex items-center gap-1 text-[10px] font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
                                <Fuel className="w-2.5 h-2.5" />{day.variable.length}
                              </span>
                            )}
                            {day.maintenance.length > 0 && (
                              <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                                <Wrench className="w-2.5 h-2.5" />{day.maintenance.length}
                              </span>
                            )}
                            {day.damages.length > 0 && (
                              <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
                                <AlertTriangle className="w-2.5 h-2.5" />{day.damages.length}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-base font-bold text-foreground">€{day.total.toLocaleString('de-DE')}</span>
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className={`px-3 pb-4 space-y-3 border-t border-border`}>
                        {/* Variable / Fuel */}
                        {day.variable.length > 0 && (
                          <div className="pt-3">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Fuel className="w-3.5 h-3.5 text-orange-500" />
                              <span className={`text-xs font-semibold ${isDarkMode ? 'text-orange-400' : 'text-orange-700'}`}>Fuel / Charging</span>
                            </div>
                            <div className="space-y-1.5">
                              {day.variable.map((item, i) => {
                                const net = Math.round(item.gross / (1 + VAT_RATE) * 100) / 100;
                                const vat = Math.round((item.gross - net) * 100) / 100;
                                return (
                                  <div key={i} className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${
                                    isDarkMode ? 'bg-orange-900/20' : 'bg-orange-50/80'
                                  }`}>
                                    <span className="text-xs font-medium text-foreground/80">{item.vehicle}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">Net €{net.toFixed(2)} + VAT €{vat.toFixed(2)}</span>
                                      <span className="text-[10px] font-bold text-orange-600">€{item.gross.toLocaleString('de-DE')}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Maintenance */}
                        {day.maintenance.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <Wrench className="w-3.5 h-3.5 text-amber-500" />
                              <span className={`text-xs font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>Maintenance & Service</span>
                            </div>
                            <div className="space-y-1.5">
                              {day.maintenance.map((item, i) => {
                                const net = Math.round(item.gross / (1 + VAT_RATE) * 100) / 100;
                                const vat = Math.round((item.gross - net) * 100) / 100;
                                return (
                                  <div key={i} className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${
                                    isDarkMode ? 'bg-amber-900/20' : 'bg-amber-50/80'
                                  }`}>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-foreground/80">{item.vehicle}</span>
                                      <span className="text-[10px] font-medium text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">{item.type}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">Net €{net.toFixed(2)} + VAT €{vat.toFixed(2)}</span>
                                      <span className="text-[10px] font-bold text-amber-600">€{item.gross.toLocaleString('de-DE')}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Damage Repairs */}
                        {day.damages.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                              <span className={`text-xs font-semibold ${isDarkMode ? 'text-red-400' : 'text-red-700'}`}>Damage Repairs</span>
                            </div>
                            <div className="space-y-1.5">
                              {day.damages.map((item, i) => {
                                const net = Math.round(item.gross / (1 + VAT_RATE) * 100) / 100;
                                const vat = Math.round((item.gross - net) * 100) / 100;
                                return (
                                  <div key={i} className={`flex items-center justify-between py-1.5 px-3 rounded-lg ${
                                    isDarkMode ? 'bg-red-900/20' : 'bg-red-50/80'
                                  }`}>
                                    <span className="text-xs font-medium text-foreground/80">{item.vehicle}</span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">Net €{net.toFixed(2)} + VAT €{vat.toFixed(2)}</span>
                                      <span className="text-[10px] font-bold text-red-600">€{item.gross.toLocaleString('de-DE')}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Total bar with tax breakdown */}
            <div className={`mt-4 p-4 rounded-lg border ${
              isDarkMode ? 'bg-red-900/20 border-red-800/30' : 'bg-red-50 border-red-200/60'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium ${isDarkMode ? 'text-red-400/70' : 'text-red-600/80'}`}>Net Total</span>
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-red-400/80' : 'text-red-700/80'}`}>€{costsTotalNet.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-medium ${isDarkMode ? 'text-red-400/70' : 'text-red-600/80'}`}>VAT (19%)</span>
                <span className={`text-xs font-semibold ${isDarkMode ? 'text-red-400/80' : 'text-red-700/80'}`}>€{costsTotalVat.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className={`pt-2 border-t ${isDarkMode ? 'border-red-800/40' : 'border-red-300/60'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold ${isDarkMode ? 'text-red-400' : 'text-red-700'}`}>Total Costs MTD (Gross)</span>
                  <span className={`text-base font-bold ${isDarkMode ? 'text-red-400' : 'text-red-700'}`}>€{costsTotalGross.toLocaleString('de-DE', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stat Box Popups - Other stat categories only (not Vehicle Alerts or Driver Behavior) */}
      {activePopup && !['Vehicle Alerts', 'Driver Behavior'].includes(activePopup) && false && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setActivePopup(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-h-[85vh] overflow-y-auto rounded-xl p-5 shadow-2xl ${
              (activePopup === 'In Maintenance' || activePopup === 'Vehicle Alerts' || activePopup === 'Driver Behavior') ? 'max-w-2xl' : 'max-w-xl'
            } ${
              'bg-card border border-border'
            }`}
          >
            <button
              onClick={() => setActivePopup(null)}
              className="absolute top-4 right-5 p-1.5 rounded-full transition-colors z-10 text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Inline stat details moved to StatInlineDetail component */}
            {false && (() => {
              return (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Car className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Available Vehicles</h2>
                      <p className="text-xs text-muted-foreground">{availableVehicles.length} vehicles ready for rental</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {availableVehicles.map((v) => (
                      <div key={v.id} onClick={() => { onVehicleSelect?.(v); setActivePopup(null); }} className={`rounded-lg p-4 border transition-all hover:shadow-md cursor-pointer ${
                        'bg-card border-border hover:border-border/80'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-foreground">{v.license}</span>
                            <span className="text-xs text-muted-foreground">{v.model}</span>
                          </div>
                          <ChevronRight className={`w-5 h-5 text-muted-foreground/50`} />
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            <MapPin className={`w-3.5 h-3.5 text-muted-foreground`} />
                            <span className="text-xs text-muted-foreground">{v.station}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Fuel className={`w-3.5 h-3.5 text-muted-foreground`} />
                            <div className={`w-16 h-1.5 rounded-full overflow-hidden bg-muted`}>
                              <div className={`h-full rounded-full ${v.fuel > 50 ? 'bg-green-500' : v.fuel > 25 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${v.fuel}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-muted-foreground">{v.fuel}%</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{v.odometer.toLocaleString()} km</span>
                          <span className={`ml-auto px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            v.cleaningStatus === 'Clean' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>{v.cleaningStatus}</span>
                          {v.alert && (
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">{v.alert}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {/* Reserved */}
            {activePopup === 'Reserved' && (() => {
              const vehicles = fleetVehicles.filter(v => v.status === 'Reserved');
              const alertCount = vehicles.filter(v => v.healthStatus !== 'Good Health' || v.alert).length;
              return (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Reserved Vehicles</h2>
                      <p className="text-xs text-muted-foreground">{vehicles.length} vehicles reserved{alertCount > 0 ? ` · ${alertCount} with alerts` : ''}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {vehicles.map((v) => {
                      const hasAlert = v.healthStatus !== 'Good Health' || !!v.alert;
                      const isClean = v.cleaningStatus === 'Clean';
                      return (
                        <div key={v.id} onClick={() => { onVehicleSelect?.(v); setActivePopup(null); }} className={`rounded-lg p-4 border transition-all hover:shadow-md cursor-pointer ${
                          'bg-card border-border hover:border-border/80'
                        }`}>
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-foreground">{v.license}</span>
                              <span className="text-xs text-muted-foreground">{v.model}</span>
                            </div>
                            <ChevronRight className={`w-5 h-5 text-muted-foreground/50`} />
                          </div>
                          <div className="flex items-center gap-3 flex-wrap mb-3">
                            <div className="flex items-center gap-1.5">
                              <Users className={`w-3.5 h-3.5 text-muted-foreground`} />
                              <span className="text-xs font-medium text-foreground/80">{v.customer || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <MapPin className={`w-3.5 h-3.5 text-muted-foreground`} />
                              <span className="text-xs text-muted-foreground">{v.station}</span>
                            </div>
                            <span className={`ml-auto text-xs font-semibold ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>
                              Pickup: {v.pickup || 'TBD'}
                            </span>
                          </div>
                          {/* Badges Row: Clean Status + Health + Alerts */}
                          <div className={`flex items-center gap-2 flex-wrap pt-2.5 border-t border-border`}>
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${
                              isClean
                                ? isDarkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600'
                                : isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600'
                            }`}>
                              <Sparkles className="w-3 h-3" />
                              {isClean ? 'Clean' : 'Needs Cleaning'}
                            </span>
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${
                              v.healthStatus === 'Good Health'
                                ? isDarkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-600'
                                : v.healthStatus === 'Warning'
                                ? isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600'
                                : isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'
                            }`}>
                              {v.healthStatus === 'Good Health' ? (
                                <CheckCircle className="w-3 h-3" />
                              ) : (
                                <AlertTriangle className="w-3 h-3" />
                              )}
                              {v.healthStatus}
                            </span>
                            {hasAlert && (
                              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${
                                v.healthStatus === 'Critical'
                                  ? isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'
                                  : isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600'
                              }`}>
                                <ShieldAlert className="w-3 h-3" />
                                {v.alert || 'Health Alert'}
                              </span>
                            )}
                            <div className="ml-auto flex items-center gap-2">
                              <div className={`w-16 h-1.5 rounded-full overflow-hidden bg-muted`}>
                                <div className={`h-full rounded-full ${v.fuel > 50 ? 'bg-green-500' : v.fuel > 25 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${v.fuel}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-muted-foreground">{v.fuel}%</span>
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
              const kmData: Record<string, { included: number; driven: number }> = {
                'v4': { included: 1500, driven: 820 },
                'v5': { included: 2000, driven: 1870 },
                'v6': { included: 1200, driven: 2350 },
                'v7': { included: 1000, driven: 480 },
              };
              return (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 rounded-lg bg-green-100 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Active Rentals</h2>
                      <p className="text-xs text-muted-foreground">{vehicles.length} vehicles currently rented</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {vehicles.map((v) => {
                      const km = kmData[v.id] || { included: 1500, driven: 900 };
                      const kmPercent = Math.min((km.driven / km.included) * 100, 100);
                      const overKm = km.driven > km.included;
                      const overAmount = overKm ? km.driven - km.included : 0;
                      const remaining = overKm ? 0 : km.included - km.driven;
                      return (
                        <div key={v.id} onClick={() => { onVehicleSelect?.(v); setActivePopup(null); }} className={`rounded-lg p-4 border transition-all hover:shadow-md cursor-pointer ${
                          'bg-card border-border hover:border-border/80'
                        }`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-foreground">{v.license}</span>
                              <span className="text-xs text-muted-foreground">{v.model}</span>
                            </div>
                            <ChevronRight className={`w-5 h-5 text-muted-foreground/50`} />
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <Users className={`w-3.5 h-3.5 text-muted-foreground`} />
                              <span className="text-xs font-medium text-foreground/80">{v.driver || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <MapPin className={`w-3.5 h-3.5 text-muted-foreground`} />
                              <span className="text-xs text-muted-foreground">{v.station}</span>
                            </div>
                            <span className={`ml-auto text-xs font-semibold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                              ERT: {v.ert || 'N/A'}
                            </span>
                          </div>
                          {/* Fuel Progress */}
                          <div className="flex items-center gap-3 mt-3">
                            <Fuel className={`w-3.5 h-3.5 shrink-0 text-muted-foreground`} />
                            <div className={`flex-1 h-1.5 rounded-full overflow-hidden bg-muted`}>
                              <div className={`h-full rounded-full ${v.fuel > 50 ? 'bg-green-500' : v.fuel > 25 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${v.fuel}%` }} />
                            </div>
                            <span className={`text-xs font-semibold min-w-[40px] text-right text-muted-foreground`}>Fuel {v.fuel}%</span>
                          </div>
                          {/* Kilometer Progress */}
                          <div className="flex items-center gap-3 mt-2">
                            <Gauge className={`w-3.5 h-3.5 shrink-0 text-muted-foreground`} />
                            <div className="flex-1">
                              <div className={`h-1.5 rounded-full overflow-hidden bg-muted`}>
                                <div className={`h-full rounded-full transition-all ${
                                  overKm ? 'bg-red-500' : kmPercent > 80 ? 'bg-amber-500' : 'bg-blue-500'
                                }`} style={{ width: `${kmPercent}%` }} />
                              </div>
                            </div>
                            <span className={`text-xs font-semibold min-w-[40px] text-right ${
                              overKm ? 'text-red-500' : 'text-muted-foreground'
                            }`}>
                              {km.driven.toLocaleString('de-DE')} km
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-1 pl-6.5">
                            <span className="text-xs text-muted-foreground">
                              Inkl. {km.included.toLocaleString('de-DE')} km
                            </span>
                            {overKm ? (
                              <span className={`text-xs font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                                +{overAmount.toLocaleString('de-DE')} km über Limit
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {remaining.toLocaleString('de-DE')} km verbleibend
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            {/* Pick Up Today */}
            {activePopup === 'Pick Up Today' && (() => {
              return (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 rounded-lg bg-orange-100 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Pick Ups Today</h2>
                      <p className="text-xs text-muted-foreground">{pickupItems.filter(p => p.done).length} of {pickupItems.length} completed</p>
                    </div>
                  </div>
                  {(pickupNeedsCleaning > 0 || pickupAlerts > 0) && (
                    <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg ${isDarkMode ? 'bg-amber-900/20 border border-amber-800/30' : 'bg-amber-50 border border-amber-200/60'}`}>
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                      <span className={`text-xs font-medium ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                        {pickupNeedsCleaning > 0 && `${pickupNeedsCleaning} vehicle${pickupNeedsCleaning > 1 ? 's' : ''} needs cleaning`}
                        {pickupNeedsCleaning > 0 && pickupAlerts > 0 && ' · '}
                        {pickupAlerts > 0 && `${pickupAlerts} active alert${pickupAlerts > 1 ? 's' : ''}`}
                      </span>
                    </div>
                  )}
                  <div className="space-y-2">
                    {pickupItems.map((p, i) => {
                      const hasIssues = p.needsCleaning || p.hasAlert || p.hasError;
                      const linkedVehicle = p.vehicleId ? fleetVehicles.find(v => v.id === p.vehicleId) : null;
                      return (
                        <div
                          key={i}
                          onClick={() => {
                            if (linkedVehicle) {
                              onVehicleSelect?.(linkedVehicle);
                              setActivePopup(null);
                            }
                          }}
                          className={`rounded-lg p-3.5 border transition-all ${linkedVehicle ? 'cursor-pointer hover:shadow-md' : ''} ${
                            p.done
                              ? isDarkMode ? 'bg-green-900/10 border-green-800/30' : 'bg-green-50/60 border-green-200/50'
                              : hasIssues
                                ? isDarkMode ? 'bg-red-900/10 border-red-800/30' : 'bg-red-50/40 border-red-200/60'
                                : 'bg-card border-border hover:border-border/80'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`text-xs font-bold w-12 text-muted-foreground`}>{p.time}</span>
                            {p.done ? (
                              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                            ) : (
                              <div className={`w-5 h-5 rounded-full border-2 shrink-0 border-border`} />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold ${p.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                  {p.vehicle} ({p.plate})
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">{p.customer} · {p.station}</div>
                              {!p.done && hasIssues && (
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                  {p.needsCleaning && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
                                      <Sparkles className="w-3 h-3" />Needs Cleaning
                                    </span>
                                  )}
                                  {p.hasAlert && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                                      <AlertTriangle className="w-3 h-3" />Active Alert
                                    </span>
                                  )}
                                  {p.hasError && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                                      <ShieldAlert className="w-3 h-3" />Error Code
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <ChevronRight className={`w-5 h-5 shrink-0 ${linkedVehicle ? 'text-muted-foreground' : 'text-muted-foreground/30'}`} />
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
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 rounded-lg bg-orange-100 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Returns Today</h2>
                      <p className="text-xs text-muted-foreground">{returnItems.filter(r => r.done).length} of {returnItems.length} completed</p>
                    </div>
                  </div>
                  {(returnErrors > 0 || returnKmExceeded > 0 || returnAlerts > 0) && (
                    <div className={`flex items-center gap-2 mb-3 px-3 py-2 rounded-lg ${isDarkMode ? 'bg-red-900/20 border border-red-800/30' : 'bg-red-50 border border-red-200/60'}`}>
                      <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                      <span className={`text-xs font-medium ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>
                        {returnErrors > 0 && `${returnErrors} error code${returnErrors > 1 ? 's' : ''}`}
                        {returnErrors > 0 && returnKmExceeded > 0 && ' · '}
                        {returnKmExceeded > 0 && `${returnKmExceeded} km exceeded`}
                        {(returnErrors > 0 || returnKmExceeded > 0) && returnAlerts > 0 && ' · '}
                        {returnAlerts > 0 && `${returnAlerts} alert${returnAlerts > 1 ? 's' : ''}`}
                      </span>
                    </div>
                  )}
                  <div className="space-y-2">
                    {returnItems.map((r, i) => {
                      const hasIssues = r.hasError || r.kmExceeded || r.hasAlert;
                      const linkedVehicle = r.vehicleId ? fleetVehicles.find(v => v.id === r.vehicleId) : null;
                      return (
                        <div
                          key={i}
                          onClick={() => {
                            if (linkedVehicle) {
                              onVehicleSelect?.(linkedVehicle);
                              setActivePopup(null);
                            }
                          }}
                          className={`rounded-lg p-3.5 border transition-all ${linkedVehicle ? 'cursor-pointer hover:shadow-md' : ''} ${
                            r.done
                              ? isDarkMode ? 'bg-green-900/10 border-green-800/30' : 'bg-green-50/60 border-green-200/50'
                              : hasIssues
                                ? isDarkMode ? 'bg-red-900/10 border-red-800/30' : 'bg-red-50/40 border-red-200/60'
                                : 'bg-card border-border hover:border-border/80'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`text-xs font-bold w-12 text-muted-foreground`}>{r.time}</span>
                            {r.done ? (
                              <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                            ) : (
                              <div className={`w-5 h-5 rounded-full border-2 shrink-0 border-border`} />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold ${r.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                                  {r.vehicle} ({r.plate})
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">{r.customer} · {r.station}</div>
                              {!r.done && hasIssues && (
                                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                  {r.hasError && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                                      <ShieldAlert className="w-3 h-3" />Error Code
                                    </span>
                                  )}
                                  {r.kmExceeded && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                                      <Gauge className="w-3 h-3" />km exceeded
                                    </span>
                                  )}
                                  {r.hasAlert && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-orange-100 text-orange-700">
                                      <AlertTriangle className="w-3 h-3" />Active Alert
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <ChevronRight className={`w-5 h-5 shrink-0 ${linkedVehicle ? 'text-muted-foreground' : 'text-muted-foreground/30'}`} />
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
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 rounded-lg bg-red-100 flex items-center justify-center">
                      <Wrench className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">In Maintenance</h2>
                      <p className="text-xs text-muted-foreground">{vehicles.length} vehicles in workshop</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {vehicles.map((v) => (
                      <div key={v.id} onClick={() => { onVehicleSelect?.(v); setActivePopup(null); }} className={`rounded-lg p-4 border transition-all hover:shadow-md cursor-pointer ${
                        'bg-card border-border hover:border-border/80'
                      }`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-foreground">{v.license}</span>
                            <span className="text-xs text-muted-foreground">{v.model}</span>
                          </div>
                          <ChevronRight className={`w-5 h-5 text-muted-foreground/50`} />
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <p className={`text-xs uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>Reason</p>
                            <p className={`text-xs font-semibold ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}>{v.reason || 'General Service'}</p>
                          </div>
                          <div>
                            <p className={`text-xs uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>Workshop</p>
                            <p className={`text-xs font-semibold text-foreground/80`}>{v.workshop || 'N/A'}</p>
                          </div>
                          <div>
                            <p className={`text-xs uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground`}>ETA</p>
                            <p className={`text-xs font-semibold ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{v.eta || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}

            {/* Driver Behavior */}
            {activePopup === 'Driver Behavior' && (() => {
              const activeRentals = fleetVehicles.filter(v => v.status === 'Active Rented');
              const driverScores: Record<string, { overall: number; acceleration: number; braking: number; cornering: number; speeding: number; abuses: { type: string; time: string; severity: 'high' | 'medium' | 'low' }[] }> = {
                'v4': { overall: 92, acceleration: 95, braking: 88, cornering: 94, speeding: 91, abuses: [] },
                'v5': { overall: 64, acceleration: 58, braking: 52, cornering: 70, speeding: 68, abuses: [
                  { type: 'Harsh Braking', time: 'Heute, 14:22', severity: 'medium' },
                  { type: 'Excessive Speed (142 km/h)', time: 'Heute, 13:05', severity: 'high' },
                  { type: 'Harsh Acceleration', time: 'Heute, 11:38', severity: 'low' },
                ] },
                'v6': { overall: 78, acceleration: 82, braking: 74, cornering: 76, speeding: 80, abuses: [
                  { type: 'Harsh Cornering', time: 'Heute, 15:10', severity: 'medium' },
                ] },
                'v7': { overall: 45, acceleration: 40, braking: 38, cornering: 52, speeding: 50, abuses: [
                  { type: 'Excessive Speed (168 km/h)', time: 'Heute, 16:45', severity: 'high' },
                  { type: 'Harsh Braking (Emergency)', time: 'Heute, 16:44', severity: 'high' },
                  { type: 'Excessive Speed (155 km/h)', time: 'Heute, 14:30', severity: 'high' },
                  { type: 'Harsh Acceleration', time: 'Heute, 12:15', severity: 'medium' },
                  { type: 'Harsh Cornering', time: 'Heute, 10:50', severity: 'medium' },
                ] },
              };
              const getScoreColor = (score: number) => {
                if (score >= 80) return { bg: 'bg-green-500', text: isDarkMode ? 'text-green-400' : 'text-green-600', ring: 'ring-green-500/20' };
                if (score >= 60) return { bg: 'bg-amber-500', text: isDarkMode ? 'text-amber-400' : 'text-amber-600', ring: 'ring-amber-500/20' };
                return { bg: 'bg-red-500', text: isDarkMode ? 'text-red-400' : 'text-red-600', ring: 'ring-red-500/20' };
              };
              const getScoreLabel = (score: number) => {
                if (score >= 80) return 'Good';
                if (score >= 60) return 'Fair';
                return 'Poor';
              };
              const totalAbuses = Object.values(driverScores).reduce((sum, d) => sum + d.abuses.length, 0);

              return (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 rounded-lg bg-yellow-100 flex items-center justify-center">
                      <Award className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Driver Behavior</h2>
                      <p className="text-xs text-muted-foreground">{activeRentals.length} active rentals · {totalAbuses} abuse detections today</p>
                    </div>
                  </div>

                  {/* Summary Bar */}
                  <div className="grid grid-cols-3 gap-3 mb-3 p-4 rounded-lg border bg-muted border-border">
                    <div className="text-center">
                      <div className={`text-xs font-bold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                        {Object.values(driverScores).filter(d => d.overall >= 80).length}
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wider mt-0.5 text-muted-foreground">Good</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-xs font-bold ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                        {Object.values(driverScores).filter(d => d.overall >= 60 && d.overall < 80).length}
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wider mt-0.5 text-muted-foreground">Fair</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-xs font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                        {Object.values(driverScores).filter(d => d.overall < 60).length}
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wider mt-0.5 text-muted-foreground">Poor</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {activeRentals.map((v) => {
                      const scores = driverScores[v.id] || { overall: 75, acceleration: 78, braking: 72, cornering: 74, speeding: 76, abuses: [] };
                      const color = getScoreColor(scores.overall);
                      const categories = [
                        { label: 'Acceleration', value: scores.acceleration },
                        { label: 'Braking', value: scores.braking },
                        { label: 'Cornering', value: scores.cornering },
                        { label: 'Speeding', value: scores.speeding },
                      ];
                      return (
                        <div key={v.id} className="rounded-lg border overflow-hidden bg-card border-border">
                          {/* Driver Header */}
                          <div className={`px-3 py-2.5 flex items-center gap-3 ${
                            isDarkMode ? 'border-b border-neutral-700/50' : 'border-b border-gray-100'
                          }`}>
                            {/* Score Circle */}
                            <div className={`relative w-9 h-9 rounded-full flex items-center justify-center ring-4 ${color.ring} bg-muted`}>
                              <span className={`text-base font-bold ${color.text}`}>{scores.overall}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-foreground">{v.driver || 'Unknown'}</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  scores.overall >= 80 ? 'bg-green-100 text-green-700' :
                                  scores.overall >= 60 ? 'bg-amber-100 text-amber-700' :
                                  'bg-red-100 text-red-700'
                                }`}>{getScoreLabel(scores.overall)}</span>
                              </div>
                              <div className="text-xs mt-0.5 text-muted-foreground">
                                {v.license} · {v.model}
                              </div>
                            </div>
                            {scores.abuses.length > 0 && (
                              <div className="flex items-center gap-1.5">
                                <ShieldAlert className="w-5 h-5 text-red-500" />
                                <span className={`text-xs font-bold ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>{scores.abuses.length}</span>
                              </div>
                            )}
                          </div>

                          <div className="px-3 py-2.5">
                            {/* Score Bars */}
                            <div className="grid grid-cols-4 gap-3 mb-3">
                              {categories.map((cat) => {
                                const catColor = getScoreColor(cat.value);
                                return (
                                  <div key={cat.label}>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="text-xs font-semibold text-muted-foreground">{cat.label}</span>
                                      <span className={`text-xs font-bold ${catColor.text}`}>{cat.value}</span>
                                    </div>
                                    <div className={`h-1.5 rounded-full overflow-hidden bg-muted`}>
                                      <div className={`h-full rounded-full ${catColor.bg}`} style={{ width: `${cat.value}%` }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Abuse Detections */}
                            {scores.abuses.length > 0 && (
                              <div className={`mt-3 pt-3 border-t border-border`}>
                                <div className="flex items-center gap-1.5 mb-2">
                                  <ShieldAlert className={`w-3.5 h-3.5 ${isDarkMode ? 'text-red-400' : 'text-red-500'}`} />
                                  <span className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                                    Abuse Detections ({scores.abuses.length})
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  {scores.abuses.map((abuse, ai) => (
                                    <div key={ai} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                                      abuse.severity === 'high'
                                        ? isDarkMode ? 'bg-red-900/15' : 'bg-red-50'
                                        : abuse.severity === 'medium'
                                        ? isDarkMode ? 'bg-amber-900/15' : 'bg-amber-50'
                                        : 'bg-muted'
                                    }`}>
                                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                        abuse.severity === 'high' ? 'bg-red-500' :
                                        abuse.severity === 'medium' ? 'bg-amber-500' :
                                        'bg-gray-400'
                                      }`} />
                                      <span className={`text-xs flex-1 text-foreground/80`}>{abuse.type}</span>
                                      <span className="text-xs text-muted-foreground">{abuse.time}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            {/* Vehicle Alerts */}
            {activePopup === 'Vehicle Alerts' && (() => {
              const alertVehicles = fleetVehicles.filter(v => v.alert);
              const alertDetails: Record<string, { severity: 'critical' | 'warning' | 'info'; description: string; code: string; system: string; recommendation: string }[]> = {
                'v1': [
                  { severity: 'warning', code: 'P0420', system: 'Emission', description: 'Catalyst System Efficiency Below Threshold  –  Der Katalysator arbeitet unterhalb der Effizienzgrenze. Möglicherweise ist der Katalysator verschlissen oder ein Lambdasonden-Problem liegt vor.', recommendation: 'Lambdasonde prüfen und ggf. Katalysator austauschen. Werkstatttermin empfohlen.' },
                ],
                'v3': [
                  { severity: 'warning', code: 'P0171', system: 'Fuel System', description: 'System Too Lean (Bank 1)  –  Das Kraftstoffgemisch ist zu mager. Ursachen können ein Luftmassenmesser-Defekt, Vakuumleck oder verstopfter Kraftstofffilter sein.', recommendation: 'Luftmassenmesser und Einspritzdüsen prüfen. Kraftstofffilter kontrollieren.' },
                  { severity: 'critical', code: 'C0035', system: 'Brakes / ABS', description: 'Left Front Wheel Speed Sensor  –  Der Raddrehzahlsensor vorne links liefert fehlerhafte Signale. ABS und ESP könnten eingeschränkt funktionieren.', recommendation: 'Sofort Werkstatt aufsuchen. Raddrehzahlsensor und Verkabelung prüfen lassen.' },
                ],
                'v5': [
                  { severity: 'info', code: 'P0456', system: 'EVAP', description: 'Evaporative Emission System Leak (Small)  –  Kleines Leck im Kraftstoffdampf-Rückhaltesystem erkannt. Häufig ist der Tankdeckel nicht richtig geschlossen.', recommendation: 'Tankdeckel prüfen und fest verschließen. Falls Fehler bestehen bleibt, EVAP-System inspizieren.' },
                ],
                'v7': [
                  { severity: 'warning', code: 'B1234', system: 'Tire Pressure', description: 'Reifendruck-Warnung  –  Der Reifendruck eines oder mehrerer Reifen ist unter dem empfohlenen Wert. Dies kann den Kraftstoffverbrauch erhöhen und die Fahrsicherheit beeinträchtigen.', recommendation: 'Reifendruck an allen vier Reifen prüfen und auf den empfohlenen Wert auffüllen.' },
                  { severity: 'warning', code: 'P0301', system: 'Engine', description: 'Cylinder 1 Misfire Detected  –  Zündaussetzer in Zylinder 1 erkannt. Kann durch defekte Zündkerze, Zündspule oder Einspritzdüse verursacht werden.', recommendation: 'Zündkerzen und Zündspulen prüfen. Bei häufigen Aussetzern Einspritzdüse kontrollieren.' },
                ],
                'v9': [
                  { severity: 'critical', code: 'P0217', system: 'Cooling', description: 'Engine Coolant Over Temperature  –  Die Kühlmitteltemperatur hat den kritischen Bereich überschritten. Sofortiges Anhalten empfohlen, um Motorschäden zu vermeiden.', recommendation: 'Fahrzeug sofort abstellen! Kühlmittelstand, Thermostat und Wasserpumpe prüfen lassen.' },
                ],
              };
              return (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-5 h-5 rounded-lg bg-red-100 flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Vehicle Alerts</h2>
                      <p className="text-xs text-muted-foreground">{alertVehicles.length} vehicles with active error codes</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {alertVehicles.map((v) => {
                      const errors = alertDetails[v.id] || [{ severity: 'warning' as const, code: 'UNKNOWN', system: 'General', description: 'Unbekannter Fehler erkannt. Fahrzeug sollte in der Werkstatt diagnostiziert werden.', recommendation: 'Werkstatttermin vereinbaren.' }];
                      return (
                        <div key={v.id} className="rounded-lg border overflow-hidden bg-card border-border">
                          {/* Vehicle Header */}
                          <div className={`px-3 py-2.5 flex items-center justify-between ${
                            isDarkMode ? 'border-b border-neutral-700/50' : 'border-b border-gray-100'
                          }`}>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-foreground">{v.license}</span>
                              <span className="text-xs text-muted-foreground">{v.model}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                errors.some(e => e.severity === 'critical')
                                  ? 'bg-red-100 text-red-700'
                                  : errors.some(e => e.severity === 'warning')
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-blue-100 text-blue-700'
                              }`}>
                                {errors.length} {errors.length === 1 ? 'Error' : 'Errors'}
                              </span>
                              <MapPin className={`w-3.5 h-3.5 text-muted-foreground`} />
                              <span className="text-xs text-muted-foreground">{v.station}</span>
                            </div>
                          </div>
                          {/* Error Details */}
                          <div className="px-3 py-2 space-y-3">
                            {errors.map((err, ei) => (
                              <div key={ei} className={`rounded-lg p-4 border ${
                                err.severity === 'critical'
                                  ? isDarkMode ? 'bg-red-900/15 border-red-800/30' : 'bg-red-50 border-red-200/60'
                                  : err.severity === 'warning'
                                  ? isDarkMode ? 'bg-amber-900/15 border-amber-800/30' : 'bg-amber-50 border-amber-200/60'
                                  : isDarkMode ? 'bg-blue-900/15 border-blue-800/30' : 'bg-blue-50 border-blue-200/60'
                              }`}>
                                <div className="flex items-center gap-2 mb-2">
                                  <span className={`px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider ${
                                    err.severity === 'critical'
                                      ? 'bg-red-500 text-white'
                                      : err.severity === 'warning'
                                      ? 'bg-amber-500 text-white'
                                      : 'bg-blue-500 text-white'
                                  }`}>
                                    {err.severity}
                                  </span>
                                  <span className={`text-xs font-mono font-bold text-foreground/80`}>{err.code}</span>
                                  <span className={`text-xs uppercase tracking-wider font-semibold ml-auto text-muted-foreground`}>{err.system}</span>
                                </div>
                                <p className={`text-xs leading-relaxed mb-3 text-foreground/80`}>
                                  {err.description}
                                </p>
                                <div className={`flex items-start gap-2 pt-2.5 border-t ${
                                  err.severity === 'critical'
                                    ? isDarkMode ? 'border-red-800/30' : 'border-red-200/60'
                                    : err.severity === 'warning'
                                    ? isDarkMode ? 'border-amber-800/30' : 'border-amber-200/60'
                                    : isDarkMode ? 'border-blue-800/30' : 'border-blue-200/60'
                                }`}>
                                  <Wrench className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                                    err.severity === 'critical'
                                      ? isDarkMode ? 'text-red-400' : 'text-red-500'
                                      : err.severity === 'warning'
                                      ? isDarkMode ? 'text-amber-400' : 'text-amber-500'
                                      : isDarkMode ? 'text-blue-400' : 'text-blue-500'
                                  }`} />
                                  <p className={`text-[11px] leading-relaxed text-muted-foreground`}>
                                    <span className="font-semibold">Empfehlung:</span> {err.recommendation}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
import { useState, useEffect, useCallback } from 'react';
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, Search, Filter, ArrowUpDown,
  ChevronRight, ChevronLeft, ChevronDown, Loader2, AlertCircle, Check, Clock,
  Car, FileText, ExternalLink, Send, Eye, X, Info, Plus, Zap, BarChart3,
  Activity, Target, Radio, RefreshCw, Building2, Calendar, MapPin,
} from 'lucide-react';
import { api } from '../../lib/api';
import type {
  InsuranceFleetOverview, InsuranceFleetVehicle, InsurancePartnerSummary,
  InsuranceInquirySubmission, InsuranceInquiryResult, InsuranceDisclosureTemplate,
} from '../../lib/api';

// ─── Types & constants ────────────────────────────────────────

interface InsurancesViewProps {
  isDarkMode: boolean;
  onNavigateToVehicleDocuments?: (vehicleId: string) => void;
}

type MainView = 'overview' | 'inquiry';
type StatusFilter = 'all' | 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'MISSING' | 'PENDING_INQUIRY';
type SortKey = 'expiry' | 'status' | 'vehicle';

const STEP_LABELS = [
  'Vehicle', 'Insurers', 'Purpose', 'Historical Data',
  'Time Range', 'Live Data', 'Review', 'Submit',
] as const;

const INQUIRY_PURPOSE_OPTIONS: { value: string; label: string; desc: string }[] = [
  { value: 'quote_standard', label: 'Standard Quote', desc: 'Request a standard fleet insurance quote' },
  { value: 'quote_usage_based', label: 'Usage-Based Quote', desc: 'Quote based on actual vehicle usage data' },
  { value: 'quote_kilometer_based', label: 'Kilometer-Based Quote', desc: 'Quote calculated from driven kilometers' },
  { value: 'quote_driving_score', label: 'Driving-Score Quote', desc: 'Quote factoring in driver safety scores' },
  { value: 'contract_optimization', label: 'Contract Optimization', desc: 'Optimize your existing insurance contract' },
  { value: 'replacement_insurer', label: 'Replacement Insurer', desc: 'Find a replacement for your current insurer' },
  { value: 'dynamic_insurance_interest', label: 'Dynamic Insurance', desc: 'Express interest in dynamic/telematics insurance' },
];

const HISTORICAL_DATA_GROUPS: { label: string; items: { key: string; label: string; desc: string }[] }[] = [
  {
    label: 'Mileage & Usage',
    items: [
      { key: 'odometer_history', label: 'Odometer History', desc: 'Historical odometer readings over time' },
      { key: 'mileage_summary', label: 'Mileage Summary', desc: 'Aggregated mileage statistics' },
      { key: 'average_monthly_mileage', label: 'Avg. Monthly Mileage', desc: 'Average kilometers driven per month' },
      { key: 'vehicle_utilization', label: 'Vehicle Utilization', desc: 'Percentage of time vehicle is in active use' },
    ],
  },
  {
    label: 'Trip & Driving',
    items: [
      { key: 'trip_history', label: 'Trip History', desc: 'Detailed trip records with routes' },
      { key: 'trip_distance_aggregates', label: 'Trip Distance Aggregates', desc: 'Aggregated distances per trip category' },
      { key: 'driving_score_history', label: 'Driving Score History', desc: 'Historical driving safety scores' },
    ],
  },
  {
    label: 'Safety Events',
    items: [
      { key: 'harsh_braking_events', label: 'Harsh Braking Events', desc: 'Recorded harsh braking incidents' },
      { key: 'harsh_acceleration_events', label: 'Harsh Acceleration Events', desc: 'Recorded harsh acceleration incidents' },
      { key: 'speeding_events', label: 'Speeding Events', desc: 'Recorded speed limit violations' },
      { key: 'nighttime_driving_share', label: 'Nighttime Driving Share', desc: 'Percentage of driving occurring at night' },
    ],
  },
  {
    label: 'Vehicle Health',
    items: [
      { key: 'maintenance_summary', label: 'Maintenance Summary', desc: 'Summary of maintenance events' },
      { key: 'vehicle_health_summary', label: 'Vehicle Health Summary', desc: 'Overall vehicle health indicators' },
      { key: 'idle_time_summary', label: 'Idle Time Summary', desc: 'Summary of vehicle idle time' },
    ],
  },
];

const LIVE_DATA_OPTIONS: { key: string; label: string; desc: string }[] = [
  { key: 'odometer_updates', label: 'Odometer Updates', desc: 'Ongoing odometer reading updates' },
  { key: 'trip_distance', label: 'Trip Distance', desc: 'Real-time trip distance tracking' },
  { key: 'vehicle_utilization', label: 'Vehicle Utilization', desc: 'Live utilization rate data' },
  { key: 'driving_score_updates', label: 'Driving Score Updates', desc: 'Continuous driving score recalculations' },
  { key: 'speeding_summaries', label: 'Speeding Summaries', desc: 'Periodic speeding behavior summaries' },
  { key: 'harsh_braking_summaries', label: 'Harsh Braking Summaries', desc: 'Periodic harsh braking summaries' },
  { key: 'harsh_acceleration_summaries', label: 'Harsh Acceleration Summaries', desc: 'Periodic harsh acceleration summaries' },
  { key: 'time_of_day_patterns', label: 'Time-of-Day Patterns', desc: 'Driving time distribution patterns' },
  { key: 'trip_frequency', label: 'Trip Frequency', desc: 'Number of trips per period' },
];

const TIME_RANGE_OPTIONS: { value: string; label: string; days: number }[] = [
  { value: 'last_30_days', label: 'Last 30 Days', days: 30 },
  { value: 'last_90_days', label: 'Last 90 Days', days: 90 },
  { value: 'last_6_months', label: 'Last 6 Months', days: 183 },
  { value: 'last_12_months', label: 'Last 12 Months', days: 365 },
  { value: 'custom', label: 'Custom Range', days: 0 },
];

const STATUS_ORDER: Record<string, number> = {
  EXPIRED: 0, MISSING: 1, EXPIRING_SOON: 2, PENDING_INQUIRY: 3, ACTIVE: 4,
};

// ─── Helpers ──────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'Active', EXPIRING_SOON: 'Expiring Soon', EXPIRED: 'Expired',
    MISSING: 'Missing', PENDING_INQUIRY: 'Pending Inquiry',
  };
  return map[s] ?? s;
}

function statusColors(s: string, dk: boolean): { bg: string; text: string; border: string } {
  switch (s) {
    case 'ACTIVE': return {
      bg: dk ? 'bg-emerald-500/15' : 'bg-emerald-50',
      text: dk ? 'text-emerald-400' : 'text-emerald-700',
      border: dk ? 'border-emerald-500/30' : 'border-emerald-200',
    };
    case 'EXPIRING_SOON': return {
      bg: dk ? 'bg-amber-500/15' : 'bg-amber-50',
      text: dk ? 'text-amber-400' : 'text-amber-700',
      border: dk ? 'border-amber-500/30' : 'border-amber-200',
    };
    case 'EXPIRED': return {
      bg: dk ? 'bg-red-500/15' : 'bg-red-50',
      text: dk ? 'text-red-400' : 'text-red-700',
      border: dk ? 'border-red-500/30' : 'border-red-200',
    };
    case 'PENDING_INQUIRY': return {
      bg: dk ? 'bg-blue-500/15' : 'bg-blue-50',
      text: dk ? 'text-blue-400' : 'text-blue-700',
      border: dk ? 'border-blue-500/30' : 'border-blue-200',
    };
    default: return {
      bg: dk ? 'bg-neutral-500/15' : 'bg-gray-100',
      text: dk ? 'text-neutral-400' : 'text-gray-600',
      border: dk ? 'border-neutral-500/30' : 'border-gray-300',
    };
  }
}

function statusIcon(s: string) {
  switch (s) {
    case 'ACTIVE': return <ShieldCheck className="w-4 h-4" />;
    case 'EXPIRING_SOON': return <ShieldAlert className="w-4 h-4" />;
    case 'EXPIRED': return <ShieldX className="w-4 h-4" />;
    case 'PENDING_INQUIRY': return <Clock className="w-4 h-4" />;
    default: return <ShieldQuestion className="w-4 h-4" />;
  }
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Component ────────────────────────────────────────────────

export function InsurancesView({ isDarkMode: dk, onNavigateToVehicleDocuments }: InsurancesViewProps) {
  // ── Main navigation ─────────────────────────────────────────
  const [mainView, setMainView] = useState<MainView>('overview');

  // ── Overview state ──────────────────────────────────────────
  const [overview, setOverview] = useState<InsuranceFleetOverview | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // ── Drawer state ────────────────────────────────────────────
  const [detailVehicle, setDetailVehicle] = useState<InsuranceFleetVehicle | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailInquiries, setDetailInquiries] = useState<any[]>([]);
  const [detailLiveSharing, setDetailLiveSharing] = useState<any[]>([]);

  // ── Inquiry wizard state ────────────────────────────────────
  const [step, setStep] = useState(0);
  const [selectedVehicle, setSelectedVehicle] = useState<InsuranceFleetVehicle | null>(null);
  const [partners, setPartners] = useState<InsurancePartnerSummary[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [selectedInsurerIds, setSelectedInsurerIds] = useState<Set<string>>(new Set());
  const [inquiryPurpose, setInquiryPurpose] = useState('');
  const [selectedHistorical, setSelectedHistorical] = useState<Set<string>>(new Set());
  const [timeRange, setTimeRange] = useState('last_90_days');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selectedLiveData, setSelectedLiveData] = useState<Set<string>>(new Set());
  const [reportingFrequency, setReportingFrequency] = useState('monthly');
  const [aggregationLevel, setAggregationLevel] = useState<'aggregated' | 'detailed'>('aggregated');
  const [disclosure, setDisclosure] = useState<InsuranceDisclosureTemplate | null>(null);
  const [loadingDisclosure, setLoadingDisclosure] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<InsuranceInquiryResult | null>(null);
  const [vehicleSearch, setVehicleSearch] = useState('');

  // ── Data fetching ───────────────────────────────────────────

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const data = await api.insurances.overview();
      setOverview(data);
    } catch { /* graceful */ }
    setLoadingOverview(false);
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);

  const loadPartners = useCallback(async () => {
    if (partners.length > 0) return;
    setLoadingPartners(true);
    try {
      const data = await api.insurances.partners();
      setPartners(data);
    } catch { /* graceful */ }
    setLoadingPartners(false);
  }, [partners.length]);

  const loadDisclosure = useCallback(async () => {
    setLoadingDisclosure(true);
    try {
      const data = await api.insurances.disclosure(undefined, inquiryPurpose || undefined);
      setDisclosure(data);
    } catch { /* graceful */ }
    setLoadingDisclosure(false);
  }, [inquiryPurpose]);

  const openDetail = useCallback(async (v: InsuranceFleetVehicle) => {
    setDetailVehicle(v);
    setDetailLoading(true);
    try {
      const detail = await api.insurances.vehicleInsurance(v.vehicle.id);
      setDetailInquiries(detail.inquiries ?? []);
      setDetailLiveSharing(detail.liveSharingPermissions ?? []);
    } catch {
      setDetailInquiries([]);
      setDetailLiveSharing([]);
    }
    setDetailLoading(false);
  }, []);

  // ── Filtered / sorted vehicles ──────────────────────────────

  const filteredVehicles = (() => {
    if (!overview) return [];
    let list = overview.vehicles;
    if (statusFilter !== 'all') list = list.filter(v => v.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v => {
        const veh = v.vehicle;
        return (
          veh.make.toLowerCase().includes(q) ||
          veh.model.toLowerCase().includes(q) ||
          (veh.licensePlate ?? '').toLowerCase().includes(q) ||
          (veh.vin ?? '').toLowerCase().includes(q) ||
          (v.insurance?.insurerName ?? '').toLowerCase().includes(q) ||
          (v.insurance?.policyNumber ?? '').toLowerCase().includes(q)
        );
      });
    }
    list = [...list].sort((a, b) => {
      if (sortKey === 'vehicle') return `${a.vehicle.make} ${a.vehicle.model}`.localeCompare(`${b.vehicle.make} ${b.vehicle.model}`);
      if (sortKey === 'expiry') {
        const ea = a.insurance?.validUntil ?? '';
        const eb = b.insurance?.validUntil ?? '';
        return ea.localeCompare(eb);
      }
      return (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5);
    });
    return list;
  })();

  // ── Inquiry wizard helpers ──────────────────────────────────

  const startInquiry = useCallback((vehicle?: InsuranceFleetVehicle) => {
    setMainView('inquiry');
    setStep(0);
    setSelectedVehicle(vehicle ?? null);
    setSelectedInsurerIds(new Set());
    setInquiryPurpose('');
    setSelectedHistorical(new Set());
    setTimeRange('last_90_days');
    setCustomFrom('');
    setCustomTo('');
    setSelectedLiveData(new Set());
    setReportingFrequency('monthly');
    setAggregationLevel('aggregated');
    setDisclosure(null);
    setSubmitResult(null);
    setVehicleSearch('');
    if (vehicle) setStep(1);
  }, []);

  const toggleSet = useCallback((set: Set<string>, key: string): Set<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  }, []);

  const canAdvance = (): boolean => {
    switch (step) {
      case 0: return !!selectedVehicle;
      case 1: return selectedInsurerIds.size > 0;
      case 2: return !!inquiryPurpose;
      case 3: return selectedHistorical.size > 0;
      case 4: return timeRange !== 'custom' || (!!customFrom && !!customTo);
      case 5: return selectedLiveData.size > 0;
      case 6: return true;
      default: return false;
    }
  };

  const handleNext = async () => {
    if (step === 1 && partners.length === 0) await loadPartners();
    if (step === 5) loadDisclosure();
    if (step < 7) setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    if (!selectedVehicle) return;
    setSubmitting(true);
    const rangeObj = timeRange === 'custom'
      ? { from: customFrom, to: customTo, label: 'custom' }
      : { from: daysFromNow(TIME_RANGE_OPTIONS.find(t => t.value === timeRange)?.days ?? 90), to: new Date().toISOString().slice(0, 10), label: timeRange };
    const payload: InsuranceInquirySubmission = {
      vehicleId: selectedVehicle.vehicle.id,
      inquiryType: inquiryPurpose,
      selectedInsurerIds: Array.from(selectedInsurerIds),
      selectedHistoricalData: Object.fromEntries(Array.from(selectedHistorical).map(k => [k, true])),
      selectedLiveData: Object.fromEntries(Array.from(selectedLiveData).map(k => [k, { frequency: reportingFrequency, level: aggregationLevel }])),
      selectedTimeRange: rangeObj,
      selectedInsuranceModels: [inquiryPurpose],
    };
    try {
      const result = await api.insurances.submitInquiry(payload);
      setSubmitResult(result);
      setStep(7);
    } catch { /* graceful */ }
    setSubmitting(false);
  };

  // ── Reusable style tokens ──────────────────────────────────

  const pageBg = dk ? 'bg-[#0f0f1a]' : 'bg-gray-50';
  const cardBg = dk ? 'bg-[#1a1a2e]' : 'bg-white';
  const cardBorder = dk ? 'border-white/10' : 'border-gray-200';
  const textPrimary = dk ? 'text-white' : 'text-gray-900';
  const textSecondary = dk ? 'text-neutral-400' : 'text-gray-500';
  const textMuted = dk ? 'text-neutral-500' : 'text-gray-400';
  const inputBg = dk ? 'bg-white/5' : 'bg-white';
  const inputBorder = dk ? 'border-white/10' : 'border-gray-300';
  const hoverRow = dk ? 'hover:bg-white/5' : 'hover:bg-gray-50';
  const btnPrimary = 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-lg shadow-indigo-500/25';
  const btnSecondary = dk
    ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
    : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 shadow-sm';

  // ── Metric card subcomponent ────────────────────────────────

  const MetricCard = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) => (
    <div className={`${cardBg} border ${cardBorder} rounded-xl p-4 flex items-center gap-3 transition-all`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      <div>
        <div className={`text-2xl font-bold ${textPrimary}`}>{value}</div>
        <div className={`text-xs ${textSecondary}`}>{label}</div>
      </div>
    </div>
  );

  // ── Status badge subcomponent ───────────────────────────────

  const StatusBadge = ({ status }: { status: string }) => {
    const c = statusColors(status, dk);
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
        {statusIcon(status)}
        {statusLabel(status)}
      </span>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER: FLEET OVERVIEW
  // ═══════════════════════════════════════════════════════════

  const renderOverview = () => {
    if (loadingOverview) {
      return (
        <div className="flex items-center justify-center py-32">
          <Loader2 className={`w-8 h-8 animate-spin ${textMuted}`} />
        </div>
      );
    }
    if (!overview) {
      return (
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <AlertCircle className={`w-10 h-10 ${textMuted}`} />
          <p className={textSecondary}>Failed to load fleet insurance data.</p>
          <button onClick={loadOverview} className={`${btnSecondary} px-4 py-2 rounded-lg text-sm flex items-center gap-2`}>
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      );
    }
    const s = overview.summary;
    return (
      <>
        {/* ── Summary metrics ─────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <MetricCard icon={<Shield className="w-5 h-5 text-indigo-400" />} label="Total Vehicles" value={s.total} color={dk ? 'bg-indigo-500/15' : 'bg-indigo-50'} />
          <MetricCard icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />} label="Insured" value={s.insured} color={dk ? 'bg-emerald-500/15' : 'bg-emerald-50'} />
          <MetricCard icon={<ShieldAlert className="w-5 h-5 text-amber-400" />} label="Expiring Soon" value={s.expiringSoon} color={dk ? 'bg-amber-500/15' : 'bg-amber-50'} />
          <MetricCard icon={<ShieldX className="w-5 h-5 text-red-400" />} label="Expired" value={s.expired} color={dk ? 'bg-red-500/15' : 'bg-red-50'} />
          <MetricCard icon={<ShieldQuestion className="w-5 h-5 text-neutral-400" />} label="Missing" value={s.missing} color={dk ? 'bg-neutral-500/15' : 'bg-gray-100'} />
          <MetricCard icon={<Clock className="w-5 h-5 text-blue-400" />} label="Pending Inquiries" value={s.pendingInquiry} color={dk ? 'bg-blue-500/15' : 'bg-blue-50'} />
        </div>

        {/* ── Toolbar ─────────────────────────────────────── */}
        <div className={`${cardBg} border ${cardBorder} rounded-xl p-4 mb-4 flex flex-wrap items-center gap-3`}>
          <div className="relative flex-1 min-w-[200px]">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textMuted}`} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search vehicle, plate, VIN, insurer…"
              className={`w-full pl-10 pr-4 py-2 rounded-lg text-sm ${inputBg} border ${inputBorder} ${textPrimary} placeholder:${textMuted} focus:outline-none focus:ring-2 focus:ring-indigo-500/40`}
            />
          </div>

          {/* Filter dropdown */}
          <div className="relative">
            <button onClick={() => { setFilterOpen(!filterOpen); setSortOpen(false); }} className={`${btnSecondary} px-3 py-2 rounded-lg text-sm flex items-center gap-2`}>
              <Filter className="w-4 h-4" />
              {statusFilter === 'all' ? 'All Statuses' : statusLabel(statusFilter)}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {filterOpen && (
              <div className={`absolute right-0 top-full mt-1 z-30 min-w-[180px] ${cardBg} border ${cardBorder} rounded-xl shadow-xl py-1`}>
                {(['all', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'MISSING', 'PENDING_INQUIRY'] as StatusFilter[]).map(f => (
                  <button key={f} onClick={() => { setStatusFilter(f); setFilterOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm ${hoverRow} ${statusFilter === f ? (dk ? 'text-indigo-400' : 'text-indigo-600') : textPrimary} flex items-center gap-2`}>
                    {statusFilter === f && <Check className="w-3.5 h-3.5" />}
                    {f === 'all' ? 'All Statuses' : statusLabel(f)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <button onClick={() => { setSortOpen(!sortOpen); setFilterOpen(false); }} className={`${btnSecondary} px-3 py-2 rounded-lg text-sm flex items-center gap-2`}>
              <ArrowUpDown className="w-4 h-4" />
              Sort
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {sortOpen && (
              <div className={`absolute right-0 top-full mt-1 z-30 min-w-[170px] ${cardBg} border ${cardBorder} rounded-xl shadow-xl py-1`}>
                {([['status', 'By Status'], ['expiry', 'By Expiry Date'], ['vehicle', 'By Vehicle']] as [SortKey, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => { setSortKey(k); setSortOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm ${hoverRow} ${sortKey === k ? (dk ? 'text-indigo-400' : 'text-indigo-600') : textPrimary} flex items-center gap-2`}>
                    {sortKey === k && <Check className="w-3.5 h-3.5" />}
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => startInquiry()} className={`${btnPrimary} px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2`}>
            <Plus className="w-4 h-4" /> New Inquiry
          </button>
        </div>

        {/* ── Vehicle list ────────────────────────────────── */}
        <div className={`${cardBg} border ${cardBorder} rounded-xl overflow-hidden`}>
          {filteredVehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Car className={`w-8 h-8 ${textMuted}`} />
              <p className={`text-sm ${textSecondary}`}>No vehicles match your filters.</p>
            </div>
          ) : (
            <div className="divide-y divide-inherit" style={{ borderColor: dk ? 'rgba(255,255,255,0.06)' : undefined }}>
              {filteredVehicles.map(v => {
                const sc = statusColors(v.status, dk);
                const isMissing = v.status === 'MISSING';
                return (
                  <div key={v.vehicle.id} className={`px-5 py-4 ${hoverRow} transition-colors`}>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      {/* Left: vehicle info */}
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${dk ? 'bg-white/5' : 'bg-gray-100'}`}>
                          <Car className={`w-5 h-5 ${textSecondary}`} />
                        </div>
                        <div className="min-w-0">
                          <div className={`font-semibold text-sm ${textPrimary} truncate`}>
                            {v.vehicle.make} {v.vehicle.model} <span className={textMuted}>({v.vehicle.year})</span>
                          </div>
                          <div className={`text-xs ${textSecondary} flex items-center gap-3 mt-0.5 flex-wrap`}>
                            {v.vehicle.licensePlate && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{v.vehicle.licensePlate}</span>}
                            {v.vehicle.vin && <span className="font-mono truncate max-w-[140px]">{v.vehicle.vin}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Center: insurance info */}
                      <div className="flex-1 min-w-[200px]">
                        <StatusBadge status={v.status} />
                        {v.insurance && !isMissing && (
                          <div className={`mt-2 text-xs ${textSecondary} space-y-0.5`}>
                            {v.insurance.insurerName && (
                              <div className="flex items-center gap-1.5"><Building2 className="w-3 h-3" /> {v.insurance.insurerName}</div>
                            )}
                            {v.insurance.policyNumber && (
                              <div className="flex items-center gap-1.5"><FileText className="w-3 h-3" /> {v.insurance.policyNumber}</div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <Calendar className="w-3 h-3" />
                              {fmtDate(v.insurance.validFrom)} — {fmtDate(v.insurance.validUntil)}
                            </div>
                          </div>
                        )}
                        {isMissing && (
                          <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${dk ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            No insurance document stored for this vehicle.
                          </div>
                        )}
                      </div>

                      {/* Right: actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isMissing && onNavigateToVehicleDocuments && (
                          <button onClick={() => onNavigateToVehicleDocuments(v.vehicle.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${dk ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/20' : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'}`}>
                            <FileText className="w-3.5 h-3.5" /> Upload Insurance
                          </button>
                        )}
                        <button onClick={() => openDetail(v)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${btnSecondary}`}>
                          <Eye className="w-3.5 h-3.5" /> Detail
                        </button>
                        <button onClick={() => startInquiry(v)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${btnPrimary}`}>
                          <Send className="w-3.5 h-3.5" /> Inquiry
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER: INQUIRY WIZARD STEPPER
  // ═══════════════════════════════════════════════════════════

  const renderStepper = () => (
    <div className={`${cardBg} border ${cardBorder} rounded-xl p-5 mb-6 overflow-x-auto`}>
      <div className="flex items-center justify-between min-w-[640px]">
        {STEP_LABELS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          const circleBase = 'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all';
          const circleClass = done
            ? `${circleBase} bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25`
            : active
            ? `${circleBase} bg-gradient-to-r from-indigo-600 to-violet-600 text-white ring-4 ${dk ? 'ring-indigo-500/30' : 'ring-indigo-200'}`
            : `${circleBase} ${dk ? 'bg-white/10 text-neutral-500' : 'bg-gray-200 text-gray-500'}`;
          const lineClass = done
            ? 'flex-1 h-0.5 bg-gradient-to-r from-indigo-600 to-violet-600 mx-2'
            : `flex-1 h-0.5 mx-2 ${dk ? 'bg-white/10' : 'bg-gray-200'}`;
          return (
            <div key={i} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center gap-1">
                <div className={circleClass}>{done ? <Check className="w-4 h-4" /> : i + 1}</div>
                <span className={`text-[10px] whitespace-nowrap ${active ? (dk ? 'text-indigo-400' : 'text-indigo-600') : done ? (dk ? 'text-indigo-300' : 'text-indigo-500') : textMuted}`}>
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && <div className={lineClass} />}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Step 0: Select Vehicle ──────────────────────────────────

  const renderStepVehicle = () => {
    const vehicles = overview?.vehicles ?? [];
    const q = vehicleSearch.toLowerCase();
    const filtered = q
      ? vehicles.filter(v => `${v.vehicle.make} ${v.vehicle.model} ${v.vehicle.licensePlate ?? ''} ${v.vehicle.vin ?? ''}`.toLowerCase().includes(q))
      : vehicles;
    return (
      <div>
        <h3 className={`text-lg font-semibold ${textPrimary} mb-1`}>Select a Vehicle</h3>
        <p className={`text-sm ${textSecondary} mb-4`}>Choose the vehicle you want to request insurance for.</p>
        <div className="relative mb-4">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${textMuted}`} />
          <input value={vehicleSearch} onChange={e => setVehicleSearch(e.target.value)} placeholder="Search vehicles…"
            className={`w-full pl-10 pr-4 py-2.5 rounded-lg text-sm ${inputBg} border ${inputBorder} ${textPrimary} placeholder:${textMuted} focus:outline-none focus:ring-2 focus:ring-indigo-500/40`}
          />
        </div>
        <div className="grid gap-2 max-h-[420px] overflow-y-auto pr-1">
          {filtered.map(v => {
            const sel = selectedVehicle?.vehicle.id === v.vehicle.id;
            return (
              <button key={v.vehicle.id} onClick={() => setSelectedVehicle(v)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-4
                  ${sel
                    ? `border-indigo-500 ${dk ? 'bg-indigo-500/10' : 'bg-indigo-50'} ring-2 ring-indigo-500/30`
                    : `${cardBorder} border ${dk ? 'bg-white/[0.02] hover:bg-white/5' : 'bg-white hover:bg-gray-50'}`}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${sel ? (dk ? 'bg-indigo-500/20' : 'bg-indigo-100') : (dk ? 'bg-white/5' : 'bg-gray-100')}`}>
                  <Car className={`w-5 h-5 ${sel ? 'text-indigo-400' : textSecondary}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium ${textPrimary}`}>{v.vehicle.make} {v.vehicle.model} ({v.vehicle.year})</div>
                  <div className={`text-xs ${textSecondary} flex gap-3`}>
                    {v.vehicle.licensePlate && <span>{v.vehicle.licensePlate}</span>}
                    {v.vehicle.vin && <span className="font-mono truncate max-w-[120px]">{v.vehicle.vin}</span>}
                  </div>
                </div>
                <StatusBadge status={v.status} />
                {sel && <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0"><Check className="w-3.5 h-3.5 text-white" /></div>}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className={`text-center py-10 ${textSecondary} text-sm`}>No vehicles found.</div>
          )}
        </div>
      </div>
    );
  };

  // ── Step 1: Select Insurers ─────────────────────────────────

  const renderStepInsurers = () => {
    if (loadingPartners || (partners.length === 0 && step === 1)) {
      if (partners.length === 0 && !loadingPartners) loadPartners();
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className={`w-6 h-6 animate-spin ${textMuted}`} />
        </div>
      );
    }
    return (
      <div>
        <h3 className={`text-lg font-semibold ${textPrimary} mb-1`}>Select Insurance Partners</h3>
        <p className={`text-sm ${textSecondary} mb-4`}>Choose one or more insurers to receive your inquiry.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {partners.map(p => {
            const sel = selectedInsurerIds.has(p.id);
            return (
              <button key={p.id} onClick={() => setSelectedInsurerIds(prev => toggleSet(prev, p.id))}
                className={`text-left p-4 rounded-xl border transition-all
                  ${sel
                    ? `border-indigo-500 ${dk ? 'bg-indigo-500/10' : 'bg-indigo-50'} ring-2 ring-indigo-500/30`
                    : `${cardBorder} border ${dk ? 'bg-white/[0.02] hover:bg-white/5' : 'bg-white hover:bg-gray-50'}`}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold text-sm ${textPrimary} flex items-center gap-2`}>
                      <Building2 className="w-4 h-4 flex-shrink-0" />
                      {p.displayName}
                    </div>
                    {p.description && <div className={`text-xs ${textSecondary} mt-1 line-clamp-2`}>{p.description}</div>}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {p.supportsUsageBased && <span className={`text-[10px] px-1.5 py-0.5 rounded ${dk ? 'bg-purple-500/15 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>Usage-Based</span>}
                      {p.supportsKilometerBased && <span className={`text-[10px] px-1.5 py-0.5 rounded ${dk ? 'bg-cyan-500/15 text-cyan-400' : 'bg-cyan-50 text-cyan-600'}`}>Km-Based</span>}
                      {p.supportsDrivingScoreBased && <span className={`text-[10px] px-1.5 py-0.5 rounded ${dk ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>Score-Based</span>}
                      {p.supportsDynamicInsurance && <span className={`text-[10px] px-1.5 py-0.5 rounded ${dk ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>Dynamic</span>}
                    </div>
                    <div className={`text-[10px] ${textMuted} mt-2`}>
                      Channel: {p.communicationChannel} · Models: {p.supportedInsuranceModels.join(', ') || '—'}
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all
                    ${sel ? 'bg-indigo-600 border-indigo-600' : `${dk ? 'border-white/20' : 'border-gray-300'}`}`}>
                    {sel && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {partners.length === 0 && (
          <div className={`text-center py-10 ${textSecondary} text-sm`}>No insurance partners available.</div>
        )}
      </div>
    );
  };

  // ── Step 2: Inquiry Purpose ─────────────────────────────────

  const renderStepPurpose = () => (
    <div>
      <h3 className={`text-lg font-semibold ${textPrimary} mb-1`}>Inquiry Purpose</h3>
      <p className={`text-sm ${textSecondary} mb-4`}>Select the type of insurance inquiry you want to send.</p>
      <div className="grid gap-2">
        {INQUIRY_PURPOSE_OPTIONS.map(opt => {
          const sel = inquiryPurpose === opt.value;
          return (
            <button key={opt.value} onClick={() => setInquiryPurpose(opt.value)}
              className={`text-left p-4 rounded-xl border transition-all flex items-center gap-4
                ${sel
                  ? `border-indigo-500 ${dk ? 'bg-indigo-500/10' : 'bg-indigo-50'} ring-2 ring-indigo-500/30`
                  : `${cardBorder} border ${dk ? 'bg-white/[0.02] hover:bg-white/5' : 'bg-white hover:bg-gray-50'}`}`}>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
                ${sel ? 'border-indigo-600 bg-indigo-600' : (dk ? 'border-white/20' : 'border-gray-300')}`}>
                {sel && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div>
                <div className={`text-sm font-medium ${textPrimary}`}>{opt.label}</div>
                <div className={`text-xs ${textSecondary} mt-0.5`}>{opt.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Step 3: Historical Data ─────────────────────────────────

  const renderStepHistorical = () => (
    <div>
      <h3 className={`text-lg font-semibold ${textPrimary} mb-1`}>Historical Data Selection</h3>
      <p className={`text-sm ${textSecondary} mb-4`}>Select which historical data categories to include with this inquiry.</p>
      <div className="space-y-5">
        {HISTORICAL_DATA_GROUPS.map(group => (
          <div key={group.label}>
            <h4 className={`text-xs font-semibold uppercase tracking-wider ${textMuted} mb-2`}>{group.label}</h4>
            <div className="grid gap-2 md:grid-cols-2">
              {group.items.map(item => {
                const sel = selectedHistorical.has(item.key);
                const accepted = partners.length > 0 ? partners.some(p => selectedInsurerIds.has(p.id) && p.acceptedHistoricalData.includes(item.key)) : true;
                return (
                  <button key={item.key} onClick={() => setSelectedHistorical(prev => toggleSet(prev, item.key))}
                    className={`text-left p-3 rounded-xl border transition-all flex items-start gap-3
                      ${sel
                        ? `border-indigo-500 ${dk ? 'bg-indigo-500/10' : 'bg-indigo-50'} ring-1 ring-indigo-500/30`
                        : `${cardBorder} border ${dk ? 'bg-white/[0.02] hover:bg-white/5' : 'bg-white hover:bg-gray-50'}`}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all
                      ${sel ? 'bg-indigo-600 border-indigo-600' : (dk ? 'border-white/20' : 'border-gray-300')}`}>
                      {sel && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${textPrimary}`}>{item.label}</span>
                        {accepted && <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${dk ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>Available</span>}
                      </div>
                      <div className={`text-xs ${textSecondary} mt-0.5`}>{item.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── Step 4: Time Range ──────────────────────────────────────

  const renderStepTimeRange = () => (
    <div>
      <h3 className={`text-lg font-semibold ${textPrimary} mb-1`}>Time Range</h3>
      <p className={`text-sm ${textSecondary} mb-4`}>Select the time period for the historical data to share.</p>
      <div className="grid gap-2 max-w-lg">
        {TIME_RANGE_OPTIONS.map(opt => {
          const sel = timeRange === opt.value;
          return (
            <button key={opt.value} onClick={() => setTimeRange(opt.value)}
              className={`text-left p-4 rounded-xl border transition-all flex items-center gap-4
                ${sel
                  ? `border-indigo-500 ${dk ? 'bg-indigo-500/10' : 'bg-indigo-50'} ring-2 ring-indigo-500/30`
                  : `${cardBorder} border ${dk ? 'bg-white/[0.02] hover:bg-white/5' : 'bg-white hover:bg-gray-50'}`}`}>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
                ${sel ? 'border-indigo-600 bg-indigo-600' : (dk ? 'border-white/20' : 'border-gray-300')}`}>
                {sel && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex items-center gap-2">
                <Calendar className={`w-4 h-4 ${sel ? 'text-indigo-400' : textMuted}`} />
                <span className={`text-sm font-medium ${textPrimary}`}>{opt.label}</span>
              </div>
            </button>
          );
        })}
      </div>
      {timeRange === 'custom' && (
        <div className="flex items-center gap-3 mt-4 max-w-lg">
          <div className="flex-1">
            <label className={`text-xs font-medium ${textSecondary} mb-1 block`}>From</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg text-sm ${inputBg} border ${inputBorder} ${textPrimary} focus:outline-none focus:ring-2 focus:ring-indigo-500/40`} />
          </div>
          <div className={`mt-5 ${textMuted}`}>—</div>
          <div className="flex-1">
            <label className={`text-xs font-medium ${textSecondary} mb-1 block`}>To</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg text-sm ${inputBg} border ${inputBorder} ${textPrimary} focus:outline-none focus:ring-2 focus:ring-indigo-500/40`} />
          </div>
        </div>
      )}
    </div>
  );

  // ── Step 5: Live Data Sharing ───────────────────────────────

  const renderStepLiveData = () => (
    <div>
      <h3 className={`text-lg font-semibold ${textPrimary} mb-1`}>Live Data Sharing</h3>
      <p className={`text-sm ${textSecondary} mb-2`}>Select ongoing data categories to share with insurers.</p>
      <div className={`p-3 rounded-lg mb-4 flex items-start gap-2 text-xs ${dk ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>You are authorizing ongoing sharing of these data categories with the selected insurance partners. You can revoke sharing permissions at any time from the vehicle detail view.</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 mb-6">
        {LIVE_DATA_OPTIONS.map(opt => {
          const sel = selectedLiveData.has(opt.key);
          return (
            <button key={opt.key} onClick={() => setSelectedLiveData(prev => toggleSet(prev, opt.key))}
              className={`text-left p-3 rounded-xl border transition-all flex items-start gap-3
                ${sel
                  ? `border-indigo-500 ${dk ? 'bg-indigo-500/10' : 'bg-indigo-50'} ring-1 ring-indigo-500/30`
                  : `${cardBorder} border ${dk ? 'bg-white/[0.02] hover:bg-white/5' : 'bg-white hover:bg-gray-50'}`}`}>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all
                ${sel ? 'bg-indigo-600 border-indigo-600' : (dk ? 'border-white/20' : 'border-gray-300')}`}>
                {sel && <Check className="w-3 h-3 text-white" />}
              </div>
              <div>
                <div className={`text-sm font-medium ${textPrimary}`}>{opt.label}</div>
                <div className={`text-xs ${textSecondary} mt-0.5`}>{opt.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Frequency & aggregation */}
      <div className="grid gap-4 md:grid-cols-2 max-w-xl">
        <div>
          <label className={`text-xs font-semibold uppercase tracking-wider ${textMuted} mb-2 block`}>Reporting Frequency</label>
          <div className="flex gap-2">
            {(['daily', 'weekly', 'monthly'] as const).map(f => (
              <button key={f} onClick={() => setReportingFrequency(f)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all border
                  ${reportingFrequency === f
                    ? `${btnPrimary} border-transparent`
                    : `${btnSecondary}`}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={`text-xs font-semibold uppercase tracking-wider ${textMuted} mb-2 block`}>Aggregation Level</label>
          <div className="flex gap-2">
            {(['aggregated', 'detailed'] as const).map(l => (
              <button key={l} onClick={() => setAggregationLevel(l)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all border
                  ${aggregationLevel === l
                    ? `${btnPrimary} border-transparent`
                    : `${btnSecondary}`}`}>
                {l.charAt(0).toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── Step 6: Review ──────────────────────────────────────────

  const renderStepReview = () => {
    const purposeLabel = INQUIRY_PURPOSE_OPTIONS.find(o => o.value === inquiryPurpose)?.label ?? inquiryPurpose;
    const rangeLabel = TIME_RANGE_OPTIONS.find(t => t.value === timeRange)?.label ?? timeRange;
    const selectedPartners = partners.filter(p => selectedInsurerIds.has(p.id));
    const historicalLabels = Array.from(selectedHistorical).map(k =>
      HISTORICAL_DATA_GROUPS.flatMap(g => g.items).find(i => i.key === k)?.label ?? k
    );
    const liveLabels = Array.from(selectedLiveData).map(k =>
      LIVE_DATA_OPTIONS.find(i => i.key === k)?.label ?? k
    );

    const SectionCard = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
      <div className={`${cardBg} border ${cardBorder} rounded-xl p-4`}>
        <div className={`flex items-center gap-2 mb-3 text-sm font-semibold ${textPrimary}`}>{icon}{title}</div>
        {children}
      </div>
    );

    return (
      <div>
        <h3 className={`text-lg font-semibold ${textPrimary} mb-1`}>Review Your Inquiry</h3>
        <p className={`text-sm ${textSecondary} mb-4`}>Review all selections before submitting to insurers.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <SectionCard title="Vehicle" icon={<Car className="w-4 h-4 text-indigo-400" />}>
            {selectedVehicle && (
              <div className={`text-sm ${textPrimary}`}>
                <div className="font-medium">{selectedVehicle.vehicle.make} {selectedVehicle.vehicle.model} ({selectedVehicle.vehicle.year})</div>
                <div className={`text-xs ${textSecondary} mt-1`}>
                  {selectedVehicle.vehicle.licensePlate && <span className="mr-3">{selectedVehicle.vehicle.licensePlate}</span>}
                  {selectedVehicle.vehicle.vin && <span className="font-mono">{selectedVehicle.vehicle.vin}</span>}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Insurance Partners" icon={<Building2 className="w-4 h-4 text-indigo-400" />}>
            <div className="flex flex-wrap gap-1.5">
              {selectedPartners.map(p => (
                <span key={p.id} className={`text-xs px-2 py-1 rounded-full ${dk ? 'bg-indigo-500/15 text-indigo-300' : 'bg-indigo-50 text-indigo-700'}`}>
                  {p.displayName}
                </span>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Purpose" icon={<Target className="w-4 h-4 text-indigo-400" />}>
            <div className={`text-sm ${textPrimary}`}>{purposeLabel}</div>
          </SectionCard>

          <SectionCard title="Time Range" icon={<Calendar className="w-4 h-4 text-indigo-400" />}>
            <div className={`text-sm ${textPrimary}`}>
              {timeRange === 'custom' ? `${fmtDate(customFrom)} — ${fmtDate(customTo)}` : rangeLabel}
            </div>
          </SectionCard>

          <SectionCard title="Historical Data" icon={<BarChart3 className="w-4 h-4 text-indigo-400" />}>
            <div className="flex flex-wrap gap-1.5">
              {historicalLabels.map(l => (
                <span key={l} className={`text-xs px-2 py-1 rounded-full ${dk ? 'bg-white/10 text-neutral-300' : 'bg-gray-100 text-gray-700'}`}>{l}</span>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Live Data Sharing" icon={<Activity className="w-4 h-4 text-indigo-400" />}>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {liveLabels.map(l => (
                <span key={l} className={`text-xs px-2 py-1 rounded-full ${dk ? 'bg-white/10 text-neutral-300' : 'bg-gray-100 text-gray-700'}`}>{l}</span>
              ))}
            </div>
            <div className={`text-xs ${textSecondary}`}>Frequency: {reportingFrequency} · Level: {aggregationLevel}</div>
          </SectionCard>
        </div>

        {/* Disclosure */}
        {loadingDisclosure ? (
          <div className="flex items-center gap-2 mt-4"><Loader2 className={`w-4 h-4 animate-spin ${textMuted}`} /><span className={`text-sm ${textSecondary}`}>Loading disclosure…</span></div>
        ) : disclosure && (
          <div className={`mt-4 p-4 rounded-xl border ${dk ? 'bg-white/[0.02] border-white/10' : 'bg-gray-50 border-gray-200'}`}>
            <div className={`flex items-center gap-2 text-sm font-semibold ${textPrimary} mb-2`}>
              <FileText className="w-4 h-4 text-indigo-400" />
              Data Disclosure Notice
            </div>
            <div className={`text-xs leading-relaxed ${textSecondary}`}>{disclosure.body}</div>
            <div className={`text-[10px] mt-2 ${textMuted}`}>Version {disclosure.version} · Effective {fmtDate(disclosure.effectiveFrom)}</div>
          </div>
        )}
      </div>
    );
  };

  // ── Step 7: Submit / Results ────────────────────────────────

  const renderStepSubmit = () => {
    if (submitting) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <div className={`w-16 h-16 rounded-full ${dk ? 'bg-indigo-500/15' : 'bg-indigo-50'} flex items-center justify-center`}>
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
          </div>
          <div className={`text-lg font-semibold ${textPrimary}`}>Submitting Inquiry…</div>
          <p className={`text-sm ${textSecondary} text-center max-w-md`}>Sending your insurance inquiry to the selected partners. This may take a moment.</p>
        </div>
      );
    }
    if (!submitResult) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className={`w-16 h-16 rounded-full ${dk ? 'bg-red-500/15' : 'bg-red-50'} flex items-center justify-center`}>
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <div className={`text-lg font-semibold ${textPrimary}`}>Submission Failed</div>
          <p className={`text-sm ${textSecondary}`}>Something went wrong. Please try again.</p>
          <button onClick={() => setStep(6)} className={`${btnSecondary} px-4 py-2 rounded-lg text-sm`}>Back to Review</button>
        </div>
      );
    }

    const allOk = submitResult.recipients.every(r => r.success);
    return (
      <div>
        <div className="flex flex-col items-center py-8 gap-3">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${allOk ? (dk ? 'bg-emerald-500/15' : 'bg-emerald-50') : (dk ? 'bg-amber-500/15' : 'bg-amber-50')}`}>
            {allOk ? <ShieldCheck className="w-8 h-8 text-emerald-500" /> : <ShieldAlert className="w-8 h-8 text-amber-500" />}
          </div>
          <div className={`text-lg font-semibold ${textPrimary}`}>{allOk ? 'Inquiry Submitted Successfully' : 'Inquiry Partially Submitted'}</div>
          <p className={`text-sm ${textSecondary} text-center max-w-md`}>
            {allOk
              ? 'Your inquiry has been sent to all selected insurance partners.'
              : 'Some partners could not be reached. See details below.'}
          </p>
          <div className={`text-xs font-mono ${textMuted}`}>ID: {submitResult.inquiryId}</div>
        </div>

        <div className="grid gap-3 max-w-lg mx-auto">
          {submitResult.recipients.map((r, i) => (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${r.success
              ? (dk ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200')
              : (dk ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200')}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${r.success ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                {r.success ? <Check className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-red-400" />}
              </div>
              <div className="flex-1">
                <div className={`text-sm font-medium ${textPrimary}`}>{r.insurerName}</div>
                {r.message && <div className={`text-xs ${textSecondary} mt-0.5`}>{r.message}</div>}
              </div>
              <span className={`text-xs font-medium ${r.success ? 'text-emerald-400' : 'text-red-400'}`}>
                {r.success ? 'Sent' : 'Failed'}
              </span>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-3 mt-8">
          <button onClick={() => { setMainView('overview'); loadOverview(); }} className={`${btnSecondary} px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2`}>
            <ChevronLeft className="w-4 h-4" /> Back to Overview
          </button>
          <button onClick={() => startInquiry()} className={`${btnPrimary} px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2`}>
            <Plus className="w-4 h-4" /> New Inquiry
          </button>
        </div>
      </div>
    );
  };

  // ── Inquiry step dispatcher ─────────────────────────────────

  const renderCurrentStep = () => {
    switch (step) {
      case 0: return renderStepVehicle();
      case 1: return renderStepInsurers();
      case 2: return renderStepPurpose();
      case 3: return renderStepHistorical();
      case 4: return renderStepTimeRange();
      case 5: return renderStepLiveData();
      case 6: return renderStepReview();
      case 7: return renderStepSubmit();
      default: return null;
    }
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER: INQUIRY WIZARD
  // ═══════════════════════════════════════════════════════════

  const renderInquiry = () => (
    <>
      {renderStepper()}
      <div className={`${cardBg} border ${cardBorder} rounded-xl p-6`}>
        {renderCurrentStep()}
      </div>
      {step < 7 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => { if (step === 0) { setMainView('overview'); } else { setStep(s => s - 1); } }}
            className={`${btnSecondary} px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2`}>
            <ChevronLeft className="w-4 h-4" />
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step === 6 ? (
            <button onClick={handleSubmit} disabled={submitting}
              className={`${btnPrimary} px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50`}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submit Inquiry
            </button>
          ) : (
            <button onClick={handleNext} disabled={!canAdvance()}
              className={`${btnPrimary} px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}>
              Next <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </>
  );

  // ═══════════════════════════════════════════════════════════
  // RENDER: VEHICLE DETAIL DRAWER
  // ═══════════════════════════════════════════════════════════

  const renderDetailDrawer = () => {
    if (!detailVehicle) return null;
    const v = detailVehicle;
    const isMissing = v.status === 'MISSING';
    return (
      <>
        {/* Backdrop */}
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={() => setDetailVehicle(null)} />
        {/* Drawer */}
        <div className={`fixed inset-y-0 right-0 z-50 w-full max-w-md ${dk ? 'bg-[#1a1a2e]' : 'bg-white'} shadow-2xl flex flex-col`}>
          {/* Header */}
          <div className={`flex items-center justify-between p-5 border-b ${dk ? 'border-white/10' : 'border-gray-200'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${dk ? 'bg-white/5' : 'bg-gray-100'}`}>
                <Car className={`w-5 h-5 ${textSecondary}`} />
              </div>
              <div>
                <div className={`font-semibold text-sm ${textPrimary}`}>{v.vehicle.make} {v.vehicle.model}</div>
                <div className={`text-xs ${textSecondary}`}>{v.vehicle.year} · {v.vehicle.licensePlate ?? '—'}</div>
              </div>
            </div>
            <button onClick={() => setDetailVehicle(null)} className={`p-2 rounded-lg ${hoverRow}`}><X className={`w-5 h-5 ${textSecondary}`} /></button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {detailLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 className={`w-6 h-6 animate-spin ${textMuted}`} /></div>
            ) : (
              <>
                {/* Vehicle summary card */}
                <div className={`${dk ? 'bg-white/[0.03]' : 'bg-gray-50'} rounded-xl p-4 border ${cardBorder}`}>
                  <div className={`text-xs font-semibold uppercase tracking-wider ${textMuted} mb-3`}>Vehicle Summary</div>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                    <div className={textSecondary}>Make / Model</div>
                    <div className={textPrimary}>{v.vehicle.make} {v.vehicle.model}</div>
                    <div className={textSecondary}>Year</div>
                    <div className={textPrimary}>{v.vehicle.year}</div>
                    <div className={textSecondary}>Plate</div>
                    <div className={textPrimary}>{v.vehicle.licensePlate ?? '—'}</div>
                    <div className={textSecondary}>VIN</div>
                    <div className={`${textPrimary} font-mono text-xs`}>{v.vehicle.vin ?? '—'}</div>
                    <div className={textSecondary}>Fuel</div>
                    <div className={textPrimary}>{v.vehicle.fuelType ?? '—'}</div>
                    {v.vehicle.mileageKm != null && (
                      <>
                        <div className={textSecondary}>Mileage</div>
                        <div className={textPrimary}>{v.vehicle.mileageKm.toLocaleString()} km</div>
                      </>
                    )}
                  </div>
                </div>

                {/* Insurance record */}
                <div className={`${dk ? 'bg-white/[0.03]' : 'bg-gray-50'} rounded-xl p-4 border ${cardBorder}`}>
                  <div className={`text-xs font-semibold uppercase tracking-wider ${textMuted} mb-3`}>Insurance Record</div>
                  {v.insurance && !isMissing ? (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2"><StatusBadge status={v.status} /></div>
                      <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                        <div className={textSecondary}>Insurer</div>
                        <div className={textPrimary}>{v.insurance.insurerName ?? '—'}</div>
                        <div className={textSecondary}>Policy #</div>
                        <div className={`${textPrimary} font-mono text-xs`}>{v.insurance.policyNumber ?? '—'}</div>
                        <div className={textSecondary}>Type</div>
                        <div className={textPrimary}>{v.insurance.insuranceType ?? '—'}</div>
                        <div className={textSecondary}>Valid From</div>
                        <div className={textPrimary}>{fmtDate(v.insurance.validFrom)}</div>
                        <div className={textSecondary}>Valid Until</div>
                        <div className={textPrimary}>{fmtDate(v.insurance.validUntil)}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${dk ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        No insurance record on file.
                      </div>
                      {onNavigateToVehicleDocuments && (
                        <button onClick={() => { onNavigateToVehicleDocuments(v.vehicle.id); setDetailVehicle(null); }}
                          className={`${btnPrimary} w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2`}>
                          <FileText className="w-4 h-4" /> Upload Insurance Document
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Recent inquiries */}
                <div className={`${dk ? 'bg-white/[0.03]' : 'bg-gray-50'} rounded-xl p-4 border ${cardBorder}`}>
                  <div className={`text-xs font-semibold uppercase tracking-wider ${textMuted} mb-3`}>Recent Inquiries</div>
                  {detailInquiries.length === 0 ? (
                    <p className={`text-sm ${textSecondary}`}>No inquiries for this vehicle.</p>
                  ) : (
                    <div className="space-y-2">
                      {detailInquiries.slice(0, 5).map((inq: any) => (
                        <div key={inq.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${cardBorder} ${dk ? 'bg-white/[0.02]' : 'bg-white'}`}>
                          <div>
                            <div className={`text-sm font-medium ${textPrimary}`}>{inq.inquiryType?.replace(/_/g, ' ')}</div>
                            <div className={`text-xs ${textSecondary}`}>{fmtDate(inq.createdAt)}</div>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            inq.status === 'completed' ? (dk ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700')
                              : inq.status === 'failed' ? (dk ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700')
                              : (dk ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-700')
                          }`}>{inq.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Live sharing */}
                <div className={`${dk ? 'bg-white/[0.03]' : 'bg-gray-50'} rounded-xl p-4 border ${cardBorder}`}>
                  <div className={`text-xs font-semibold uppercase tracking-wider ${textMuted} mb-3`}>Active Live Sharing</div>
                  {detailLiveSharing.length === 0 ? (
                    <p className={`text-sm ${textSecondary}`}>No active live data sharing permissions.</p>
                  ) : (
                    <div className="space-y-2">
                      {detailLiveSharing.map((ls: any) => (
                        <div key={ls.id} className={`p-2.5 rounded-lg border ${cardBorder} ${dk ? 'bg-white/[0.02]' : 'bg-white'}`}>
                          <div className="flex items-center justify-between">
                            <div className={`text-sm font-medium ${textPrimary}`}>{ls.insurer?.displayName ?? '—'}</div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              ls.status === 'active' ? (dk ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700')
                                : (dk ? 'bg-neutral-500/15 text-neutral-400' : 'bg-gray-100 text-gray-600')
                            }`}>{ls.status}</span>
                          </div>
                          <div className={`text-xs ${textSecondary} mt-1`}>
                            Since {fmtDate(ls.validFrom)} · {ls.reportingFrequency ?? 'N/A'}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <button onClick={() => { setDetailVehicle(null); startInquiry(v); }}
                  className={`${btnPrimary} w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2`}>
                  <Send className="w-4 h-4" /> Send Insurance Inquiry
                </button>
              </>
            )}
          </div>
        </div>
      </>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className={`min-h-full ${pageBg} p-6`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={`text-2xl font-bold ${textPrimary} flex items-center gap-2.5`}>
            <Shield className="w-7 h-7 text-indigo-500" />
            Fleet Insurance
          </h1>
          <p className={`text-sm ${textSecondary} mt-1`}>Manage fleet insurance coverage, inquiries, and data sharing.</p>
        </div>
        {mainView === 'overview' && (
          <button onClick={loadOverview} className={`${btnSecondary} px-3 py-2 rounded-lg text-sm flex items-center gap-2`}>
            <RefreshCw className={`w-4 h-4 ${loadingOverview ? 'animate-spin' : ''}`} /> Refresh
          </button>
        )}
      </div>

      {/* View tabs */}
      <div className={`flex items-center gap-1 mb-6 p-1 rounded-xl ${dk ? 'bg-white/5' : 'bg-gray-100'} w-fit`}>
        <button onClick={() => setMainView('overview')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mainView === 'overview'
              ? `${dk ? 'bg-white/10 text-white' : 'bg-white text-gray-900 shadow-sm'}`
              : `${textSecondary} hover:${dk ? 'text-white' : 'text-gray-700'}`
          }`}>
          <span className="flex items-center gap-2"><Shield className="w-4 h-4" /> Overview</span>
        </button>
        <button onClick={() => startInquiry()}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mainView === 'inquiry'
              ? `${dk ? 'bg-white/10 text-white' : 'bg-white text-gray-900 shadow-sm'}`
              : `${textSecondary} hover:${dk ? 'text-white' : 'text-gray-700'}`
          }`}>
          <span className="flex items-center gap-2"><Send className="w-4 h-4" /> New Inquiry</span>
        </button>
      </div>

      {/* Active view */}
      {mainView === 'overview' ? renderOverview() : renderInquiry()}

      {/* Detail drawer */}
      {renderDetailDrawer()}
    </div>
  );
}

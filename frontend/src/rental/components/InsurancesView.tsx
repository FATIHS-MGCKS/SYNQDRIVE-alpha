import { Icon } from './ui/Icon';
import {
  PageHeader,
  DataCard,
  MetricCard,
  DetailDrawer,
  EmptyState,
  StatusChip,
  SectionHeader,
  SkeletonMetricGrid,
} from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';
import { useState, useEffect, useCallback } from 'react';

import { api } from '../../lib/api';
import type {
  InsuranceFleetOverview, InsuranceFleetVehicle, InsurancePartnerSummary,
  InsuranceInquirySubmission, InsuranceInquiryResult, InsuranceDisclosureTemplate,
} from '../../lib/api';

// ─── Types & constants ────────────────────────────────────────

interface InsurancesViewProps {
  onNavigateToVehicleDocuments?: (vehicleId: string) => void;
}

const BTN_PRIMARY =
  'sq-3d-btn sq-3d-btn--primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50';
const BTN_SECONDARY =
  'sq-3d-btn sq-3d-btn--neutral inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold';
const INPUT_CLASS =
  'w-full rounded-lg border border-border/70 bg-card text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]';

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

function insuranceStatusTone(s: string): StatusTone {
  switch (s) {
    case 'ACTIVE': return 'success';
    case 'EXPIRING_SOON': return 'warning';
    case 'EXPIRED': return 'critical';
    case 'PENDING_INQUIRY': return 'info';
    default: return 'noData';
  }
}

function InsuranceStatusChip({ status }: { status: string }) {
  return (
    <StatusChip tone={insuranceStatusTone(status)} icon={statusIcon(status)}>
      {statusLabel(status)}
    </StatusChip>
  );
}

function inquiryStatusTone(status: string): StatusTone {
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'critical';
  return 'info';
}

function statusIcon(s: string) {
  switch (s) {
    case 'ACTIVE': return <Icon name="shield-check" className="w-4 h-4" />;
    case 'EXPIRING_SOON': return <Icon name="shield-alert" className="w-4 h-4" />;
    case 'EXPIRED': return <Icon name="shield-x" className="w-4 h-4" />;
    case 'PENDING_INQUIRY': return <Icon name="clock" className="w-4 h-4" />;
    default: return <Icon name="shield-question" className="w-4 h-4" />;
  }
}

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Component ────────────────────────────────────────────────

export function InsurancesView({ onNavigateToVehicleDocuments }: InsurancesViewProps) {
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

  // ═══════════════════════════════════════════════════════════
  // RENDER: FLEET OVERVIEW
  // ═══════════════════════════════════════════════════════════

  const renderOverview = () => {
    if (loadingOverview) {
      return <SkeletonMetricGrid count={6} />;
    }
    if (!overview) {
      return (
        <EmptyState
          icon={<Icon name="alert-circle" className="w-5 h-5" />}
          title="Failed to load fleet insurance data"
          action={
            <button type="button" onClick={loadOverview} className={BTN_SECONDARY}>
              <Icon name="refresh-cw" className="w-4 h-4" /> Retry
            </button>
          }
        />
      );
    }
    const s = overview.summary;
    const metricCards: Array<{ label: string; value: number; icon: string; tone: StatusTone }> = [
      { label: 'Total Vehicles', value: s.total, icon: 'shield', tone: 'info' },
      { label: 'Insured', value: s.insured, icon: 'shield-check', tone: 'success' },
      { label: 'Expiring Soon', value: s.expiringSoon, icon: 'shield-alert', tone: 'warning' },
      { label: 'Expired', value: s.expired, icon: 'shield-x', tone: 'critical' },
      { label: 'Missing', value: s.missing, icon: 'shield-question', tone: 'noData' },
      { label: 'Pending Inquiries', value: s.pendingInquiry, icon: 'clock', tone: 'info' },
    ];
    return (
      <>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {metricCards.map((card) => (
            <MetricCard
              key={card.label}
              label={card.label}
              value={card.value}
              status={card.tone}
              icon={<Icon name={card.icon} className="w-4 h-4" />}
            />
          ))}
        </div>

        <DataCard className="mb-4 rounded-2xl shadow-[var(--shadow-1)]" bodyClassName="p-4">
          <div className="relative flex-1 min-w-[200px]">
            <Icon name="search" className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search vehicle, plate, VIN, insurer…"
              className={`${INPUT_CLASS} pl-10 pr-4 py-2`}
            />
          </div>

          {/* Filter dropdown */}
          <div className="relative">
            <button onClick={() => { setFilterOpen(!filterOpen); setSortOpen(false); }} className={BTN_SECONDARY}>
              <Icon name="filter" className="w-4 h-4" />
              {statusFilter === 'all' ? 'All Statuses' : statusLabel(statusFilter)}
              <Icon name="chevron-down" className="w-3.5 h-3.5" />
            </button>
            {filterOpen && (
              <div className={`absolute right-0 top-full mt-1 z-30 min-w-[180px] bg-card border border-border rounded-xl shadow-xl py-1`}>
                {(['all', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'MISSING', 'PENDING_INQUIRY'] as StatusFilter[]).map(f => (
                  <button key={f} onClick={() => { setStatusFilter(f); setFilterOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-muted/50 ${statusFilter === f ? 'text-[color:var(--brand)]' : 'text-foreground'} flex items-center gap-2`}>
                    {statusFilter === f && <Icon name="check" className="w-3.5 h-3.5" />}
                    {f === 'all' ? 'All Statuses' : statusLabel(f)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <button onClick={() => { setSortOpen(!sortOpen); setFilterOpen(false); }} className={BTN_SECONDARY}>
              <Icon name="arrow-up-down" className="w-4 h-4" />
              Sort
              <Icon name="chevron-down" className="w-3.5 h-3.5" />
            </button>
            {sortOpen && (
              <div className={`absolute right-0 top-full mt-1 z-30 min-w-[170px] bg-card border border-border rounded-xl shadow-xl py-1`}>
                {([['status', 'By Status'], ['expiry', 'By Expiry Date'], ['vehicle', 'By Vehicle']] as [SortKey, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => { setSortKey(k); setSortOpen(false); }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-muted/50 ${sortKey === k ? 'text-[color:var(--brand)]' : 'text-foreground'} flex items-center gap-2`}>
                    {sortKey === k && <Icon name="check" className="w-3.5 h-3.5" />}
                    {l}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => startInquiry()} className={BTN_PRIMARY}>
            <Icon name="plus" className="w-4 h-4" /> New Inquiry
          </button>
        </DataCard>

        <DataCard flush className="overflow-hidden rounded-2xl shadow-[var(--shadow-1)]">
          {filteredVehicles.length === 0 ? (
            <EmptyState
              compact
              icon={<Icon name="car" className="w-5 h-5" />}
              title="No vehicles match your filters"
            />
          ) : (
            <div className="divide-y divide-inherit" >
              {filteredVehicles.map(v => {
                const isMissing = v.status === 'MISSING';
                return (
                  <div key={v.vehicle.id} className={`px-5 py-4 hover:bg-muted/50 transition-colors`}>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      {/* Left: vehicle info */}
                      <div className="flex items-center gap-4 min-w-0 flex-1">
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${'bg-muted'}`}>
                          <Icon name="car" className={`w-5 h-5 text-muted-foreground`} />
                        </div>
                        <div className="min-w-0">
                          <div className={`font-semibold text-sm text-foreground truncate`}>
                            {v.vehicle.make} {v.vehicle.model} <span className="text-muted-foreground">({v.vehicle.year})</span>
                          </div>
                          <div className={`text-xs text-muted-foreground flex items-center gap-3 mt-0.5 flex-wrap`}>
                            {v.vehicle.licensePlate && <span className="flex items-center gap-1"><Icon name="map-pin" className="w-3 h-3" />{v.vehicle.licensePlate}</span>}
                            {v.vehicle.vin && <span className="font-mono truncate max-w-[140px]">{v.vehicle.vin}</span>}
                          </div>
                        </div>
                      </div>

                      {/* Center: insurance info */}
                      <div className="flex-1 min-w-[200px]">
                        <InsuranceStatusChip status={v.status} />
                        {v.insurance && !isMissing && (
                          <div className={`mt-2 text-xs text-muted-foreground space-y-0.5`}>
                            {v.insurance.insurerName && (
                              <div className="flex items-center gap-1.5"><Icon name="building-2" className="w-3 h-3" /> {v.insurance.insurerName}</div>
                            )}
                            {v.insurance.policyNumber && (
                              <div className="flex items-center gap-1.5"><Icon name="file-text" className="w-3 h-3" /> {v.insurance.policyNumber}</div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <Icon name="calendar" className="w-3 h-3" />
                              {fmtDate(v.insurance.validFrom)} — {fmtDate(v.insurance.validUntil)}
                            </div>
                          </div>
                        )}
                        {isMissing && (
                          <div className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${'sq-tone-critical border border-border'}`}>
                            <Icon name="alert-circle" className="w-3.5 h-3.5 flex-shrink-0" />
                            No insurance document stored for this vehicle.
                          </div>
                        )}
                      </div>

                      {/* Right: actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isMissing && onNavigateToVehicleDocuments && (
                          <button onClick={() => onNavigateToVehicleDocuments(v.vehicle.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${'sq-tone-watch border border-border hover:opacity-90'}`}>
                            <Icon name="file-text" className="w-3.5 h-3.5" /> Upload Insurance
                          </button>
                        )}
                        <button type="button" onClick={() => openDetail(v)} className={`${BTN_SECONDARY} px-3 py-1.5 text-xs`}>
                          <Icon name="eye" className="w-3.5 h-3.5" /> Detail
                        </button>
                        <button type="button" onClick={() => startInquiry(v)} className={`${BTN_PRIMARY} px-3 py-1.5 text-xs`}>
                          <Icon name="send" className="w-3.5 h-3.5" /> Inquiry
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DataCard>
      </>
    );
  };

  // ═══════════════════════════════════════════════════════════
  // RENDER: INQUIRY WIZARD STEPPER
  // ═══════════════════════════════════════════════════════════

  const renderStepper = () => (
    <div className={`bg-card border border-border rounded-xl p-5 mb-6 overflow-x-auto`}>
      <div className="flex items-center justify-between min-w-[640px]">
        {STEP_LABELS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          const circleBase = 'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all';
          const circleClass = done
            ? `${circleBase} bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25`
            : active
            ? `${circleBase} bg-gradient-to-r from-indigo-600 to-violet-600 text-white ring-4 ${'ring-[color:var(--brand-soft)]'}`
            : `${circleBase} ${'bg-muted text-muted-foreground'}`;
          const lineClass = done
            ? 'flex-1 h-0.5 bg-gradient-to-r from-indigo-600 to-violet-600 mx-2'
            : `flex-1 h-0.5 mx-2 ${'bg-muted'}`;
          return (
            <div key={i} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center gap-1">
                <div className={circleClass}>{done ? <Icon name="check" className="w-4 h-4" /> : i + 1}</div>
                <span className={`text-[10px] whitespace-nowrap ${active ? ('text-[color:var(--brand)]') : done ? ('text-[color:var(--brand)]') : 'text-muted-foreground'}`}>
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
        <h3 className={`text-lg font-semibold text-foreground mb-1`}>Select a Vehicle</h3>
        <p className={`text-sm text-muted-foreground mb-4`}>Choose the vehicle you want to request insurance for.</p>
        <div className="relative mb-4">
          <Icon name="search" className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
          <input value={vehicleSearch} onChange={e => setVehicleSearch(e.target.value)} placeholder="Search vehicles…"
            className={`w-full pl-10 pr-4 py-2.5 rounded-lg text-sm bg-card border border-border/70 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/40`}
          />
        </div>
        <div className="grid gap-2 max-h-[420px] overflow-y-auto pr-1">
          {filtered.map(v => {
            const sel = selectedVehicle?.vehicle.id === v.vehicle.id;
            return (
              <button key={v.vehicle.id} onClick={() => setSelectedVehicle(v)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-4
                  ${sel
                    ? `border-brand ${'bg-[color:var(--brand-soft)]'} ring-2 ring-brand/30`
                    : `border-border border ${'bg-card hover:bg-muted/40'}`}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${sel ? ('bg-[color:var(--brand-soft)]') : ('bg-muted')}`}>
                  <Icon name="car" className={`w-5 h-5 ${sel ? 'text-status-info' : 'text-muted-foreground'}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className={`text-sm font-medium text-foreground`}>{v.vehicle.make} {v.vehicle.model} ({v.vehicle.year})</div>
                  <div className={`text-xs text-muted-foreground flex gap-3`}>
                    {v.vehicle.licensePlate && <span>{v.vehicle.licensePlate}</span>}
                    {v.vehicle.vin && <span className="font-mono truncate max-w-[120px]">{v.vehicle.vin}</span>}
                  </div>
                </div>
                <InsuranceStatusChip status={v.status} />
                {sel && <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center flex-shrink-0"><Icon name="check" className="w-3.5 h-3.5 text-white" /></div>}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className={`text-center py-10 text-muted-foreground text-sm`}>No vehicles found.</div>
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
          <Icon name="loader-2" className={`w-6 h-6 animate-spin text-muted-foreground`} />
        </div>
      );
    }
    return (
      <div>
        <h3 className={`text-lg font-semibold text-foreground mb-1`}>Select Insurance Partners</h3>
        <p className={`text-sm text-muted-foreground mb-4`}>Choose one or more insurers to receive your inquiry.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {partners.map(p => {
            const sel = selectedInsurerIds.has(p.id);
            return (
              <button key={p.id} onClick={() => setSelectedInsurerIds(prev => toggleSet(prev, p.id))}
                className={`text-left p-4 rounded-xl border transition-all
                  ${sel
                    ? `border-brand ${'bg-[color:var(--brand-soft)]'} ring-2 ring-brand/30`
                    : `border-border border ${'bg-card hover:bg-muted/40'}`}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold text-sm text-foreground flex items-center gap-2`}>
                      <Icon name="building-2" className="w-4 h-4 flex-shrink-0" />
                      {p.displayName}
                    </div>
                    {p.description && <div className={`text-xs text-muted-foreground mt-1 line-clamp-2`}>{p.description}</div>}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {p.supportsUsageBased && <span className={`text-[10px] px-1.5 py-0.5 rounded ${'sq-tone-ai'}`}>Usage-Based</span>}
                      {p.supportsKilometerBased && <span className={`text-[10px] px-1.5 py-0.5 rounded ${'sq-tone-info'}`}>Km-Based</span>}
                      {p.supportsDrivingScoreBased && <span className={`text-[10px] px-1.5 py-0.5 rounded ${'sq-tone-success'}`}>Score-Based</span>}
                      {p.supportsDynamicInsurance && <span className={`text-[10px] px-1.5 py-0.5 rounded ${'sq-tone-watch'}`}>Dynamic</span>}
                    </div>
                    <div className={`text-[10px] text-muted-foreground mt-2`}>
                      Channel: {p.communicationChannel} · Models: {p.supportedInsuranceModels.join(', ') || '—'}
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all
                    ${sel ? 'bg-brand border-brand' : `${'border-border'}`}`}>
                    {sel && <Icon name="check" className="w-3.5 h-3.5 text-white" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        {partners.length === 0 && (
          <div className={`text-center py-10 text-muted-foreground text-sm`}>No insurance partners available.</div>
        )}
      </div>
    );
  };

  // ── Step 2: Inquiry Purpose ─────────────────────────────────

  const renderStepPurpose = () => (
    <div>
      <h3 className={`text-lg font-semibold text-foreground mb-1`}>Inquiry Purpose</h3>
      <p className={`text-sm text-muted-foreground mb-4`}>Select the type of insurance inquiry you want to send.</p>
      <div className="grid gap-2">
        {INQUIRY_PURPOSE_OPTIONS.map(opt => {
          const sel = inquiryPurpose === opt.value;
          return (
            <button key={opt.value} onClick={() => setInquiryPurpose(opt.value)}
              className={`text-left p-4 rounded-xl border transition-all flex items-center gap-4
                ${sel
                  ? `border-brand ${'bg-[color:var(--brand-soft)]'} ring-2 ring-brand/30`
                  : `border-border border ${'bg-card hover:bg-muted/40'}`}`}>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
                ${sel ? 'border-brand bg-brand' : ('border-border')}`}>
                {sel && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div>
                <div className={`text-sm font-medium text-foreground`}>{opt.label}</div>
                <div className={`text-xs text-muted-foreground mt-0.5`}>{opt.desc}</div>
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
      <h3 className={`text-lg font-semibold text-foreground mb-1`}>Historical Data Selection</h3>
      <p className={`text-sm text-muted-foreground mb-4`}>Select which historical data categories to include with this inquiry.</p>
      <div className="space-y-5">
        {HISTORICAL_DATA_GROUPS.map(group => (
          <div key={group.label}>
            <h4 className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2`}>{group.label}</h4>
            <div className="grid gap-2 md:grid-cols-2">
              {group.items.map(item => {
                const sel = selectedHistorical.has(item.key);
                const accepted = partners.length > 0 ? partners.some(p => selectedInsurerIds.has(p.id) && p.acceptedHistoricalData.includes(item.key)) : true;
                return (
                  <button key={item.key} onClick={() => setSelectedHistorical(prev => toggleSet(prev, item.key))}
                    className={`text-left p-3 rounded-xl border transition-all flex items-start gap-3
                      ${sel
                        ? `border-brand ${'bg-[color:var(--brand-soft)]'} ring-1 ring-brand/30`
                        : `border-border border ${'bg-card hover:bg-muted/40'}`}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all
                      ${sel ? 'bg-brand border-brand' : ('border-border')}`}>
                      {sel && <Icon name="check" className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium text-foreground`}>{item.label}</span>
                        {accepted && <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${'sq-tone-success'}`}>Available</span>}
                      </div>
                      <div className={`text-xs text-muted-foreground mt-0.5`}>{item.desc}</div>
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
      <h3 className={`text-lg font-semibold text-foreground mb-1`}>Time Range</h3>
      <p className={`text-sm text-muted-foreground mb-4`}>Select the time period for the historical data to share.</p>
      <div className="grid gap-2 max-w-lg">
        {TIME_RANGE_OPTIONS.map(opt => {
          const sel = timeRange === opt.value;
          return (
            <button key={opt.value} onClick={() => setTimeRange(opt.value)}
              className={`text-left p-4 rounded-xl border transition-all flex items-center gap-4
                ${sel
                  ? `border-brand ${'bg-[color:var(--brand-soft)]'} ring-2 ring-brand/30`
                  : `border-border border ${'bg-card hover:bg-muted/40'}`}`}>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
                ${sel ? 'border-brand bg-brand' : ('border-border')}`}>
                {sel && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex items-center gap-2">
                <Icon name="calendar" className={`w-4 h-4 ${sel ? 'text-[color:var(--brand)]' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-medium text-foreground`}>{opt.label}</span>
              </div>
            </button>
          );
        })}
      </div>
      {timeRange === 'custom' && (
        <div className="flex items-center gap-3 mt-4 max-w-lg">
          <div className="flex-1">
            <label className={`text-xs font-medium text-muted-foreground mb-1 block`}>From</label>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg text-sm bg-card border border-border/70 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/40`} />
          </div>
          <div className={`mt-5 text-muted-foreground`}>—</div>
          <div className="flex-1">
            <label className={`text-xs font-medium text-muted-foreground mb-1 block`}>To</label>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg text-sm bg-card border border-border/70 text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/40`} />
          </div>
        </div>
      )}
    </div>
  );

  // ── Step 5: Live Data Sharing ───────────────────────────────

  const renderStepLiveData = () => (
    <div>
      <h3 className={`text-lg font-semibold text-foreground mb-1`}>Live Data Sharing</h3>
      <p className={`text-sm text-muted-foreground mb-2`}>Select ongoing data categories to share with insurers.</p>
      <div className={`p-3 rounded-lg mb-4 flex items-start gap-2 text-xs ${'sq-tone-watch border border-border'}`}>
        <Icon name="info" className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>You are authorizing ongoing sharing of these data categories with the selected insurance partners. You can revoke sharing permissions at any time from the vehicle detail view.</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 mb-6">
        {LIVE_DATA_OPTIONS.map(opt => {
          const sel = selectedLiveData.has(opt.key);
          return (
            <button key={opt.key} onClick={() => setSelectedLiveData(prev => toggleSet(prev, opt.key))}
              className={`text-left p-3 rounded-xl border transition-all flex items-start gap-3
                ${sel
                  ? `border-brand ${'bg-[color:var(--brand-soft)]'} ring-1 ring-brand/30`
                  : `border-border border ${'bg-card hover:bg-muted/40'}`}`}>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all
                ${sel ? 'bg-brand border-brand' : ('border-border')}`}>
                {sel && <Icon name="check" className="w-3 h-3 text-white" />}
              </div>
              <div>
                <div className={`text-sm font-medium text-foreground`}>{opt.label}</div>
                <div className={`text-xs text-muted-foreground mt-0.5`}>{opt.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Frequency & aggregation */}
      <div className="grid gap-4 md:grid-cols-2 max-w-xl">
        <div>
          <label className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block`}>Reporting Frequency</label>
          <div className="flex gap-2">
            {(['daily', 'weekly', 'monthly'] as const).map(f => (
              <button key={f} onClick={() => setReportingFrequency(f)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all border
                  ${reportingFrequency === f
                    ? `${BTN_PRIMARY} border-transparent`
                    : `${BTN_SECONDARY}`}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={`text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block`}>Aggregation Level</label>
          <div className="flex gap-2">
            {(['aggregated', 'detailed'] as const).map(l => (
              <button key={l} onClick={() => setAggregationLevel(l)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all border
                  ${aggregationLevel === l
                    ? `${BTN_PRIMARY} border-transparent`
                    : `${BTN_SECONDARY}`}`}>
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
      <div className={`bg-card border border-border rounded-xl p-4`}>
        <div className={`flex items-center gap-2 mb-3 text-sm font-semibold text-foreground`}>{icon}{title}</div>
        {children}
      </div>
    );

    return (
      <div>
        <h3 className={`text-lg font-semibold text-foreground mb-1`}>Review Your Inquiry</h3>
        <p className={`text-sm text-muted-foreground mb-4`}>Review all selections before submitting to insurers.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <SectionCard title="Vehicle" icon={<Icon name="car" className="w-4 h-4 text-status-info" />}>
            {selectedVehicle && (
              <div className={`text-sm text-foreground`}>
                <div className="font-medium">{selectedVehicle.vehicle.make} {selectedVehicle.vehicle.model} ({selectedVehicle.vehicle.year})</div>
                <div className={`text-xs text-muted-foreground mt-1`}>
                  {selectedVehicle.vehicle.licensePlate && <span className="mr-3">{selectedVehicle.vehicle.licensePlate}</span>}
                  {selectedVehicle.vehicle.vin && <span className="font-mono">{selectedVehicle.vehicle.vin}</span>}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Insurance Partners" icon={<Icon name="building-2" className="w-4 h-4 text-status-info" />}>
            <div className="flex flex-wrap gap-1.5">
              {selectedPartners.map(p => (
                <span key={p.id} className={`text-xs px-2 py-1 rounded-full ${'sq-tone-brand'}`}>
                  {p.displayName}
                </span>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Purpose" icon={<Icon name="target" className="w-4 h-4 text-status-info" />}>
            <div className={`text-sm text-foreground`}>{purposeLabel}</div>
          </SectionCard>

          <SectionCard title="Time Range" icon={<Icon name="calendar" className="w-4 h-4 text-status-info" />}>
            <div className={`text-sm text-foreground`}>
              {timeRange === 'custom' ? `${fmtDate(customFrom)} — ${fmtDate(customTo)}` : rangeLabel}
            </div>
          </SectionCard>

          <SectionCard title="Historical Data" icon={<Icon name="bar-chart-3" className="w-4 h-4 text-status-info" />}>
            <div className="flex flex-wrap gap-1.5">
              {historicalLabels.map(l => (
                <span key={l} className={`text-xs px-2 py-1 rounded-full ${'sq-tone-neutral'}`}>{l}</span>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Live Data Sharing" icon={<Icon name="activity" className="w-4 h-4 text-status-info" />}>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {liveLabels.map(l => (
                <span key={l} className={`text-xs px-2 py-1 rounded-full ${'sq-tone-neutral'}`}>{l}</span>
              ))}
            </div>
            <div className={`text-xs text-muted-foreground`}>Frequency: {reportingFrequency} · Level: {aggregationLevel}</div>
          </SectionCard>
        </div>

        {/* Disclosure */}
        {loadingDisclosure ? (
          <div className="flex items-center gap-2 mt-4"><Icon name="loader-2" className={`w-4 h-4 animate-spin text-muted-foreground`} /><span className={`text-sm text-muted-foreground`}>Loading disclosure…</span></div>
        ) : disclosure && (
          <div className={`mt-4 p-4 rounded-xl border ${'bg-muted/40 border border-border'}`}>
            <div className={`flex items-center gap-2 text-sm font-semibold text-foreground mb-2`}>
              <Icon name="file-text" className="w-4 h-4 text-status-info" />
              Data Disclosure Notice
            </div>
            <div className={`text-xs leading-relaxed text-muted-foreground`}>{disclosure.body}</div>
            <div className={`text-[10px] mt-2 text-muted-foreground`}>Version {disclosure.version} · Effective {fmtDate(disclosure.effectiveFrom)}</div>
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
            <div className={`w-16 h-16 rounded-full ${'sq-tone-brand'} flex items-center justify-center`}>
              <Icon name="loader-2" className="w-8 h-8 animate-spin text-status-info" />
            </div>
          </div>
          <div className={`text-lg font-semibold text-foreground`}>Submitting Inquiry…</div>
          <p className={`text-sm text-muted-foreground text-center max-w-md`}>Sending your insurance inquiry to the selected partners. This may take a moment.</p>
        </div>
      );
    }
    if (!submitResult) {
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className={`w-16 h-16 rounded-full ${'sq-tone-critical'} flex items-center justify-center`}>
            <Icon name="alert-circle" className="w-8 h-8 text-red-500" />
          </div>
          <div className={`text-lg font-semibold text-foreground`}>Submission Failed</div>
          <p className={`text-sm text-muted-foreground`}>Something went wrong. Please try again.</p>
          <button onClick={() => setStep(6)} className={`${BTN_SECONDARY} px-4 py-2 rounded-lg text-sm`}>Back to Review</button>
        </div>
      );
    }

    const allOk = submitResult.recipients.every(r => r.success);
    return (
      <div>
        <div className="flex flex-col items-center py-8 gap-3">
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${allOk ? ('sq-tone-success') : ('sq-tone-watch')}`}>
            {allOk ? <Icon name="shield-check" className="w-8 h-8 text-emerald-500" /> : <Icon name="shield-alert" className="w-8 h-8 text-amber-500" />}
          </div>
          <div className={`text-lg font-semibold text-foreground`}>{allOk ? 'Inquiry Submitted Successfully' : 'Inquiry Partially Submitted'}</div>
          <p className={`text-sm text-muted-foreground text-center max-w-md`}>
            {allOk
              ? 'Your inquiry has been sent to all selected insurance partners.'
              : 'Some partners could not be reached. See details below.'}
          </p>
          <div className={`text-xs font-mono text-muted-foreground`}>ID: {submitResult.inquiryId}</div>
        </div>

        <div className="grid gap-3 max-w-lg mx-auto">
          {submitResult.recipients.map((r, i) => (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${r.success
              ? ('sq-tone-success border border-border')
              : ('sq-tone-critical border border-border')}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${r.success ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
                {r.success ? <Icon name="check" className="w-4 h-4 text-emerald-400" /> : <Icon name="x" className="w-4 h-4 text-red-400" />}
              </div>
              <div className="flex-1">
                <div className={`text-sm font-medium text-foreground`}>{r.insurerName}</div>
                {r.message && <div className={`text-xs text-muted-foreground mt-0.5`}>{r.message}</div>}
              </div>
              <span className={`text-xs font-medium ${r.success ? 'text-emerald-400' : 'text-red-400'}`}>
                {r.success ? 'Sent' : 'Failed'}
              </span>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-3 mt-8">
          <button onClick={() => { setMainView('overview'); loadOverview(); }} className={`${BTN_SECONDARY} px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2`}>
            <Icon name="chevron-left" className="w-4 h-4" /> Back to Overview
          </button>
          <button onClick={() => startInquiry()} className={`${BTN_PRIMARY} px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2`}>
            <Icon name="plus" className="w-4 h-4" /> New Inquiry
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
      <div className={`bg-card border border-border rounded-xl p-6`}>
        {renderCurrentStep()}
      </div>
      {step < 7 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => { if (step === 0) { setMainView('overview'); } else { setStep(s => s - 1); } }}
            className={`${BTN_SECONDARY} px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2`}>
            <Icon name="chevron-left" className="w-4 h-4" />
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          {step === 6 ? (
            <button onClick={handleSubmit} disabled={submitting}
              className={`${BTN_PRIMARY} px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50`}>
              {submitting ? <Icon name="loader-2" className="w-4 h-4 animate-spin" /> : <Icon name="send" className="w-4 h-4" />}
              Submit Inquiry
            </button>
          ) : (
            <button onClick={handleNext} disabled={!canAdvance()}
              className={`${BTN_PRIMARY} px-5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}>
              Next <Icon name="chevron-right" className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </>
  );

  const detailContent = detailVehicle ? (() => {
    const v = detailVehicle;
    const isMissing = v.status === 'MISSING';
    if (detailLoading) {
      return (
        <div className="flex items-center justify-center py-16">
          <Icon name="loader-2" className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <DataCard title="Vehicle Summary" bodyClassName="p-4">
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
            <div className="text-muted-foreground">Make / Model</div>
            <div className="text-foreground">{v.vehicle.make} {v.vehicle.model}</div>
            <div className="text-muted-foreground">Year</div>
            <div className="text-foreground">{v.vehicle.year}</div>
            <div className="text-muted-foreground">Plate</div>
            <div className="text-foreground">{v.vehicle.licensePlate ?? '—'}</div>
            <div className="text-muted-foreground">VIN</div>
            <div className="font-mono text-xs text-foreground">{v.vehicle.vin ?? '—'}</div>
            <div className="text-muted-foreground">Fuel</div>
            <div className="text-foreground">{v.vehicle.fuelType ?? '—'}</div>
            {v.vehicle.mileageKm != null && (
              <>
                <div className="text-muted-foreground">Mileage</div>
                <div className="text-foreground">{v.vehicle.mileageKm.toLocaleString()} km</div>
              </>
            )}
          </div>
        </DataCard>

        <DataCard title="Insurance Record" bodyClassName="p-4">
          {v.insurance && !isMissing ? (
            <div className="space-y-2 text-sm">
              <InsuranceStatusChip status={v.status} />
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 pt-2">
                <div className="text-muted-foreground">Insurer</div>
                <div className="text-foreground">{v.insurance.insurerName ?? '—'}</div>
                <div className="text-muted-foreground">Policy #</div>
                <div className="font-mono text-xs text-foreground">{v.insurance.policyNumber ?? '—'}</div>
                <div className="text-muted-foreground">Type</div>
                <div className="text-foreground">{v.insurance.insuranceType ?? '—'}</div>
                <div className="text-muted-foreground">Valid From</div>
                <div className="text-foreground">{fmtDate(v.insurance.validFrom)}</div>
                <div className="text-muted-foreground">Valid Until</div>
                <div className="text-foreground">{fmtDate(v.insurance.validUntil)}</div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="sq-tone-critical flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium">
                <Icon name="alert-circle" className="h-4 w-4 shrink-0" />
                No insurance record on file.
              </div>
              {onNavigateToVehicleDocuments && (
                <button
                  type="button"
                  onClick={() => { onNavigateToVehicleDocuments(v.vehicle.id); setDetailVehicle(null); }}
                  className={`${BTN_PRIMARY} w-full`}
                >
                  <Icon name="file-text" className="w-4 h-4" /> Upload Insurance Document
                </button>
              )}
            </div>
          )}
        </DataCard>

        <DataCard title="Recent Inquiries" bodyClassName="p-4">
          {detailInquiries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No inquiries for this vehicle.</p>
          ) : (
            <div className="space-y-2">
              {detailInquiries.slice(0, 5).map((inq: { id: string; inquiryType?: string; createdAt?: string; status?: string }) => (
                <div key={inq.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-2.5">
                  <div>
                    <div className="text-sm font-medium text-foreground">{inq.inquiryType?.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(inq.createdAt ?? null)}</div>
                  </div>
                  <StatusChip tone={inquiryStatusTone(inq.status ?? '')}>{inq.status}</StatusChip>
                </div>
              ))}
            </div>
          )}
        </DataCard>

        <DataCard title="Active Live Sharing" bodyClassName="p-4">
          {detailLiveSharing.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active live data sharing permissions.</p>
          ) : (
            <div className="space-y-2">
              {detailLiveSharing.map((ls: { id: string; insurer?: { displayName?: string }; status?: string; validFrom?: string; reportingFrequency?: string }) => (
                <div key={ls.id} className="rounded-lg border border-border bg-card p-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-foreground">{ls.insurer?.displayName ?? '—'}</div>
                    <StatusChip tone={ls.status === 'active' ? 'success' : 'neutral'}>{ls.status}</StatusChip>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Since {fmtDate(ls.validFrom ?? null)} · {ls.reportingFrequency ?? 'N/A'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DataCard>
      </div>
    );
  })() : null;

  // ═══════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="min-h-full bg-background p-6">
      <PageHeader
        title="Fleet Insurance"
        icon={<Icon name="shield" className="w-4 h-4 text-[color:var(--brand)]" />}
        actions={
          mainView === 'overview' ? (
            <button type="button" onClick={loadOverview} className={BTN_SECONDARY}>
              <Icon name="refresh-cw" className={`w-4 h-4 ${loadingOverview ? 'animate-spin' : ''}`} /> Refresh
            </button>
          ) : undefined
        }
      />

      {/* View tabs */}
      <div className={`flex items-center gap-1 mb-6 p-1 rounded-xl ${'bg-muted'} w-fit`}>
        <button onClick={() => setMainView('overview')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mainView === 'overview'
              ? `${'bg-card text-foreground shadow-[var(--shadow-1)]'}`
              : 'text-muted-foreground hover:text-foreground'
          }`}>
          <span className="flex items-center gap-2"><Icon name="shield" className="w-4 h-4" /> Overview</span>
        </button>
        <button onClick={() => startInquiry()}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            mainView === 'inquiry'
              ? `${'bg-card text-foreground shadow-[var(--shadow-1)]'}`
              : 'text-muted-foreground hover:text-foreground'
          }`}>
          <span className="flex items-center gap-2"><Icon name="send" className="w-4 h-4" /> New Inquiry</span>
        </button>
      </div>

      {/* Active view */}
      {mainView === 'overview' ? renderOverview() : renderInquiry()}

      <DetailDrawer
        open={!!detailVehicle}
        onOpenChange={(open) => { if (!open) setDetailVehicle(null); }}
        title={detailVehicle ? `${detailVehicle.vehicle.make} ${detailVehicle.vehicle.model}` : ''}
        description={detailVehicle ? `${detailVehicle.vehicle.year} · ${detailVehicle.vehicle.licensePlate ?? '—'}` : undefined}
        status={detailVehicle ? <InsuranceStatusChip status={detailVehicle.status} /> : undefined}
        footer={
          detailVehicle && !detailLoading ? (
            <button
              type="button"
              onClick={() => { const v = detailVehicle; setDetailVehicle(null); startInquiry(v); }}
              className={BTN_PRIMARY}
            >
              <Icon name="send" className="w-4 h-4" /> Send Insurance Inquiry
            </button>
          ) : undefined
        }
      >
        {detailContent}
      </DetailDrawer>
    </div>
  );
}

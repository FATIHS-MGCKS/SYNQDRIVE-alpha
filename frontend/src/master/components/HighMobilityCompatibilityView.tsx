import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Zap,
  Calendar,
  Info,
  Link2,
  RotateCcw,
  Wrench,
  HelpCircle,
} from 'lucide-react';
import { api } from '../../lib/api';
import type {
  HmAppCoverageSummary,
  HmCompatibilityAppStatus,
  HmCompatibilityBrandOption,
  HmCompatibilityCheckResponse,
  HmCompatibilityConfidence,
  HmCompatibilityEligibilityMode,
  HmCompatibilityModelOption,
  HmCompatibilityOnboardingMode,
  HmCompatibilityOverall,
  HmSignalCoverage,
  HmSignalCoverageItem,
} from '../../lib/api';

interface Props { isDarkMode: boolean }

// ── Badge config (aligned with HighMobilityDataView pill pattern) ───────────

const APP_STATUS_CONFIG: Record<HmCompatibilityAppStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  SUPPORTED:       { label: 'Supported',           color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', icon: CheckCircle2 },
  PARTIAL:         { label: 'Partially Supported', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',        icon: AlertTriangle },
  NOT_RECOMMENDED: { label: 'Not Recommended',     color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',                 icon: XCircle },
};

const OVERALL_CONFIG: Record<HmCompatibilityOverall, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  GOOD:    { label: 'Good',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', icon: CheckCircle2 },
  LIMITED: { label: 'Limited', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',         icon: AlertTriangle },
  WEAK:    { label: 'Weak',    color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',                 icon: XCircle },
};

const ELIGIBILITY_CONFIG: Record<HmCompatibilityEligibilityMode, { label: string; color: string }> = {
  AVAILABLE:       { label: 'Available',       color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  NOT_AVAILABLE:   { label: 'Not Available',   color: 'bg-muted text-muted-foreground' },
  SUPPORT_REQUEST: { label: 'Support Request', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
  VIN_DEPENDENT:   { label: 'VIN Dependent',   color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400' },
};

const ONBOARDING_CONFIG: Record<HmCompatibilityOnboardingMode, { label: string; color: string }> = {
  PRECHECK_CONNECT: { label: 'Precheck + Connect', color: 'bg-status-info-soft text-status-info dark:bg-status-info-soft dark:text-status-info' },
  DIRECT_CONNECT:   { label: 'Direct Connect',     color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400' },
  MANUAL_REVIEW:    { label: 'Manual Review',      color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' },
};

const CONFIDENCE_CONFIG: Record<HmCompatibilityConfidence, { label: string; color: string }> = {
  HIGH:   { label: 'High',   color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' },
  MEDIUM: { label: 'Medium', color: 'bg-status-info-soft text-status-info dark:bg-status-info-soft dark:text-status-info' },
  LOW:    { label: 'Low',    color: 'bg-muted text-muted-foreground' },
};

const COVERAGE_CONFIG: Record<HmSignalCoverage, { label: string; color: string; dot: string }> = {
  CONFIRMED:  { label: 'Confirmed',  color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400', dot: 'bg-emerald-500' },
  EXPECTED:   { label: 'Expected',   color: 'bg-status-info-soft text-status-info dark:bg-status-info-soft dark:text-status-info',               dot: 'bg-status-info' },
  UNVERIFIED: { label: 'Unverified', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',           dot: 'bg-amber-500' },
  MISSING:    { label: 'Missing',    color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',                   dot: 'bg-red-500' },
};

// ── Badge primitives ────────────────────────────────────────────────────────

function Pill({ label, color, icon: Icon }: { label: string; color: string; icon?: typeof CheckCircle2 }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${color}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </span>
  );
}

function AppStatusPill({ status }: { status: HmCompatibilityAppStatus }) {
  const cfg = APP_STATUS_CONFIG[status];
  return <Pill label={cfg.label} color={cfg.color} icon={cfg.icon} />;
}

function OverallPill({ status }: { status: HmCompatibilityOverall }) {
  const cfg = OVERALL_CONFIG[status];
  return <Pill label={cfg.label} color={cfg.color} icon={cfg.icon} />;
}

function EligibilityPill({ mode }: { mode: HmCompatibilityEligibilityMode }) {
  const cfg = ELIGIBILITY_CONFIG[mode];
  return <Pill label={cfg.label} color={cfg.color} />;
}

function OnboardingPill({ mode }: { mode: HmCompatibilityOnboardingMode }) {
  const cfg = ONBOARDING_CONFIG[mode];
  return <Pill label={cfg.label} color={cfg.color} />;
}

function ConfidencePill({ level }: { level: HmCompatibilityConfidence }) {
  const cfg = CONFIDENCE_CONFIG[level];
  return <Pill label={cfg.label} color={cfg.color} />;
}

function CoveragePill({ coverage }: { coverage: HmSignalCoverage }) {
  const cfg = COVERAGE_CONFIG[coverage];
  return <Pill label={cfg.label} color={cfg.color} />;
}

// ── Card helpers ────────────────────────────────────────────────────────────

function card(isDark: boolean): string {
  return `rounded-xl border ${isDark ? 'bg-card border-border' : 'bg-card border-border'}`;
}

function cardHeader(title: string, subtitle: string | null, icon: typeof ShieldCheck, accent: string) {
  const Icon = icon;
  return (
    <div className="flex items-start gap-3 px-5 py-4 border-b border-border/50">
      <div className={`p-1.5 rounded-lg ${accent}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Debounce hook ───────────────────────────────────────────────────────────

function useDebounced<T extends (...args: any[]) => void>(fn: T, delayMs: number): T {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    ((...args: Parameters<T>) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), delayMs);
    }) as T,
    [fn, delayMs],
  );
}

// ── Lookup form ─────────────────────────────────────────────────────────────

interface LookupFormProps {
  isDarkMode: boolean;
  brands: HmCompatibilityBrandOption[];
  models: HmCompatibilityModelOption[];
  brandsLoading: boolean;
  modelsLoading: boolean;
  onSelectBrand: (brand: string) => void;
  onRun: (brand: string, model: string, year: number | null) => void;
  loading: boolean;
  initialBrand?: string;
  initialModel?: string;
  initialYear?: number | null;
}

function LookupForm({
  isDarkMode,
  brands,
  models,
  brandsLoading,
  modelsLoading,
  onSelectBrand,
  onRun,
  loading,
  initialBrand,
  initialModel,
  initialYear,
}: LookupFormProps) {
  const [brand, setBrand] = useState(initialBrand ?? '');
  const [model, setModel] = useState(initialModel ?? '');
  const [year, setYear] = useState<string>(initialYear != null ? String(initialYear) : '');

  // Reset model when brand changes.
  useEffect(() => {
    onSelectBrand(brand);
  }, [brand, onSelectBrand]);

  const inputBg = isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200';
  const labelCls = 'text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block';

  const canRun = brand.trim().length > 0 && model.trim().length > 0;

  const submit = () => {
    if (!canRun || loading) return;
    const yearNum = year.trim() ? Number.parseInt(year.trim(), 10) : null;
    onRun(brand.trim(), model.trim(), Number.isFinite(yearNum as number) ? (yearNum as number) : null);
  };

  return (
    <div className={card(isDarkMode)}>
      {cardHeader(
        'Lookup',
        'Check HM compatibility for brand, model, and model year',
        Search,
        isDarkMode ? 'bg-status-info-soft text-status-info' : 'bg-status-info-soft text-status-info',
      )}
      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Brand</label>
            <select
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                setModel('');
              }}
              className={`w-full px-3 py-2 rounded-lg border text-sm ${inputBg}`}
              disabled={brandsLoading}
            >
              <option value="">{brandsLoading ? 'Loading brands…' : 'Select brand…'}</option>
              {brands.map((b) => (
                <option key={b.brand} value={b.brand}>
                  {b.displayName} ({b.modelCount})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border text-sm ${inputBg}`}
              disabled={!brand || modelsLoading}
            >
              <option value="">
                {!brand ? 'Select brand first' : modelsLoading ? 'Loading models…' : 'Select model…'}
              </option>
              {models.map((m) => (
                <option key={m.model} value={m.model}>
                  {m.displayName}
                  {m.yearRange ? ` · ${m.yearRange}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Model Year (optional)</label>
            <input
              type="number"
              inputMode="numeric"
              min={1990}
              max={2099}
              step={1}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              placeholder="e.g. 2022"
              className={`w-full px-3 py-2 rounded-lg border text-sm ${inputBg}`}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={!canRun || loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-brand text-brand-foreground hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Check Compatibility
          </button>
          <p className="text-xs text-muted-foreground">
            Model year is optional — when omitted, the latest matching record is used.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Summary card ────────────────────────────────────────────────────────────

function SummaryCard({
  isDarkMode,
  data,
}: {
  isDarkMode: boolean;
  data: HmCompatibilityCheckResponse;
}) {
  const s = data.summary;
  const onb = data.onboarding;

  if (!s) {
    return (
      <div className={card(isDarkMode)}>
        {cardHeader(
          'No Compatibility Record',
          data.notFoundReason,
          HelpCircle,
          isDarkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-50 text-amber-600',
        )}
        <div className="px-5 py-4 space-y-3">
          <div className="text-sm text-muted-foreground">
            No curated compatibility entry exists for <span className="font-medium text-foreground">{data.lookup.brand}</span> <span className="font-medium text-foreground">{data.lookup.model}</span>
            {data.lookup.year != null && <> (MY {data.lookup.year})</>}.
          </div>
          {onb && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Fallback onboarding recommendation:</span>
              <EligibilityPill mode={onb.eligibilityMode} />
              <OnboardingPill mode={onb.onboardingMode} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const range = (() => {
    if (s.modelYearFrom == null && s.modelYearTo == null) return s.supportFromText ?? '—';
    if (s.modelYearFrom != null && s.modelYearTo == null) return `MY ${s.modelYearFrom}+`;
    if (s.modelYearFrom == null && s.modelYearTo != null) return `bis MY ${s.modelYearTo}`;
    if (s.modelYearFrom === s.modelYearTo) return `MY ${s.modelYearFrom}`;
    return `MY ${s.modelYearFrom}–${s.modelYearTo}`;
  })();

  return (
    <div className={card(isDarkMode)}>
      {cardHeader(
        'Compatibility Summary',
        s.overallNotes,
        ShieldCheck,
        isDarkMode ? 'bg-status-info-soft text-status-info' : 'bg-status-info-soft text-status-info',
      )}
      <div className="px-5 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Brand" value={s.brandDisplayName} />
          <Stat label="Model" value={s.modelDisplayName} />
          <Stat label="Support" value={range} />
          <Stat
            label="Overall"
            valueSlot={<OverallPill status={s.overallStatus} />}
          />
        </div>
        {onb && (
          <div className="mt-4 pt-4 border-t border-border/50 flex items-center gap-3 flex-wrap">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Quick onboarding signals:
            </span>
            <EligibilityPill mode={onb.eligibilityMode} />
            <OnboardingPill mode={onb.onboardingMode} />
            {onb.oemPath === 'DIRECT_FLEET_CLEARANCE' && (
              <Pill label="VW / Porsche direct path" color="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, valueSlot }: { label: string; value?: string; valueSlot?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">
        {valueSlot ?? value ?? '—'}
      </div>
    </div>
  );
}

// ── App card (Health / Telemetry) ───────────────────────────────────────────

function AppCard({
  isDarkMode,
  kind,
  summary,
}: {
  isDarkMode: boolean;
  kind: 'HEALTH' | 'TELEMETRY';
  summary: HmAppCoverageSummary | null;
}) {
  const isHealth = kind === 'HEALTH';
  const title = isHealth ? 'Health APP' : 'Telemetry APP';
  const subtitle = isHealth
    ? 'Core health signals (odometer, energy, warnings, service)'
    : 'Location + trip-derivation signals (GPS, ignition, odometer)';
  const accent = isHealth
    ? (isDarkMode ? 'bg-teal-900/30 text-teal-400' : 'bg-teal-50 text-teal-600')
    : (isDarkMode ? 'bg-status-info-soft text-status-info' : 'bg-status-info-soft text-status-info');
  const Icon = isHealth ? Activity : Zap;

  if (!summary) {
    return (
      <div className={card(isDarkMode)}>
        {cardHeader(title, subtitle, Icon, accent)}
        <div className="px-5 py-6 text-sm text-muted-foreground text-center">
          No signal coverage data.
        </div>
      </div>
    );
  }

  const ratio = summary.totalRequired === 0 ? 0 : summary.coveredRequired / summary.totalRequired;
  const barColor = ratio >= 0.8 ? 'bg-emerald-500' : ratio >= 0.4 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className={card(isDarkMode)}>
      {cardHeader(title, subtitle, Icon, accent)}
      <div className="px-5 py-4 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <AppStatusPill status={summary.status} />
            <p className="text-xs text-muted-foreground max-w-md">{summary.reason}</p>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Required Coverage
            </div>
            <div className="text-lg font-bold tabular-nums">
              {summary.coveredRequired} / {summary.totalRequired}
            </div>
            <div className={`mt-1 h-1.5 w-28 rounded-full ${isDarkMode ? 'bg-card' : 'bg-gray-100'}`}>
              <div
                className={`h-full rounded-full ${barColor}`}
                style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }}
              />
            </div>
          </div>
        </div>

        <SignalCoverageTable isDarkMode={isDarkMode} signals={summary.signals} />
      </div>
    </div>
  );
}

function SignalCoverageTable({
  isDarkMode,
  signals,
}: {
  isDarkMode: boolean;
  signals: HmSignalCoverageItem[];
}) {
  if (signals.length === 0) {
    return <div className="text-sm text-muted-foreground">No signals defined.</div>;
  }

  // Group by signalGroup for readability.
  const groups = useMemo(() => {
    const m = new Map<string, HmSignalCoverageItem[]>();
    for (const s of signals) {
      const arr = m.get(s.signalGroup) ?? [];
      arr.push(s);
      m.set(s.signalGroup, arr);
    }
    return Array.from(m.entries());
  }, [signals]);

  return (
    <div className="space-y-3">
      {groups.map(([group, items]) => (
        <div key={group}>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1.5">
            {group}
          </div>
          <div className={`rounded-lg border ${isDarkMode ? 'border-neutral-800' : 'border-border/60'} divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-border/60'}`}>
            {items.map((s) => (
              <div
                key={s.signalKey}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${COVERAGE_CONFIG[s.coverage].dot}`} />
                  <span className="text-sm font-medium truncate">{s.signalLabel}</span>
                  {s.required && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${isDarkMode ? 'bg-card text-neutral-400' : 'bg-muted text-muted-foreground'}`}>
                      REQUIRED
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <CoveragePill coverage={s.coverage} />
                  <ConfidencePill level={s.confidence} />
                </div>
              </div>
            ))}
          </div>
          {items.some((s) => s.notes) && (
            <ul className="mt-1.5 pl-4 text-[11px] text-muted-foreground list-disc space-y-0.5">
              {items
                .filter((s) => s.notes)
                .map((s) => (
                  <li key={`${s.signalKey}-note`}>
                    <span className="font-medium text-foreground/80">{s.signalLabel}:</span> {s.notes}
                  </li>
                ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Onboarding & Source cards ───────────────────────────────────────────────

function OnboardingCard({
  isDarkMode,
  data,
}: {
  isDarkMode: boolean;
  data: HmCompatibilityCheckResponse;
}) {
  const onb = data.onboarding;
  if (!onb) return null;
  return (
    <div className={card(isDarkMode)}>
      {cardHeader(
        'Onboarding & Eligibility',
        'How to onboard this vehicle through HM',
        Link2,
        isDarkMode ? 'bg-status-info-soft text-status-info' : 'bg-status-info-soft text-status-info',
      )}
      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <KV label="Eligibility API" slot={<EligibilityPill mode={onb.eligibilityMode} />} />
          <KV label="Onboarding Mode" slot={<OnboardingPill mode={onb.onboardingMode} />} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <KV
            label="OEM Path"
            value={
              onb.oemPath === 'ELIGIBILITY_FIRST'
                ? 'Eligibility-first (precheck → clearance)'
                : onb.oemPath === 'DIRECT_FLEET_CLEARANCE'
                  ? 'Direct Fleet Clearance (VW Group / Porsche)'
                  : 'Unknown — default to direct clearance'
            }
          />
          {onb.routingNote && <KV label="Routing Note" value={onb.routingNote} />}
        </div>
        <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-xs ${isDarkMode ? 'bg-status-info-soft text-brand border border-border' : 'bg-brand-soft text-status-info border border-border'}`}>
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{onb.guidance}</span>
        </div>
      </div>
    </div>
  );
}

function SourceCard({
  isDarkMode,
  data,
}: {
  isDarkMode: boolean;
  data: HmCompatibilityCheckResponse;
}) {
  const src = data.source;
  if (!src) return null;
  const reviewed = src.lastReviewedAt
    ? new Date(src.lastReviewedAt).toLocaleDateString('de-DE', { year: 'numeric', month: 'short', day: '2-digit' })
    : '—';
  return (
    <div className={card(isDarkMode)}>
      {cardHeader(
        'Source · Confidence · Notes',
        'Provenance of this compatibility entry',
        Wrench,
        isDarkMode ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground',
      )}
      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KV label="Support Source" value={src.supportSource ?? '—'} />
          <KV label="Confidence" slot={<ConfidencePill level={src.confidence} />} />
          <KV
            label="Last Reviewed"
            slot={
              <span className="inline-flex items-center gap-1 text-sm font-medium">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                {reviewed}
              </span>
            }
          />
        </div>
        {src.notes && (
          <div className={`px-3 py-2.5 rounded-lg text-xs ${isDarkMode ? 'bg-neutral-900 border border-neutral-800 text-neutral-300' : 'bg-gray-50 border border-gray-200 text-gray-700'}`}>
            {src.notes}
          </div>
        )}
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  slot,
}: {
  label: string;
  value?: string;
  slot?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{slot ?? value ?? '—'}</div>
    </div>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────

export function HighMobilityCompatibilityView({ isDarkMode }: Props) {
  const [brands, setBrands] = useState<HmCompatibilityBrandOption[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [models, setModels] = useState<HmCompatibilityModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  const [result, setResult] = useState<HmCompatibilityCheckResponse | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load brand options on mount.
  useEffect(() => {
    let cancelled = false;
    setBrandsLoading(true);
    api.hmCompatibility
      .listBrands()
      .then((res) => {
        if (!cancelled) setBrands(res.brands);
      })
      .catch(() => {
        if (!cancelled) setBrands([]);
      })
      .finally(() => {
        if (!cancelled) setBrandsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadModels = useCallback(
    (brand: string) => {
      if (!brand) {
        setModels([]);
        return;
      }
      setModelsLoading(true);
      api.hmCompatibility
        .listModels(brand)
        .then((res) => setModels(res.models))
        .catch(() => setModels([]))
        .finally(() => setModelsLoading(false));
    },
    [],
  );

  const debouncedLoadModels = useDebounced(loadModels, 120);

  const runCheck = useCallback(
    async (brand: string, model: string, year: number | null) => {
      setResultLoading(true);
      setError(null);
      try {
        const res = await api.hmCompatibility.check(brand, model, year);
        setResult(res);
      } catch (e: any) {
        setError(e?.message ?? 'Compatibility check failed');
        setResult(null);
      } finally {
        setResultLoading(false);
      }
    },
    [],
  );

  return (
    <div className="flex flex-col h-full min-h-0 px-4 sm:px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className={`p-2 rounded-xl ${isDarkMode ? 'bg-card' : 'bg-status-info-soft'}`}>
          <ShieldCheck className={`w-5 h-5 ${isDarkMode ? 'text-status-info' : 'text-status-info'}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">High Mobility Compatibility Check</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-status-info-soft text-status-info' : 'bg-status-info-soft text-status-info'}`}>
              Internal Master Admin
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Check vehicle support, onboarding mode, and signal coverage for Health APP and Telemetry APP.
          </p>
        </div>
      </div>

      {/* Domain rules notice */}
      <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-xs ${isDarkMode ? 'bg-status-info-soft border-border text-status-info' : 'bg-status-info-soft border-border text-status-info'}`}>
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold">Product rules: </span>
          Eligibility absence does <strong>not</strong> mean unsupported — VW/Porsche vehicles are still usable through Direct Fleet Clearance.
          App suitability is derived from signal coverage, not just OEM name. Overall verdict aggregates both apps.
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-5">
        <LookupForm
          isDarkMode={isDarkMode}
          brands={brands}
          models={models}
          brandsLoading={brandsLoading}
          modelsLoading={modelsLoading}
          onSelectBrand={debouncedLoadModels}
          onRun={runCheck}
          loading={resultLoading}
        />

        {error && (
          <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border text-xs ${isDarkMode ? 'bg-red-900/20 border-red-800/40 text-red-300' : 'bg-red-50 border-red-200 text-red-700'}`}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!result && !error && !resultLoading && (
          <div className={`rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground ${isDarkMode ? 'border-neutral-800' : 'border-border'}`}>
            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Pick a brand, model, and optional model year to run a compatibility check.
          </div>
        )}

        {resultLoading && (
          <div className={`rounded-xl border px-6 py-10 text-center text-sm text-muted-foreground ${isDarkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-card border-border'}`}>
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Running compatibility check…
          </div>
        )}

        {result && (
          <>
            <SummaryCard isDarkMode={isDarkMode} data={result} />
            {result.found && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <AppCard isDarkMode={isDarkMode} kind="HEALTH" summary={result.healthApp} />
                  <AppCard isDarkMode={isDarkMode} kind="TELEMETRY" summary={result.telemetryApp} />
                </div>
                <OnboardingCard isDarkMode={isDarkMode} data={result} />
                <SourceCard isDarkMode={isDarkMode} data={result} />
              </>
            )}
            <div className="pt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                Generated at {new Date(result.generatedAt).toLocaleString('de-DE')}
              </span>
              <button
                onClick={() =>
                  runCheck(result.lookup.brand, result.lookup.model, result.lookup.year)
                }
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Re-run
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

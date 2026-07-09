import { Circle, Package, Wrench } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useCallback, useMemo } from 'react';

import { api } from '../../lib/api';
import type {
  PartsProviderSummary,
  PartsDisclosureTemplate,
  PartsDisclosedFieldSet,
  PartsSearchParams,
  PartsSearchResponse,
  PartsProductResult,
  PartsProductDetail,
} from '../../lib/api';
import { useFleetVehicles } from '../FleetContext';
import type { VehicleData } from '../data/vehicles';

interface PartsAccessoriesViewProps {
  isDarkMode: boolean;
}

type Category = 'TIRES' | 'PARTS' | 'ACCESSORIES';
type SortOption = 'relevance' | 'price_asc' | 'price_desc';

const STEP_LABELS = [
  'Vehicle',
  'Category',
  'Provider',
  'Authorization',
  'Results',
  'Detail',
];

const CATEGORY_META: { value: Category; label: string; description: string; Icon: typeof Circle }[] = [
  { value: 'TIRES', label: 'Tires', description: 'Search for tires matching your vehicle specs', Icon: Circle },
  { value: 'PARTS', label: 'Parts', description: 'OEM and aftermarket replacement parts', Icon: Wrench },
  { value: 'ACCESSORIES', label: 'Accessories', description: 'Interior, exterior, and performance add-ons', Icon: Package },
];

function cls(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(' ');
}

function truncateVin(vin: string | undefined): string {
  if (!vin) return '—';
  return vin.length > 11 ? vin.slice(0, 4) + '…' + vin.slice(-4) : vin;
}

function healthDot(status: string) {
  if (status === 'healthy') return 'bg-emerald-500';
  if (status === 'degraded') return 'bg-amber-500';
  return 'bg-red-500';
}

function availabilityBadge(status: string, dk: boolean) {
  if (status === 'in_stock')
    return { label: 'In Stock', bg: dk ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700' };
  if (status === 'limited')
    return { label: 'Limited', bg: dk ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700' };
  if (status === 'out_of_stock')
    return { label: 'Out of Stock', bg: dk ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-700' };
  return { label: 'Unknown', bg: dk ? 'bg-neutral-500/15 text-neutral-400' : 'bg-muted text-muted-foreground' };
}

function fitmentBadge(status: string, dk: boolean) {
  if (status === 'exact_fit')
    return { label: 'Exact Fit', bg: dk ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700' };
  if (status === 'likely_fit')
    return { label: 'Likely Fit', bg: dk ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700' };
  return { label: 'Universal', bg: dk ? 'bg-neutral-500/15 text-neutral-400' : 'bg-muted text-muted-foreground' };
}

function formatPrice(value: number | undefined, currency: string) {
  if (value == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency || 'EUR' }).format(value);
}

// ── Skeleton helpers ───────────────────────────────────
function Skeleton({ className, dk }: { className?: string; dk: boolean }) {
  return (
    <div className={cls('animate-pulse rounded-lg', dk ? 'bg-white/[0.06]' : 'bg-gray-200/80', className)} />
  );
}

function CardSkeleton({ dk }: { dk: boolean }) {
  return (
    <div className={cls(
      'rounded-2xl border p-5 space-y-3',
      dk ? 'bg-white/[0.03] border-white/[0.06]' : 'bg-white/70 border-gray-200/60',
    )}>
      <Skeleton dk={dk} className="h-36 w-full" />
      <Skeleton dk={dk} className="h-4 w-3/4" />
      <Skeleton dk={dk} className="h-4 w-1/2" />
      <div className="flex gap-2">
        <Skeleton dk={dk} className="h-6 w-20" />
        <Skeleton dk={dk} className="h-6 w-16" />
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────
export function PartsAccessoriesView({ isDarkMode: dk }: PartsAccessoriesViewProps) {
  const { fleetVehicles, loading: fleetLoading } = useFleetVehicles();

  const [step, setStep] = useState(1);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleData | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [providers, setProviders] = useState<PartsProviderSummary[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<PartsProviderSummary | null>(null);

  const [disclosure, setDisclosure] = useState<PartsDisclosureTemplate | null>(null);
  const [disclosedFields, setDisclosedFields] = useState<PartsDisclosedFieldSet | null>(null);
  const [disclosureLoading, setDisclosureLoading] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<PartsSearchResponse | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('relevance');
  const [searchPage, setSearchPage] = useState(1);

  const [detailProduct, setDetailProduct] = useState<PartsProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const [error, setError] = useState<string | null>(null);

  // ── Glass card class ─────────────────────────────────
  const card = dk
    ? 'bg-white/[0.03] border border-white/[0.06] rounded-2xl'
    : 'bg-white border border-gray-200 rounded-2xl';

  // ── Vehicle search filtering ─────────────────────────
  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch.trim()) return fleetVehicles;
    const q = vehicleSearch.toLowerCase();
    return fleetVehicles.filter((v) =>
      [v.license, v.make, v.model, String(v.year)].some((f) => (f || '').toLowerCase().includes(q)),
    );
  }, [fleetVehicles, vehicleSearch]);

  // ── Provider filtering by category ───────────────────
  const filteredProviders = useMemo(() => {
    if (!selectedCategory) return providers;
    return providers.filter((p) =>
      p.supportedCategories.map((c) => c.toUpperCase()).includes(selectedCategory),
    );
  }, [providers, selectedCategory]);

  // ── Load providers when entering step 3 ──────────────
  useEffect(() => {
    if (step !== 3) return;
    let cancelled = false;
    setProvidersLoading(true);
    setError(null);
    api.partsAccessories.providers()
      .then((data) => { if (!cancelled) setProviders(data); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load providers'); })
      .finally(() => { if (!cancelled) setProvidersLoading(false); });
    return () => { cancelled = true; };
  }, [step]);

  // ── Load disclosure when entering step 4 ─────────────
  useEffect(() => {
    if (step !== 4 || !selectedProvider || !selectedCategory) return;
    let cancelled = false;
    setDisclosureLoading(true);
    setAuthorized(false);
    setError(null);
    api.partsAccessories.disclosure(selectedProvider.key, selectedCategory)
      .then((res) => {
        if (cancelled) return;
        setDisclosure(res.disclosure);
        setDisclosedFields(res.disclosedFields);
      })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load disclosure'); })
      .finally(() => { if (!cancelled) setDisclosureLoading(false); });
    return () => { cancelled = true; };
  }, [step, selectedProvider, selectedCategory]);

  // ── Search when entering step 5 ──────────────────────
  const runSearch = useCallback(async (page = 1, sort: SortOption = sortBy) => {
    if (!selectedVehicle || !selectedProvider || !selectedCategory || !correlationId) return;
    setSearchLoading(true);
    setError(null);
    try {
      const params: PartsSearchParams = {
        vehicleId: selectedVehicle.id,
        providerKey: selectedProvider.key,
        category: selectedCategory,
        correlationId,
        page,
        pageSize: 12,
        sortBy: sort === 'relevance' ? undefined : sort === 'price_asc' ? 'price_asc' : 'price_desc',
      };
      const res = await api.partsAccessories.search(params);
      setSearchResults(res);
      setSearchPage(page);
    } catch (e: any) {
      setError(e?.message || 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  }, [selectedVehicle, selectedProvider, selectedCategory, correlationId, sortBy]);

  useEffect(() => {
    if (step === 5 && correlationId) runSearch(1, sortBy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, correlationId]);

  // ── Confirm disclosure ───────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!selectedVehicle || !selectedProvider || !selectedCategory) return;
    setConfirmLoading(true);
    setError(null);
    try {
      const res = await api.partsAccessories.confirmDisclosure({
        vehicleId: selectedVehicle.id,
        providerKey: selectedProvider.key,
        category: selectedCategory,
      });
      setCorrelationId(res.correlationId);
      setStep(5);
    } catch (e: any) {
      setError(e?.message || 'Authorization failed');
    } finally {
      setConfirmLoading(false);
    }
  }, [selectedVehicle, selectedProvider, selectedCategory]);

  // ── Open product detail ──────────────────────────────
  const openDetail = useCallback(async (product: PartsProductResult) => {
    setShowDetail(true);
    setDetailLoading(true);
    setDetailProduct(null);
    try {
      const detail = await api.partsAccessories.productDetail(
        product.providerKey,
        product.externalId,
        selectedVehicle?.id,
      );
      setDetailProduct(detail ?? (product as unknown as PartsProductDetail));
    } catch {
      setDetailProduct(product as unknown as PartsProductDetail);
    } finally {
      setDetailLoading(false);
    }
  }, [selectedVehicle]);

  // ── Step navigation ──────────────────────────────────
  const canContinue = (s: number) => {
    if (s === 1) return !!selectedVehicle;
    if (s === 2) return !!selectedCategory;
    if (s === 3) return !!selectedProvider;
    return false;
  };

  const goNext = () => {
    if (step < 5 && canContinue(step)) setStep(step + 1);
  };
  const goBack = () => {
    if (step > 1) {
      setError(null);
      if (step === 5) { setSearchResults(null); setCorrelationId(null); }
      setStep(step - 1);
    }
  };

  // ── Stepper bar ──────────────────────────────────────
  const renderStepper = () => (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {STEP_LABELS.slice(0, 5).map((label, i) => {
        const s = i + 1;
        const isActive = s === step;
        const isDone = s < step;
        return (
          <div key={s} className="flex items-center gap-1">
            {i > 0 && (
              <div className={cls(
                'w-6 h-px',
                isDone ? (dk ? 'bg-status-info' : 'bg-status-info') : dk ? 'bg-white/10' : 'bg-gray-300',
              )} />
            )}
            <button
              onClick={() => { if (isDone) setStep(s); }}
              disabled={!isDone && !isActive}
              className={cls(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                isDone && (dk ? 'bg-brand-soft text-status-info' : 'bg-status-info-soft text-status-info'),
                isActive && (dk ? 'bg-brand-soft text-white ring-1 ring-brand/50' : 'bg-status-info-soft text-status-info ring-1 ring-brand/30'),
                !isDone && !isActive && (dk ? 'text-white/30' : 'text-muted-foreground'),
              )}
            >
              {isDone ? <Icon name="check" className="w-3 h-3" /> : <span className="w-4 text-center">{s}</span>}
              <span className="hidden sm:inline">{label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );

  // ── Context bar (sticky summary) ─────────────────────
  const renderContextBar = () => {
    if (step <= 1) return null;
    return (
      <div className={cls(
        'flex flex-wrap items-center gap-3 px-4 py-2 rounded-xl text-xs',
        dk ? 'bg-white/[0.04] text-white/60' : 'bg-gray-50 text-gray-500',
      )}>
        {selectedVehicle && (
          <span className="flex items-center gap-1">
            <Icon name="car" className="w-3 h-3" />
            {selectedVehicle.make} {selectedVehicle.model} {selectedVehicle.year} — {selectedVehicle.license}
          </span>
        )}
        {selectedCategory && step > 2 && (
          <span className={cls('px-2 py-0.5 rounded-full', dk ? 'bg-brand-soft text-status-info' : 'bg-status-info-soft text-status-info')}>
            {selectedCategory}
          </span>
        )}
        {selectedProvider && step > 3 && (
          <span className="flex items-center gap-1">
            <Icon name="truck" className="w-3 h-3" /> {selectedProvider.displayName}
          </span>
        )}
      </div>
    );
  };

  // ── STEP 1 — Vehicle Selection ───────────────────────
  const renderVehicleSelection = () => (
    <div className="space-y-4">
      <div>
        <h2 className={cls('text-lg font-semibold', dk ? 'text-white' : 'text-gray-900')}>
          Select a Vehicle
        </h2>
        <p className={cls('text-sm mt-1', dk ? 'text-white/50' : 'text-gray-500')}>
          Choose the vehicle you'd like to find parts or accessories for.
        </p>
      </div>
      <div className="relative">
        <Icon name="search" className={cls('absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4', dk ? 'text-white/40' : 'text-muted-foreground')} />
        <input
          value={vehicleSearch}
          onChange={(e) => setVehicleSearch(e.target.value)}
          placeholder="Search by plate, make, or model…"
          className={cls(
            'w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition',
            dk ? 'bg-white/[0.06] text-white placeholder:text-white/30 border border-white/[0.08] focus:border-brand/50'
               : 'bg-white text-gray-900 placeholder:text-gray-400 border border-gray-200 focus:border-brand',
          )}
        />
      </div>

      {fleetLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} dk={dk} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className={cls('text-center py-16', dk ? 'text-white/40' : 'text-muted-foreground')}>
          <Icon name="car" className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No vehicles found</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-h-[56vh] overflow-y-auto pr-1">
          {filteredVehicles.map((v) => {
            const selected = selectedVehicle?.id === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setSelectedVehicle(v)}
                className={cls(
                  card,
                  'p-4 text-left transition-all hover:scale-[1.01]',
                  selected && 'ring-2 ring-blue-500',
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className={cls('text-sm font-semibold', dk ? 'text-white' : 'text-gray-900')}>
                      {v.license || '—'}
                    </p>
                    <p className={cls('text-xs mt-0.5', dk ? 'text-white/50' : 'text-gray-500')}>
                      {v.make} {v.model} · {v.year}
                    </p>
                  </div>
                  {selected && (
                    <div className="w-5 h-5 rounded-full bg-status-info flex items-center justify-center shrink-0">
                      <Icon name="check" className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                <p className={cls('text-[10px] mt-2 font-mono', dk ? 'text-white/30' : 'text-muted-foreground')}>
                  VIN {truncateVin((v as any).vin)}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── STEP 2 — Category Selection ──────────────────────
  const renderCategorySelection = () => (
    <div className="space-y-4">
      <div>
        <h2 className={cls('text-lg font-semibold', dk ? 'text-white' : 'text-gray-900')}>
          What are you looking for?
        </h2>
        <p className={cls('text-sm mt-1', dk ? 'text-white/50' : 'text-gray-500')}>
          Select a product category to continue.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {CATEGORY_META.map(({ value, label, description, Icon }) => {
          const selected = selectedCategory === value;
          return (
            <button
              key={value}
              onClick={() => setSelectedCategory(value)}
              className={cls(
                card,
                'p-6 text-left transition-all hover:scale-[1.01] flex flex-col items-start gap-3',
                selected && 'ring-2 ring-blue-500',
              )}
            >
              <div className={cls(
                'w-11 h-11 rounded-xl flex items-center justify-center',
                selected
                  ? 'bg-brand text-brand-foreground'
                  : dk ? 'bg-white/[0.06] text-white/60' : 'bg-muted text-muted-foreground',
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className={cls('font-semibold', dk ? 'text-white' : 'text-gray-900')}>{label}</p>
                <p className={cls('text-xs mt-1 leading-relaxed', dk ? 'text-white/40' : 'text-gray-500')}>
                  {description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── STEP 3 — Provider Selection ──────────────────────
  const renderProviderSelection = () => (
    <div className="space-y-4">
      <div>
        <h2 className={cls('text-lg font-semibold', dk ? 'text-white' : 'text-gray-900')}>
          Choose a Provider
        </h2>
        <p className={cls('text-sm mt-1', dk ? 'text-white/50' : 'text-gray-500')}>
          Select where you want to search for {selectedCategory?.toLowerCase() || 'products'}.
        </p>
      </div>

      {providersLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} dk={dk} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      ) : filteredProviders.length === 0 ? (
        <div className={cls('text-center py-16', dk ? 'text-white/40' : 'text-muted-foreground')}>
          <Icon name="truck" className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-medium">No providers available</p>
          <p className="text-xs mt-1">No enabled providers support {selectedCategory || 'this category'}.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredProviders.map((p) => {
            const selected = selectedProvider?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedProvider(p)}
                className={cls(
                  card,
                  'p-5 text-left transition-all hover:scale-[1.01]',
                  selected && 'ring-2 ring-blue-500',
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cls('font-semibold truncate', dk ? 'text-white' : 'text-gray-900')}>
                        {p.displayName}
                      </p>
                      <span className={cls('w-2 h-2 rounded-full shrink-0', healthDot(p.healthStatus))} />
                    </div>
                    {p.description && (
                      <p className={cls('text-xs mt-1 line-clamp-2', dk ? 'text-white/40' : 'text-gray-500')}>
                        {p.description}
                      </p>
                    )}
                  </div>
                  {selected && (
                    <div className="w-5 h-5 rounded-full bg-status-info flex items-center justify-center shrink-0 ml-2">
                      <Icon name="check" className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {p.supportedCategories.map((cat) => (
                    <span
                      key={cat}
                      className={cls(
                        'px-2 py-0.5 rounded-full text-[10px] font-medium',
                        dk ? 'bg-white/[0.06] text-white/50' : 'bg-gray-100 text-gray-600',
                      )}
                    >
                      {cat}
                    </span>
                  ))}
                </div>
                <p className={cls('text-[10px] mt-2', dk ? 'text-white/25' : 'text-muted-foreground')}>
                  {p.integrationType}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── STEP 4 — Data Authorization ──────────────────────
  const renderAuthorization = () => (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <h2 className={cls('text-lg font-semibold', dk ? 'text-white' : 'text-gray-900')}>
          Data Authorization
        </h2>
        <p className={cls('text-sm mt-1', dk ? 'text-white/50' : 'text-gray-500')}>
          Review what data will be shared before continuing.
        </p>
      </div>

      {disclosureLoading ? (
        <div className={cls(card, 'p-6 space-y-4')}>
          <Skeleton dk={dk} className="h-5 w-2/3" />
          <Skeleton dk={dk} className="h-4 w-full" />
          <Skeleton dk={dk} className="h-4 w-full" />
          <Skeleton dk={dk} className="h-4 w-3/4" />
          <Skeleton dk={dk} className="h-10 w-40 mt-4" />
        </div>
      ) : (
        <div className={cls(card, 'p-6 space-y-5')}>
          {/* Provider name */}
          <div className="flex items-center gap-3">
            <div className={cls(
              'w-10 h-10 rounded-xl flex items-center justify-center',
              dk ? 'bg-brand-soft' : 'bg-brand-soft',
            )}>
              <Icon name="shield-check" className={cls('w-5 h-5', dk ? 'text-status-info' : 'text-brand')} />
            </div>
            <div>
              <p className={cls('font-semibold', dk ? 'text-white' : 'text-gray-900')}>
                {selectedProvider?.displayName}
              </p>
              <p className={cls('text-xs', dk ? 'text-white/40' : 'text-gray-500')}>
                Data disclosure notice
              </p>
            </div>
          </div>

          {/* Body / purpose */}
          {disclosure && (
            <div className={cls(
              'p-4 rounded-xl text-sm leading-relaxed',
              dk ? 'bg-white/[0.04] text-white/70' : 'bg-gray-50 text-gray-700',
            )}>
              <p className={cls('font-medium mb-1 text-xs uppercase tracking-wide', dk ? 'text-white/40' : 'text-gray-500')}>
                Purpose
              </p>
              {disclosure.body}
            </div>
          )}

          {/* Disclosed fields */}
          {disclosedFields && disclosedFields.fields.length > 0 && (
            <div>
              <p className={cls('text-xs font-medium mb-2 uppercase tracking-wide', dk ? 'text-white/40' : 'text-gray-500')}>
                Data Fields Shared
              </p>
              <div className="space-y-1.5">
                {disclosedFields.fields.map((field) => (
                  <div
                    key={field}
                    className={cls(
                      'flex items-start gap-2 text-sm px-3 py-2 rounded-lg',
                      dk ? 'bg-white/[0.03]' : 'bg-gray-50',
                    )}
                  >
                    <Icon name="info" className={cls('w-3.5 h-3.5 mt-0.5 shrink-0', dk ? 'text-status-info/60' : 'text-status-info/60')} />
                    <div>
                      <span className={cls('font-medium', dk ? 'text-white/80' : 'text-gray-800')}>{field}</span>
                      {disclosedFields.descriptions[field] && (
                        <p className={cls('text-xs mt-0.5', dk ? 'text-white/35' : 'text-gray-500')}>
                          {disclosedFields.descriptions[field]}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vehicle summary */}
          {selectedVehicle && (
            <div className={cls(
              'flex items-center gap-3 px-4 py-3 rounded-xl',
              dk ? 'bg-white/[0.04]' : 'bg-gray-50',
            )}>
              <Icon name="car" className={cls('w-4 h-4', dk ? 'text-white/40' : 'text-muted-foreground')} />
              <span className={cls('text-sm', dk ? 'text-white/70' : 'text-gray-700')}>
                {selectedVehicle.make} {selectedVehicle.model} {selectedVehicle.year} — {selectedVehicle.license}
              </span>
            </div>
          )}

          {/* Notice meta */}
          {disclosure && (
            <div className={cls('flex gap-4 text-[10px]', dk ? 'text-white/25' : 'text-muted-foreground')}>
              <span>Version {disclosure.version}</span>
              <span>Effective {new Date(disclosure.effectiveFrom).toLocaleDateString()}</span>
            </div>
          )}

          {/* Checkbox */}
          <label className={cls(
            'flex items-start gap-3 cursor-pointer select-none pt-2',
          )}>
            <div
              onClick={() => setAuthorized(!authorized)}
              className={cls(
                'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5 transition-colors',
                authorized
                  ? 'bg-status-info border-brand'
                  : dk ? 'border-white/20 bg-white/[0.04]' : 'border-gray-300 bg-white',
              )}
            >
              {authorized && <Icon name="check" className="w-3 h-3 text-white" />}
            </div>
            <span
              onClick={() => setAuthorized(!authorized)}
              className={cls('text-sm leading-snug', dk ? 'text-white/70' : 'text-gray-700')}
            >
              I understand and authorize this data transfer to {selectedProvider?.displayName} for the purpose of searching {selectedCategory?.toLowerCase()}.
            </span>
          </label>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={goBack}
              className={cls(
                'px-5 py-2.5 rounded-xl text-sm font-medium transition',
                dk ? 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
              )}
            >
              Cancel
            </button>
            <button
              disabled={!authorized || confirmLoading}
              onClick={handleConfirm}
              className={cls(
                'px-6 py-2.5 rounded-xl text-sm font-semibold transition flex items-center gap-2',
                authorized
                  ? 'bg-brand text-brand-foreground hover:bg-brand-hover'
                  : dk ? 'bg-white/[0.06] text-white/30 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed',
              )}
            >
              {confirmLoading && <Icon name="loader-2" className="w-4 h-4 animate-spin" />}
              Confirm & Search
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ── STEP 5 — Search Results ──────────────────────────
  const renderSearchResults = () => {
    const handleSort = (s: SortOption) => {
      setSortBy(s);
      runSearch(1, s);
    };

    return (
      <div className="space-y-4">
        {/* Header row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className={cls('text-lg font-semibold', dk ? 'text-white' : 'text-gray-900')}>
              Search Results
            </h2>
            {searchResults && !searchLoading && (
              <p className={cls('text-xs mt-0.5', dk ? 'text-white/40' : 'text-gray-500')}>
                {searchResults.totalCount} result{searchResults.totalCount !== 1 ? 's' : ''} · {searchResults.searchDurationMs}ms
              </p>
            )}
          </div>

          {/* Sort */}
          <div className="relative">
            <div className="flex items-center gap-2">
              <Icon name="arrow-up-down" className={cls('w-3.5 h-3.5', dk ? 'text-white/40' : 'text-muted-foreground')} />
              <select
                value={sortBy}
                onChange={(e) => handleSort(e.target.value as SortOption)}
                className={cls(
                  'text-sm rounded-lg px-3 py-1.5 outline-none appearance-none pr-7 cursor-pointer',
                  dk ? 'bg-white/[0.06] text-white border border-white/[0.08]' : 'bg-white text-gray-700 border border-gray-200',
                )}
              >
                <option value="relevance">Relevance</option>
                <option value="price_asc">Price: Low → High</option>
                <option value="price_desc">Price: High → Low</option>
              </select>
            </div>
          </div>
        </div>

        {/* Loading */}
        {searchLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} dk={dk} />)}
          </div>
        ) : !searchResults || searchResults.results.length === 0 ? (
          <div className={cls('text-center py-20', dk ? 'text-white/40' : 'text-muted-foreground')}>
            <Icon name="search" className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No products found</p>
            <p className="text-xs mt-1">Try adjusting your vehicle or category selection.</p>
          </div>
        ) : (
          <>
            {/* Product grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {searchResults.results.map((product) => {
                const avail = availabilityBadge(product.availabilityStatus, dk);
                const fit = fitmentBadge(product.fitmentStatus, dk);
                return (
                  <div key={product.id} className={cls(card, 'overflow-hidden flex flex-col transition-all hover:scale-[1.005]')}>
                    {/* Image area */}
                    {product.imageUrl ? (
                      <div className="h-40 overflow-hidden">
                        <img src={product.imageUrl} alt={product.title} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className={cls(
                        'h-40 flex items-center justify-center',
                        dk ? 'bg-white/[0.04]' : 'bg-gray-50',
                      )}>
                        <Icon name="package" className={cls('w-10 h-10', dk ? 'text-white/15' : 'text-gray-300')} />
                      </div>
                    )}

                    <div className="p-4 flex flex-col flex-1">
                      {/* Brand */}
                      {product.brand && (
                        <p className={cls('text-[10px] uppercase tracking-wider font-semibold mb-1', dk ? 'text-status-info/70' : 'text-brand/70')}>
                          {product.brand}
                        </p>
                      )}
                      {/* Title */}
                      <p className={cls('text-sm font-semibold line-clamp-2 leading-snug', dk ? 'text-white' : 'text-gray-900')}>
                        {product.title}
                      </p>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <span className={cls('px-2 py-0.5 rounded-full text-[10px] font-medium', avail.bg)}>
                          {avail.label}
                        </span>
                        <span className={cls('px-2 py-0.5 rounded-full text-[10px] font-medium', fit.bg)}>
                          {fit.label}
                        </span>
                      </div>

                      {/* Seller */}
                      {product.sellerName && (
                        <p className={cls('text-[10px] mt-2', dk ? 'text-white/30' : 'text-muted-foreground')}>
                          Sold by {product.sellerName}
                        </p>
                      )}

                      {/* Price + action */}
                      <div className="mt-auto pt-3 flex items-end justify-between">
                        <div>
                          <p className={cls('text-lg font-bold', dk ? 'text-white' : 'text-gray-900')}>
                            {formatPrice(product.priceGross, product.currency)}
                          </p>
                          {product.priceNet != null && product.priceNet !== product.priceGross && (
                            <p className={cls('text-[10px]', dk ? 'text-white/30' : 'text-muted-foreground')}>
                              {formatPrice(product.priceNet, product.currency)} net
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => openDetail(product)}
                          className={cls(
                            'px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1',
                            dk ? 'bg-brand-soft text-status-info hover:bg-brand-soft' : 'bg-brand-soft text-brand hover:bg-brand-soft',
                          )}
                        >
                          <Icon name="eye" className="w-3 h-3" /> Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {searchResults.hasMore && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={() => runSearch(searchPage + 1, sortBy)}
                  disabled={searchLoading}
                  className={cls(
                    'px-6 py-2.5 rounded-xl text-sm font-medium transition flex items-center gap-2',
                    dk ? 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                  )}
                >
                  {searchLoading ? <Icon name="loader-2" className="w-4 h-4 animate-spin" /> : <Icon name="chevron-down" className="w-4 h-4" />}
                  Load More
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // ── STEP 6 — Product Detail Drawer ───────────────────
  const renderDetailDrawer = () => {
    if (!showDetail) return null;
    return (
      <div className="fixed inset-0 z-50 flex justify-end">
        {/* Backdrop */}
        <div className="absolute inset-0 overlay-scrim" onClick={() => setShowDetail(false)} />

        {/* Drawer */}
        <div className={cls(
          'relative w-full max-w-lg h-full overflow-y-auto',
          dk ? 'bg-neutral-900' : 'bg-white',
        )}>
          {/* Close */}
          <button
            onClick={() => setShowDetail(false)}
            className={cls(
              'absolute top-4 right-4 p-2 rounded-xl z-10 transition',
              dk ? 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
            )}
          >
            <Icon name="x" className="w-4 h-4" />
          </button>

          {detailLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton dk={dk} className="h-56 w-full" />
              <Skeleton dk={dk} className="h-6 w-3/4" />
              <Skeleton dk={dk} className="h-4 w-1/2" />
              <Skeleton dk={dk} className="h-40 w-full" />
            </div>
          ) : detailProduct ? (
            <div className="p-6 space-y-5">
              {/* Image */}
              {(detailProduct.images?.length ?? 0) > 0 ? (
                <div className="rounded-2xl overflow-hidden">
                  <img
                    src={detailProduct.images![0]}
                    alt={detailProduct.title}
                    className="w-full h-64 object-cover"
                  />
                </div>
              ) : detailProduct.imageUrl ? (
                <div className="rounded-2xl overflow-hidden">
                  <img src={detailProduct.imageUrl} alt={detailProduct.title} className="w-full h-64 object-cover" />
                </div>
              ) : (
                <div className={cls(
                  'h-56 rounded-2xl flex items-center justify-center',
                  dk ? 'bg-white/[0.04]' : 'bg-gray-50',
                )}>
                  <Icon name="package" className={cls('w-16 h-16', dk ? 'text-white/10' : 'text-gray-200')} />
                </div>
              )}

              {/* Brand + title */}
              {detailProduct.brand && (
                <p className={cls('text-xs uppercase tracking-wider font-semibold', dk ? 'text-status-info/70' : 'text-brand/70')}>
                  {detailProduct.brand}
                </p>
              )}
              <h3 className={cls('text-xl font-bold leading-snug', dk ? 'text-white' : 'text-gray-900')}>
                {detailProduct.title}
              </h3>
              {detailProduct.subtitle && (
                <p className={cls('text-sm', dk ? 'text-white/50' : 'text-gray-500')}>
                  {detailProduct.subtitle}
                </p>
              )}

              {/* Price breakdown */}
              <div className={cls(card, 'p-4 space-y-2')}>
                <div className="flex justify-between items-baseline">
                  <span className={cls('text-sm', dk ? 'text-white/50' : 'text-gray-500')}>Price (incl. tax)</span>
                  <span className={cls('text-2xl font-bold', dk ? 'text-white' : 'text-gray-900')}>
                    {formatPrice(detailProduct.priceGross, detailProduct.currency)}
                  </span>
                </div>
                {detailProduct.priceNet != null && (
                  <div className="flex justify-between items-baseline">
                    <span className={cls('text-xs', dk ? 'text-white/35' : 'text-muted-foreground')}>Net price</span>
                    <span className={cls('text-sm', dk ? 'text-white/60' : 'text-gray-600')}>
                      {formatPrice(detailProduct.priceNet, detailProduct.currency)}
                    </span>
                  </div>
                )}
                {detailProduct.shippingInfo && (
                  <p className={cls('text-xs', dk ? 'text-white/30' : 'text-muted-foreground')}>
                    {detailProduct.shippingInfo}
                  </p>
                )}
              </div>

              {/* Badges row */}
              <div className="flex flex-wrap gap-2">
                {(() => { const a = availabilityBadge(detailProduct.availabilityStatus, dk); return <span className={cls('px-3 py-1 rounded-full text-xs font-medium', a.bg)}>{a.label}</span>; })()}
                {(() => { const f = fitmentBadge(detailProduct.fitmentStatus, dk); return <span className={cls('px-3 py-1 rounded-full text-xs font-medium', f.bg)}>{f.label}</span>; })()}
                {detailProduct.rating != null && (
                  <span className={cls('flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium', dk ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700')}>
                    <Icon name="star" className="w-3 h-3" /> {detailProduct.rating.toFixed(1)}
                    {detailProduct.reviewCount != null && <span className="opacity-60">({detailProduct.reviewCount})</span>}
                  </span>
                )}
              </div>

              {/* Fitment notes */}
              {detailProduct.fitmentNotes && (
                <div className={cls(
                  'p-3 rounded-xl text-sm',
                  dk ? 'bg-white/[0.04] text-white/60' : 'bg-gray-50 text-gray-600',
                )}>
                  <p className={cls('text-[10px] uppercase tracking-wider font-semibold mb-1', dk ? 'text-white/30' : 'text-muted-foreground')}>
                    Fitment Notes
                  </p>
                  {detailProduct.fitmentNotes}
                </div>
              )}

              {/* Description */}
              {detailProduct.description && (
                <div>
                  <p className={cls('text-xs uppercase tracking-wider font-semibold mb-2', dk ? 'text-white/30' : 'text-muted-foreground')}>
                    Description
                  </p>
                  <p className={cls('text-sm leading-relaxed', dk ? 'text-white/60' : 'text-gray-600')}>
                    {detailProduct.description}
                  </p>
                </div>
              )}

              {/* Specifications */}
              {detailProduct.specifications && Object.keys(detailProduct.specifications).length > 0 && (
                <div>
                  <p className={cls('text-xs uppercase tracking-wider font-semibold mb-2', dk ? 'text-white/30' : 'text-muted-foreground')}>
                    Specifications
                  </p>
                  <div className={cls(card, 'overflow-hidden divide-y', dk ? 'divide-white/[0.06]' : 'divide-gray-100')}>
                    {Object.entries(detailProduct.specifications).map(([key, val]) => (
                      <div key={key} className="flex justify-between px-4 py-2.5 text-sm">
                        <span className={dk ? 'text-white/50' : 'text-gray-500'}>{key}</span>
                        <span className={cls('font-medium', dk ? 'text-white/80' : 'text-gray-800')}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Provider terms */}
              {detailProduct.providerTermsNote && (
                <div className={cls(
                  'p-3 rounded-xl text-xs',
                  dk ? 'bg-amber-500/10 text-amber-400/80 border border-amber-500/20' : 'bg-amber-50 text-amber-800 border border-amber-200',
                )}>
                  <p className="font-medium mb-0.5">Provider Notice</p>
                  {detailProduct.providerTermsNote}
                </div>
              )}

              {/* CTA */}
              <div className="pt-2 space-y-3">
                {(detailProduct.checkoutUrl || detailProduct.productUrl) ? (
                  <a
                    href={detailProduct.checkoutUrl || detailProduct.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-xl text-sm font-semibold bg-brand text-brand-foreground hover:bg-brand-hover transition"
                  >
                    <Icon name="credit-card" className="w-4 h-4" />
                    Continue to Checkout
                    <Icon name="external-link" className="w-3.5 h-3.5 opacity-60" />
                  </a>
                ) : (
                  <div className={cls(
                    'text-center py-3 rounded-xl text-sm',
                    dk ? 'bg-white/[0.04] text-white/40' : 'bg-gray-50 text-gray-400',
                  )}>
                    No checkout link available for this product.
                  </div>
                )}
                <p className={cls('text-[10px] text-center', dk ? 'text-white/20' : 'text-muted-foreground')}>
                  You will be redirected to {selectedProvider?.displayName || 'the provider'}'s website.
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  // ── Error inline toast ───────────────────────────────
  const renderError = () => {
    if (!error) return null;
    return (
      <div className={cls(
        'flex items-start gap-2 px-4 py-3 rounded-xl text-sm',
        dk ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-red-50 text-red-700 border border-red-200',
      )}>
        <Icon name="alert-circle" className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="flex-1">{error}</div>
        <button onClick={() => setError(null)}>
          <Icon name="x" className="w-3.5 h-3.5 opacity-60 hover:opacity-100" />
        </button>
      </div>
    );
  };

  // ── Step content router ──────────────────────────────
  const renderStepContent = () => {
    switch (step) {
      case 1: return renderVehicleSelection();
      case 2: return renderCategorySelection();
      case 3: return renderProviderSelection();
      case 4: return renderAuthorization();
      case 5: return renderSearchResults();
      default: return null;
    }
  };

  // ── Bottom nav bar ───────────────────────────────────
  const renderNavBar = () => {
    if (step === 4 || step === 5) return null;
    return (
      <div className={cls(
        'flex items-center justify-between pt-4 border-t',
        dk ? 'border-white/[0.06]' : 'border-gray-200/60',
      )}>
        <button
          onClick={goBack}
          disabled={step === 1}
          className={cls(
            'flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition',
            step === 1
              ? dk ? 'text-white/15 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed'
              : dk ? 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
          )}
        >
          <Icon name="chevron-left" className="w-4 h-4" /> Back
        </button>
        <button
          onClick={goNext}
          disabled={!canContinue(step)}
          className={cls(
            'flex items-center gap-1 px-5 py-2 rounded-xl text-sm font-semibold transition',
            canContinue(step)
              ? 'bg-brand text-brand-foreground hover:bg-brand-hover'
              : dk ? 'bg-white/[0.06] text-white/20 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed',
          )}
        >
          Continue <Icon name="chevron-right" className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <div className={cls('flex flex-col gap-4 p-4 sm:p-6 min-h-full', dk ? 'text-white' : 'text-gray-900')}>
      {/* Page header */}
      <div>
        <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">
          Parts & Accessories
        </h1>
        <p className={cls('text-sm mt-1', dk ? 'text-white/50' : 'text-gray-500')}>
          Find and order parts, tires, and accessories for your fleet vehicles.
        </p>
      </div>

      {/* Stepper */}
      {renderStepper()}

      {/* Context bar */}
      {renderContextBar()}

      {/* Error */}
      {renderError()}

      {/* Step content */}
      <div className="flex-1">
        {renderStepContent()}
      </div>

      {/* Navigation */}
      {renderNavBar()}

      {/* Detail drawer overlay */}
      {renderDetailDrawer()}
    </div>
  );
}

export default PartsAccessoriesView;

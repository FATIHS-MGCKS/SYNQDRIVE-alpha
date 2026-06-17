import { Briefcase, Building2, Car, Cog, Eye, Factory, FileSearch, Globe, Paintbrush, Shield, ShieldCheck, ShoppingCart, Sparkles, Tag, Truck, Wrench } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

import { api } from '../../lib/api';
import type { Vendor, VendorCategory, VendorSource, VendorSourceType, VendorInput, VendorMapboxSuggestion } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { useFleetVehicles } from '../FleetContext';
import { PageHeader, StatusChip, EmptyState, SkeletonCard, FormDialog } from '../../components/patterns';

// ── constants ──────────────────────────────────────────

const CATEGORIES: { value: VendorCategory; label: string; icon: typeof Wrench }[] = [
  { value: 'WORKSHOP', label: 'Workshop', icon: Wrench },
  { value: 'SERVICE_PARTNER', label: 'Service Partner', icon: Cog },
  { value: 'PAINT_SHOP', label: 'Paint Shop', icon: Paintbrush },
  { value: 'BODY_REPAIR', label: 'Body Repair', icon: Car },
  { value: 'AUTO_GLASS', label: 'Auto Glass', icon: Eye },
  { value: 'TIRE_DEALER', label: 'Tire Dealer', icon: Truck },
  { value: 'PARTS_DEALER', label: 'Parts Dealer', icon: ShoppingCart },
  { value: 'DETAILING', label: 'Detailing', icon: Sparkles },
  { value: 'TUV_STATION', label: 'TÜV Station', icon: Shield },
  { value: 'ONLINE_SUPPLIER', label: 'Online Supplier', icon: Globe },
  { value: 'INSURANCE', label: 'Insurance', icon: ShieldCheck },
  { value: 'APPRAISER', label: 'Appraiser', icon: FileSearch },
  { value: 'TOWING', label: 'Towing', icon: Truck },
  { value: 'DEALERSHIP', label: 'Dealership', icon: Building2 },
  { value: 'OEM_SERVICE', label: 'OEM Service', icon: Factory },
  { value: 'OTHER', label: 'Other', icon: Briefcase },
];

const SERVICE_AREA_OPTIONS = [
  'Tires', 'Brakes', 'Oil / Service', 'Body Repair', 'Paint', 'Auto Glass',
  'Inspections (TÜV/HU)', 'Parts Supply', 'Detailing / Reconditioning',
  'Battery / EV Service', 'Roadside / Towing', 'General Workshop',
  'Windshield', 'Suspension', 'Exhaust', 'AC / Climate', 'Electrical',
];

function getCategoryLabel(cat: VendorCategory): string {
  return CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}
function getCategoryIcon(cat: VendorCategory) {
  return CATEGORIES.find((c) => c.value === cat)?.icon ?? Briefcase;
}

// ── types ──────────────────────────────────────────────

interface VendorManagementViewProps {
  onOpenDetail?: (vendor: Vendor) => void;
  /** When true, page title is provided by FleetHubView. */
  embedded?: boolean;
}

type VendorScopeFilter = 'ALL' | 'ACTIVE' | 'LINKED';

type MapboxSuggestionWithToken = VendorMapboxSuggestion & { sessionToken: string };

interface VendorFormData {
  name: string;
  category: VendorCategory;
  sourceType: VendorSourceType;
  source: VendorSource;
  externalPlaceId: string | null;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  website: string;
  phone: string;
  email: string;
  notes: string;
  serviceAreas: string[];
  contactName: string;
  contactRole: string;
  contactPhone: string;
  contactEmail: string;
  contactNotes: string;
}

const emptyForm: VendorFormData = {
  name: '', category: 'WORKSHOP', sourceType: 'LOCAL_BUSINESS',
  source: 'MANUAL', externalPlaceId: null, latitude: null, longitude: null,
  street: '', city: '', postalCode: '', country: '', website: '', phone: '',
  email: '', notes: '', serviceAreas: [], contactName: '', contactRole: '',
  contactPhone: '', contactEmail: '', contactNotes: '',
};

// ── component ──────────────────────────────────────────

export function VendorManagementView({ onOpenDetail, embedded = false }: VendorManagementViewProps) {
  const { orgId, hasPermission } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const canManage = hasPermission('vendor-management', 'write');

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<VendorCategory | 'ALL'>('ALL');
  const [scopeFilter, setScopeFilter] = useState<VendorScopeFilter>('ALL');
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [showScopeFilter, setShowScopeFilter] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<VendorFormData>({ ...emptyForm });

  // ── Mapbox POI search state ──
  const [poiQuery, setPoiQuery] = useState('');
  const [suggestions, setSuggestions] = useState<MapboxSuggestionWithToken[]>([]);
  const [sugLoading, setSugLoading] = useState(false);
  const [sugError, setSugError] = useState(false);
  const sugTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const inputClass = 'w-full rounded-lg px-3 py-2 text-xs outline-none transition border border-border bg-[color:var(--input-background)] text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)]';

  // ── data loading ─────────────────────────────────────

  const loadVendors = useCallback(() => {
    if (!orgId) return;
    setLoading(true);
    api.vendors.list(orgId).then(setVendors).catch(() => setVendors([])).finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { loadVendors(); }, [loadVendors]);

  // ── filtering ────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = vendors;
    if (catFilter !== 'ALL') list = list.filter((v) => v.category === catFilter);
    if (scopeFilter === 'ACTIVE') list = list.filter((v) => v.isActive);
    if (scopeFilter === 'LINKED') list = list.filter((v) => v.linkedVehicleCount > 0);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((v) =>
        v.name.toLowerCase().includes(q) ||
        v.city?.toLowerCase().includes(q) ||
        v.contactName?.toLowerCase().includes(q) ||
        v.serviceAreas.some((sa) => sa.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [vendors, catFilter, scopeFilter, search]);

  const stats = useMemo(() => {
    const active = vendors.filter((v) => v.isActive).length;
    const cats = new Set(vendors.map((v) => v.category));
    const linked = vendors.filter((v) => v.linkedVehicleCount > 0).length;
    return { total: vendors.length, active, categories: cats.size, withVehicles: linked };
  }, [vendors]);

  const categoryCount = (category: VendorCategory | 'ALL') =>
    category === 'ALL'
      ? vendors.length
      : vendors.filter((vendor) => vendor.category === category).length;
  const scopeCount = (scope: VendorScopeFilter) => {
    if (scope === 'ACTIVE') return stats.active;
    if (scope === 'LINKED') return stats.withVehicles;
    return vendors.length;
  };
  const inactiveCount = vendors.filter((vendor) => !vendor.isActive).length;
  const activeCategoryLabel = catFilter === 'ALL' ? 'All categories' : getCategoryLabel(catFilter);
  const activeScopeLabel = scopeFilter === 'ACTIVE' ? 'Active partners' : scopeFilter === 'LINKED' ? 'Vehicle-linked' : 'All partners';
  const hasActiveFilters = Boolean(search.trim()) || catFilter !== 'ALL' || scopeFilter !== 'ALL';
  const clearFilters = () => {
    setSearch('');
    setCatFilter('ALL');
    setScopeFilter('ALL');
    setShowCategoryFilter(false);
    setShowScopeFilter(false);
  };

  // ── Mapbox POI search (suggest → select → retrieve → prefill) ──

  const resetSearch = () => {
    setPoiQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    setSugError(false);
  };

  const handlePoiQueryChange = (value: string) => {
    setPoiQuery(value);
    setSugError(false);
    if (sugTimeout.current) clearTimeout(sugTimeout.current);
    if (value.trim().length < 3 || !orgId) {
      setSuggestions([]);
      setShowSuggestions(false);
      setSugLoading(false);
      return;
    }
    setSugLoading(true);
    setShowSuggestions(true);
    sugTimeout.current = setTimeout(() => {
      api.vendors.searchMapbox(orgId, value.trim())
        .then((res) => {
          const token = res.sessionToken;
          setSuggestions((res.suggestions ?? []).map((s) => ({ ...s, sessionToken: token })));
          setSugError(false);
        })
        .catch(() => { setSuggestions([]); setSugError(true); })
        .finally(() => setSugLoading(false));
    }, 350);
  };

  const selectSuggestion = async (sug: MapboxSuggestionWithToken) => {
    setShowSuggestions(false);
    setSuggestions([]);
    if (!orgId || !sug.sessionToken) return;
    const prefill = await api.vendors.mapboxRetrieve(orgId, sug.mapboxId, sug.sessionToken).catch(() => null);
    setPoiQuery('');
    if (prefill) {
      setForm((f) => ({
        ...f,
        name: prefill.name ?? sug.name,
        category: prefill.category ?? f.category,
        source: 'MAPBOX',
        externalPlaceId: prefill.externalPlaceId,
        street: prefill.street ?? f.street,
        city: prefill.city ?? f.city,
        postalCode: prefill.postalCode ?? f.postalCode,
        country: prefill.country ?? f.country,
        latitude: prefill.latitude,
        longitude: prefill.longitude,
        phone: prefill.phone ?? f.phone,
        website: prefill.website ?? f.website,
      }));
    } else {
      setForm((f) => ({ ...f, name: sug.name, source: 'MAPBOX', externalPlaceId: sug.mapboxId }));
    }
  };

  // ── save ─────────────────────────────────────────────

  const buildPayload = (): VendorInput => ({
    name: form.name.trim(),
    category: form.category,
    sourceType: form.sourceType,
    source: form.source,
    externalPlaceId: form.externalPlaceId,
    street: form.street || null,
    city: form.city || null,
    postalCode: form.postalCode || null,
    country: form.country || null,
    latitude: form.latitude,
    longitude: form.longitude,
    website: form.website || null,
    phone: form.phone || null,
    email: form.email || null,
    notes: form.notes || null,
    serviceAreas: form.serviceAreas,
    contactName: form.contactName || null,
    contactRole: form.contactRole || null,
    contactPhone: form.contactPhone || null,
    contactEmail: form.contactEmail || null,
    contactNotes: form.contactNotes || null,
  });

  const closeModal = () => {
    setShowCreate(false);
    setEditVendor(null);
    setForm({ ...emptyForm });
    resetSearch();
  };

  const handleSave = async () => {
    if (!orgId || !form.name.trim() || !canManage) return;
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editVendor) {
        // Master data only — vehicle links are managed on the detail page.
        await api.vendors.update(orgId, editVendor.id, payload);
      } else {
        await api.vendors.create(orgId, payload);
      }
      closeModal();
      loadVendors();
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!orgId || !canManage) return;
    await api.vendors.delete(orgId, id).catch(() => null);
    loadVendors();
  };

  const openCreate = () => {
    setForm({ ...emptyForm });
    setEditVendor(null);
    resetSearch();
    setShowCreate(true);
  };

  const openEdit = (v: Vendor) => {
    setForm({
      name: v.name, category: v.category, sourceType: v.sourceType,
      source: v.source, externalPlaceId: v.externalPlaceId,
      street: v.street ?? '', city: v.city ?? '', postalCode: v.postalCode ?? '',
      country: v.country ?? '', latitude: v.latitude, longitude: v.longitude,
      website: v.website ?? '', phone: v.phone ?? '',
      email: v.email ?? '', notes: v.notes ?? '',
      serviceAreas: v.serviceAreas ?? [],
      contactName: v.contactName ?? '', contactRole: v.contactRole ?? '',
      contactPhone: v.contactPhone ?? '', contactEmail: v.contactEmail ?? '',
      contactNotes: v.contactNotes ?? '',
    });
    setEditVendor(v);
    resetSearch();
    setShowCreate(true);
  };

  // ── render ───────────────────────────────────────────

  const addVendorAction = canManage ? (
    <button
      type="button"
      onClick={openCreate}
      className="sq-press flex items-center gap-2 rounded-xl bg-[color:var(--brand)] px-3 py-2 text-[10px] font-semibold text-white shadow-[var(--shadow-1)] transition-all hover:opacity-90"
    >
      <Icon name="plus" className="h-4 w-4" />
      Add Partner
    </button>
  ) : undefined;

  return (
    <div className={`${embedded ? '' : 'max-w-[1600px] mx-auto'} space-y-5`}>
      {embedded ? (
        addVendorAction ? <div className="flex justify-end">{addVendorAction}</div> : null
      ) : (
      <PageHeader
        title="Service"
        actions={addVendorAction}
      />
      )}

      {/* Segment metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          {
            label: 'Total Partners',
            value: stats.total,
            helper: `${filtered.length} currently visible`,
            icon: Briefcase,
            tone: 'sq-tone-neutral',
            action: () => clearFilters(),
            active: !hasActiveFilters,
          },
          {
            label: 'Active',
            value: stats.active,
            helper: `${inactiveCount} inactive partners`,
            icon: Wrench,
            tone: stats.active > 0 ? 'sq-tone-success' : 'sq-tone-neutral',
            action: () => setScopeFilter(scopeFilter === 'ACTIVE' ? 'ALL' : 'ACTIVE'),
            active: scopeFilter === 'ACTIVE',
          },
          {
            label: 'Categories',
            value: stats.categories,
            helper: `${CATEGORIES.length} configured types`,
            icon: Tag,
            tone: 'sq-tone-brand',
            action: () => setShowCategoryFilter(true),
            active: catFilter !== 'ALL',
          },
          {
            label: 'Vehicle-Linked',
            value: stats.withVehicles,
            helper: `${fleetVehicles.length} fleet vehicles`,
            icon: Car,
            tone: stats.withVehicles > 0 ? 'sq-tone-warning' : 'sq-tone-neutral',
            action: () => setScopeFilter(scopeFilter === 'LINKED' ? 'ALL' : 'LINKED'),
            active: scopeFilter === 'LINKED',
          },
        ].map((metric) => {
          const MetricIcon = metric.icon;
          return (
            <button
              key={metric.label}
              type="button"
              onClick={metric.action}
              className={`group sq-card sq-press rounded-2xl p-4 text-left shadow-[var(--shadow-1)] transition-all ${
                metric.active ? 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_22%,transparent)]' : 'hover:bg-muted/35'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-muted-foreground">{metric.label}</p>
                  <p className="mt-1 truncate text-[20px] font-bold leading-none tracking-[-0.03em] text-foreground tabular-nums">
                    {metric.value}
                  </p>
                  <p className="mt-2 truncate text-[10px] font-medium text-muted-foreground">{metric.helper}</p>
                </div>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${metric.tone}`}>
                  <MetricIcon className="h-4 w-4" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search + Filter */}
      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon name="filter" className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <h2 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Filters</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Showing {filtered.length} of {vendors.length} partners
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {catFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setCatFilter('ALL')}
                className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-brand"
              >
                {activeCategoryLabel} active ×
              </button>
            )}
            {scopeFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setScopeFilter('ALL')}
                className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-success"
              >
                {activeScopeLabel} active ×
              </button>
            )}
            {search.trim() && (
              <span className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-neutral">
                Search active
              </span>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-1.5 text-[10px] font-semibold transition-all sq-tone-critical hover:opacity-90"
              >
                <Icon name="x" className="h-3.5 w-3.5" />
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Icon name="search" className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${'text-muted-foreground'}`} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vendors, city, contact or service area..."
              className="w-full rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground py-2.5 pl-10 pr-4 text-xs outline-none transition-all focus:border-[color:var(--brand)]"
            />
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowCategoryFilter(false);
                setShowScopeFilter(!showScopeFilter);
              }}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium transition-all ${
                scopeFilter !== 'ALL'
                  ? 'bg-[color:var(--brand-soft)] border-transparent text-[color:var(--brand-ink)]'
                  : 'bg-card border-border text-foreground hover:bg-muted'
              }`}
            >
              <span>{activeScopeLabel}</span>
              <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${showScopeFilter ? 'rotate-180' : ''}`} />
            </button>
            {showScopeFilter && (
              <div className={`absolute right-0 top-full z-50 mt-2 min-w-[220px] overflow-hidden rounded-lg border shadow-xl sm:left-0 sm:right-auto ${
                'bg-popover border-border'
              }`}>
                {[
                  { value: 'ALL' as const, label: 'All partners', icon: Briefcase },
                  { value: 'ACTIVE' as const, label: 'Active partners', icon: Wrench },
                  { value: 'LINKED' as const, label: 'Vehicle-linked', icon: Car },
                ].map((scope) => {
                  const ScopeIcon = scope.icon;
                  const selected = scopeFilter === scope.value;
                  return (
                    <button
                      key={scope.value}
                      type="button"
                      onClick={() => {
                        setScopeFilter(scope.value);
                        setShowScopeFilter(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                        selected
                          ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <ScopeIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{scope.label}</span>
                      </span>
                      <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums sq-tone-neutral">
                        {scopeCount(scope.value)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowScopeFilter(false);
                setShowCategoryFilter(!showCategoryFilter);
              }}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium transition-all ${
                catFilter !== 'ALL'
                  ? 'bg-[color:var(--brand-soft)] border-transparent text-[color:var(--brand-ink)]'
                  : 'bg-card border-border text-foreground hover:bg-muted'
              }`}
            >
              <span>{activeCategoryLabel}</span>
              <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${showCategoryFilter ? 'rotate-180' : ''}`} />
            </button>
            {showCategoryFilter && (
              <div className={`absolute right-0 top-full z-50 mt-2 min-w-[250px] overflow-hidden rounded-lg border shadow-xl sm:left-0 sm:right-auto ${
                'bg-popover border-border'
              }`}>
                {([{ value: 'ALL' as const, label: 'All categories', icon: Briefcase }, ...CATEGORIES]).map((cat) => {
                  const CatIcon = cat.icon;
                  const selected = catFilter === cat.value;
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => {
                        setCatFilter(cat.value);
                        setShowCategoryFilter(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                        selected
                          ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <CatIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{cat.label}</span>
                      </span>
                      <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums sq-tone-neutral">
                        {categoryCount(cat.value)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vendor list */}
      {loading ? (
        <div className="space-y-2">
          <SkeletonCard className="rounded-2xl shadow-[var(--shadow-1)]" />
          <SkeletonCard className="rounded-2xl shadow-[var(--shadow-1)]" />
          <SkeletonCard className="rounded-2xl shadow-[var(--shadow-1)]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="sq-card rounded-2xl shadow-[var(--shadow-1)]">
          <EmptyState
            icon={<Icon name="store" className="h-5 w-5" />}
            title={vendors.length === 0 ? 'No service partners yet' : 'No matching vendors'}
            description={vendors.length === 0 ? 'Add your first workshop, tire dealer, or service partner.' : 'Try adjusting your search or filter.'}
            action={vendors.length === 0 && canManage ? (
              <button
                type="button"
                onClick={openCreate}
                className="sq-press inline-flex items-center gap-2 rounded-xl bg-[color:var(--brand)] px-3 py-2 text-[10px] font-semibold text-white shadow-[var(--shadow-1)] transition-all hover:opacity-90"
              >
                <Icon name="plus" className="h-4 w-4" />
                Add Vendor
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const CatIcon = getCategoryIcon(v.category);
            return (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                className="group sq-card sq-press w-full cursor-pointer rounded-2xl p-4 text-left shadow-[var(--shadow-1)] transition-all hover:bg-muted/35"
                onClick={() => onOpenDetail?.(v)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpenDetail?.(v);
                  }
                }}
              >
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sq-tone-brand">
                    <CatIcon className="h-5 w-5" />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">{v.name}</span>
                      <StatusChip tone={v.sourceType === 'ONLINE_VENDOR' ? 'ai' : 'neutral'}>
                        {v.sourceType === 'ONLINE_VENDOR' ? 'Online' : 'Local'}
                      </StatusChip>
                      {!v.isActive && (
                        <StatusChip tone="watch">Inactive</StatusChip>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <StatusChip tone="neutral">{getCategoryLabel(v.category)}</StatusChip>
                      </span>
                      {v.city && <span className="flex items-center gap-1"><Icon name="map-pin" className="w-3 h-3" />{v.city}</span>}
                      {v.contactName && <span className="flex items-center gap-1"><Icon name="user" className="w-3 h-3" />{v.contactName}</span>}
                    </div>
                  </div>

                  {/* Service areas */}
                  <div className="hidden md:flex items-center gap-1 max-w-[200px] overflow-hidden">
                    {v.serviceAreas.slice(0, 3).map((sa) => (
                      <StatusChip key={sa} tone="info" className="whitespace-nowrap text-[9px]">{sa}</StatusChip>
                    ))}
                    {v.serviceAreas.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">+{v.serviceAreas.length - 3}</span>
                    )}
                  </div>

                  {/* Vehicle count */}
                  <div className="shrink-0 text-center text-muted-foreground">
                    <div className="text-sm font-bold text-foreground tabular-nums">{v.linkedVehicleCount}</div>
                    <div className="text-[9px]">Vehicles</div>
                  </div>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openEdit(v);
                    }}
                    className="hidden rounded-lg border border-border text-foreground hover:bg-muted px-2.5 py-1.5 text-[10px] font-semibold transition-all sm:inline-flex"
                  >
                    Edit
                  </button>

                  {/* Arrow */}
                  <Icon name="chevron-right" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FormDialog
        open={showCreate}
        onOpenChange={(open) => { if (!open) closeModal(); }}
        maxWidthClassName="sm:max-w-2xl"
        title={editVendor ? 'Edit Vendor' : 'Add New Vendor'}
        description={editVendor ? 'Update vendor master data — vehicles are linked on the detail page' : 'Search a business to prefill, or fill in the details manually'}
        bodyClassName="p-0"
        footer={(
          <div className="flex w-full items-center justify-between">
            <div>
              {editVendor && canManage && (
                <button
                  type="button"
                  onClick={() => { handleDelete(editVendor.id); closeModal(); }}
                  className="text-[11px] text-[color:var(--status-critical)] transition hover:opacity-80"
                >
                  Delete Vendor
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg px-4 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !canManage}
                className="sq-cta rounded-lg px-4 py-2 text-xs font-medium disabled:opacity-50"
              >
                {saving ? <Icon name="loader-2" className="h-3.5 w-3.5 animate-spin" /> : editVendor ? 'Save Changes' : 'Create Vendor'}
              </button>
            </div>
          </div>
        )}
      >
            <div className="max-h-[min(65vh,100dvh-14rem)] space-y-5 overflow-y-auto p-5">
              {/* Mapbox POI search — prefill only (create flow) */}
              {!editVendor && (
                <div>
                  <label className={`text-[11px] font-medium mb-1.5 block ${'text-muted-foreground'}`}>
                    Search business (Mapbox)
                  </label>
                  <div className="relative">
                    <Icon name="search" className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${'text-muted-foreground'}`} />
                    <input value={poiQuery} onChange={(e) => handlePoiQueryChange(e.target.value)}
                      onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Name, Branche oder Adresse eingeben…"
                      className={`${inputClass} pl-9 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]`} />
                    {sugLoading && <Icon name="loader-2" className={`absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin ${'text-muted-foreground'}`} />}

                    {showSuggestions && (
                      <div className="sq-overlay absolute z-20 top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto">
                        {sugLoading && suggestions.length === 0 ? (
                          <p className={`px-3 py-2.5 text-[11px] ${'text-muted-foreground'}`}>Searching…</p>
                        ) : sugError ? (
                          <p className="px-3 py-2.5 text-[11px] text-[color:var(--status-critical)]">Search failed. Try again or enter manually.</p>
                        ) : suggestions.length === 0 && poiQuery.trim().length >= 3 ? (
                          <p className={`px-3 py-2.5 text-[11px] ${'text-muted-foreground'}`}>No matches — enter details manually.</p>
                        ) : suggestions.map((s) => (
                          <button key={s.mapboxId} onMouseDown={() => selectSuggestion(s)}
                            className="w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-inset">
                            <Icon name="map-pin" className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${'text-[color:var(--brand)]'}`} />
                            <div>
                              <div className={`text-xs font-medium ${'text-foreground'}`}>{s.name}</div>
                              <div className={`text-[10px] ${'text-muted-foreground'}`}>{s.placeFormatted ?? s.fullAddress}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Company Name */}
              <div>
                <label className={`text-[11px] font-medium mb-1.5 block ${'text-muted-foreground'}`}>
                  Company / Vendor Name *
                </label>
                <div className="relative">
                  <Icon name="building-2" className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${'text-muted-foreground'}`} />
                  <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Company name" className={`${inputClass} pl-9`} />
                  {form.source === 'MAPBOX' && (
                    <StatusChip tone="info" className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px]">MAPBOX</StatusChip>
                  )}
                </div>
              </div>

              {/* Category + Source Type row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-[11px] font-medium mb-1.5 block ${'text-muted-foreground'}`}>Category</label>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as VendorCategory }))}
                    className={inputClass}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`text-[11px] font-medium mb-1.5 block ${'text-muted-foreground'}`}>Type</label>
                  <select value={form.sourceType} onChange={(e) => setForm((f) => ({ ...f, sourceType: e.target.value as VendorSourceType }))}
                    className={inputClass}>
                    <option value="LOCAL_BUSINESS">Local Business</option>
                    <option value="ONLINE_VENDOR">Online Vendor</option>
                  </select>
                </div>
              </div>

              {/* Address section */}
              <div>
                <label className={`text-[11px] font-medium mb-1.5 block ${'text-muted-foreground'}`}>Address</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input value={form.street} onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))} placeholder="Street" className={inputClass} />
                  <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="City" className={inputClass} />
                  <input value={form.postalCode} onChange={(e) => setForm((f) => ({ ...f, postalCode: e.target.value }))} placeholder="Postal Code" className={inputClass} />
                  <input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} placeholder="Country" className={inputClass} />
                </div>
              </div>

              {/* Contact row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className={`text-[11px] font-medium mb-1.5 block ${'text-muted-foreground'}`}>Phone</label>
                  <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" className={inputClass} />
                </div>
                <div>
                  <label className={`text-[11px] font-medium mb-1.5 block ${'text-muted-foreground'}`}>Email</label>
                  <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className={inputClass} />
                </div>
                <div>
                  <label className={`text-[11px] font-medium mb-1.5 block ${'text-muted-foreground'}`}>Website</label>
                  <input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://..." className={inputClass} />
                </div>
              </div>

              {/* Service areas */}
              <div>
                <label className={`text-[11px] font-medium mb-1.5 block ${'text-muted-foreground'}`}>Service Areas</label>
                <div className="flex flex-wrap gap-1.5">
                  {SERVICE_AREA_OPTIONS.map((sa) => {
                    const active = form.serviceAreas.includes(sa);
                    return (
                      <button key={sa} type="button"
                        onClick={() => setForm((f) => ({
                          ...f,
                          serviceAreas: active ? f.serviceAreas.filter((s) => s !== sa) : [...f.serviceAreas, sa],
                        }))}
                        className={`px-2 py-1 rounded-md text-[10px] font-medium transition border ${
                          active
                            ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)] border-transparent'
                            : 'bg-card text-muted-foreground border-border hover:text-foreground'
                        }`}>
                        {sa}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Contact person */}
              <div className="p-4 rounded-lg bg-muted/40 border border-border">
                <h4 className="text-[11px] font-semibold mb-3 flex items-center gap-1.5 text-muted-foreground">
                  <Icon name="user" className="w-3.5 h-3.5" /> Contact Person
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} placeholder="Full Name" className={inputClass} />
                  <input value={form.contactRole} onChange={(e) => setForm((f) => ({ ...f, contactRole: e.target.value }))} placeholder="Role / Function" className={inputClass} />
                  <input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))} placeholder="Direct Phone" className={inputClass} />
                  <input value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} placeholder="Direct Email" className={inputClass} />
                </div>
                <textarea value={form.contactNotes} onChange={(e) => setForm((f) => ({ ...f, contactNotes: e.target.value }))} placeholder="Contact notes (availability, preferences...)"
                  rows={2} className={`${inputClass} mt-2 resize-none`} />
              </div>

              {/* Vehicle linking moved to the Vendor Detail page */}
              <div className="flex items-start gap-2.5 rounded-lg p-3 bg-[color:var(--status-info-soft)] border border-transparent">
                <Icon name="car" className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${'text-[color:var(--brand)]'}`} />
                <p className={`text-[11px] leading-relaxed ${'text-muted-foreground'}`}>
                  Vehicle links (relation type, preferred, notes) are managed on the vendor detail page after saving.
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className={`text-[11px] font-medium mb-1.5 block ${'text-muted-foreground'}`}>Internal Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Internal notes about this vendor..."
                  rows={2} className={`${inputClass} resize-none`} />
              </div>
            </div>
      </FormDialog>
    </div>
  );
}

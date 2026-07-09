import { Briefcase, Building2, Car, Cog, Eye, Factory, FileSearch, Globe, Paintbrush, Shield, ShieldCheck, ShoppingCart, Sparkles, Star, Tag, Truck, Wrench } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

import { api } from '../../lib/api';
import type { Vendor, VendorCategory, VendorSource, VendorSourceType, VendorInput, VendorMapboxSuggestion } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { useFleetVehicles } from '../FleetContext';
import { PageHeader, StatusChip, EmptyState, SkeletonCard, FormDialog } from '../../components/patterns';
import { ServiceTaskCreateModal } from './service-center/ServiceTaskCreateModal';
import { VendorDirectoryCard } from './vendors/VendorDirectoryCard';
import {
  filterVendorDirectory,
  getVendorCategoryLabel,
  VENDOR_CATEGORIES,
  VENDOR_SERVICE_AREAS,
  vendorHasPreferredLink,
  type VendorDirectoryScope,
} from '../lib/vendor-directory.utils';

// ── constants ──────────────────────────────────────────

const CATEGORIES = VENDOR_CATEGORIES;
const SERVICE_AREA_OPTIONS = [...VENDOR_SERVICE_AREAS];

function getCategoryLabel(cat: VendorCategory): string {
  return getVendorCategoryLabel(cat);
}

// ── types ──────────────────────────────────────────────

interface VendorManagementViewProps {
  onOpenDetail?: (vendor: Vendor) => void;
  /** When true, page title is provided by FleetHubView. */
  embedded?: boolean;
  /** When true, nested inside ServiceCenterView — hide duplicate KPI strip. */
  embeddedInServiceCenter?: boolean;
}

type VendorScopeFilter = VendorDirectoryScope;

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

export function VendorManagementView({
  onOpenDetail,
  embedded = false,
  embeddedInServiceCenter = false,
}: VendorManagementViewProps) {
  const { orgId, hasPermission } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const canManage = hasPermission('vendor-management', 'write');

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<VendorCategory | 'ALL'>('ALL');
  const [serviceAreaFilter, setServiceAreaFilter] = useState<string | 'ALL'>('ALL');
  const [scopeFilter, setScopeFilter] = useState<VendorScopeFilter>('ALL');
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [showScopeFilter, setShowScopeFilter] = useState(false);
  const [showServiceAreaFilter, setShowServiceAreaFilter] = useState(false);
  const [createTaskVendor, setCreateTaskVendor] = useState<Vendor | null>(null);
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

  const filtered = useMemo(
    () =>
      filterVendorDirectory(vendors, {
        search,
        category: catFilter,
        serviceArea: serviceAreaFilter,
        scope: scopeFilter,
      }),
    [vendors, catFilter, serviceAreaFilter, scopeFilter, search],
  );

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
    if (scope === 'INACTIVE') return inactiveCount;
    if (scope === 'LINKED') return stats.withVehicles;
    if (scope === 'PREFERRED') return vendors.filter(vendorHasPreferredLink).length;
    return vendors.length;
  };
  const serviceAreaCount = (area: string | 'ALL') =>
    area === 'ALL' ? vendors.length : vendors.filter((v) => v.serviceAreas?.includes(area)).length;
  const inactiveCount = vendors.filter((vendor) => !vendor.isActive).length;
  const activeCategoryLabel = catFilter === 'ALL'
    ? (embeddedInServiceCenter ? 'Alle Kategorien' : 'All categories')
    : getCategoryLabel(catFilter);
  const activeScopeLabel =
    scopeFilter === 'ACTIVE' ? (embeddedInServiceCenter ? 'Aktive Partner' : 'Active partners') :
    scopeFilter === 'INACTIVE' ? (embeddedInServiceCenter ? 'Inaktive Partner' : 'Inactive partners') :
    scopeFilter === 'LINKED' ? (embeddedInServiceCenter ? 'Mit Fahrzeugen' : 'Vehicle-linked') :
    scopeFilter === 'PREFERRED' ? (embeddedInServiceCenter ? 'Bevorzugte Partner' : 'Preferred partners') :
    (embeddedInServiceCenter ? 'Alle Partner' : 'All partners');
  const activeServiceAreaLabel = serviceAreaFilter === 'ALL'
    ? (embeddedInServiceCenter ? 'Alle Leistungen' : 'All service areas')
    : serviceAreaFilter;
  const hasActiveFilters =
    Boolean(search.trim()) || catFilter !== 'ALL' || serviceAreaFilter !== 'ALL' || scopeFilter !== 'ALL';
  const clearFilters = () => {
    setSearch('');
    setCatFilter('ALL');
    setServiceAreaFilter('ALL');
    setScopeFilter('ALL');
    setShowCategoryFilter(false);
    setShowScopeFilter(false);
    setShowServiceAreaFilter(false);
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
      className="sq-3d-btn sq-3d-btn--primary flex items-center gap-2 px-3 py-2 text-[10px] font-semibold"
    >
      <Icon name="plus" className="h-4 w-4" />
      Add Partner
    </button>
  ) : undefined;

  return (
    <div className={`${embedded ? '' : 'max-w-[1600px] mx-auto'} space-y-5`}>
      {embedded ? (
        embeddedInServiceCenter ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Partnerverzeichnis
              </p>
              <h3 className="text-sm font-semibold tracking-[-0.02em] text-foreground">
                Dienstleister & Werkstätten
              </h3>
            </div>
            {addVendorAction}
          </div>
        ) : addVendorAction ? (
          <div className="flex justify-end">{addVendorAction}</div>
        ) : null
      ) : (
      <PageHeader
        title="Service"
        actions={addVendorAction}
      />
      )}

      {/* Segment metrics */}
      {!embeddedInServiceCenter && (
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
              className={`group surface-premium sq-press rounded-2xl p-4 text-left shadow-[var(--shadow-1)] transition-all ${
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
      )}

      {/* Search + Filter */}
      <div className="surface-premium rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon name="filter" className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <h2 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">
                {embeddedInServiceCenter ? 'Partnerverzeichnis filtern' : 'Filters'}
              </h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {embeddedInServiceCenter
                  ? `${filtered.length} von ${vendors.length} Partnern`
                  : `Showing ${filtered.length} of ${vendors.length} partners`}
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
            {serviceAreaFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setServiceAreaFilter('ALL')}
                className="rounded-full px-2 py-1 text-[10px] font-semibold sq-tone-info"
              >
                {activeServiceAreaLabel} ×
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
              placeholder={embeddedInServiceCenter
                ? 'Partner, Ort, Kontakt oder Leistung suchen…'
                : 'Search vendors, city, contact or service area...'}
              className="w-full rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground py-2.5 pl-10 pr-4 text-xs outline-none transition-all focus:border-[color:var(--brand)]"
            />
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowCategoryFilter(false);
                setShowServiceAreaFilter(false);
                setShowScopeFilter(!showScopeFilter);
              }}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium transition-all ${
                scopeFilter !== 'ALL'
                  ? 'bg-[color:var(--brand-soft)] border-transparent text-[color:var(--brand-ink)]'
                  : 'surface-premium border-border text-foreground hover:bg-muted'
              }`}
            >
              <span>{activeScopeLabel}</span>
              <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${showScopeFilter ? 'rotate-180' : ''}`} />
            </button>
            {showScopeFilter && (
              <div className="absolute right-0 top-full z-50 mt-2 min-w-[220px] overflow-hidden rounded-lg border border-border bg-popover shadow-[var(--shadow-2)] sm:left-0 sm:right-auto">
                {[
                  { value: 'ALL' as const, label: embeddedInServiceCenter ? 'Alle Partner' : 'All partners', icon: Briefcase },
                  { value: 'ACTIVE' as const, label: embeddedInServiceCenter ? 'Aktive Partner' : 'Active partners', icon: Wrench },
                  { value: 'INACTIVE' as const, label: embeddedInServiceCenter ? 'Inaktive Partner' : 'Inactive partners', icon: Tag },
                  { value: 'LINKED' as const, label: embeddedInServiceCenter ? 'Mit Fahrzeugen' : 'Vehicle-linked', icon: Car },
                  { value: 'PREFERRED' as const, label: embeddedInServiceCenter ? 'Bevorzugte Partner' : 'Preferred partners', icon: Star },
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
                setShowCategoryFilter(false);
                setShowServiceAreaFilter(!showServiceAreaFilter);
              }}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium transition-all ${
                serviceAreaFilter !== 'ALL'
                  ? 'bg-[color:var(--brand-soft)] border-transparent text-[color:var(--brand-ink)]'
                  : 'surface-premium border-border text-foreground hover:bg-muted'
              }`}
            >
              <span className="max-w-[140px] truncate">{activeServiceAreaLabel}</span>
              <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${showServiceAreaFilter ? 'rotate-180' : ''}`} />
            </button>
            {showServiceAreaFilter && (
              <div className="absolute right-0 top-full z-50 mt-2 max-h-[280px] min-w-[240px] overflow-y-auto rounded-lg border border-border bg-popover shadow-[var(--shadow-2)] sm:left-0 sm:right-auto">
                <button
                  type="button"
                  onClick={() => {
                    setServiceAreaFilter('ALL');
                    setShowServiceAreaFilter(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                    serviceAreaFilter === 'ALL'
                      ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                      : 'text-foreground hover:bg-muted'
                  }`}
                >
                  <span>{embeddedInServiceCenter ? 'Alle Leistungen' : 'All service areas'}</span>
                  <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums sq-tone-neutral">
                    {serviceAreaCount('ALL')}
                  </span>
                </button>
                {SERVICE_AREA_OPTIONS.map((area) => {
                  const selected = serviceAreaFilter === area;
                  return (
                    <button
                      key={area}
                      type="button"
                      onClick={() => {
                        setServiceAreaFilter(area);
                        setShowServiceAreaFilter(false);
                      }}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                        selected
                          ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <span className="truncate">{area}</span>
                      <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums sq-tone-neutral">
                        {serviceAreaCount(area)}
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
                setShowServiceAreaFilter(false);
                setShowCategoryFilter(!showCategoryFilter);
              }}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-xs font-medium transition-all ${
                catFilter !== 'ALL'
                  ? 'bg-[color:var(--brand-soft)] border-transparent text-[color:var(--brand-ink)]'
                  : 'surface-premium border-border text-foreground hover:bg-muted'
              }`}
            >
              <span>{activeCategoryLabel}</span>
              <Icon name="chevron-down" className={`h-3.5 w-3.5 transition-transform ${showCategoryFilter ? 'rotate-180' : ''}`} />
            </button>
            {showCategoryFilter && (
              <div className="absolute right-0 top-full z-50 mt-2 min-w-[250px] overflow-hidden rounded-lg border border-border bg-popover shadow-[var(--shadow-2)] sm:left-0 sm:right-auto">
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
        <div className="surface-premium rounded-2xl shadow-[var(--shadow-1)]">
          <EmptyState
            icon={<Icon name="store" className="h-5 w-5" />}
            title={vendors.length === 0 ? 'No service partners yet' : 'No matching vendors'}
            description={vendors.length === 0 ? 'Add your first workshop, tire dealer, or service partner.' : 'Try adjusting your search or filter.'}
            action={vendors.length === 0 && canManage ? (
              <button
                type="button"
                onClick={openCreate}
                className="sq-3d-btn sq-3d-btn--primary inline-flex items-center gap-2 px-3 py-2 text-[10px] font-semibold"
              >
                <Icon name="plus" className="h-4 w-4" />
                Add Vendor
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((v) => (
            <VendorDirectoryCard
              key={v.id}
              vendor={v}
              onView={(vendor) => onOpenDetail?.(vendor)}
              onEdit={canManage ? openEdit : undefined}
              onCreateTask={() => setCreateTaskVendor(v)}
            />
          ))}
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
                  className="sq-3d-btn sq-3d-btn--destructive px-3 py-2 text-[11px] font-semibold"
                >
                  Delete Vendor
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="sq-3d-btn sq-3d-btn--neutral px-4 py-2 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !canManage}
                className="sq-3d-btn sq-3d-btn--primary px-4 py-2 text-xs font-medium disabled:opacity-50"
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
                            : 'surface-premium text-muted-foreground border-border hover:text-foreground'
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

      <ServiceTaskCreateModal
        open={createTaskVendor != null}
        onOpenChange={(open) => {
          if (!open) setCreateTaskVendor(null);
        }}
        vendors={vendors}
        defaultVendorId={createTaskVendor?.id ?? null}
      />
    </div>
  );
}

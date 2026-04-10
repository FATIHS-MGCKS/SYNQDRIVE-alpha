import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Search, Plus, Briefcase, MapPin, Phone, Mail, Globe, ChevronRight,
  Wrench, Paintbrush, Car, Shield, Cog, ShoppingCart, Sparkles, Eye,
  X, Loader2, Building2, User, Tag, ExternalLink, Store, Truck,
  Filter,
} from 'lucide-react';
import { api } from '../../lib/api';
import type { Vendor, VendorCategory, VendorSourceType, PlaceSuggestion, PlaceDetails } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { useFleetVehicles } from '../FleetContext';

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
  isDarkMode: boolean;
  onOpenDetail?: (vendor: Vendor) => void;
}

interface VendorFormData {
  name: string;
  category: VendorCategory;
  sourceType: VendorSourceType;
  street: string;
  city: string;
  postalCode: string;
  country: string;
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
  vehicleIds: string[];
}

const emptyForm: VendorFormData = {
  name: '', category: 'WORKSHOP', sourceType: 'LOCAL_BUSINESS',
  street: '', city: '', postalCode: '', country: '', website: '', phone: '',
  email: '', notes: '', serviceAreas: [], contactName: '', contactRole: '',
  contactPhone: '', contactEmail: '', contactNotes: '', vehicleIds: [],
};

// ── component ──────────────────────────────────────────

export function VendorManagementView({ isDarkMode, onOpenDetail }: VendorManagementViewProps) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const isDark = isDarkMode;

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<VendorCategory | 'ALL'>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<VendorFormData>({ ...emptyForm });

  // place suggestion state
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [sugLoading, setSugLoading] = useState(false);
  const sugTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [showSuggestions, setShowSuggestions] = useState(false);

  const cardClass = isDark
    ? 'bg-neutral-900 border border-neutral-700 rounded-xl'
    : 'bg-white border border-gray-200 rounded-xl';

  const inputClass = `w-full rounded-lg px-3 py-2 text-xs outline-none transition ${
    isDark ? 'bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:border-blue-500/50' :
    'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400'
  }`;

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
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((v) =>
        v.name.toLowerCase().includes(q) ||
        v.city?.toLowerCase().includes(q) ||
        v.contactName?.toLowerCase().includes(q) ||
        v.serviceAreas.some((sa) => sa.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [vendors, catFilter, search]);

  const stats = useMemo(() => {
    const active = vendors.filter((v) => v.isActive).length;
    const cats = new Set(vendors.map((v) => v.category));
    const linked = vendors.filter((v) => v.linkedVehicleCount > 0).length;
    return { total: vendors.length, active, categories: cats.size, withVehicles: linked };
  }, [vendors]);

  // ── place search ─────────────────────────────────────

  const handleNameChange = (value: string) => {
    setForm((f) => ({ ...f, name: value }));
    if (sugTimeout.current) clearTimeout(sugTimeout.current);
    if (value.length < 3 || !orgId) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSugLoading(true);
    setShowSuggestions(true);
    sugTimeout.current = setTimeout(() => {
      api.vendors.searchPlaces(orgId, value)
        .then((res) => setSuggestions(Array.isArray(res) ? res : []))
        .catch(() => setSuggestions([]))
        .finally(() => setSugLoading(false));
    }, 350);
  };

  const selectPlace = async (sug: PlaceSuggestion) => {
    setShowSuggestions(false);
    setSuggestions([]);
    if (!orgId) return;
    const details = await api.vendors.placeDetails(orgId, sug.placeId).catch(() => null);
    if (details) {
      setForm((f) => ({
        ...f,
        name: details.name ?? sug.name,
        street: details.street ?? f.street,
        city: details.city ?? f.city,
        postalCode: details.postalCode ?? f.postalCode,
        country: details.country ?? f.country,
        phone: details.phone ?? f.phone,
        website: details.website ?? f.website,
      }));
    } else {
      setForm((f) => ({ ...f, name: sug.name }));
    }
  };

  // ── save ─────────────────────────────────────────────

  const handleSave = async () => {
    if (!orgId || !form.name.trim()) return;
    setSaving(true);
    try {
      if (editVendor) {
        await api.vendors.update(orgId, editVendor.id, form);
      } else {
        await api.vendors.create(orgId, form);
      }
      setShowCreate(false);
      setEditVendor(null);
      setForm({ ...emptyForm });
      loadVendors();
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!orgId) return;
    await api.vendors.delete(orgId, id).catch(() => null);
    loadVendors();
  };

  const openEdit = (v: Vendor) => {
    setForm({
      name: v.name, category: v.category, sourceType: v.sourceType,
      street: v.street ?? '', city: v.city ?? '', postalCode: v.postalCode ?? '',
      country: v.country ?? '', website: v.website ?? '', phone: v.phone ?? '',
      email: v.email ?? '', notes: v.notes ?? '',
      serviceAreas: v.serviceAreas ?? [],
      contactName: v.contactName ?? '', contactRole: v.contactRole ?? '',
      contactPhone: v.contactPhone ?? '', contactEmail: v.contactEmail ?? '',
      contactNotes: v.contactNotes ?? '',
      vehicleIds: v.linkedVehicles.map((lv) => lv.id),
    });
    setEditVendor(v);
    setShowCreate(true);
  };

  // ── render ───────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Partners', value: stats.total, color: 'blue' },
          { label: 'Active', value: stats.active, color: 'emerald' },
          { label: 'Categories', value: stats.categories, color: 'purple' },
          { label: 'Vehicle-Linked', value: stats.withVehicles, color: 'amber' },
        ].map((s) => (
          <div key={s.label} className={`${cardClass} p-4`}>
            <div className={`text-[10px] uppercase tracking-wider font-medium ${isDark ? 'text-neutral-500' : 'text-gray-400'}`}>{s.label}</div>
            <div className={`text-2xl font-bold mt-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter + Add */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isDark ? 'text-neutral-500' : 'text-gray-400'}`} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors..."
            className={`${inputClass} pl-9`} />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button onClick={() => setCatFilter('ALL')}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition whitespace-nowrap ${
              catFilter === 'ALL'
                ? (isDark ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-700 border border-blue-200')
                : (isDark ? 'bg-neutral-800/50 text-neutral-400 border border-neutral-700/30 hover:text-white' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:text-gray-900')
            }`}>All</button>
          {CATEGORIES.slice(0, 6).map((cat) => (
            <button key={cat.value} onClick={() => setCatFilter(catFilter === cat.value ? 'ALL' : cat.value)}
              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition whitespace-nowrap ${
                catFilter === cat.value
                  ? (isDark ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-700 border border-blue-200')
                  : (isDark ? 'bg-neutral-800/50 text-neutral-400 border border-neutral-700/30 hover:text-white' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:text-gray-900')
              }`}>{cat.label}</button>
          ))}
        </div>

        <button onClick={() => { setForm({ ...emptyForm }); setEditVendor(null); setShowCreate(true); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm">
          <Plus className="w-3.5 h-3.5" /> Add Vendor
        </button>
      </div>

      {/* Vendor list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className={`w-6 h-6 animate-spin ${isDark ? 'text-neutral-500' : 'text-gray-300'}`} />
        </div>
      ) : filtered.length === 0 ? (
        <div className={`${cardClass} p-8 text-center`}>
          <Store className={`w-8 h-8 mx-auto mb-3 ${isDark ? 'text-neutral-600' : 'text-gray-300'}`} />
          <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {vendors.length === 0 ? 'No service partners yet' : 'No matching vendors'}
          </p>
          <p className={`text-xs mt-1 ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
            {vendors.length === 0 ? 'Add your first workshop, tire dealer, or service partner.' : 'Try adjusting your search or filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((v) => {
            const CatIcon = getCategoryIcon(v.category);
            return (
              <div key={v.id} className={`${cardClass} p-4 hover:shadow-lg transition-all duration-200 cursor-pointer group`}
                onClick={() => onOpenDetail?.(v)}>
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isDark ? 'bg-neutral-800' : 'bg-gray-100'
                  }`}>
                    <CatIcon className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{v.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                        v.sourceType === 'ONLINE_VENDOR'
                          ? (isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-50 text-purple-600')
                          : (isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
                      }`}>{v.sourceType === 'ONLINE_VENDOR' ? 'Online' : 'Local'}</span>
                    </div>
                    <div className={`flex items-center gap-3 text-[11px] mt-0.5 ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                      <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{getCategoryLabel(v.category)}</span>
                      {v.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{v.city}</span>}
                      {v.contactName && <span className="flex items-center gap-1"><User className="w-3 h-3" />{v.contactName}</span>}
                    </div>
                  </div>

                  {/* Service areas */}
                  <div className="hidden md:flex items-center gap-1 max-w-[200px] overflow-hidden">
                    {v.serviceAreas.slice(0, 3).map((sa) => (
                      <span key={sa} className={`px-1.5 py-0.5 rounded text-[9px] font-medium whitespace-nowrap ${
                        isDark ? 'bg-neutral-800 text-neutral-300' : 'bg-gray-100 text-gray-600'
                      }`}>{sa}</span>
                    ))}
                    {v.serviceAreas.length > 3 && (
                      <span className={`text-[9px] ${isDark ? 'text-neutral-500' : 'text-gray-400'}`}>+{v.serviceAreas.length - 3}</span>
                    )}
                  </div>

                  {/* Vehicle count */}
                  <div className={`text-center shrink-0 ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                    <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{v.linkedVehicleCount}</div>
                    <div className="text-[9px]">Vehicles</div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${isDark ? 'text-neutral-600' : 'text-gray-300'}`} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setShowCreate(false); setEditVendor(null); }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl ${isDark ? 'bg-neutral-900 border border-neutral-700' : 'bg-white border border-gray-200'}`}
            onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className={`sticky top-0 z-10 flex items-center justify-between p-5 border-b ${isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-100'}`}>
              <div>
                <h2 className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                  {editVendor ? 'Edit Vendor' : 'Add New Vendor'}
                </h2>
                <p className={`text-[11px] mt-0.5 ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>
                  {editVendor ? 'Update vendor information' : 'Start typing a company name for suggestions'}
                </p>
              </div>
              <button onClick={() => { setShowCreate(false); setEditVendor(null); }}
                className={`p-1.5 rounded-lg transition ${isDark ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-gray-100 text-gray-400'}`}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Company Name + suggestion */}
              <div>
                <label className={`text-[11px] font-medium mb-1.5 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>
                  Company / Vendor Name *
                </label>
                <div className="relative">
                  <Building2 className={`absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${isDark ? 'text-neutral-500' : 'text-gray-400'}`} />
                  <input value={form.name} onChange={(e) => handleNameChange(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="Type company name..." className={`${inputClass} pl-9`} />
                  {sugLoading && <Loader2 className={`absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin ${isDark ? 'text-neutral-500' : 'text-gray-400'}`} />}

                  {showSuggestions && suggestions.length > 0 && (
                    <div className={`absolute z-20 top-full left-0 right-0 mt-1 rounded-lg shadow-xl border max-h-60 overflow-y-auto ${
                      isDark ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-gray-200'
                    }`}>
                      {suggestions.map((s) => (
                        <button key={s.placeId} onMouseDown={() => selectPlace(s)}
                          className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition ${
                            isDark ? 'hover:bg-neutral-700/60' : 'hover:bg-gray-50'
                          }`}>
                          <MapPin className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
                          <div>
                            <div className={`text-xs font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{s.name}</div>
                            <div className={`text-[10px] ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>{s.address}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Category + Source Type row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-[11px] font-medium mb-1.5 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Category</label>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as VendorCategory }))}
                    className={inputClass}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`text-[11px] font-medium mb-1.5 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Type</label>
                  <select value={form.sourceType} onChange={(e) => setForm((f) => ({ ...f, sourceType: e.target.value as VendorSourceType }))}
                    className={inputClass}>
                    <option value="LOCAL_BUSINESS">Local Business</option>
                    <option value="ONLINE_VENDOR">Online Vendor</option>
                  </select>
                </div>
              </div>

              {/* Address section */}
              <div>
                <label className={`text-[11px] font-medium mb-1.5 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Address</label>
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
                  <label className={`text-[11px] font-medium mb-1.5 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Phone</label>
                  <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" className={inputClass} />
                </div>
                <div>
                  <label className={`text-[11px] font-medium mb-1.5 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Email</label>
                  <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className={inputClass} />
                </div>
                <div>
                  <label className={`text-[11px] font-medium mb-1.5 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Website</label>
                  <input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://..." className={inputClass} />
                </div>
              </div>

              {/* Service areas */}
              <div>
                <label className={`text-[11px] font-medium mb-1.5 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Service Areas</label>
                <div className="flex flex-wrap gap-1.5">
                  {SERVICE_AREA_OPTIONS.map((sa) => {
                    const active = form.serviceAreas.includes(sa);
                    return (
                      <button key={sa} type="button"
                        onClick={() => setForm((f) => ({
                          ...f,
                          serviceAreas: active ? f.serviceAreas.filter((s) => s !== sa) : [...f.serviceAreas, sa],
                        }))}
                        className={`px-2 py-1 rounded-md text-[10px] font-medium transition ${
                          active
                            ? (isDark ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-blue-50 text-blue-700 border border-blue-200')
                            : (isDark ? 'bg-neutral-800 text-neutral-400 border border-neutral-700/30 hover:text-white' : 'bg-gray-50 text-gray-500 border border-gray-200 hover:text-gray-900')
                        }`}>
                        {sa}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Contact person */}
              <div className={`p-4 rounded-lg ${isDark ? 'bg-neutral-800/40 border border-neutral-700/30' : 'bg-gray-50/80 border border-gray-100'}`}>
                <h4 className={`text-[11px] font-semibold mb-3 flex items-center gap-1.5 ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>
                  <User className="w-3.5 h-3.5" /> Contact Person
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

              {/* Vehicle linking */}
              <div>
                <label className={`text-[11px] font-medium mb-1.5 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>
                  Link Vehicles ({form.vehicleIds.length} selected)
                </label>
                <div className={`max-h-36 overflow-y-auto rounded-lg border ${isDark ? 'border-neutral-700/50 bg-neutral-800/30' : 'border-gray-200 bg-gray-50/50'}`}>
                  {fleetVehicles.length === 0 ? (
                    <p className={`p-3 text-[11px] ${isDark ? 'text-neutral-500' : 'text-gray-400'}`}>No vehicles in fleet</p>
                  ) : fleetVehicles.map((fv) => {
                    const checked = form.vehicleIds.includes(fv.id);
                    return (
                      <label key={fv.id} className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition ${
                        isDark ? 'hover:bg-neutral-700/30' : 'hover:bg-gray-100/60'
                      }`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setForm((f) => ({
                            ...f,
                            vehicleIds: checked ? f.vehicleIds.filter((id) => id !== fv.id) : [...f.vehicleIds, fv.id],
                          }))}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5" />
                        <span className={`text-xs ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {fv.model} {fv.year ? `(${fv.year})` : ''}
                        </span>
                        <span className={`text-[10px] ${isDark ? 'text-neutral-500' : 'text-gray-400'}`}>{fv.license}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={`text-[11px] font-medium mb-1.5 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Internal Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Internal notes about this vendor..."
                  rows={2} className={`${inputClass} resize-none`} />
              </div>
            </div>

            {/* Modal footer */}
            <div className={`sticky bottom-0 p-5 border-t flex items-center justify-between ${isDark ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-100'}`}>
              <div>
                {editVendor && (
                  <button onClick={() => { handleDelete(editVendor.id); setShowCreate(false); setEditVendor(null); }}
                    className="text-[11px] text-red-500 hover:text-red-400 transition">Delete Vendor</button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowCreate(false); setEditVendor(null); }}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition ${isDark ? 'text-neutral-400 hover:text-white hover:bg-neutral-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}>
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || !form.name.trim()}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50 shadow-sm">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editVendor ? 'Save Changes' : 'Create Vendor'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

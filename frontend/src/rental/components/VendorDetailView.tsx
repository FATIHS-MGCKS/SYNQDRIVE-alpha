import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, Building2, MapPin, Phone, Mail, Globe, User, Tag,
  Wrench, Paintbrush, Car, Shield, Cog, ShoppingCart, Sparkles, Eye,
  Truck, Briefcase, ExternalLink, Edit3, Trash2, Plus, X, Loader2,
  Link2, Unlink, Store, ChevronDown,
} from 'lucide-react';
import { api } from '../../lib/api';
import type { Vendor, VendorCategory, VendorSourceType, PlaceSuggestion } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { useFleetVehicles } from '../FleetContext';

// ── shared constants ───────────────────────────────────

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

function getCategoryLabel(cat: VendorCategory) {
  return CATEGORIES.find((c) => c.value === cat)?.label ?? cat;
}
function getCategoryIcon(cat: VendorCategory) {
  return CATEGORIES.find((c) => c.value === cat)?.icon ?? Briefcase;
}

// ── types ──────────────────────────────────────────────

interface VendorDetailViewProps {
  isDarkMode: boolean;
  vendorId: string;
  onBack: () => void;
}

interface EditFormData {
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
}

// ── component ──────────────────────────────────────────

export function VendorDetailView({ isDarkMode, vendorId, onBack }: VendorDetailViewProps) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const isDark = isDarkMode;

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditFormData | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');

  const cardClass = isDark
    ? 'bg-neutral-900 border border-neutral-700 rounded-xl'
    : 'bg-white border border-gray-200 rounded-xl';

  const inputClass = `w-full rounded-lg px-3 py-2 text-xs outline-none transition ${
    isDark ? 'bg-neutral-800 border border-neutral-700 text-white placeholder-neutral-500 focus:border-blue-500/50' :
    'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400'
  }`;

  // ── load vendor ──────────────────────────────────────

  const loadVendor = useCallback(() => {
    if (!orgId || !vendorId) return;
    setLoading(true);
    api.vendors.get(orgId, vendorId).then(setVendor).catch(() => setVendor(null)).finally(() => setLoading(false));
  }, [orgId, vendorId]);

  useEffect(() => { loadVendor(); }, [loadVendor]);

  // ── editing ──────────────────────────────────────────

  const startEdit = () => {
    if (!vendor) return;
    setForm({
      name: vendor.name, category: vendor.category, sourceType: vendor.sourceType,
      street: vendor.street ?? '', city: vendor.city ?? '', postalCode: vendor.postalCode ?? '',
      country: vendor.country ?? '', website: vendor.website ?? '', phone: vendor.phone ?? '',
      email: vendor.email ?? '', notes: vendor.notes ?? '',
      serviceAreas: vendor.serviceAreas ?? [],
      contactName: vendor.contactName ?? '', contactRole: vendor.contactRole ?? '',
      contactPhone: vendor.contactPhone ?? '', contactEmail: vendor.contactEmail ?? '',
      contactNotes: vendor.contactNotes ?? '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!orgId || !vendor || !form) return;
    setSaving(true);
    try {
      await api.vendors.update(orgId, vendor.id, form);
      setEditing(false);
      setForm(null);
      loadVendor();
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!orgId || !vendor) return;
    await api.vendors.delete(orgId, vendor.id).catch(() => null);
    onBack();
  };

  // ── vehicle linking ──────────────────────────────────

  const handleLink = async (vehicleId: string) => {
    if (!orgId || !vendor) return;
    await api.vendors.linkVehicle(orgId, vendor.id, vehicleId).catch(() => null);
    loadVendor();
  };

  const handleUnlink = async (vehicleId: string) => {
    if (!orgId || !vendor) return;
    await api.vendors.unlinkVehicle(orgId, vendor.id, vehicleId).catch(() => null);
    loadVendor();
  };

  const availableToLink = fleetVehicles.filter((fv) => !vendor?.linkedVehicles.some((lv) => lv.id === fv.id));
  const filteredToLink = linkSearch.trim()
    ? availableToLink.filter((v) => `${v.model} ${v.license}`.toLowerCase().includes(linkSearch.toLowerCase()))
    : availableToLink;

  // ── render ───────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className={`w-6 h-6 animate-spin ${isDark ? 'text-neutral-500' : 'text-gray-300'}`} />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className={`${cardClass} p-8 text-center`}>
        <Store className={`w-8 h-8 mx-auto mb-3 ${isDark ? 'text-neutral-600' : 'text-gray-300'}`} />
        <p className={`text-sm font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>Vendor not found</p>
        <button onClick={onBack} className="mt-3 text-xs text-blue-500 hover:text-blue-400">Go back</button>
      </div>
    );
  }

  const CatIcon = getCategoryIcon(vendor.category);
  const address = [vendor.street, vendor.postalCode, vendor.city, vendor.country].filter(Boolean).join(', ');

  // ── detail view (non-editing) ────────────────────────

  if (!editing) {
    return (
      <div className="space-y-5">
        {/* Back + header */}
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={`p-2 rounded-lg transition ${isDark ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-gray-100 text-gray-400'}`}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-neutral-800' : 'bg-gray-100'}`}>
            <CatIcon className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className={`text-lg font-bold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{vendor.name}</h2>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                vendor.sourceType === 'ONLINE_VENDOR'
                  ? (isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-50 text-purple-600')
                  : (isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
              }`}>{vendor.sourceType === 'ONLINE_VENDOR' ? 'Online' : 'Local'}</span>
            </div>
            <p className={`text-[11px] ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>{getCategoryLabel(vendor.category)}</p>
          </div>
          <button onClick={startEdit}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
              isDark ? 'bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700' : 'bg-gray-100 text-gray-600 hover:text-gray-900 hover:bg-gray-200'
            }`}>
            <Edit3 className="w-3.5 h-3.5" /> Edit
          </button>
        </div>

        {/* Overview section */}
        <div className={`${cardClass} p-5`}>
          <h3 className={`text-xs font-semibold mb-4 ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Overview</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {address && (
              <InfoRow isDark={isDark} icon={MapPin} label="Address" value={address} />
            )}
            {vendor.phone && (
              <InfoRow isDark={isDark} icon={Phone} label="Phone" value={vendor.phone} href={`tel:${vendor.phone}`} />
            )}
            {vendor.email && (
              <InfoRow isDark={isDark} icon={Mail} label="Email" value={vendor.email} href={`mailto:${vendor.email}`} />
            )}
            {vendor.website && (
              <InfoRow isDark={isDark} icon={Globe} label="Website" value={vendor.website} href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`} external />
            )}
          </div>

          {/* Service Areas */}
          {vendor.serviceAreas.length > 0 && (
            <div className="mt-5">
              <h4 className={`text-[11px] font-medium mb-2 ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>Service Areas</h4>
              <div className="flex flex-wrap gap-1.5">
                {vendor.serviceAreas.map((sa) => (
                  <span key={sa} className={`px-2 py-1 rounded-md text-[10px] font-medium ${
                    isDark ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-blue-50 text-blue-600 border border-blue-100'
                  }`}>{sa}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Contact Person */}
        {vendor.contactName && (
          <div className={`${cardClass} p-5`}>
            <h3 className={`text-xs font-semibold mb-4 flex items-center gap-2 ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>
              <User className="w-3.5 h-3.5" /> Contact Person
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow isDark={isDark} icon={User} label="Name" value={vendor.contactName} />
              {vendor.contactRole && <InfoRow isDark={isDark} icon={Tag} label="Role" value={vendor.contactRole} />}
              {vendor.contactPhone && <InfoRow isDark={isDark} icon={Phone} label="Phone" value={vendor.contactPhone} href={`tel:${vendor.contactPhone}`} />}
              {vendor.contactEmail && <InfoRow isDark={isDark} icon={Mail} label="Email" value={vendor.contactEmail} href={`mailto:${vendor.contactEmail}`} />}
            </div>
            {vendor.contactNotes && (
              <p className={`mt-3 text-[11px] ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>{vendor.contactNotes}</p>
            )}
          </div>
        )}

        {/* Linked Vehicles */}
        <div className={`${cardClass} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-xs font-semibold flex items-center gap-2 ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>
              <Car className="w-3.5 h-3.5" /> Linked Vehicles ({vendor.linkedVehicleCount})
            </h3>
            <button onClick={() => setShowLinkModal(true)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition ${
                isDark ? 'bg-neutral-800 text-neutral-300 hover:text-white' : 'bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}>
              <Plus className="w-3 h-3" /> Link Vehicle
            </button>
          </div>

          {vendor.linkedVehicles.length === 0 ? (
            <p className={`text-[11px] ${isDark ? 'text-neutral-500' : 'text-gray-400'}`}>No vehicles linked yet</p>
          ) : (
            <div className="space-y-1.5">
              {vendor.linkedVehicles.map((lv) => (
                <div key={lv.id} className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${
                  isDark ? 'bg-neutral-800/40' : 'bg-gray-50'
                }`}>
                  <div>
                    <span className={`text-xs font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {lv.make} {lv.model} {lv.year ? `(${lv.year})` : ''}
                    </span>
                    <span className={`text-[10px] ml-2 ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>{lv.licensePlate ?? lv.vin}</span>
                  </div>
                  <button onClick={() => handleUnlink(lv.id)}
                    className={`p-1.5 rounded-lg transition ${isDark ? 'hover:bg-red-500/20 text-neutral-500 hover:text-red-400' : 'hover:bg-red-50 text-gray-400 hover:text-red-500'}`}>
                    <Unlink className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        {vendor.notes && (
          <div className={`${cardClass} p-5`}>
            <h3 className={`text-xs font-semibold mb-3 ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Internal Notes</h3>
            <p className={`text-xs whitespace-pre-wrap ${isDark ? 'text-neutral-300' : 'text-gray-700'}`}>{vendor.notes}</p>
          </div>
        )}

        {/* Metadata */}
        <div className={`text-[10px] flex items-center gap-4 px-1 ${isDark ? 'text-neutral-600' : 'text-gray-400'}`}>
          <span>Created {new Date(vendor.createdAt).toLocaleDateString('de-DE')}</span>
          <span>Updated {new Date(vendor.updatedAt).toLocaleDateString('de-DE')}</span>
        </div>

        {/* Link Vehicle Modal */}
        {showLinkModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowLinkModal(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div className={`relative w-full max-w-md max-h-[70vh] overflow-y-auto rounded-2xl shadow-2xl ${isDark ? 'bg-neutral-900 border border-neutral-700/50' : 'bg-white border border-gray-200'}`}
              onClick={(e) => e.stopPropagation()}>
              <div className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-neutral-800' : 'border-gray-100'}`}>
                <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Link Vehicle</h3>
                <button onClick={() => setShowLinkModal(false)} className={`p-1 rounded ${isDark ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-gray-100 text-gray-400'}`}>
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4">
                <input value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} placeholder="Search vehicles..." className={`${inputClass} mb-3`} />
                {filteredToLink.length === 0 ? (
                  <p className={`text-[11px] text-center py-6 ${isDark ? 'text-neutral-500' : 'text-gray-400'}`}>
                    {availableToLink.length === 0 ? 'All vehicles already linked' : 'No matching vehicles'}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {filteredToLink.map((v) => (
                      <button key={v.id} onClick={() => { handleLink(v.id); setShowLinkModal(false); setLinkSearch(''); }}
                        className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
                          isDark ? 'hover:bg-neutral-800' : 'hover:bg-gray-50'
                        }`}>
                        <Link2 className={`w-3.5 h-3.5 shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
                        <div>
                          <div className={`text-xs font-medium ${isDark ? 'text-white' : 'text-gray-900'}`}>{v.model}</div>
                          <div className={`text-[10px] ${isDark ? 'text-neutral-400' : 'text-gray-500'}`}>{v.license}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── edit mode ────────────────────────────────────────

  if (!form) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => { setEditing(false); setForm(null); }}
            className={`p-2 rounded-lg transition ${isDark ? 'hover:bg-neutral-800 text-neutral-400' : 'hover:bg-gray-100 text-gray-400'}`}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Edit Vendor</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDelete}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium text-red-500 hover:bg-red-500/10 transition">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button onClick={() => { setEditing(false); setForm(null); }}
            className={`px-3 py-2 rounded-lg text-xs font-medium transition ${isDark ? 'text-neutral-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !form.name.trim()}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50 shadow-sm">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Edit form */}
      <div className={`${cardClass} p-5 space-y-4`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={`text-[11px] font-medium mb-1 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Company Name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => f ? { ...f, name: e.target.value } : f)} className={inputClass} />
          </div>
          <div>
            <label className={`text-[11px] font-medium mb-1 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Category</label>
            <select value={form.category} onChange={(e) => setForm((f) => f ? { ...f, category: e.target.value as VendorCategory } : f)} className={inputClass}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className={`text-[11px] font-medium mb-1 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Type</label>
            <select value={form.sourceType} onChange={(e) => setForm((f) => f ? { ...f, sourceType: e.target.value as VendorSourceType } : f)} className={inputClass}>
              <option value="LOCAL_BUSINESS">Local Business</option>
              <option value="ONLINE_VENDOR">Online Vendor</option>
            </select>
          </div>
        </div>

        <div>
          <label className={`text-[11px] font-medium mb-1 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Address</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={form.street} onChange={(e) => setForm((f) => f ? { ...f, street: e.target.value } : f)} placeholder="Street" className={inputClass} />
            <input value={form.city} onChange={(e) => setForm((f) => f ? { ...f, city: e.target.value } : f)} placeholder="City" className={inputClass} />
            <input value={form.postalCode} onChange={(e) => setForm((f) => f ? { ...f, postalCode: e.target.value } : f)} placeholder="Postal Code" className={inputClass} />
            <input value={form.country} onChange={(e) => setForm((f) => f ? { ...f, country: e.target.value } : f)} placeholder="Country" className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className={`text-[11px] font-medium mb-1 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Phone</label>
            <input value={form.phone} onChange={(e) => setForm((f) => f ? { ...f, phone: e.target.value } : f)} className={inputClass} />
          </div>
          <div>
            <label className={`text-[11px] font-medium mb-1 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Email</label>
            <input value={form.email} onChange={(e) => setForm((f) => f ? { ...f, email: e.target.value } : f)} className={inputClass} />
          </div>
          <div>
            <label className={`text-[11px] font-medium mb-1 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Website</label>
            <input value={form.website} onChange={(e) => setForm((f) => f ? { ...f, website: e.target.value } : f)} className={inputClass} />
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
                  onClick={() => setForm((f) => f ? {
                    ...f,
                    serviceAreas: active ? f.serviceAreas.filter((s) => s !== sa) : [...f.serviceAreas, sa],
                  } : f)}
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
            <input value={form.contactName} onChange={(e) => setForm((f) => f ? { ...f, contactName: e.target.value } : f)} placeholder="Full Name" className={inputClass} />
            <input value={form.contactRole} onChange={(e) => setForm((f) => f ? { ...f, contactRole: e.target.value } : f)} placeholder="Role / Function" className={inputClass} />
            <input value={form.contactPhone} onChange={(e) => setForm((f) => f ? { ...f, contactPhone: e.target.value } : f)} placeholder="Direct Phone" className={inputClass} />
            <input value={form.contactEmail} onChange={(e) => setForm((f) => f ? { ...f, contactEmail: e.target.value } : f)} placeholder="Direct Email" className={inputClass} />
          </div>
          <textarea value={form.contactNotes} onChange={(e) => setForm((f) => f ? { ...f, contactNotes: e.target.value } : f)} placeholder="Contact notes..."
            rows={2} className={`${inputClass} mt-2 resize-none`} />
        </div>

        {/* Notes */}
        <div>
          <label className={`text-[11px] font-medium mb-1 block ${isDark ? 'text-neutral-300' : 'text-gray-600'}`}>Internal Notes</label>
          <textarea value={form.notes} onChange={(e) => setForm((f) => f ? { ...f, notes: e.target.value } : f)} placeholder="Internal notes..."
            rows={3} className={`${inputClass} resize-none`} />
        </div>
      </div>
    </div>
  );
}

// ── sub-components ─────────────────────────────────────

function InfoRow({ isDark, icon: Icon, label, value, href, external }: {
  isDark: boolean; icon: typeof MapPin; label: string; value: string; href?: string; external?: boolean;
}) {
  const content = (
    <div className="flex items-start gap-2.5">
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isDark ? 'text-neutral-500' : 'text-gray-400'}`} />
      <div>
        <div className={`text-[10px] ${isDark ? 'text-neutral-500' : 'text-gray-400'}`}>{label}</div>
        <div className={`text-xs font-medium ${isDark ? 'text-white' : 'text-gray-900'} ${href ? 'hover:text-blue-500 transition' : ''}`}>
          {value}
          {external && <ExternalLink className="w-2.5 h-2.5 inline ml-1 opacity-40" />}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>{content}</a>;
  }
  return content;
}

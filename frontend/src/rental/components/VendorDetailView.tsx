import {
  Briefcase, Building2, Car, Cog, Eye, Factory, FileSearch, Globe, Mail, MapPin,
  Paintbrush, Phone, Shield, ShieldCheck, ShoppingCart, Sparkles, Tag, Truck, User, Wrench, ClipboardList,
} from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useCallback } from 'react';

import { PageHeader, StatusChip, EmptyState, SkeletonCard } from '../../components/patterns';
import { api } from '../../lib/api';
import type {
  Vendor, VendorCategory, VendorSourceType, VendorVehicleRelationType,
  VendorLinkedVehicle, VendorVehicleLinkInput, VendorInvoiceRow, VendorAuditEntry,
} from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { useFleetVehicles } from '../FleetContext';
import { ServiceTaskCreateModal } from './service-center/ServiceTaskCreateModal';
import { VendorOperationalTasks, useVendorTaskStats } from './vendors/VendorOperationalTasks';
import {
  formatVendorAddress,
  getVendorCategoryIcon,
  getVendorCategoryLabel,
  VENDOR_CATEGORIES,
  VENDOR_SERVICE_AREAS,
} from '../lib/vendor-directory.utils';

// ── shared constants ───────────────────────────────────

const CATEGORIES = VENDOR_CATEGORIES;
const SERVICE_AREA_OPTIONS = [...VENDOR_SERVICE_AREAS];

const RELATION_TYPES: { value: VendorVehicleRelationType; label: string }[] = [
  { value: 'PRIMARY_WORKSHOP', label: 'Primary Workshop' },
  { value: 'TIRE_PARTNER', label: 'Tire Partner' },
  { value: 'BODY_SHOP', label: 'Body Shop' },
  { value: 'GLASS_REPAIR', label: 'Glass Repair' },
  { value: 'CLEANING_PARTNER', label: 'Cleaning Partner' },
  { value: 'INSPECTION_PARTNER', label: 'Inspection Partner' },
  { value: 'OTHER', label: 'Other' },
];

function getCategoryLabel(cat: VendorCategory) {
  return getVendorCategoryLabel(cat);
}
function getCategoryIcon(cat: VendorCategory) {
  return getVendorCategoryIcon(cat);
}
function getRelationLabel(rel: VendorVehicleRelationType) {
  return RELATION_TYPES.find((r) => r.value === rel)?.label ?? rel;
}

type DetailTab = 'overview' | 'vehicles' | 'tasks' | 'invoices' | 'documents' | 'history';

const TABS: { value: DetailTab; label: string }[] = [
  { value: 'overview', label: 'Übersicht' },
  { value: 'vehicles', label: 'Fahrzeuge' },
  { value: 'tasks', label: 'Aufgaben' },
  { value: 'invoices', label: 'Rechnungen' },
  { value: 'documents', label: 'Dokumente' },
  { value: 'history', label: 'Aktivität' },
];

// ── types ──────────────────────────────────────────────

interface VendorDetailViewProps {
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

interface LinkFormData {
  vehicleId: string;
  relationType: VendorVehicleRelationType;
  isPreferred: boolean;
  priority: string;
  validFrom: string;
  validUntil: string;
  notes: string;
}

const emptyLinkForm: LinkFormData = {
  vehicleId: '', relationType: 'PRIMARY_WORKSHOP', isPreferred: false,
  priority: '', validFrom: '', validUntil: '', notes: '',
};

// ── component ──────────────────────────────────────────

function formatRecordDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('de-DE') : null;
}

export function VendorDetailView({ vendorId, onBack }: VendorDetailViewProps) {
  const { orgId, hasPermission } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const canManage = hasPermission('vendor-management', 'write');
  const canViewFinancials = hasPermission('vendor-management', 'read');

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  // editing master data
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditFormData | null>(null);

  // vehicle link modal
  const [linkModal, setLinkModal] = useState<{ mode: 'create' | 'edit'; linkId?: string } | null>(null);
  const [linkForm, setLinkForm] = useState<LinkFormData>({ ...emptyLinkForm });
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');

  // tab data
  const [invoices, setInvoices] = useState<VendorInvoiceRow[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [audit, setAudit] = useState<VendorAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLoaded, setAuditLoaded] = useState(false);
  const [documents, setDocuments] = useState<Array<Record<string, unknown>>>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [allVendors, setAllVendors] = useState<Vendor[]>([]);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskVehicleId, setCreateTaskVehicleId] = useState<string | null>(null);

  const taskStats = useVendorTaskStats(orgId, vendorId);

  const cardClass = 'surface-premium rounded-xl';

  const inputClass = 'w-full rounded-lg px-3 py-2 text-xs outline-none transition border border-border bg-[color:var(--input-background)] text-foreground placeholder:text-muted-foreground focus:border-[color:var(--brand)]';

  // ── load vendor ──────────────────────────────────────

  const loadVendor = useCallback(() => {
    if (!orgId || !vendorId) return;
    setLoading(true);
    api.vendors.get(orgId, vendorId).then(setVendor).catch(() => setVendor(null)).finally(() => setLoading(false));
  }, [orgId, vendorId]);

  useEffect(() => { loadVendor(); }, [loadVendor]);

  useEffect(() => {
    if (!orgId) return;
    api.vendors.list(orgId).then(setAllVendors).catch(() => setAllVendors([]));
  }, [orgId]);

  // lazy-load invoices when tab opens
  useEffect(() => {
    if (activeTab === 'invoices' && orgId && !invoicesLoaded) {
      setInvoicesLoading(true);
      api.vendors.invoices(orgId, vendorId)
        .then((rows) => setInvoices(Array.isArray(rows) ? rows : []))
        .catch(() => setInvoices([]))
        .finally(() => { setInvoicesLoading(false); setInvoicesLoaded(true); });
    }
  }, [activeTab, orgId, vendorId, invoicesLoaded]);

  // lazy-load audit when history tab opens
  useEffect(() => {
    if (activeTab === 'history' && orgId && !auditLoaded) {
      setAuditLoading(true);
      api.vendors.audit(orgId, vendorId)
        .then((rows) => setAudit(Array.isArray(rows) ? rows : []))
        .catch(() => setAudit([]))
        .finally(() => { setAuditLoading(false); setAuditLoaded(true); });
    }
  }, [activeTab, orgId, vendorId, auditLoaded]);

  useEffect(() => {
    if (activeTab === 'documents' && orgId && !documentsLoaded) {
      setDocumentsLoading(true);
      api.vendors.documents(orgId, vendorId)
        .then((rows) => setDocuments(Array.isArray(rows) ? rows : []))
        .catch(() => setDocuments([]))
        .finally(() => { setDocumentsLoading(false); setDocumentsLoaded(true); });
    }
  }, [activeTab, orgId, vendorId, documentsLoaded]);

  const openCreateTask = (vehicleId?: string | null) => {
    setCreateTaskVehicleId(vehicleId ?? null);
    setCreateTaskOpen(true);
  };

  // ── editing master data ──────────────────────────────

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
    if (!orgId || !vendor || !form || !canManage) return;
    setSaving(true);
    try {
      // Master data only — vehicle links are managed separately below.
      await api.vendors.update(orgId, vendor.id, {
        name: form.name.trim(),
        category: form.category,
        sourceType: form.sourceType,
        street: form.street || null,
        city: form.city || null,
        postalCode: form.postalCode || null,
        country: form.country || null,
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
      setEditing(false);
      setForm(null);
      loadVendor();
    } catch { /* silent */ }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!orgId || !vendor || !canManage) return;
    await api.vendors.delete(orgId, vendor.id).catch(() => null);
    onBack();
  };

  // ── vehicle linking ──────────────────────────────────

  const openCreateLink = () => {
    setLinkForm({ ...emptyLinkForm });
    setLinkSearch('');
    setLinkModal({ mode: 'create' });
  };

  const openEditLink = (lv: VendorLinkedVehicle) => {
    setLinkForm({
      vehicleId: lv.id,
      relationType: lv.relationType,
      isPreferred: lv.isPreferred,
      priority: lv.priority != null ? String(lv.priority) : '',
      validFrom: lv.validFrom ? lv.validFrom.slice(0, 10) : '',
      validUntil: lv.validUntil ? lv.validUntil.slice(0, 10) : '',
      notes: lv.notes ?? '',
    });
    setLinkModal({ mode: 'edit', linkId: lv.vendorVehicleId });
  };

  const submitLink = async () => {
    if (!orgId || !vendor || !linkModal || !canManage) return;
    if (linkModal.mode === 'create' && !linkForm.vehicleId) return;
    setLinkSaving(true);
    const priorityNum = linkForm.priority.trim() ? Number(linkForm.priority) : null;
    try {
      if (linkModal.mode === 'create') {
        const payload: VendorVehicleLinkInput = {
          vehicleId: linkForm.vehicleId,
          relationType: linkForm.relationType,
          isPreferred: linkForm.isPreferred,
          priority: priorityNum != null && !Number.isNaN(priorityNum) ? priorityNum : null,
          validFrom: linkForm.validFrom || null,
          validUntil: linkForm.validUntil || null,
          notes: linkForm.notes || null,
        };
        await api.vendors.linkVehicle(orgId, vendor.id, payload);
      } else if (linkModal.linkId) {
        await api.vendors.updateLink(orgId, vendor.id, linkModal.linkId, {
          relationType: linkForm.relationType,
          isPreferred: linkForm.isPreferred,
          priority: priorityNum != null && !Number.isNaN(priorityNum) ? priorityNum : null,
          validFrom: linkForm.validFrom || null,
          validUntil: linkForm.validUntil || null,
          notes: linkForm.notes || null,
        });
      }
      setLinkModal(null);
      loadVendor();
    } catch { /* silent */ }
    setLinkSaving(false);
  };

  const handleUnlink = async (linkId: string) => {
    if (!orgId || !vendor || !canManage) return;
    await api.vendors.unlinkVehicle(orgId, vendor.id, linkId).catch(() => null);
    loadVendor();
  };

  const availableToLink = fleetVehicles.filter((fv) => !vendor?.linkedVehicles.some((lv) => lv.id === fv.id));
  const filteredToLink = linkSearch.trim()
    ? availableToLink.filter((v) => `${v.model} ${v.license}`.toLowerCase().includes(linkSearch.toLowerCase()))
    : availableToLink;

  // ── loading / not-found ──────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className={cardClass}>
        <EmptyState
          icon={<Icon name="store" className="h-5 w-5" />}
          title="Vendor not found"
          description="This vendor may have been removed or you may not have access."
          action={(
            <button
              type="button"
              onClick={onBack}
              className="text-xs font-medium text-[color:var(--brand)] hover:opacity-80"
            >
              Go back
            </button>
          )}
        />
      </div>
    );
  }

  const CatIcon = getCategoryIcon(vendor.category);
  const address = formatVendorAddress(vendor);

  // ── edit mode (master data) ──────────────────────────

  if (editing && form) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => { setEditing(false); setForm(null); }}
              className={`p-2 rounded-lg transition ${'hover:bg-muted text-muted-foreground'}`}>
              <Icon name="arrow-left" className="w-4 h-4" />
            </button>
            <h2 className={`text-lg font-bold ${'text-foreground'}`}>Edit Vendor</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditing(false); setForm(null); }}
              className="sq-3d-btn sq-3d-btn--neutral px-3 py-2 text-xs font-medium">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving || !form.name.trim()}
              className="sq-3d-btn sq-3d-btn--primary px-4 py-2 text-xs font-medium disabled:opacity-50">
              {saving ? <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> : 'Save Changes'}
            </button>
          </div>
        </div>

        <div className={`${cardClass} p-5 space-y-4`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={`text-[11px] font-medium mb-1 block ${'text-muted-foreground'}`}>Company Name *</label>
              <input value={form.name} onChange={(e) => setForm((f) => f ? { ...f, name: e.target.value } : f)} className={inputClass} />
            </div>
            <div>
              <label className={`text-[11px] font-medium mb-1 block ${'text-muted-foreground'}`}>Category</label>
              <select value={form.category} onChange={(e) => setForm((f) => f ? { ...f, category: e.target.value as VendorCategory } : f)} className={inputClass}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className={`text-[11px] font-medium mb-1 block ${'text-muted-foreground'}`}>Type</label>
              <select value={form.sourceType} onChange={(e) => setForm((f) => f ? { ...f, sourceType: e.target.value as VendorSourceType } : f)} className={inputClass}>
                <option value="LOCAL_BUSINESS">Local Business</option>
                <option value="ONLINE_VENDOR">Online Vendor</option>
              </select>
            </div>
          </div>

          <div>
            <label className={`text-[11px] font-medium mb-1 block ${'text-muted-foreground'}`}>Address</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={form.street} onChange={(e) => setForm((f) => f ? { ...f, street: e.target.value } : f)} placeholder="Street" className={inputClass} />
              <input value={form.city} onChange={(e) => setForm((f) => f ? { ...f, city: e.target.value } : f)} placeholder="City" className={inputClass} />
              <input value={form.postalCode} onChange={(e) => setForm((f) => f ? { ...f, postalCode: e.target.value } : f)} placeholder="Postal Code" className={inputClass} />
              <input value={form.country} onChange={(e) => setForm((f) => f ? { ...f, country: e.target.value } : f)} placeholder="Country" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className={`text-[11px] font-medium mb-1 block ${'text-muted-foreground'}`}>Phone</label>
              <input value={form.phone} onChange={(e) => setForm((f) => f ? { ...f, phone: e.target.value } : f)} className={inputClass} />
            </div>
            <div>
              <label className={`text-[11px] font-medium mb-1 block ${'text-muted-foreground'}`}>Email</label>
              <input value={form.email} onChange={(e) => setForm((f) => f ? { ...f, email: e.target.value } : f)} className={inputClass} />
            </div>
            <div>
              <label className={`text-[11px] font-medium mb-1 block ${'text-muted-foreground'}`}>Website</label>
              <input value={form.website} onChange={(e) => setForm((f) => f ? { ...f, website: e.target.value } : f)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={`text-[11px] font-medium mb-1.5 block ${'text-muted-foreground'}`}>Service Areas</label>
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
                        ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)] border border-transparent'
                        : 'surface-premium text-muted-foreground border border-border hover:text-foreground'
                    }`}>
                    {sa}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`p-4 rounded-lg ${'bg-muted/40 border border-border'}`}>
            <h4 className={`text-[11px] font-semibold mb-3 flex items-center gap-1.5 ${'text-muted-foreground'}`}>
              <Icon name="user" className="w-3.5 h-3.5" /> Contact Person
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

          <div>
            <label className={`text-[11px] font-medium mb-1 block ${'text-muted-foreground'}`}>Internal Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => f ? { ...f, notes: e.target.value } : f)} placeholder="Internal notes..."
              rows={3} className={`${inputClass} resize-none`} />
          </div>
        </div>
      </div>
    );
  }

  // ── detail view ──────────────────────────────────────

  return (
    <div className="space-y-5">
      <PageHeader
        variant="full"
        eyebrow={(
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 p-1.5 rounded-lg transition hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <Icon name="arrow-left" className="w-4 h-4" />
            <span>Zurück zum Partnerverzeichnis</span>
          </button>
        )}
        title={vendor.name}
        description={getCategoryLabel(vendor.category)}
        icon={<CatIcon className="w-4 h-4 text-[color:var(--brand)]" />}
        status={(
          <>
            {!vendor.isActive && (
              <StatusChip tone="watch">Inaktiv</StatusChip>
            )}
            {vendor.source === 'MAPBOX' && (
              <StatusChip tone="info">Mapbox</StatusChip>
            )}
          </>
        )}
        actions={(
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openCreateTask()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)] hover:opacity-90"
            >
              <ClipboardList className="w-3.5 h-3.5" /> Service-Aufgabe
            </button>
            {canManage && (
              <button
                type="button"
                onClick={startEdit}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition bg-muted text-foreground hover:bg-accent"
              >
                <Icon name="edit-3" className="w-3.5 h-3.5" /> Bearbeiten
              </button>
            )}
          </div>
        )}
      />

      {/* Tab bar */}
      <div className={`flex items-center gap-1 overflow-x-auto border-b ${'border-border'}`}>
        {TABS.map((t) => {
          const count =
            t.value === 'vehicles' ? vendor.linkedVehicleCount :
            t.value === 'invoices' ? vendor.invoiceCount :
            t.value === 'tasks' ? taskStats.open : undefined;
          const active = activeTab === t.value;
          return (
            <button key={t.value} onClick={() => setActiveTab(t.value)}
              className={`relative px-3 py-2.5 text-xs font-medium whitespace-nowrap transition ${
                active
                  ? ('text-foreground')
                  : 'text-muted-foreground hover:text-foreground'
              }`}>
              {t.label}
              {count != null && count > 0 && (
                <StatusChip tone="neutral" className="ml-1.5 text-[10px]">{count}</StatusChip>
              )}
              {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[color:var(--brand)] rounded-full" />}
            </button>
          );
        })}
      </div>

      {/* ── Overview tab ── */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="surface-premium rounded-xl p-3 text-center">
              <p className="text-lg font-bold tabular-nums text-foreground">{taskStats.open}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Offen</p>
            </div>
            <div className="surface-premium rounded-xl p-3 text-center">
              <p className="text-lg font-bold tabular-nums text-foreground">{taskStats.completed}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Erledigt</p>
            </div>
            <div className="surface-premium rounded-xl p-3 text-center">
              <p className="text-lg font-bold tabular-nums text-foreground">{vendor.linkedVehicleCount}</p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Fahrzeuge</p>
            </div>
            <div className="surface-premium rounded-xl p-3 text-center">
              <p className="text-[11px] font-semibold text-foreground">
                {taskStats.lastActivity
                  ? taskStats.lastActivity.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
                  : '—'}
              </p>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Letzte Nutzung</p>
            </div>
          </div>

          <div className={`${cardClass} p-5`}>
            <h3 className={`text-xs font-semibold mb-4 ${'text-muted-foreground'}`}>Kontakt & Adresse</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {address && <InfoRow icon={MapPin} label="Address" value={address} />}
              {vendor.phone && <InfoRow icon={Phone} label="Phone" value={vendor.phone} href={`tel:${vendor.phone}`} />}
              {vendor.email && <InfoRow icon={Mail} label="Email" value={vendor.email} href={`mailto:${vendor.email}`} />}
              {vendor.website && <InfoRow icon={Globe} label="Website" value={vendor.website} href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`} external />}
              {(vendor.latitude != null && vendor.longitude != null) && (
                <InfoRow icon={MapPin} label="Coordinates" value={`${vendor.latitude.toFixed(5)}, ${vendor.longitude.toFixed(5)}`} />
              )}
            </div>

            {vendor.serviceAreas.length > 0 && (
              <div className="mt-5">
                <h4 className={`text-[11px] font-medium mb-2 ${'text-muted-foreground'}`}>Leistungsbereiche</h4>
                <div className="flex flex-wrap gap-1.5">
                  {vendor.serviceAreas.map((sa) => (
                    <StatusChip key={sa} tone="info">{sa}</StatusChip>
                  ))}
                </div>
              </div>
            )}
          </div>

          {vendor.contactName && (
            <div className={`${cardClass} p-5`}>
              <h3 className={`text-xs font-semibold mb-4 flex items-center gap-2 ${'text-muted-foreground'}`}>
                <Icon name="user" className="w-3.5 h-3.5" /> Ansprechpartner
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoRow icon={User} label="Name" value={vendor.contactName} />
                {vendor.contactRole && <InfoRow icon={Tag} label="Role" value={vendor.contactRole} />}
                {vendor.contactPhone && <InfoRow icon={Phone} label="Phone" value={vendor.contactPhone} href={`tel:${vendor.contactPhone}`} />}
                {vendor.contactEmail && <InfoRow icon={Mail} label="Email" value={vendor.contactEmail} href={`mailto:${vendor.contactEmail}`} />}
              </div>
              {vendor.contactNotes && <p className={`mt-3 text-[11px] ${'text-muted-foreground'}`}>{vendor.contactNotes}</p>}
            </div>
          )}

          {vendor.notes && (
            <div className={`${cardClass} p-5`}>
              <h3 className={`text-xs font-semibold mb-3 ${'text-muted-foreground'}`}>Interne Notizen</h3>
              <p className={`text-xs whitespace-pre-wrap ${'text-foreground/80'}`}>{vendor.notes}</p>
            </div>
          )}

          <div className={`text-[10px] flex items-center gap-4 px-1 ${'text-muted-foreground/60'}`}>
            <span>Created {new Date(vendor.createdAt).toLocaleDateString('de-DE')}</span>
            <span>Updated {new Date(vendor.updatedAt).toLocaleDateString('de-DE')}</span>
          </div>
        </div>
      )}

      {/* ── Linked Vehicles tab ── */}
      {activeTab === 'vehicles' && (
        <div className={`${cardClass} p-5`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-xs font-semibold flex items-center gap-2 ${'text-muted-foreground'}`}>
              <Icon name="car" className="w-3.5 h-3.5" /> Verknüpfte Fahrzeuge ({vendor.linkedVehicleCount})
            </h3>
            <div className="flex items-center gap-2">
              {canManage && (
                <button onClick={openCreateLink}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition ${
                    'bg-muted text-foreground hover:bg-accent'
                  }`}>
                  <Icon name="plus" className="w-3 h-3" /> Fahrzeug verknüpfen
                </button>
              )}
            </div>
          </div>

          {vendor.linkedVehicles.length === 0 ? (
            <EmptyState
              compact
              icon={<Icon name="car" className="h-5 w-5" />}
              title="Noch keine Fahrzeuge verknüpft"
              description="Verknüpfen Sie Flottenfahrzeuge, um bevorzugte Werkstätten und Service-Beziehungen zu pflegen."
              action={canManage ? (
                <button
                  type="button"
                  onClick={openCreateLink}
                  className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1.5 text-[10px] font-medium text-foreground hover:bg-accent transition"
                >
                  <Icon name="plus" className="w-3 h-3" /> Fahrzeug verknüpfen
                </button>
              ) : undefined}
            />
          ) : (
            <div className="space-y-1.5">
              {vendor.linkedVehicles.map((lv) => (
                <div key={lv.vendorVehicleId} className={`flex items-start justify-between px-3 py-2.5 rounded-lg ${'bg-muted/40'}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium ${'text-foreground'}`}>
                        {lv.make} {lv.model} {lv.year ? `(${lv.year})` : ''}
                      </span>
                      <span className={`text-[10px] ${'text-muted-foreground'}`}>{lv.licensePlate ?? lv.vin}</span>
                      <StatusChip tone="neutral">{getRelationLabel(lv.relationType)}</StatusChip>
                      {lv.isPreferred && (
                        <StatusChip tone="info">Bevorzugt</StatusChip>
                      )}
                      {lv.priority != null && (
                        <span className={`text-[9px] ${'text-muted-foreground'}`}>Prio {lv.priority}</span>
                      )}
                    </div>
                    {lv.notes && <p className={`mt-1 text-[10px] ${'text-muted-foreground'}`}>{lv.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openCreateTask(lv.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-semibold border border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]"
                        title="Service-Aufgabe für dieses Fahrzeug"
                      >
                        <ClipboardList className="w-3 h-3" />
                        Aufgabe
                      </button>
                      {canManage && (
                        <>
                      <button onClick={() => openEditLink(lv)}
                        className="p-1.5 rounded-lg transition hover:bg-muted text-muted-foreground hover:text-foreground">
                        <Icon name="edit-3" className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleUnlink(lv.vendorVehicleId)}
                        className="p-1.5 rounded-lg transition hover:bg-[color:var(--status-critical-soft)] text-muted-foreground hover:text-[color:var(--status-critical)]">
                        <Icon name="unlink" className="w-3.5 h-3.5" />
                      </button>
                        </>
                      )}
                    </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Invoices tab ── */}
      {activeTab === 'invoices' && (
        <div className={`${cardClass} p-5`}>
          <h3 className={`text-xs font-semibold mb-4 flex items-center gap-2 ${'text-muted-foreground'}`}>
            <Icon name="file-text" className="w-3.5 h-3.5" /> Invoices ({vendor.invoiceCount})
          </h3>
          {!canViewFinancials ? (
            <p className={`text-[11px] ${'text-muted-foreground'}`}>You do not have permission to view financials.</p>
          ) : invoicesLoading ? (
            <SkeletonCard className="border-0 shadow-none bg-transparent p-0" />
          ) : invoices.length === 0 ? (
            <EmptyState
              compact
              icon={<Icon name="file-text" className="h-5 w-5" />}
              title="No invoices linked to this vendor yet"
            />
          ) : (
            <div className="space-y-1.5">
              {invoices.map((inv) => (
                <div key={inv.id} className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${'bg-muted/40'}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${'text-foreground'}`}>#{inv.invoiceNumber}</span>
                      <span className={`text-[11px] truncate ${'text-foreground/80'}`}>{inv.title}</span>
                    </div>
                    <div className={`text-[10px] ${'text-muted-foreground'}`}>
                      {new Date(inv.invoiceDate).toLocaleDateString('de-DE')} · {inv.status}
                    </div>
                  </div>
                  <span className={`text-xs font-semibold shrink-0 ${'text-foreground'}`}>
                    {(inv.totalCents / 100).toLocaleString('de-DE', { style: 'currency', currency: inv.currency || 'EUR' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Documents tab ── */}
      {activeTab === 'documents' && (
        <div className={`${cardClass} p-5`}>
          <h3 className={`text-xs font-semibold mb-4 flex items-center gap-2 ${'text-muted-foreground'}`}>
            <Icon name="file-text" className="w-3.5 h-3.5" /> Documents
          </h3>
          {documentsLoading ? (
            <SkeletonCard className="border-0 shadow-none bg-transparent p-0" />
          ) : documents.length === 0 ? (
            <EmptyState
              compact
              icon={<Icon name="file-text" className="h-5 w-5" />}
              title="No documents yet"
              description="Contracts, quotes and warranty documents linked to this vendor will appear here."
            />
          ) : (
            <div className="space-y-2">
              {documents.map((doc, idx) => {
                const createdLabel = formatRecordDate(doc.createdAt);
                return (
                <div key={String(doc.id ?? idx)} className="flex items-center justify-between gap-3 py-2 border-b border-border/50 last:border-0">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-foreground truncate">{String(doc.title ?? doc.name ?? 'Document')}</p>
                    {createdLabel != null && (
                      <p className="text-[10px] text-muted-foreground">{createdLabel}</p>
                    )}
                  </div>
                </div>
              );})}
            </div>
          )}
        </div>
      )}

      {/* ── Vendor Tasks tab (real task data, no fake service history) ── */}
      {activeTab === 'tasks' && orgId && (
        <VendorOperationalTasks
          orgId={orgId}
          vendorId={vendorId}
          onCreateTask={() => openCreateTask()}
        />
      )}

      {/* ── History (audit) tab ── */}
      {activeTab === 'history' && (
        <div className={`${cardClass} p-5`}>
          <h3 className={`text-xs font-semibold mb-4 flex items-center gap-2 ${'text-muted-foreground'}`}>
            <Icon name="clock" className="w-3.5 h-3.5" /> Activity History
          </h3>
          {auditLoading ? (
            <SkeletonCard className="border-0 shadow-none bg-transparent p-0" />
          ) : audit.length === 0 ? (
            <EmptyState compact title="No activity recorded yet" />
          ) : (
            <div className="space-y-2">
              {audit.map((a) => (
                <div key={a.id} className="flex items-start gap-3">
                  <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                    a.level === 'CRITICAL' ? 'bg-[color:var(--status-critical)]' : a.level === 'WARNING' ? 'bg-[color:var(--status-watch)]' : 'bg-[color:var(--status-info)]'
                  }`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[11px] ${'text-foreground/90'}`}>{a.description}</p>
                    {a.changeSummary && <p className={`text-[10px] ${'text-muted-foreground'}`}>{a.changeSummary}</p>}
                    <p className={`text-[10px] ${'text-muted-foreground/60'}`}>
                      {new Date(a.createdAt).toLocaleString('de-DE')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Link / Edit-Link Modal ── */}
      {linkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setLinkModal(null)}>
          <div className="absolute inset-0 overlay-scrim" />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl bg-popover border border-border"
            onClick={(e) => e.stopPropagation()}>
            <div className={`flex items-center justify-between p-4 border-b ${'border-border'}`}>
              <h3 className={`text-sm font-bold ${'text-foreground'}`}>
                {linkModal.mode === 'create' ? 'Link Vehicle' : 'Edit Link'}
              </h3>
              <button onClick={() => setLinkModal(null)} className={`p-1 rounded ${'hover:bg-muted text-muted-foreground'}`}>
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {linkModal.mode === 'create' && (
                <div>
                  <label className={`text-[11px] font-medium mb-1 block ${'text-muted-foreground'}`}>Vehicle *</label>
                  <input value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} placeholder="Search vehicles..." className={`${inputClass} mb-2`} />
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                    {filteredToLink.length === 0 ? (
                      <p className={`p-3 text-[11px] ${'text-muted-foreground'}`}>
                        {availableToLink.length === 0 ? 'All vehicles already linked' : 'No matching vehicles'}
                      </p>
                    ) : filteredToLink.map((v) => {
                      const selected = linkForm.vehicleId === v.id;
                      return (
                        <button key={v.id} onClick={() => setLinkForm((f) => ({ ...f, vehicleId: v.id }))}
                          className={`w-full text-left flex items-center gap-2.5 px-3 py-2 transition ${
                            selected
                              ? 'bg-[color:var(--brand-soft)]'
                              : 'hover:bg-muted'
                          }`}>
                          <Icon name={selected ? 'check' : 'car'} className={`w-3.5 h-3.5 shrink-0 ${'text-[color:var(--brand)]'}`} />
                          <div>
                            <div className={`text-xs font-medium ${'text-foreground'}`}>{v.model}</div>
                            <div className={`text-[10px] ${'text-muted-foreground'}`}>{v.license}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className={`text-[11px] font-medium mb-1 block ${'text-muted-foreground'}`}>Relation Type</label>
                <select value={linkForm.relationType} onChange={(e) => setLinkForm((f) => ({ ...f, relationType: e.target.value as VendorVehicleRelationType }))} className={inputClass}>
                  {RELATION_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`text-[11px] font-medium mb-1 block ${'text-muted-foreground'}`}>Priority</label>
                  <input type="number" value={linkForm.priority} onChange={(e) => setLinkForm((f) => ({ ...f, priority: e.target.value }))} placeholder="—" className={inputClass} />
                </div>
                <label className={`flex items-center gap-2 mt-6 cursor-pointer text-xs ${'text-foreground/80'}`}>
                  <input type="checkbox" checked={linkForm.isPreferred} onChange={(e) => setLinkForm((f) => ({ ...f, isPreferred: e.target.checked }))}
                    className="rounded border-border accent-[color:var(--brand)] w-3.5 h-3.5" />
                  Preferred
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`text-[11px] font-medium mb-1 block ${'text-muted-foreground'}`}>Valid From</label>
                  <input type="date" value={linkForm.validFrom} onChange={(e) => setLinkForm((f) => ({ ...f, validFrom: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className={`text-[11px] font-medium mb-1 block ${'text-muted-foreground'}`}>Valid Until</label>
                  <input type="date" value={linkForm.validUntil} onChange={(e) => setLinkForm((f) => ({ ...f, validUntil: e.target.value }))} className={inputClass} />
                </div>
              </div>

              <div>
                <label className={`text-[11px] font-medium mb-1 block ${'text-muted-foreground'}`}>Notes</label>
                <textarea value={linkForm.notes} onChange={(e) => setLinkForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Link notes..."
                  rows={2} className={`${inputClass} resize-none`} />
              </div>
            </div>
            <div className={`flex items-center justify-end gap-2 p-4 border-t ${'border-border'}`}>
              <button onClick={() => setLinkModal(null)}
                className="sq-3d-btn sq-3d-btn--neutral px-3 py-2 text-xs font-medium">
                Cancel
              </button>
              <button onClick={submitLink} disabled={linkSaving || (linkModal.mode === 'create' && !linkForm.vehicleId)}
                className="sq-3d-btn sq-3d-btn--primary px-4 py-2 text-xs font-medium disabled:opacity-50">
                {linkSaving ? <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> : linkModal.mode === 'create' ? 'Link Vehicle' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ServiceTaskCreateModal
        open={createTaskOpen}
        onOpenChange={(open) => {
          setCreateTaskOpen(open);
          if (!open) setCreateTaskVehicleId(null);
        }}
        vendors={allVendors.length > 0 ? allVendors : vendor ? [vendor] : []}
        defaultVendorId={vendor.id}
        defaultVehicleId={createTaskVehicleId}
      />
    </div>
  );
}

// ── sub-components ─────────────────────────────────────

function InfoRow({ icon: IconCmp, label, value, href, external }: {
  icon: typeof MapPin; label: string; value: string; href?: string; external?: boolean;
}) {
  const content = (
    <div className="flex items-start gap-2.5">
      <IconCmp className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
      <div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className={`text-xs font-medium text-foreground ${href ? 'hover:text-[color:var(--brand)] transition' : ''}`}>
          {value}
          {external && <Icon name="external-link" className="w-2.5 h-2.5 inline ml-1 opacity-40" />}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>{content}</a>;
  }
  return content;
}

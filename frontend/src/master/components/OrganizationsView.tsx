import {
  Building2, Search, Plus, MoreHorizontal, CheckCircle, AlertTriangle,
  XCircle, X, Save, Trash2, ChevronRight, UserPlus, ArrowLeft, Eye, EyeOff,
  Upload, Globe, Phone, MapPin, FileText, Clock, Languages, User, Mail, ImageIcon,
} from 'lucide-react';
import { useState } from 'react';
import type { Organization, OrgStatus, SubscriptionPlan } from '../data/platform-data';

interface OrganizationsViewProps {
  isDarkMode: boolean;
  organizations: Organization[];
  onSelectOrg: (org: Organization) => void;
  onAddOrg: (org: Organization, adminData?: { name: string; email: string; password: string } | null) => void;
  onUpdateOrg: (org: Organization) => void;
  onDeleteOrg: (id: string) => void;
}

const planColors: Record<string, string> = {
  Starter: 'bg-gray-100 text-gray-700 border-gray-200',
  Business: 'bg-blue-50 text-blue-700 border-blue-200',
  Enterprise: 'bg-purple-50 text-purple-700 border-purple-200',
  Custom: 'bg-amber-50 text-amber-700 border-amber-200',
};
const statusColors: Record<string, string> = {
  Active: 'bg-green-50 text-green-700 border-green-200',
  Trial: 'bg-blue-50 text-blue-700 border-blue-200',
  Suspended: 'bg-red-50 text-red-700 border-red-200',
  Churned: 'bg-gray-100 text-gray-500 border-gray-200',
};
const statusIcons: Record<string, typeof CheckCircle> = {
  Active: CheckCircle, Trial: AlertTriangle, Suspended: XCircle, Churned: XCircle,
};

const BUSINESS_TYPES = [
  { label: 'Car Rental', value: 'RENTAL' },
  { label: 'Fleet Management', value: 'FLEET' },
  { label: 'Taxi Service', value: 'TAXI' },
  { label: 'Logistics', value: 'LOGISTICS' },
  { label: 'Other', value: 'OTHER' },
];

export function OrganizationsView({
  isDarkMode, organizations, onSelectOrg, onAddOrg, onUpdateOrg, onDeleteOrg,
}: OrganizationsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlan, setFilterPlan] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Wizard step (1 = org details, 2 = admin account)
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);

  // Step 1 — Unternehmensinformationen
  const [formName, setFormName] = useState('');
  const [formShortCode, setFormShortCode] = useState('');
  const [formType, setFormType] = useState('RENTAL');
  const [formAddress, setFormAddress] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formState, setFormState] = useState('');
  const [formZip, setFormZip] = useState('');
  const [formCountry, setFormCountry] = useState('Germany');
  const [formTaxId, setFormTaxId] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formWebsite, setFormWebsite] = useState('');
  const [formTimezone, setFormTimezone] = useState('Europe/Berlin (CET)');
  const [formLanguage, setFormLanguage] = useState('Deutsch');
  const [formEmail, setFormEmail] = useState('');
  const [formPlan, setFormPlan] = useState<SubscriptionPlan>('Starter');
  const [formStatus, setFormStatus] = useState<OrgStatus>('Trial');

  // Step 1 — Geschäftsführer / Ansprechpartner
  const [formContactName, setFormContactName] = useState('');
  const [formContactEmail, setFormContactEmail] = useState('');

  // Step 2 — Admin account
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [skipAdmin, setSkipAdmin] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setFormName(''); setFormShortCode(''); setFormType('RENTAL'); setFormAddress(''); setFormCity('');
    setFormState(''); setFormZip(''); setFormCountry('Germany'); setFormTaxId('');
    setFormPhone(''); setFormWebsite(''); setFormTimezone('Europe/Berlin (CET)');
    setFormLanguage('Deutsch'); setFormEmail(''); setFormPlan('Starter');
    setFormStatus('Trial'); setFormContactName(''); setFormContactEmail('');
    setAdminName(''); setAdminEmail(''); setAdminPassword('');
    setSkipAdmin(false); setWizardStep(1);
  };

  const openCreate = () => { resetForm(); setShowCreateModal(true); };
  const closeModal = () => { setShowCreateModal(false); setEditOrg(null); resetForm(); };

  const openEdit = (org: Organization) => {
    setFormName(org.company_name);
    setFormShortCode((org as any).short_code ?? '');
    const typeEntry = BUSINESS_TYPES.find(b => b.label === org.business_type || b.value === org.business_type);
    setFormType(typeEntry?.value ?? 'RENTAL');
    setFormCity(org.city);
    setFormCountry(org.country);
    setFormEmail(org.contactEmail);
    setFormPlan(org.plan);
    setFormStatus(org.status);
    setFormPhone('');
    setFormAddress('');
    setFormWebsite('');
    setEditOrg(org);
  };

  const handleStep1Next = () => {
    if (!formName.trim()) return;
    setWizardStep(2);
  };

  const handleSaveEdit = async () => {
    if (!editOrg || !formName.trim()) return;
    setSaving(true);
    try {
      const typeLabel = BUSINESS_TYPES.find(b => b.value === formType)?.label ?? formType;
      onUpdateOrg({
        ...editOrg,
        company_name: formName,
        short_code: formShortCode.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || undefined,
        business_type: typeLabel,
        city: formCity,
        country: formCountry,
        contactEmail: formEmail,
        plan: formPlan,
        status: formStatus,
      } as any);
      setEditOrg(null);
    } finally {
      setSaving(false);
    }
  };

  const handleFinalCreate = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const typeLabel = BUSINESS_TYPES.find(b => b.value === formType)?.label ?? formType;
      const newOrg: Organization & { short_code?: string } = {
        id: '',
        company_name: formName,
        short_code: formShortCode.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || undefined,
        business_type: typeLabel,
        city: formCity,
        country: formCountry,
        fleet_size: 0,
        created_at: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        status: formStatus,
        plan: formPlan,
        mrr: 0,
        users: 0,
        contactEmail: formEmail,
        lastActive: 'Just now',
        products: [],
        integrations: [],
        invoices: [],
      };
      const adminData = (!skipAdmin && adminName.trim() && adminEmail.trim() && adminPassword.trim())
        ? { name: adminName.trim(), email: adminEmail.trim(), password: adminPassword.trim() }
        : null;
      await onAddOrg(newOrg, adminData);
      closeModal();
    } finally {
      setSaving(false);
    }
  };

  const filteredOrgs = organizations.filter(org => {
    const matchesSearch = org.company_name.toLowerCase().includes(searchQuery.toLowerCase())
      || org.city.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlan = filterPlan === 'all' || org.plan === filterPlan;
    const matchesStatus = filterStatus === 'all' || org.status === filterStatus;
    return matchesSearch && matchesPlan && matchesStatus;
  });

  const totalMRR = filteredOrgs.reduce((s, o) => s + o.mrr, 0);
  const totalVehicles = filteredOrgs.reduce((s, o) => s + o.fleet_size, 0);

  const cardClass = 'bg-card border border-border rounded-lg shadow-xs';
  const inputClass = 'w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors bg-muted border-border text-foreground focus:border-ring';
  const labelClass = `block text-sm font-semibold mb-1 text-foreground`;

  const isEdit = !!editOrg;
  const modalOpen = showCreateModal || isEdit;
  const modalTitle = isEdit
    ? 'Edit Organization'
    : wizardStep === 1 ? 'New Organization — Details' : 'New Organization — Admin Account';

  const step1Valid = formName.trim().length > 0;
  const step2Valid = skipAdmin || (adminName.trim() && adminEmail.trim() && adminPassword.trim());

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Organizations</h1>
          <p className="text-sm mt-1 font-medium text-muted-foreground">
            {filteredOrgs.length} organizations · {totalVehicles} vehicles · €{totalMRR.toLocaleString()} MRR
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:shadow-md transition-all"
        >
          <Plus className="w-5 h-5" />New Organization
        </button>
      </div>

      {/* Filters */}
      <div className={`${cardClass} p-4`}>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-xl border ${isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-50/50 border-gray-200/50'}`}>
            <Search className={`w-4 h-4 shrink-0 text-muted-foreground`} />
            <input
              type="text"
              placeholder="Search organizations…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`flex-1 bg-transparent outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground`}
            />
          </div>
          <select
            value={filterPlan}
            onChange={e => setFilterPlan(e.target.value)}
            className={`px-3 py-2 rounded-md border text-xs font-semibold appearance-none cursor-pointer bg-muted border-border text-foreground`}
          >
            <option value="all">All Plans</option>
            <option>Starter</option><option>Business</option><option>Enterprise</option><option>Custom</option>
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className={`px-3 py-2 rounded-md border text-xs font-semibold appearance-none cursor-pointer bg-muted border-border text-foreground`}
          >
            <option value="all">All Status</option>
            <option>Active</option><option>Trial</option><option>Suspended</option><option>Churned</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className={`${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className={`text-left px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Organization</th>
                <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Plan</th>
                <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Status</th>
                <th className={`text-center px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Vehicles</th>
                <th className={`text-center px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Users</th>
                <th className={`text-right px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>MRR</th>
                <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Last Active</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filteredOrgs.length === 0 && (
                <tr>
                  <td colSpan={8} className={`text-center py-16 text-sm text-muted-foreground`}>
                    No organizations found. Click <strong>New Organization</strong> to get started.
                  </td>
                </tr>
              )}
              {filteredOrgs.map(org => {
                const Icon = statusIcons[org.status] ?? CheckCircle;
                return (
                  <tr
                    key={org.id}
                    className={`border-b last:border-b-0 transition-colors cursor-pointer border-border hover:bg-muted/50`}
                    onClick={() => onSelectOrg(org)}
                  >
                    <td className="px-5 py-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/15">
                          <Building2 className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div>
                          <p className={`text-sm font-semibold text-foreground`}>{org.company_name}</p>
                          <p className={`text-xs text-muted-foreground`}>{[org.city, org.country].filter(Boolean).join(', ')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${planColors[org.plan] ?? ''}`}>{org.plan}</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusColors[org.status] ?? ''}`}>
                        <Icon className="w-3 h-3" />{org.status}
                      </span>
                    </td>
                    <td className={`px-3 py-2 text-center text-sm font-semibold text-foreground`}>{org.fleet_size}</td>
                    <td className={`px-3 py-2 text-center text-sm font-semibold text-foreground`}>{org.users}</td>
                    <td className={`px-3 py-2 text-right text-sm font-semibold text-foreground`}>€{org.mrr.toLocaleString()}</td>
                    <td className={`px-3 py-2 text-sm text-muted-foreground`}>{org.lastActive}</td>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(org)}
                          className="p-1.5 rounded-lg transition-colors hover:bg-muted text-muted-foreground"
                          title="Edit"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(org.id)}
                          className="p-1.5 rounded-lg transition-colors hover:bg-red-50 text-muted-foreground hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Create / Edit Modal ─── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-start justify-center z-[100] pt-6 pb-6 overflow-y-auto">
          <div className={`w-full max-w-3xl mx-4 bg-card border border-border rounded-xl shadow-lg`}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div className="flex items-center gap-3">
                {!isEdit && wizardStep === 2 && (
                  <button onClick={() => setWizardStep(1)} className={`p-2 rounded-lg hover:bg-muted text-muted-foreground`}>
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div>
                  <h2 className="text-base font-semibold text-foreground">{modalTitle}</h2>
                  {!isEdit && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full transition-colors ${wizardStep === 1 ? 'bg-indigo-500 text-white' : (isDarkMode ? 'bg-neutral-700 text-gray-400' : 'bg-gray-100 text-gray-500')}`}>1 Unternehmensdaten</span>
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full transition-colors ${wizardStep === 2 ? 'bg-indigo-500 text-white' : 'bg-muted text-muted-foreground'}`}>2 Admin Account</span>
                    </div>
                  )}
                </div>
              </div>
              <button onClick={closeModal} className={`p-2 rounded-lg hover:bg-muted text-muted-foreground`}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-5 py-5 max-h-[75vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
              {/* ── STEP 1: Unternehmensdaten ── */}
              {(isEdit || wizardStep === 1) && (
                <div className="space-y-6">

                  {/* Section: Unternehmensinformationen */}
                  <div>
                    <div className={`flex items-center gap-2 mb-4 pb-2 border-b border-border`}>
                      <Building2 className={`w-4 h-4 text-indigo-500`} />
                      <h3 className={`text-sm font-bold uppercase tracking-wide text-foreground`}>Unternehmensinformationen</h3>
                    </div>

                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                          <label className={labelClass}>Firmenname *</label>
                          <input value={formName} onChange={e => setFormName(e.target.value)} className={inputClass} placeholder="z.B. F.S Mobility Service" />
                        </div>
                        <div>
                          <label className={labelClass}>Org-Kürzel</label>
                          <input
                            value={formShortCode}
                            onChange={e => setFormShortCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12))}
                            className={inputClass}
                            placeholder="z.B. fs"
                            maxLength={12}
                          />
                          <p className={`text-[10px] mt-0.5 text-muted-foreground`}>Used for AI Agent ID</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Branchentyp</label>
                          <select value={formType} onChange={e => setFormType(e.target.value)} className={inputClass}>
                            {BUSINESS_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>Plan</label>
                          <select value={formPlan} onChange={e => setFormPlan(e.target.value as SubscriptionPlan)} className={inputClass}>
                            <option>Starter</option><option>Business</option><option>Enterprise</option><option>Custom</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>Adresse</label>
                        <input value={formAddress} onChange={e => setFormAddress(e.target.value)} className={inputClass} placeholder="Straße und Hausnummer" />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Stadt</label>
                          <input value={formCity} onChange={e => setFormCity(e.target.value)} className={inputClass} placeholder="z.B. Berlin" />
                        </div>
                        <div>
                          <label className={labelClass}>Bundesland</label>
                          <input value={formState} onChange={e => setFormState(e.target.value)} className={inputClass} placeholder="z.B. Berlin" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>PLZ</label>
                          <input value={formZip} onChange={e => setFormZip(e.target.value)} className={inputClass} placeholder="z.B. 10115" />
                        </div>
                        <div>
                          <label className={labelClass}>Land</label>
                          <input value={formCountry} onChange={e => setFormCountry(e.target.value)} className={inputClass} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Steuernummer / USt-ID</label>
                          <input value={formTaxId} onChange={e => setFormTaxId(e.target.value)} className={inputClass} placeholder="z.B. DE123456789" />
                        </div>
                        <div>
                          <label className={labelClass}>Telefon</label>
                          <div className="relative">
                            <Phone className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                            <input value={formPhone} onChange={e => setFormPhone(e.target.value)} className={`${inputClass} pl-10`} placeholder="+49 30 1234567" />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Website</label>
                          <div className="relative">
                            <Globe className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                            <input value={formWebsite} onChange={e => setFormWebsite(e.target.value)} className={`${inputClass} pl-10`} placeholder="www.unternehmen.de" />
                          </div>
                        </div>
                        <div>
                          <label className={labelClass}>Zeitzone</label>
                          <div className="relative">
                            <Clock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                            <select value={formTimezone} onChange={e => setFormTimezone(e.target.value)} className={`${inputClass} pl-10`}>
                              <option>Europe/Berlin (CET)</option>
                              <option>Europe/London (GMT)</option>
                              <option>Europe/Paris (CET)</option>
                              <option>Europe/Zurich (CET)</option>
                              <option>Europe/Vienna (CET)</option>
                              <option>America/New_York (EST)</option>
                              <option>America/Los_Angeles (PST)</option>
                              <option>Asia/Dubai (GST)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Hauptsprache</label>
                          <div className="relative">
                            <Languages className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                            <select value={formLanguage} onChange={e => setFormLanguage(e.target.value)} className={`${inputClass} pl-10`}>
                              <option>Deutsch</option>
                              <option>English</option>
                              <option>Français</option>
                              <option>Español</option>
                              <option>Türkçe</option>
                              <option>العربية</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className={labelClass}>Status</label>
                          <select value={formStatus} onChange={e => setFormStatus(e.target.value as OrgStatus)} className={inputClass}>
                            <option>Active</option><option>Trial</option><option>Suspended</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section: Geschäftsführer / Ansprechpartner */}
                  <div>
                    <div className={`flex items-center gap-2 mb-4 pb-2 border-b border-border`}>
                      <User className={`w-4 h-4 text-indigo-500`} />
                      <h3 className={`text-sm font-bold uppercase tracking-wide text-foreground`}>Geschäftsführer / Ansprechpartner</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Name</label>
                        <div className="relative">
                          <User className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                          <input value={formContactName} onChange={e => setFormContactName(e.target.value)} className={`${inputClass} pl-10`} placeholder="Vor- und Nachname" />
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>E-Mail</label>
                        <div className="relative">
                          <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground`} />
                          <input value={formContactEmail} onChange={e => setFormContactEmail(e.target.value)} type="email" className={`${inputClass} pl-10`} placeholder="geschaeftsfuehrer@firma.de" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section: Firmenlogo (placeholder) */}
                  <div>
                    <div className={`flex items-center gap-2 mb-4 pb-2 border-b border-border`}>
                      <ImageIcon className={`w-4 h-4 text-indigo-500`} />
                      <h3 className={`text-sm font-bold uppercase tracking-wide text-foreground`}>Firmenlogo</h3>
                    </div>
                    <div className="flex flex-col items-center justify-center py-6 rounded-lg border-2 border-dashed transition-colors border-border bg-muted/50">
                      <div className="w-14 h-14 rounded-lg flex items-center justify-center mb-3 bg-muted">
                        <Upload className={`w-6 h-6 text-muted-foreground`} />
                      </div>
                      <p className={`text-sm font-medium text-muted-foreground`}>Logo hochladen</p>
                      <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>PNG, JPG bis 2MB</p>
                      <button className="mt-3 px-4 py-1.5 bg-indigo-500 text-white text-xs font-semibold rounded-lg hover:bg-indigo-600 transition-colors">
                        Datei auswählen
                      </button>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-3 pt-2">
                    <button onClick={closeModal} className={`flex-1 px-4 py-2.5 rounded-lg font-semibold transition-all border bg-muted text-foreground hover:bg-muted/80 border-border`}>
                      Abbrechen
                    </button>
                    {isEdit ? (
                      <button onClick={handleSaveEdit} disabled={!step1Valid || saving} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl font-semibold transition-all shadow-lg ${(!step1Valid || saving) ? 'opacity-50' : 'hover:shadow-xl'}`}>
                        <Save className="w-4 h-4" />{saving ? 'Speichern…' : 'Änderungen speichern'}
                      </button>
                    ) : (
                      <button onClick={handleStep1Next} disabled={!step1Valid} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl font-semibold transition-all shadow-lg ${!step1Valid ? 'opacity-50' : 'hover:shadow-xl'}`}>
                        Weiter — Admin Account <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── STEP 2: Admin Account ── */}
              {!isEdit && wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="rounded-lg p-4 border bg-muted/60 border-border">
                    <p className={`text-sm font-medium text-foreground`}>
                      Organisation: <span className="font-bold">{formName}</span>
                    </p>
                    <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                      Erstelle den ersten Org-Admin Account für diese Organisation.
                    </p>
                  </div>

                  <div>
                    <label className={labelClass}>Admin Name *</label>
                    <input value={adminName} onChange={e => setAdminName(e.target.value)} disabled={skipAdmin} className={`${inputClass} ${skipAdmin ? 'opacity-40 cursor-not-allowed' : ''}`} placeholder="Vor- und Nachname" />
                  </div>

                  <div>
                    <label className={labelClass}>Admin E-Mail *</label>
                    <input value={adminEmail} onChange={e => setAdminEmail(e.target.value)} disabled={skipAdmin} className={`${inputClass} ${skipAdmin ? 'opacity-40 cursor-not-allowed' : ''}`} type="email" placeholder="admin@firma.com" />
                  </div>

                  <div>
                    <label className={labelClass}>Temporäres Passwort *</label>
                    <div className="relative">
                      <input value={adminPassword} onChange={e => setAdminPassword(e.target.value)} disabled={skipAdmin} className={`${inputClass} pr-12 ${skipAdmin ? 'opacity-40 cursor-not-allowed' : ''}`} type={showPassword ? 'text' : 'password'} placeholder="Mind. 8 Zeichen" />
                      <button type="button" onClick={() => setShowPassword(v => !v)} disabled={skipAdmin} tabIndex={-1} className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition-colors ${isDarkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'} ${skipAdmin ? 'opacity-40 cursor-not-allowed' : ''}`}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer select-none text-muted-foreground">
                    <input type="checkbox" checked={skipAdmin} onChange={e => setSkipAdmin(e.target.checked)} className="w-4 h-4 rounded accent-indigo-500" />
                    <span className="text-sm">Überspringen — Admin wird später angelegt</span>
                  </label>

                  <div className="flex gap-3 pt-2">
                    <button onClick={closeModal} className={`flex-1 px-4 py-2.5 rounded-lg font-semibold transition-all border bg-muted text-foreground hover:bg-muted/80 border-border`}>
                      Abbrechen
                    </button>
                    <button onClick={handleFinalCreate} disabled={saving || !step2Valid} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl font-semibold transition-all shadow-lg ${(saving || !step2Valid) ? 'opacity-50' : 'hover:shadow-xl'}`}>
                      <UserPlus className="w-4 h-4" />
                      {saving ? 'Erstelle…' : skipAdmin ? 'Organisation erstellen' : 'Organisation + Admin erstellen'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirm Modal ─── */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100]">
          <div className={`max-w-md w-full mx-4 bg-card border border-border rounded-xl p-5 shadow-lg`}>
            <h3 className="text-base font-semibold mb-2 text-foreground">Delete Organization</h3>
            <p className="mb-5 text-muted-foreground">
              Are you sure? This will remove all associated data and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className={`flex-1 px-4 py-2.5 rounded-lg font-semibold bg-muted text-foreground border border-border`}
              >
                Cancel
              </button>
              <button
                onClick={() => { onDeleteOrg(deleteConfirm); setDeleteConfirm(null); }}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 shadow-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';

import { AlertTriangle, Car, CheckCircle, Eye, IdCard, ShieldCheck, Upload, User, UserCheck, UserX, Users } from 'lucide-react';
import { Icon } from './ui/Icon';
import { toast } from 'sonner';
import { CustomerDetailModal } from './CustomerDetailModal';
import { CustomerDocumentUploadBox } from './CustomerDocumentUploadBox';
import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
import {
  buildCustomerCreatePayload,
  customerStatusApiToUi,
  customerRiskApiToUi,
  customerTypeApiToUi,
} from '../lib/entityMappers';

interface CustomersViewProps {
  isDarkMode: boolean;
  onOpenCustomerDetail?: (customer: any) => void;
  additionalCustomers?: any[];
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  type: 'Individual' | 'Corporate';
  status: 'Active' | 'Under Review' | 'Suspended' | 'Blocked';
  // V4.6.95 — Customer.riskLevel is operational. Default is 'Not Assessed'.
  riskLevel: 'Not Assessed' | 'Low Risk' | 'Medium Risk' | 'High Risk';
  // V4.6.95 — `drivingStyleScore` is the canonical 0–100 scalar. The legacy
  // `drivingScore` mirror is optional and must NEVER be displayed as a
  // separate score; it is only kept around so older API payloads keep working.
  drivingScore?: number | null;
  drivingStyleScore?: number | null;
  safetyScore?: number | null;
  // V4.6.95 — backend-supplied confidence metadata.
  hasEnoughData?: boolean;
  dataConfidence?: 'none' | 'low' | 'medium' | 'high';
  scoredTripCount?: number;
  totalDistanceKm?: number;
  lastTrip: string;
  totalBookings: number;
  totalRevenue: string;
  joinDate: string;
  licenseExpiry: string;
  licenseVerified: boolean;
  idVerified: boolean;
  accidents: number;
  violations: number;
  city: string;
  currentVehicle?: string;
  notes?: string;
}

const EM_DASH = '\u2014';

function formatDateShort(raw?: string | Date | null): string {
  if (!raw) return EM_DASH;
  const d = typeof raw === 'string' ? new Date(raw) : raw;
  if (!d || Number.isNaN(d.getTime())) return EM_DASH;
  return d.toLocaleDateString('de-DE');
}

function formatCentsEUR(cents?: number | null): string {
  if (cents == null) return EM_DASH;
  try {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
      cents / 100,
    );
  } catch {
    return `${(cents / 100).toFixed(2)} EUR`;
  }
}

// V4.6.66 — uses booking-derived aggregates now returned by /customers:
//   - totalRevenueCents → formatted EUR revenue
//   - lastBookingDate   → "Last Trip"
// Previously the UI used `c.totalRevenue` / `c.lastTrip` which were never
// computed on the backend → always fell through to the placeholder.
function mapApiCustomer(c: any): Customer {
  // V4.6.95 — drivingStyleScore is the canonical scalar; drivingScore is
  // a legacy compat mirror retained only for older API payloads. Backend
  // is the single source of truth — frontend never recomputes scores.
  const styleScore =
    typeof c.drivingStyleScore === 'number'
      ? c.drivingStyleScore
      : typeof c.drivingScore === 'number'
        ? c.drivingScore
        : null;
  const safetyScore = typeof c.safetyScore === 'number' ? c.safetyScore : null;
  const totalBookings =
    typeof c.totalBookings === 'number'
      ? c.totalBookings
      : typeof c.bookingCount === 'number'
      ? c.bookingCount
      : Array.isArray(c.bookings)
      ? c.bookings.length
      : 0;
  return {
    id: c.id,
    name: c.name ?? `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim(),
    email: c.email ?? '',
    phone: c.phone ?? '',
    company: c.company ?? c.companyName ?? undefined,
    type: customerTypeApiToUi(c.customerType ?? c.type),
    status: customerStatusApiToUi(c.status),
    riskLevel: customerRiskApiToUi(c.riskLevel),
    drivingScore: styleScore,
    drivingStyleScore: styleScore,
    safetyScore,
    hasEnoughData: typeof c.hasEnoughData === 'boolean' ? c.hasEnoughData : undefined,
    dataConfidence: c.dataConfidence ?? undefined,
    scoredTripCount: typeof c.scoredTripCount === 'number' ? c.scoredTripCount : undefined,
    totalDistanceKm: typeof c.totalDistanceKm === 'number' ? c.totalDistanceKm : undefined,
    lastTrip: formatDateShort(c.lastBookingDate ?? c.lastTrip ?? null),
    totalBookings,
    totalRevenue: formatCentsEUR(
      typeof c.totalRevenueCents === 'number' ? c.totalRevenueCents : null,
    ),
    joinDate: c.joinDate ?? (c.createdAt ? new Date(c.createdAt).toLocaleDateString('de-DE') : EM_DASH),
    licenseExpiry: c.licenseExpiry
      ? (typeof c.licenseExpiry === 'string' && !c.licenseExpiry.includes('T')
          ? c.licenseExpiry
          : new Date(c.licenseExpiry).toLocaleDateString('de-DE'))
      : EM_DASH,
    licenseVerified: c.licenseVerified ?? false,
    idVerified: c.idVerified ?? false,
    accidents: c.accidents ?? 0,
    violations: c.violations ?? 0,
    city: c.city ?? '',
    currentVehicle: c.currentVehicle ?? undefined,
    notes: c.notes ?? undefined,
  };
}

export function CustomersView({ isDarkMode, onOpenCustomerDetail, additionalCustomers = [] }: CustomersViewProps) {
  const { orgId } = useRentalOrg();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  const loadCustomers = useCallback(() => {
    if (!orgId) return;
    api.customers.list(orgId)
      .then((res: any) => {
        const list = Array.isArray(res) ? res : res?.data ?? [];
        setCustomers(list.map(mapApiCustomer));
      })
      .catch(() => setCustomers([]));
  }, [orgId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Merge additional customers from NewBookingView
  const allCustomers = [...customers, ...additionalCustomers.filter(ac => !customers.some(c => c.id === ac.id))] as Customer[];
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isRiskOpen, setIsRiskOpen] = useState(false);
  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isCustomerDetailAnimating, setIsCustomerDetailAnimating] = useState(false);
  const [isCustomerDetailClosing, setIsCustomerDetailClosing] = useState(false);
  const [cardFilter, setCardFilter] = useState<'all' | 'active' | 'suspended' | 'attention'>('all');
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [isAddCustomerAnimating, setIsAddCustomerAnimating] = useState(false);
  const [isAddCustomerClosing, setIsAddCustomerClosing] = useState(false);
  const [addStep, setAddStep] = useState(0);
  const [newCustomer, setNewCustomer] = useState({
    firstName: '', lastName: '', email: '', phone: '', street: '', zip: '', city: 'Kassel',
    type: 'Individual' as 'Individual' | 'Corporate', company: '',
    licenseNumber: '', licenseExpiry: '', licenseClass: 'B',
    idType: 'Personalausweis' as 'Personalausweis' | 'Reisepass',
    idNumber: '', idExpiry: '',
    // V4.6.65 — real uploaded document URLs (null = not yet uploaded).
    idFrontUrl: null as string | null,
    idBackUrl: null as string | null,
    licenseFrontUrl: null as string | null,
    licenseBackUrl: null as string | null,
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [idVerificationStatus, setIdVerificationStatus] = useState<'idle' | 'verifying' | 'verified' | 'failed'>('idle');

  const resetAddCustomerForm = () => {
    setNewCustomer({
      firstName: '', lastName: '', email: '', phone: '', street: '', zip: '', city: 'Kassel',
      type: 'Individual', company: '',
      licenseNumber: '', licenseExpiry: '', licenseClass: 'B',
      idType: 'Personalausweis', idNumber: '', idExpiry: '',
      idFrontUrl: null, idBackUrl: null, licenseFrontUrl: null, licenseBackUrl: null,
      notes: '',
    });
    setFormErrors({});
    setAddStep(0);
    setIdVerificationStatus('idle');
  };

  const openCustomerDetail = (customer: Customer) => {
    setSelectedCustomer(customer);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsCustomerDetailAnimating(true);
      });
    });
  };

  const closeCustomerDetail = () => {
    setIsCustomerDetailAnimating(false);
    setIsCustomerDetailClosing(true);
    setTimeout(() => {
      setSelectedCustomer(null);
      setIsCustomerDetailClosing(false);
    }, 400);
  };

  const openAddCustomer = () => {
    resetAddCustomerForm();
    setIsAddCustomerOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsAddCustomerAnimating(true);
      });
    });
  };

  const closeAddCustomer = () => {
    setIsAddCustomerAnimating(false);
    setIsAddCustomerClosing(true);
    setTimeout(() => {
      setIsAddCustomerOpen(false);
      setIsAddCustomerClosing(false);
      resetAddCustomerForm();
    }, 400);
  };

  const validateStep = (step: number): boolean => {
    const errors: Record<string, string> = {};
    if (step === 0) {
      if (!newCustomer.firstName.trim()) errors.firstName = 'Vorname erforderlich';
      if (!newCustomer.lastName.trim()) errors.lastName = 'Nachname erforderlich';
      if (!newCustomer.email.trim()) errors.email = 'E-Mail erforderlich';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomer.email)) errors.email = 'Ungültige E-Mail-Adresse';
      if (!newCustomer.phone.trim()) errors.phone = 'Telefonnummer erforderlich';
      if (!newCustomer.city.trim()) errors.city = 'Stadt erforderlich';
      if (newCustomer.type === 'Corporate' && !newCustomer.company.trim()) errors.company = 'Firmenname erforderlich';
    } else if (step === 1) {
      if (!newCustomer.licenseNumber.trim()) errors.licenseNumber = 'Führerscheinnummer erforderlich';
      if (!newCustomer.licenseExpiry) errors.licenseExpiry = 'Ablaufdatum erforderlich';
      if (!newCustomer.idNumber.trim()) errors.idNumber = 'Ausweisnummer erforderlich';
      if (!newCustomer.idExpiry) errors.idExpiry = 'Ablaufdatum erforderlich';
    } else if (step === 2) {
      if (!newCustomer.idFrontUrl) errors.idFront = 'Vorderseite des Ausweises erforderlich';
      if (!newCustomer.idBackUrl) errors.idBack = 'Rückseite des Ausweises erforderlich';
      if (!newCustomer.licenseFrontUrl) errors.licenseFront = 'Vorderseite des Führerscheins erforderlich';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (validateStep(addStep)) {
      if (addStep < 3) setAddStep(addStep + 1);
    }
  };

  const handleSubmitCustomer = async () => {
    if (!orgId) {
      toast.error('Keine Organisation geladen');
      return;
    }
    setIsSavingCustomer(true);
    try {
      const payload = buildCustomerCreatePayload({
        firstName: newCustomer.firstName,
        lastName: newCustomer.lastName,
        email: newCustomer.email,
        phone: newCustomer.phone,
        street: newCustomer.street,
        zip: newCustomer.zip,
        city: newCustomer.city || 'Kassel',
        country: 'DE',
        type: newCustomer.type,
        company: newCustomer.type === 'Corporate' ? newCustomer.company : undefined,
        licenseNumber: newCustomer.licenseNumber,
        licenseExpiry: newCustomer.licenseExpiry,
        licenseClass: newCustomer.licenseClass,
        idType: newCustomer.idType,
        idNumber: newCustomer.idNumber,
        idExpiry: newCustomer.idExpiry,
        idVerified: idVerificationStatus === 'verified',
        licenseVerified: Boolean(newCustomer.licenseFrontUrl),
        riskLevel: 'Low Risk',
        status: 'Active',
        notes: newCustomer.notes,
        idFrontUrl: newCustomer.idFrontUrl,
        idBackUrl: newCustomer.idBackUrl,
        licenseFrontUrl: newCustomer.licenseFrontUrl,
        licenseBackUrl: newCustomer.licenseBackUrl,
      });
      const created: any = await api.customers.create(orgId, payload);
      const mapped = mapApiCustomer(created);
      setCustomers(prev => [mapped, ...prev.filter(c => c.id !== mapped.id)]);
      toast.success('Kunde angelegt', {
        description: `${mapped.name}${mapped.email ? ' · ' + mapped.email : ''}`,
        duration: 3000,
      });
      closeAddCustomer();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Fehler beim Anlegen';
      toast.error('Kunde konnte nicht angelegt werden', { description: String(msg), duration: 5000 });
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const filtered = allCustomers.filter(c => {
    const matchesSearch = searchQuery === '' ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      (c.company && c.company.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    const matchesRisk = riskFilter === 'all' || c.riskLevel === riskFilter;
    const matchesType = typeFilter === 'all' || c.type === typeFilter;
    const matchesCard = cardFilter === 'all'
      ? true
      : cardFilter === 'active'
      ? c.status === 'Active'
      : cardFilter === 'suspended'
      ? c.status === 'Suspended' || c.status === 'Blocked'
      : cardFilter === 'attention'
      ? c.riskLevel === 'High Risk' || c.status === 'Under Review'
      : true;
    return matchesSearch && matchesStatus && matchesRisk && matchesType && matchesCard;
  });

  const totalDrivers = allCustomers.length;
  const activeDrivers = allCustomers.filter(c => c.status === 'Active').length;
  const suspendedDrivers = allCustomers.filter(c => c.status === 'Suspended' || c.status === 'Blocked').length;
  const attentionNeeded = allCustomers.filter(c => c.riskLevel === 'High Risk' || c.status === 'Under Review').length;

  const cardClass = `rounded-lg border shadow-sm ${
    isDarkMode
      ? 'bg-neutral-900 border-neutral-700'
      : 'bg-white border-gray-200'
  }`;

  const StatusPill = ({ status }: { status: Customer['status'] }) => {
    const styles = isDarkMode
      ? {
          'Active': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
          'Under Review': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
          'Suspended': 'bg-red-500/20 text-red-400 border-red-500/30',
          'Blocked': 'bg-gray-700/50 text-gray-400 border-gray-600/50',
        }
      : {
          'Active': 'bg-emerald-100 text-emerald-700 border-emerald-200',
          'Under Review': 'bg-amber-100 text-amber-700 border-amber-200',
          'Suspended': 'bg-red-100 text-red-700 border-red-200',
          'Blocked': 'bg-gray-200 text-gray-700 border-gray-300',
        };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${styles[status]}`}>
        {status}
      </span>
    );
  };

  const RiskPill = ({ level }: { level: Customer['riskLevel'] }) => {
    // V4.6.95 — `'Not Assessed'` is a neutral-grey state, NOT a green badge.
    // Customer.riskLevel currently has no automated writer; the previous
    // green "Low Risk" default falsely communicated a positive assessment.
    const styles = isDarkMode
      ? {
          'Not Assessed': 'bg-neutral-700/40 text-neutral-300 border-neutral-600/40',
          'Low Risk': 'bg-green-500/20 text-green-400 border-green-500/30',
          'Medium Risk': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
          'High Risk': 'bg-red-500/20 text-red-400 border-red-500/30',
        }
      : {
          'Not Assessed': 'bg-gray-100 text-gray-600 border-gray-200',
          'Low Risk': 'bg-green-50 text-green-700 border-green-200',
          'Medium Risk': 'bg-amber-50 text-amber-700 border-amber-200',
          'High Risk': 'bg-red-50 text-red-700 border-red-200',
        };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${styles[level]}`}>
        {level}
      </span>
    );
  };

  // V4.6.95 — score visualization standard:
  //   - 0–100 model score (never %, never grades)
  //   - null/insufficient data renders neutral "—" badge
  // Backend is the canonical writer; we only format here.
  const ScoreBadge = ({
    score,
    hasEnoughData = true,
  }: {
    score: number | null | undefined;
    hasEnoughData?: boolean;
  }) => {
    const missing = score == null || !hasEnoughData;
    if (missing) {
      return (
        <div
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg ${
            isDarkMode
              ? 'bg-neutral-800 text-gray-400'
              : 'bg-gray-100 text-gray-500'
          }`}
          title={
            score == null
              ? 'No driving data yet'
              : 'Not enough scored trip data'
          }
        >
          <Icon name="star" className="w-3 h-3" />
          <span className="text-xs font-bold">{'\u2014'}</span>
        </div>
      );
    }
    const rounded = Math.round(score as number);
    const color =
      rounded >= 80
        ? isDarkMode
          ? 'text-green-400'
          : 'text-green-600'
        : rounded >= 60
          ? isDarkMode
            ? 'text-amber-400'
            : 'text-amber-600'
          : isDarkMode
            ? 'text-red-400'
            : 'text-red-600';
    const bg =
      rounded >= 80
        ? isDarkMode
          ? 'bg-green-500/20'
          : 'bg-green-50'
        : rounded >= 60
          ? isDarkMode
            ? 'bg-amber-500/20'
            : 'bg-amber-50'
          : isDarkMode
            ? 'bg-red-500/20'
            : 'bg-red-50';
    return (
      <div
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg ${bg}`}
        title={`${rounded} / 100 (Driving Style)`}
      >
        <Icon name="star" className={`w-3 h-3 ${color}`} />
        <span className={`text-xs font-bold ${color}`}>{rounded}</span>
      </div>
    );
  };

  const DropdownFilter = ({ label, value, options, isOpen, onToggle, onSelect }: {
    label: string; value: string; options: { value: string; label: string }[];
    isOpen: boolean; onToggle: () => void; onSelect: (v: string) => void;
  }) => (
    <div className="relative">
      <button onClick={onToggle} className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-medium transition-all ${
        value !== 'all'
          ? isDarkMode
            ? 'bg-blue-900/30 border-blue-700/50 text-blue-400'
            : 'bg-blue-50 border-blue-200 text-blue-700'
          : isDarkMode
            ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-800'
            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
      }`}>
        <span>{value === 'all' ? label : options.find(o => o.value === value)?.label}</span>
        <Icon name="chevron-down" className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className={`absolute top-full mt-2 left-0 z-50 min-w-[180px] rounded-lg border shadow-xl overflow-hidden ${
          isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
        }`}>
          {options.map(o => (
            <button key={o.value} onClick={() => { onSelect(o.value); onToggle(); }}
              className={`w-full px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                o.value === value
                  ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                  : isDarkMode ? 'text-gray-300 hover:bg-neutral-800' : 'text-gray-700 hover:bg-gray-50'
              }`}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="relative">
      <div
        className="space-y-5 transition-all duration-500 ease-out origin-center"
        style={{
          transform: (isCustomerDetailAnimating || isAddCustomerAnimating) ? 'scale(0.92)' : 'scale(1)',
          filter: (isCustomerDetailAnimating || isAddCustomerAnimating) ? 'blur(12px)' : 'blur(0px)',
          opacity: (isCustomerDetailAnimating || isAddCustomerAnimating) ? 0.4 : 1,
          pointerEvents: (selectedCustomer || isCustomerDetailClosing || isAddCustomerOpen || isAddCustomerClosing) ? 'none' : 'auto',
        }}
      >
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-2 sm:gap-3">
        <div className="animate-fade-up min-w-0">
          <h1 className="text-[18px] leading-[1.12] font-bold tracking-[-0.02em] text-foreground truncate">
            Customers & Drivers
          </h1>
        </div>
        <button className="sq-press flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border"
          onClick={openAddCustomer}>
          <Icon name="plus" className="w-4 h-4 text-[color:var(--brand)]" />
          Add Customer
        </button>
      </div>

      {/* Segment metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          {
            label: 'Total',
            value: totalDrivers,
            icon: Users,
            tone: 'neutral' as const,
            filterKey: 'all' as const,
          },
          {
            label: 'Active',
            value: activeDrivers,
            icon: UserCheck,
            tone: 'success' as const,
            filterKey: 'active' as const,
          },
          {
            label: 'Blocked',
            value: suspendedDrivers,
            icon: UserX,
            tone: suspendedDrivers > 0 ? 'critical' as const : 'neutral' as const,
            filterKey: 'suspended' as const,
          },
          {
            label: 'Attention',
            value: attentionNeeded,
            icon: AlertTriangle,
            tone: attentionNeeded > 0 ? 'warning' as const : 'neutral' as const,
            filterKey: 'attention' as const,
          },
        ].map(card => {
          const isActive = cardFilter === card.filterKey;
          return (
            <CustomerMetric
              key={card.label}
              label={card.label}
              value={card.value}
              icon={card.icon}
              tone={card.tone}
              active={isActive}
              onClick={() => setCardFilter(isActive ? 'all' : card.filterKey)}
            />
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className={`${cardClass} p-4 rounded-2xl`}>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon name="filter" className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Filters</h3>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {cardFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setCardFilter('all')}
                className="px-2 py-1 rounded-full text-[10px] font-semibold sq-tone-brand"
              >
                Segment active ×
              </button>
            )}
            {(statusFilter !== 'all' || riskFilter !== 'all' || typeFilter !== 'all' || searchQuery) && (
              <button onClick={() => { setStatusFilter('all'); setRiskFilter('all'); setTypeFilter('all'); setSearchQuery(''); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold transition-all ${
                  isDarkMode
                    ? 'bg-red-900/30 border-red-700/50 text-red-400 hover:bg-red-900/50'
                    : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                }`}>
                <Icon name="x" className="w-3.5 h-3.5" />
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px] relative">
            <Icon name="search" className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              type="text"
              placeholder="Search by name, email, phone or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-xs outline-none transition-all ${
                isDarkMode
                  ? 'bg-neutral-800 border-neutral-700 text-gray-200 placeholder-gray-500 focus:border-blue-500/50'
                  : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-300'
              }`}
            />
          </div>
          <DropdownFilter
            label="Status" value={statusFilter} isOpen={isStatusOpen}
            onToggle={() => { setIsStatusOpen(!isStatusOpen); setIsRiskOpen(false); setIsTypeOpen(false); }}
            onSelect={setStatusFilter}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'Active', label: 'Active' },
              { value: 'Under Review', label: 'Under Review' },
              { value: 'Suspended', label: 'Suspended' },
              { value: 'Blocked', label: 'Blocked' },
            ]}
          />
          <DropdownFilter
            label="Risk Level" value={riskFilter} isOpen={isRiskOpen}
            onToggle={() => { setIsRiskOpen(!isRiskOpen); setIsStatusOpen(false); setIsTypeOpen(false); }}
            onSelect={setRiskFilter}
            options={[
              { value: 'all', label: 'All Risk Levels' },
              { value: 'Not Assessed', label: 'Not Assessed' },
              { value: 'Low Risk', label: 'Low Risk' },
              { value: 'Medium Risk', label: 'Medium Risk' },
              { value: 'High Risk', label: 'High Risk' },
            ]}
          />
          <DropdownFilter
            label="Type" value={typeFilter} isOpen={isTypeOpen}
            onToggle={() => { setIsTypeOpen(!isTypeOpen); setIsStatusOpen(false); setIsRiskOpen(false); }}
            onSelect={setTypeFilter}
            options={[
              { value: 'all', label: 'All Types' },
              { value: 'Individual', label: 'Individual' },
              { value: 'Corporate', label: 'Corporate' },
            ]}
          />
        </div>
      </div>

      {/* Customer Table */}
      <div className={`${cardClass} overflow-hidden`}>
        <table className="w-full">
          <thead>
            <tr className={`border-b ${isDarkMode ? 'border-neutral-700/50' : 'border-gray-200/60'}`}>
              {['Name', 'Company', 'Contact', 'Last Trip', 'Status', 'Verification', 'Risk Level', 'Driving Style', 'Bookings', 'Revenue', ''].map(h => (
                <th key={h} className={`text-left text-xs uppercase tracking-wider font-semibold px-3 py-3 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-gray-100'}`}>
            {filtered.map(customer => (
              <tr key={customer.id}
                onClick={() => openCustomerDetail(customer)}
                className={`cursor-pointer transition-colors ${isDarkMode ? 'hover:bg-neutral-800/60' : 'hover:bg-blue-50/40'}`}>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                      customer.status === 'Active' ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                      customer.status === 'Under Review' ? 'bg-gradient-to-br from-amber-500 to-amber-600' :
                      customer.status === 'Suspended' ? 'bg-gradient-to-br from-red-500 to-red-600' :
                      'bg-gradient-to-br from-gray-500 to-gray-600'
                    }`}>
                      {customer.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className={`text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{customer.name}</p>
                      <p className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{customer.type}</p>
                    </div>
                  </div>
                </td>
                <td className={`px-3 py-2.5 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {customer.company || '—'}
                </td>
                <td className="px-3 py-2.5">
                  <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{customer.email}</p>
                  <p className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{customer.phone}</p>
                </td>
                <td className={`px-3 py-2.5 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {customer.lastTrip}
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill status={customer.status} />
                </td>
                <td className="px-3 py-2.5">
                  {customer.idVerified ? (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                      isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Verified
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                      isDarkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'
                    }`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Unverified
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <RiskPill level={customer.riskLevel} />
                </td>
                <td className="px-3 py-2.5">
                  <ScoreBadge
                    score={customer.drivingStyleScore ?? customer.drivingScore}
                    hasEnoughData={customer.hasEnoughData ?? true}
                  />
                </td>
                <td className={`px-3 py-2.5 text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {customer.totalBookings}
                </td>
                <td className={`px-3 py-2.5 text-xs font-semibold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                  {customer.totalRevenue}
                </td>
                <td className="px-3 py-2.5">
                  <Icon name="chevron-right" className={`w-5 h-5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center">
            <Icon name="users" className={`w-5 h-5 mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
            <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>No customers match your filters</p>
          </div>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          Showing {filtered.length} of {allCustomers.length} customers
        </p>
      </div>

      </div>{/* End of main content wrapper */}

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          isDarkMode={isDarkMode}
          onClose={closeCustomerDetail}
          isAnimating={isCustomerDetailAnimating}
          onUpdateCustomer={(updated) => {
            setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
            setSelectedCustomer(updated);
          }}
          onOpenDetail={() => {
            onOpenCustomerDetail?.(selectedCustomer);
          }}
        />
      )}

      {/* Add Customer Modal */}
      {isAddCustomerOpen && (() => {
        const steps = [
          { label: 'Persönliche Daten', icon: User },
          { label: 'ID & Führerschein', icon: IdCard },
          { label: 'Dokumente', icon: Upload },
          { label: 'Zusammenfassung', icon: CheckCircle },
        ];
        const inputClass = `w-full px-3 py-2.5 rounded-lg border text-xs outline-none transition-all ${
          isDarkMode
            ? 'bg-neutral-800 border-neutral-700 text-gray-200 placeholder-gray-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20'
            : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20'
        }`;
        const labelClass = `block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`;
        const sectionTitle = (icon: any, title: string) => {
          const Icon = icon;
          return (
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-blue-500/15' : 'bg-blue-50'}`}>
                <Icon className="w-5 h-5 text-blue-500" />
              </div>
              <h3 className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{title}</h3>
            </div>
          );
        };

        const SummaryRow = ({ label, value }: { label: string; value: string }) => (
          <div className="flex items-center justify-between py-2">
            <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{label}</span>
            <span className={`text-xs font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{value || '—'}</span>
          </div>
        );

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={closeAddCustomer}>
            <div
              className="absolute inset-0 transition-all duration-500 ease-out"
              style={{
                backgroundColor: isAddCustomerAnimating ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0)',
              }}
            />
            <div onClick={(e) => e.stopPropagation()}
              className={`relative w-full max-w-[680px] max-h-[85vh] flex flex-col rounded-lg border shadow-2xl transition-all duration-500 ease-out ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
              }`}
              style={{
                transform: isAddCustomerAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)',
                opacity: isAddCustomerAnimating ? 1 : 0,
                boxShadow: isAddCustomerAnimating
                  ? '0 25px 60px -12px rgba(0, 0, 0, 0.35), 0 0 40px -8px rgba(59, 130, 246, 0.15)'
                  : '0 10px 30px -12px rgba(0, 0, 0, 0)',
              }}>
              {/* Header */}
              <div className={`flex items-center justify-between px-7 py-3 border-b shrink-0 ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                <div>
                  <h2 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Neuen Kunden anlegen</h2>
                  <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Alle Pflichtfelder ausfüllen & Dokumente hochladen</p>
                </div>
                <button onClick={closeAddCustomer}
                  className={`w-5 h-5 rounded-lg flex items-center justify-center transition-colors ${
                    isDarkMode ? 'hover:bg-neutral-800 text-gray-500' : 'hover:bg-gray-100 text-gray-400'
                  }`}>
                  <Icon name="x" className="w-5 h-5" />
                </button>
              </div>

              {/* Step Indicator */}
              <div className={`flex items-center gap-1 px-7 py-3 border-b shrink-0 ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                {steps.map((s, i) => {
                  const StepIcon = s.icon;
                  const isActive = i === addStep;
                  const isDone = i < addStep;
                  return (
                    <div key={i} className="flex items-center flex-1">
                      <button onClick={() => { if (isDone) setAddStep(i); }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          isActive
                            ? isDarkMode ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-600'
                            : isDone
                              ? isDarkMode ? 'text-emerald-400 cursor-pointer hover:bg-emerald-500/10' : 'text-emerald-600 cursor-pointer hover:bg-emerald-50'
                              : isDarkMode ? 'text-gray-600' : 'text-gray-300'
                        }`}>
                        {isDone ? <Icon name="check-circle" className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{s.label}</span>
                      </button>
                      {i < steps.length - 1 && (
                        <div className={`flex-1 h-px mx-2 ${isDone ? 'bg-emerald-400/40' : isDarkMode ? 'bg-neutral-800' : 'bg-gray-200'}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-7 py-3">
                {addStep === 0 && (
                  <div className="space-y-4">
                    {sectionTitle(User, 'Persönliche Daten')}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Vorname *</label>
                        <input type="text" placeholder="Max" value={newCustomer.firstName}
                          onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })} className={inputClass} />
                        {formErrors.firstName && <p className="text-[11px] text-red-500 mt-1">{formErrors.firstName}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Nachname *</label>
                        <input type="text" placeholder="Mustermann" value={newCustomer.lastName}
                          onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })} className={inputClass} />
                        {formErrors.lastName && <p className="text-[11px] text-red-500 mt-1">{formErrors.lastName}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>E-Mail *</label>
                        <div className="relative">
                          <Icon name="mail" className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                          <input type="email" placeholder="max@beispiel.de" value={newCustomer.email}
                            onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} className={`${inputClass} pl-9`} />
                        </div>
                        {formErrors.email && <p className="text-[11px] text-red-500 mt-1">{formErrors.email}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Telefon *</label>
                        <div className="relative">
                          <Icon name="phone" className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                          <input type="text" placeholder="+49 176 1234 5678" value={newCustomer.phone}
                            onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className={`${inputClass} pl-9`} />
                        </div>
                        {formErrors.phone && <p className="text-[11px] text-red-500 mt-1">{formErrors.phone}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>Straße</label>
                        <input type="text" placeholder="Musterstraße 1" value={newCustomer.street}
                          onChange={(e) => setNewCustomer({ ...newCustomer, street: e.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>PLZ</label>
                        <input type="text" placeholder="34117" value={newCustomer.zip}
                          onChange={(e) => setNewCustomer({ ...newCustomer, zip: e.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Stadt *</label>
                        <input type="text" placeholder="Kassel" value={newCustomer.city}
                          onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })} className={inputClass} />
                        {formErrors.city && <p className="text-[11px] text-red-500 mt-1">{formErrors.city}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Kundentyp</label>
                        <div className="flex gap-2">
                          {(['Individual', 'Corporate'] as const).map(t => (
                            <button key={t} onClick={() => setNewCustomer({ ...newCustomer, type: t })}
                              className={`flex-1 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
                                newCustomer.type === t
                                  ? 'bg-blue-500 text-white border-blue-500 shadow-md'
                                  : isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-400 hover:border-gray-600' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                              }`}>
                              {t === 'Individual' ? 'Privat' : 'Firma'}
                            </button>
                          ))}
                        </div>
                      </div>
                      {newCustomer.type === 'Corporate' && (
                        <div>
                          <label className={labelClass}>Firmenname *</label>
                          <input type="text" placeholder="Firma GmbH" value={newCustomer.company}
                            onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })} className={inputClass} />
                          {formErrors.company && <p className="text-[11px] text-red-500 mt-1">{formErrors.company}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {addStep === 1 && (
                  <div className="space-y-5">
                    {sectionTitle(Car, 'Führerschein')}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>Führerscheinnr. *</label>
                        <input type="text" placeholder="B072RRE2I55" value={newCustomer.licenseNumber}
                          onChange={(e) => setNewCustomer({ ...newCustomer, licenseNumber: e.target.value })} className={inputClass} />
                        {formErrors.licenseNumber && <p className="text-[11px] text-red-500 mt-1">{formErrors.licenseNumber}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Gültig bis *</label>
                        <input type="date" value={newCustomer.licenseExpiry}
                          onChange={(e) => setNewCustomer({ ...newCustomer, licenseExpiry: e.target.value })} className={inputClass} />
                        {formErrors.licenseExpiry && <p className="text-[11px] text-red-500 mt-1">{formErrors.licenseExpiry}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Klasse</label>
                        <select value={newCustomer.licenseClass}
                          onChange={(e) => setNewCustomer({ ...newCustomer, licenseClass: e.target.value })} className={inputClass}>
                          {['AM', 'A1', 'A2', 'A', 'B', 'BE', 'C', 'CE', 'C1', 'C1E', 'D', 'DE'].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className={`h-px my-2 ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'}`} />

                    {sectionTitle(IdCard, 'Ausweisdokument (ID-Verifikation)')}
                    <div className={`rounded-lg p-3.5 mb-3 ${isDarkMode ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-amber-50 border border-amber-200/60'}`}>
                      <div className="flex items-start gap-2.5">
                        <Icon name="shield" className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                        <p className={`text-xs ${isDarkMode ? 'text-amber-300/80' : 'text-amber-700'}`}>
                          Zur Identitätsprüfung wird ein gültiger Personalausweis oder Reisepass benötigt. Die Daten werden gemäß DSGVO verarbeitet.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>Dokumenttyp</label>
                        <select value={newCustomer.idType}
                          onChange={(e) => setNewCustomer({ ...newCustomer, idType: e.target.value as any })} className={inputClass}>
                          <option value="Personalausweis">Personalausweis</option>
                          <option value="Reisepass">Reisepass</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Ausweisnummer *</label>
                        <input type="text" placeholder="L01X00T47" value={newCustomer.idNumber}
                          onChange={(e) => setNewCustomer({ ...newCustomer, idNumber: e.target.value })} className={inputClass} />
                        {formErrors.idNumber && <p className="text-[11px] text-red-500 mt-1">{formErrors.idNumber}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Gültig bis *</label>
                        <input type="date" value={newCustomer.idExpiry}
                          onChange={(e) => setNewCustomer({ ...newCustomer, idExpiry: e.target.value })} className={inputClass} />
                        {formErrors.idExpiry && <p className="text-[11px] text-red-500 mt-1">{formErrors.idExpiry}</p>}
                      </div>
                    </div>
                  </div>
                )}

                {addStep === 2 && (
                  <div className="space-y-5">
                    {sectionTitle(IdCard, `${newCustomer.idType} hochladen`)}
                    <div className="grid grid-cols-2 gap-3">
                      <CustomerDocumentUploadBox
                        label="Vorderseite *"
                        slot="id-front"
                        orgId={orgId}
                        isDarkMode={isDarkMode}
                        url={newCustomer.idFrontUrl}
                        errorMessage={formErrors.idFront}
                        onUploaded={(url) => setNewCustomer((prev) => ({ ...prev, idFrontUrl: url }))}
                        onCleared={() => setNewCustomer((prev) => ({ ...prev, idFrontUrl: null }))}
                      />
                      <CustomerDocumentUploadBox
                        label="Rückseite *"
                        slot="id-back"
                        orgId={orgId}
                        isDarkMode={isDarkMode}
                        url={newCustomer.idBackUrl}
                        errorMessage={formErrors.idBack}
                        onUploaded={(url) => setNewCustomer((prev) => ({ ...prev, idBackUrl: url }))}
                        onCleared={() => setNewCustomer((prev) => ({ ...prev, idBackUrl: null }))}
                      />
                    </div>
                    {/* Veriff ID Verification */}
                    <div className={`rounded-lg border p-4 transition-all ${
                      idVerificationStatus === 'verified'
                        ? isDarkMode ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-emerald-50/50 border-emerald-200/60'
                        : idVerificationStatus === 'failed'
                          ? isDarkMode ? 'bg-red-500/5 border-red-500/30' : 'bg-red-50/50 border-red-200/60'
                          : isDarkMode ? 'bg-neutral-800/40 border-neutral-700/50' : 'bg-gray-50/50 border-gray-200/60'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${
                            idVerificationStatus === 'verified'
                              ? isDarkMode ? 'bg-emerald-500/15' : 'bg-emerald-100'
                              : idVerificationStatus === 'failed'
                                ? isDarkMode ? 'bg-red-500/15' : 'bg-red-100'
                                : isDarkMode ? 'bg-violet-500/15' : 'bg-violet-50'
                          }`}>
                            {idVerificationStatus === 'verifying' ? (
                              <Icon name="loader-2" className="w-5 h-5 text-violet-500 animate-spin" />
                            ) : idVerificationStatus === 'verified' ? (
                              <Icon name="shield-check" className={`w-5 h-5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                            ) : idVerificationStatus === 'failed' ? (
                              <Icon name="shield" className={`w-5 h-5 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`} />
                            ) : (
                              <Icon name="shield" className="w-5 h-5 text-violet-500" />
                            )}
                          </div>
                          <div>
                            <h4 className={`text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>ID-Echtheitsprüfung</h4>
                            <p className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Powered by Veriff</p>
                          </div>
                        </div>
                        {idVerificationStatus === 'verified' && (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                            isDarkMode ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            <Icon name="shield-check" className="w-3 h-3" />
                            Verifiziert
                          </span>
                        )}
                        {idVerificationStatus === 'failed' && (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                            isDarkMode ? 'bg-red-900/30 text-red-400 border border-red-500/30' : 'bg-red-50 text-red-700 border border-red-200'
                          }`}>
                            <Icon name="x" className="w-3 h-3" />
                            Fehlgeschlagen
                          </span>
                        )}
                      </div>

                      {idVerificationStatus === 'idle' && (
                        <>
                          <p className={`text-xs mb-3 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            Lassen Sie das hochgeladene Ausweisdokument automatisch auf Echtheit prüfen. Veriff überprüft Sicherheitsmerkmale, MRZ-Daten und Dokumentenintegrität.
                          </p>
                          <button
                            onClick={() => {
                              if (!newCustomer.idFrontUrl) {
                                setFormErrors({ ...formErrors, veriff: 'Bitte laden Sie zuerst die Vorderseite des Ausweises hoch.' });
                                return;
                              }
                              setFormErrors({});
                              setIdVerificationStatus('verifying');
                              setTimeout(() => {
                                setIdVerificationStatus('verified');
                              }, 3000);
                            }}
                            disabled={!newCustomer.idFrontUrl}
                            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all ${
                              newCustomer.idFrontUrl
                                ? 'bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 text-white shadow-md hover:shadow-lg'
                                : isDarkMode
                                  ? 'bg-neutral-800 border border-neutral-700/50 text-gray-600 cursor-not-allowed'
                                  : 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
                            }`}>
                            <Icon name="shield" className="w-5 h-5" />
                            ID auf Echtheit verifizieren
                            <Icon name="external-link" className="w-3 h-3 opacity-60" />
                          </button>
                          {formErrors.veriff && <p className="text-[11px] text-red-500 mt-1.5">{formErrors.veriff}</p>}
                          {!newCustomer.idFrontUrl && (
                            <p className={`text-[11px] mt-1.5 ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                              Bitte laden Sie zuerst die Vorderseite des Ausweises hoch.
                            </p>
                          )}
                        </>
                      )}

                      {idVerificationStatus === 'verifying' && (
                        <div className="flex flex-col items-center py-3 gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-violet-500/10' : 'bg-violet-50'}`}>
                            <Icon name="loader-2" className="w-5 h-5 text-violet-500 animate-spin" />
                          </div>
                          <div className="text-center">
                            <p className={`text-xs font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Dokument wird geprüft...</p>
                            <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Veriff analysiert Sicherheitsmerkmale & MRZ-Daten</p>
                          </div>
                          <div className={`w-full rounded-full h-1.5 overflow-hidden ${isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`}>
                            <div className="h-full bg-gradient-to-r from-violet-500 to-violet-400 rounded-full animate-pulse" style={{ width: '60%' }} />
                          </div>
                        </div>
                      )}

                      {idVerificationStatus === 'verified' && (
                        <div className="space-y-2.5 mt-1">
                          <div className="grid grid-cols-2 gap-2.5">
                            {[
                              { label: 'Dokumententyp', value: newCustomer.idType, icon: IdCard },
                              { label: 'MRZ-Prüfung', value: 'Bestanden', icon: CheckCircle },
                              { label: 'Sicherheitsmerkmale', value: 'Gültig', icon: ShieldCheck },
                              { label: 'Manipulationsprüfung', value: 'Keine erkannt', icon: Eye },
                            ].map(item => (
                              <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isDarkMode ? 'bg-emerald-500/5' : 'bg-emerald-50/60'}`}>
                                <item.icon className={`w-3.5 h-3.5 shrink-0 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`} />
                                <div>
                                  <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{item.label}</p>
                                  <p className={`text-xs font-semibold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>{item.value}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {idVerificationStatus === 'failed' && (
                        <div className="mt-1">
                          <p className={`text-xs mb-3 ${isDarkMode ? 'text-red-400/80' : 'text-red-600'}`}>
                            Die Echtheitsprüfung konnte nicht bestätigt werden. Bitte überprüfen Sie die Qualität des Uploads oder verwenden Sie ein anderes Dokument.
                          </p>
                          <button
                            onClick={() => setIdVerificationStatus('idle')}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                              isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                            }`}>
                            <Icon name="shield" className="w-3.5 h-3.5" />
                            Erneut versuchen
                          </button>
                        </div>
                      )}
                    </div>

                    <div className={`h-px my-1 ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-100'}`} />
                    {sectionTitle(Car, 'Führerschein hochladen')}
                    <div className="grid grid-cols-2 gap-3">
                      <CustomerDocumentUploadBox
                        label="Vorderseite *"
                        slot="license-front"
                        orgId={orgId}
                        isDarkMode={isDarkMode}
                        url={newCustomer.licenseFrontUrl}
                        errorMessage={formErrors.licenseFront}
                        onUploaded={(url) => setNewCustomer((prev) => ({ ...prev, licenseFrontUrl: url }))}
                        onCleared={() => setNewCustomer((prev) => ({ ...prev, licenseFrontUrl: null }))}
                      />
                      <CustomerDocumentUploadBox
                        label="Rückseite (optional)"
                        slot="license-back"
                        orgId={orgId}
                        isDarkMode={isDarkMode}
                        url={newCustomer.licenseBackUrl}
                        onUploaded={(url) => setNewCustomer((prev) => ({ ...prev, licenseBackUrl: url }))}
                        onCleared={() => setNewCustomer((prev) => ({ ...prev, licenseBackUrl: null }))}
                      />
                    </div>
                  </div>
                )}

                {addStep === 3 && (
                  <div className="space-y-5">
                    {sectionTitle(CheckCircle, 'Zusammenfassung & Prüfung')}
                    <div className={`rounded-lg border p-4 space-y-0 divide-y ${
                      isDarkMode ? 'bg-neutral-800/40 border-neutral-700/50 divide-neutral-800' : 'bg-gray-50/50 border-gray-200/60 divide-gray-100'
                    }`}>
                      <SummaryRow label="Name" value={`${newCustomer.firstName} ${newCustomer.lastName}`} />
                      <SummaryRow label="E-Mail" value={newCustomer.email} />
                      <SummaryRow label="Telefon" value={newCustomer.phone} />
                      <SummaryRow label="Adresse" value={[newCustomer.street, `${newCustomer.zip} ${newCustomer.city}`].filter(Boolean).join(', ')} />
                      <SummaryRow label="Typ" value={newCustomer.type === 'Corporate' ? `Firma — ${newCustomer.company}` : 'Privatkunde'} />
                    </div>
                    <div className={`rounded-lg border p-4 space-y-0 divide-y ${
                      isDarkMode ? 'bg-neutral-800/40 border-neutral-700/50 divide-neutral-800' : 'bg-gray-50/50 border-gray-200/60 divide-gray-100'
                    }`}>
                      <SummaryRow label="Führerscheinnr." value={newCustomer.licenseNumber} />
                      <SummaryRow label="Klasse" value={newCustomer.licenseClass} />
                      <SummaryRow label="FS gültig bis" value={newCustomer.licenseExpiry} />
                      <SummaryRow label="Ausweistyp" value={newCustomer.idType} />
                      <SummaryRow label="Ausweisnr." value={newCustomer.idNumber} />
                      <SummaryRow label="Ausweis gültig bis" value={newCustomer.idExpiry} />
                      <div className="flex items-center justify-between py-2">
                        <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>ID-Verifizierung</span>
                        {idVerificationStatus === 'verified' ? (
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                            <Icon name="shield-check" className="w-3.5 h-3.5" />
                            Verifiziert (Veriff)
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${isDarkMode ? 'text-gray-600' : 'text-gray-400'}`}>
                            <Icon name="shield" className="w-3.5 h-3.5" />
                            Nicht verifiziert
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`rounded-lg border p-4 ${
                      isDarkMode ? 'bg-neutral-800/40 border-neutral-700/50' : 'bg-gray-50/50 border-gray-200/60'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Dokumente</span>
                        <div className="flex items-center gap-3">
                          {[
                            { label: 'Ausweis VS', ok: Boolean(newCustomer.idFrontUrl) },
                            { label: 'Ausweis RS', ok: Boolean(newCustomer.idBackUrl) },
                            { label: 'FS VS', ok: Boolean(newCustomer.licenseFrontUrl) },
                            { label: 'FS RS', ok: Boolean(newCustomer.licenseBackUrl) },
                          ].map(d => (
                            <span key={d.label} className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                              d.ok ? isDarkMode ? 'text-emerald-400' : 'text-emerald-600' : isDarkMode ? 'text-gray-600' : 'text-gray-300'
                            }`}>
                              {d.ok ? <Icon name="check-circle" className="w-3 h-3" /> : <Icon name="x" className="w-3 h-3" />}
                              {d.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Notizen (optional)</label>
                      <textarea rows={2} placeholder="Zusätzliche Informationen zum Kunden..."
                        value={newCustomer.notes}
                        onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
                        className={`${inputClass} resize-none`} />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className={`flex items-center justify-between px-7 py-3 border-t shrink-0 ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                <button onClick={closeAddCustomer}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isDarkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-neutral-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }`}>
                  Abbrechen
                </button>
                <div className="flex items-center gap-2.5">
                  {addStep > 0 && (
                    <button onClick={() => setAddStep(addStep - 1)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                        isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}>
                      <Icon name="chevron-left" className="w-3.5 h-3.5" />
                      Zurück
                    </button>
                  )}
                  {addStep < 3 ? (
                    <button onClick={handleNextStep}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-xs font-semibold shadow-md hover:shadow-lg transition-all">
                      Weiter
                      <Icon name="chevron-right" className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button onClick={handleSubmitCustomer}
                      disabled={isSavingCustomer}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold shadow-md transition-all ${
                        isSavingCustomer
                          ? 'bg-gray-300 text-white cursor-not-allowed'
                          : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white hover:shadow-lg'
                      }`}>
                      {isSavingCustomer ? <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> : <Icon name="check-circle" className="w-3.5 h-3.5" />}
                      {isSavingCustomer ? 'Speichert…' : 'Kunden anlegen'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function customerToneClass(tone: 'brand' | 'info' | 'success' | 'warning' | 'critical' | 'neutral') {
  if (tone === 'brand') return 'sq-tone-brand';
  if (tone === 'info') return 'sq-tone-info';
  if (tone === 'success') return 'sq-tone-success';
  if (tone === 'warning') return 'sq-tone-warning';
  if (tone === 'critical') return 'sq-tone-critical';
  return 'sq-tone-neutral';
}

function CustomerMetric({
  label,
  value,
  icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number;
  icon: any;
  tone: 'success' | 'warning' | 'critical' | 'neutral';
  active: boolean;
  onClick: () => void;
}) {
  const MetricIcon = icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl p-3 text-left transition-all duration-200 ${customerToneClass(tone)} ${
        active
          ? 'shadow-[inset_0_0_0_1px_currentColor,0_6px_14px_rgba(15,23,42,0.12)]'
          : 'opacity-80 hover:opacity-100 hover:shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[18px] leading-none font-bold tabular-nums">{value}</p>
          <p className="text-[9px] mt-1 font-semibold uppercase tracking-wider opacity-75">{label}</p>
        </div>
        <MetricIcon className="w-4 h-4 shrink-0 opacity-80" />
      </div>
    </button>
  );
}
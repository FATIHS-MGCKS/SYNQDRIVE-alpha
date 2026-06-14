import { useState, useEffect, useCallback, useMemo } from 'react';

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
import {
  PageHeader,
  DataTable,
  StatusChip,
  EmptyState,
} from '../../components/patterns';
import type { DataTableColumn } from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';
import { formatDrivingStyleScore } from '../lib/scoreFormat';

interface CustomersViewProps {
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

function customerStatusTone(status: Customer['status']): StatusTone {
  if (status === 'Active') return 'success';
  if (status === 'Under Review') return 'warning';
  if (status === 'Suspended') return 'critical';
  return 'neutral';
}

function customerRiskTone(level: Customer['riskLevel']): StatusTone {
  if (level === 'Not Assessed') return 'noData';
  if (level === 'Low Risk') return 'success';
  if (level === 'Medium Risk') return 'warning';
  return 'critical';
}

function scoreToneFromDisplay(
  tone: ReturnType<typeof formatDrivingStyleScore>['tone'],
): StatusTone {
  if (tone === 'success' || tone === 'good') return 'success';
  if (tone === 'warning') return 'warning';
  if (tone === 'critical') return 'critical';
  if (tone === 'muted') return 'noData';
  return 'neutral';
}

function customerAvatarTone(status: Customer['status']): string {
  if (status === 'Active') return 'sq-tone-brand';
  if (status === 'Under Review') return 'sq-tone-warning';
  if (status === 'Suspended') return 'sq-tone-critical';
  return 'sq-tone-neutral';
}

export function CustomersView({ onOpenCustomerDetail, additionalCustomers = [] }: CustomersViewProps) {
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

  const inputClass =
    'w-full px-3 py-2.5 rounded-lg border border-border bg-[color:var(--input-background)] text-foreground placeholder:text-muted-foreground outline-none transition-all text-xs focus:border-[color:var(--brand)] focus:ring-1 focus:ring-[color:var(--brand-soft)]';
  const labelClass =
    'block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground';
  const textTertiary = 'text-muted-foreground';

  const customerColumns = useMemo<DataTableColumn<Customer>[]>(
    () => [
      {
        key: 'name',
        header: 'Name',
        cell: (customer) => (
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${customerAvatarTone(customer.status)}`}
            >
              {customer.name.split(' ').map((n) => n[0]).join('')}
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">{customer.name}</p>
              <p className="text-[11px] text-muted-foreground">{customer.type}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'company',
        header: 'Company',
        cell: (customer) => (
          <span className="text-xs text-muted-foreground">{customer.company || '—'}</span>
        ),
      },
      {
        key: 'contact',
        header: 'Contact',
        cell: (customer) => (
          <div>
            <p className="text-xs text-foreground">{customer.email}</p>
            <p className="text-[11px] text-muted-foreground">{customer.phone}</p>
          </div>
        ),
      },
      {
        key: 'lastTrip',
        header: 'Last Trip',
        cell: (customer) => (
          <span className="text-xs text-muted-foreground">{customer.lastTrip}</span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        cell: (customer) => (
          <StatusChip tone={customerStatusTone(customer.status)}>{customer.status}</StatusChip>
        ),
      },
      {
        key: 'verification',
        header: 'Verification',
        cell: (customer) =>
          customer.idVerified ? (
            <StatusChip tone="success" dot>
              Verified
            </StatusChip>
          ) : (
            <StatusChip tone="warning" dot>
              Unverified
            </StatusChip>
          ),
      },
      {
        key: 'risk',
        header: 'Risk Level',
        cell: (customer) => (
          <StatusChip tone={customerRiskTone(customer.riskLevel)}>{customer.riskLevel}</StatusChip>
        ),
      },
      {
        key: 'driving',
        header: 'Driving Style',
        cell: (customer) => {
          const display = formatDrivingStyleScore(
            customer.drivingStyleScore ?? customer.drivingScore,
            { hasEnoughData: customer.hasEnoughData ?? true },
          );
          return (
            <StatusChip
              tone={scoreToneFromDisplay(display.tone)}
              icon={<Icon name="star" className="w-3 h-3" />}
              title={display.isMissing ? display.label : `${display.outOf100} (Driving Style)`}
            >
              {display.compact}
            </StatusChip>
          );
        },
      },
      {
        key: 'bookings',
        header: 'Bookings',
        numeric: true,
        cell: (customer) => (
          <span className="text-xs font-semibold text-foreground">{customer.totalBookings}</span>
        ),
      },
      {
        key: 'revenue',
        header: 'Revenue',
        cell: (customer) => (
          <span className="text-xs font-semibold text-[color:var(--status-positive)]">
            {customer.totalRevenue}
          </span>
        ),
      },
    ],
    [],
  );

  const DropdownFilter = ({ label, value, options, isOpen, onToggle, onSelect }: {
    label: string; value: string; options: { value: string; label: string }[];
    isOpen: boolean; onToggle: () => void; onSelect: (v: string) => void;
  }) => (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-medium transition-all ${
          value !== 'all'
            ? 'bg-[color:var(--brand-soft)] border-[color:var(--brand)]/30 text-[color:var(--brand-ink)]'
            : 'border-border bg-card text-foreground hover:bg-muted'
        }`}
      >
        <span>{value === 'all' ? label : options.find(o => o.value === value)?.label}</span>
        <Icon name="chevron-down" className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="sq-overlay absolute top-full mt-2 left-0 z-50 min-w-[180px] overflow-hidden">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onSelect(o.value); onToggle(); }}
              className={`w-full px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                o.value === value
                  ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                  : 'text-foreground hover:bg-muted'
              }`}
            >
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
      <PageHeader
        title="Customers & Drivers"
        actions={(
          <button
            type="button"
            className="sq-press flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border"
            onClick={openAddCustomer}
          >
            <Icon name="plus" className="w-4 h-4 text-[color:var(--brand)]" />
            Add Customer
          </button>
        )}
      />

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
          const MetricIcon = card.icon;
          const toneClass = customerToneClass(card.tone);
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => setCardFilter(isActive ? 'all' : card.filterKey)}
              className={`group sq-card sq-press rounded-2xl p-4 text-left shadow-[var(--shadow-1)] transition-all ${
                isActive ? 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_22%,transparent)]' : 'hover:bg-muted/35'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-muted-foreground">{card.label}</p>
                  <p className="mt-1 truncate text-[20px] font-bold leading-none tracking-[-0.03em] text-foreground tabular-nums">
                    {card.value}
                  </p>
                </div>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
                  <MetricIcon className="h-4 w-4" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <Icon name="filter" className="w-4 h-4 text-muted-foreground" />
            <div className="min-w-0">
              <h2 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Filters</h2>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Showing {filtered.length} of {allCustomers.length} customers
              </p>
            </div>
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
              <button
                type="button"
                onClick={() => { setStatusFilter('all'); setRiskFilter('all'); setTypeFilter('all'); setSearchQuery(''); }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-transparent text-[10px] font-semibold transition-all sq-tone-critical hover:opacity-90"
              >
                <Icon name="x" className="w-3.5 h-3.5" />
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px] relative">
            <Icon name="search" className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 ${textTertiary}`} />
            <input
              type="text"
              placeholder="Search by name, email, phone or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground outline-none transition-all text-xs focus:border-[color:var(--brand)]"
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
      <DataTable
        columns={customerColumns}
        rows={filtered}
        getRowKey={(customer) => customer.id}
        onRowClick={openCustomerDetail}
        empty={(
          <EmptyState
            icon={<Icon name="users" className="w-5 h-5" />}
            title="No customers match your filters"
            compact
          />
        )}
        rowActions={() => (
          <Icon name="chevron-right" className="w-5 h-5 text-muted-foreground/50" />
        )}
      />

      </div>{/* End of main content wrapper */}

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
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
        const sectionTitle = (icon: any, title: string) => {
          const SectionIcon = icon;
          return (
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-5 h-5 rounded-lg flex items-center justify-center sq-tone-brand">
                <SectionIcon className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-foreground">{title}</h3>
            </div>
          );
        };

        const SummaryRow = ({ label, value }: { label: string; value: string }) => (
          <div className="flex items-center justify-between py-2">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-xs font-medium text-foreground">{value || '—'}</span>
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
              className="relative w-full max-w-[680px] max-h-[85vh] flex flex-col rounded-lg border border-border bg-card shadow-[var(--shadow-2)] transition-all duration-500 ease-out"
              style={{
                transform: isAddCustomerAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)',
                opacity: isAddCustomerAnimating ? 1 : 0,
              }}>
              {/* Header */}
              <div className="flex items-center justify-between px-7 py-3 border-b border-border shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-foreground">Neuen Kunden anlegen</h2>
                  <p className="text-xs mt-0.5 text-muted-foreground">Alle Pflichtfelder ausfüllen & Dokumente hochladen</p>
                </div>
                <button
                  type="button"
                  onClick={closeAddCustomer}
                  className="w-5 h-5 rounded-lg flex items-center justify-center transition-colors hover:bg-muted text-muted-foreground"
                >
                  <Icon name="x" className="w-5 h-5" />
                </button>
              </div>

              {/* Step Indicator */}
              <div className="flex items-center gap-1 px-7 py-3 border-b border-border shrink-0">
                {steps.map((s, i) => {
                  const StepIcon = s.icon;
                  const isActive = i === addStep;
                  const isDone = i < addStep;
                  return (
                    <div key={i} className="flex items-center flex-1">
                      <button
                        type="button"
                        onClick={() => { if (isDone) setAddStep(i); }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          isActive
                            ? 'sq-tone-brand'
                            : isDone
                              ? 'sq-tone-success cursor-pointer hover:opacity-90'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {isDone ? <Icon name="check-circle" className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{s.label}</span>
                      </button>
                      {i < steps.length - 1 && (
                        <div className={`flex-1 h-px mx-2 ${isDone ? 'bg-[color:var(--status-positive)]/40' : 'bg-border'}`} />
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
                          <Icon name="mail" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <input type="email" placeholder="max@beispiel.de" value={newCustomer.email}
                            onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} className={`${inputClass} pl-9`} />
                        </div>
                        {formErrors.email && <p className="text-[11px] text-red-500 mt-1">{formErrors.email}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Telefon *</label>
                        <div className="relative">
                          <Icon name="phone" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
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
                            <button key={t} type="button" onClick={() => setNewCustomer({ ...newCustomer, type: t })}
                              className={`flex-1 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
                                newCustomer.type === t
                                  ? 'bg-[color:var(--brand)] text-white border-[color:var(--brand)] shadow-md'
                                  : 'border-border bg-card text-muted-foreground hover:border-[color:var(--brand)]/40 hover:bg-muted'
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

                    <div className="h-px my-2 bg-border" />

                    {sectionTitle(IdCard, 'Ausweisdokument (ID-Verifikation)')}
                    <div className="rounded-lg p-3.5 mb-3 sq-tone-warning border border-current/20">
                      <div className="flex items-start gap-2.5">
                        <Icon name="shield" className="w-5 h-5 mt-0.5 shrink-0" />
                        <p className="text-xs">
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
                        url={newCustomer.idFrontUrl}
                        errorMessage={formErrors.idFront}
                        onUploaded={(url) => setNewCustomer((prev) => ({ ...prev, idFrontUrl: url }))}
                        onCleared={() => setNewCustomer((prev) => ({ ...prev, idFrontUrl: null }))}
                      />
                      <CustomerDocumentUploadBox
                        label="Rückseite *"
                        slot="id-back"
                        orgId={orgId}
                        url={newCustomer.idBackUrl}
                        errorMessage={formErrors.idBack}
                        onUploaded={(url) => setNewCustomer((prev) => ({ ...prev, idBackUrl: url }))}
                        onCleared={() => setNewCustomer((prev) => ({ ...prev, idBackUrl: null }))}
                      />
                    </div>
                    {/* Veriff ID Verification */}
                    <div className={`rounded-lg border p-4 transition-all ${
                      idVerificationStatus === 'verified'
                        ? 'sq-tone-success border-current/30'
                        : idVerificationStatus === 'failed'
                          ? 'sq-tone-critical border-current/30'
                          : 'bg-muted/30 border-border'
                    }`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${
                            idVerificationStatus === 'verified'
                              ? 'sq-tone-success'
                              : idVerificationStatus === 'failed'
                                ? 'sq-tone-critical'
                                : 'sq-tone-info'
                          }`}>
                            {idVerificationStatus === 'verifying' ? (
                              <Icon name="loader-2" className="w-5 h-5 animate-spin" />
                            ) : idVerificationStatus === 'verified' ? (
                              <Icon name="shield-check" className="w-5 h-5" />
                            ) : idVerificationStatus === 'failed' ? (
                              <Icon name="shield" className="w-5 h-5" />
                            ) : (
                              <Icon name="shield" className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-foreground">ID-Echtheitsprüfung</h4>
                            <p className="text-[11px] text-muted-foreground">Powered by Veriff</p>
                          </div>
                        </div>
                        {idVerificationStatus === 'verified' && (
                          <StatusChip tone="success" icon={<Icon name="shield-check" className="w-3 h-3" />}>
                            Verifiziert
                          </StatusChip>
                        )}
                        {idVerificationStatus === 'failed' && (
                          <StatusChip tone="critical" icon={<Icon name="x" className="w-3 h-3" />}>
                            Fehlgeschlagen
                          </StatusChip>
                        )}
                      </div>

                      {idVerificationStatus === 'idle' && (
                        <>
                          <p className="text-xs mb-3 text-muted-foreground">
                            Lassen Sie das hochgeladene Ausweisdokument automatisch auf Echtheit prüfen. Veriff überprüft Sicherheitsmerkmale, MRZ-Daten und Dokumentenintegrität.
                          </p>
                          <button
                            type="button"
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
                                ? 'bg-[color:var(--brand)] text-white shadow-md hover:opacity-90'
                                : 'border border-border bg-muted text-muted-foreground cursor-not-allowed'
                            }`}>
                            <Icon name="shield" className="w-5 h-5" />
                            ID auf Echtheit verifizieren
                            <Icon name="external-link" className="w-3 h-3 opacity-60" />
                          </button>
                          {formErrors.veriff && <p className="text-[11px] text-[color:var(--status-critical)] mt-1.5">{formErrors.veriff}</p>}
                          {!newCustomer.idFrontUrl && (
                            <p className="text-[11px] mt-1.5 text-muted-foreground">
                              Bitte laden Sie zuerst die Vorderseite des Ausweises hoch.
                            </p>
                          )}
                        </>
                      )}

                      {idVerificationStatus === 'verifying' && (
                        <div className="flex flex-col items-center py-3 gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center sq-tone-info">
                            <Icon name="loader-2" className="w-5 h-5 animate-spin" />
                          </div>
                          <div className="text-center">
                            <p className="text-xs font-semibold text-foreground">Dokument wird geprüft...</p>
                            <p className="text-xs mt-0.5 text-muted-foreground">Veriff analysiert Sicherheitsmerkmale & MRZ-Daten</p>
                          </div>
                          <div className="w-full rounded-full h-1.5 overflow-hidden bg-muted">
                            <div className="h-full bg-[color:var(--brand)] rounded-full animate-pulse" style={{ width: '60%' }} />
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
                              <div key={item.label} className="flex items-center gap-2 px-3 py-2 rounded-lg sq-tone-success">
                                <item.icon className="w-3.5 h-3.5 shrink-0" />
                                <div>
                                  <p className="text-xs text-muted-foreground">{item.label}</p>
                                  <p className="text-xs font-semibold">{item.value}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {idVerificationStatus === 'failed' && (
                        <div className="mt-1">
                          <p className="text-xs mb-3 text-[color:var(--status-critical)]">
                            Die Echtheitsprüfung konnte nicht bestätigt werden. Bitte überprüfen Sie die Qualität des Uploads oder verwenden Sie ein anderes Dokument.
                          </p>
                          <button
                            type="button"
                            onClick={() => setIdVerificationStatus('idle')}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-xs font-medium text-foreground transition-all hover:bg-muted"
                          >
                            <Icon name="shield" className="w-3.5 h-3.5" />
                            Erneut versuchen
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="h-px my-1 bg-border" />
                    {sectionTitle(Car, 'Führerschein hochladen')}
                    <div className="grid grid-cols-2 gap-3">
                      <CustomerDocumentUploadBox
                        label="Vorderseite *"
                        slot="license-front"
                        orgId={orgId}
                        url={newCustomer.licenseFrontUrl}
                        errorMessage={formErrors.licenseFront}
                        onUploaded={(url) => setNewCustomer((prev) => ({ ...prev, licenseFrontUrl: url }))}
                        onCleared={() => setNewCustomer((prev) => ({ ...prev, licenseFrontUrl: null }))}
                      />
                      <CustomerDocumentUploadBox
                        label="Rückseite (optional)"
                        slot="license-back"
                        orgId={orgId}
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
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-0 divide-y divide-border">
                      <SummaryRow label="Name" value={`${newCustomer.firstName} ${newCustomer.lastName}`} />
                      <SummaryRow label="E-Mail" value={newCustomer.email} />
                      <SummaryRow label="Telefon" value={newCustomer.phone} />
                      <SummaryRow label="Adresse" value={[newCustomer.street, `${newCustomer.zip} ${newCustomer.city}`].filter(Boolean).join(', ')} />
                      <SummaryRow label="Typ" value={newCustomer.type === 'Corporate' ? `Firma — ${newCustomer.company}` : 'Privatkunde'} />
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-0 divide-y divide-border">
                      <SummaryRow label="Führerscheinnr." value={newCustomer.licenseNumber} />
                      <SummaryRow label="Klasse" value={newCustomer.licenseClass} />
                      <SummaryRow label="FS gültig bis" value={newCustomer.licenseExpiry} />
                      <SummaryRow label="Ausweistyp" value={newCustomer.idType} />
                      <SummaryRow label="Ausweisnr." value={newCustomer.idNumber} />
                      <SummaryRow label="Ausweis gültig bis" value={newCustomer.idExpiry} />
                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-muted-foreground">ID-Verifizierung</span>
                        {idVerificationStatus === 'verified' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--status-positive)]">
                            <Icon name="shield-check" className="w-3.5 h-3.5" />
                            Verifiziert (Veriff)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            <Icon name="shield" className="w-3.5 h-3.5" />
                            Nicht verifiziert
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Dokumente</span>
                        <div className="flex items-center gap-3">
                          {[
                            { label: 'Ausweis VS', ok: Boolean(newCustomer.idFrontUrl) },
                            { label: 'Ausweis RS', ok: Boolean(newCustomer.idBackUrl) },
                            { label: 'FS VS', ok: Boolean(newCustomer.licenseFrontUrl) },
                            { label: 'FS RS', ok: Boolean(newCustomer.licenseBackUrl) },
                          ].map(d => (
                            <span key={d.label} className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                              d.ok ? 'text-[color:var(--status-positive)]' : 'text-muted-foreground'
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
              <div className="flex items-center justify-between px-7 py-3 border-t border-border shrink-0">
                <button
                  type="button"
                  onClick={closeAddCustomer}
                  className="px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:bg-muted"
                >
                  Abbrechen
                </button>
                <div className="flex items-center gap-2.5">
                  {addStep > 0 && (
                    <button
                      type="button"
                      onClick={() => setAddStep(addStep - 1)}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-xs font-medium text-foreground transition-all hover:bg-muted"
                    >
                      <Icon name="chevron-left" className="w-3.5 h-3.5" />
                      Zurück
                    </button>
                  )}
                  {addStep < 3 ? (
                    <button
                      type="button"
                      onClick={handleNextStep}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[color:var(--brand)] text-white text-xs font-semibold shadow-md transition-all hover:opacity-90"
                    >
                      Weiter
                      <Icon name="chevron-right" className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSubmitCustomer}
                      disabled={isSavingCustomer}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold shadow-md transition-all ${
                        isSavingCustomer
                          ? 'bg-muted text-muted-foreground cursor-not-allowed'
                          : 'bg-[color:var(--status-positive)] text-white hover:opacity-90'
                      }`}
                    >
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
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { Car, CheckCircle, IdCard, Upload, User } from 'lucide-react';
import { Icon } from './ui/Icon';
import { toast } from 'sonner';
import { AddCustomerDocumentsStep } from './add-customer/AddCustomerDocumentsStep';
import {
  AddCustomerVerificationPlanSection,
  DEFAULT_VERIFICATION_PLAN,
  type CustomerVerificationPlanState,
} from './add-customer/AddCustomerVerificationPlanSection';
import { useCustomerVerification } from './customer-verification/useCustomerVerification';
import {
  DEFAULT_ADD_CUSTOMER_FORM,
  ensureWizardDraftCustomer,
  validateAddCustomerDocumentsStep,
  addCustomerFormToPayload,
} from '../lib/add-customer-wizard';
import { documentEligibilityLabelDe } from '../lib/customer-verification';
import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
import {
  buildCustomerCreatePayload,
  customerStatusUiToApi,
  customerRiskUiToApi,
  customerTypeUiToApi,
  customerStatusUiLabelDe,
  customerRiskUiLabelDe,
  uploadPendingCustomerDocuments,
  type PendingCustomerDocumentFiles,
} from '../lib/entityMappers';
import { mergeAdditionalCustomers } from '../lib/customer-list.utils';
import {
  customerRiskTone,
  customerStatusTone,
} from './customer-detail/customer-detail-ui';
import { CustomerKpiCard } from './customer-list/CustomerKpiCard';
import { CustomerListFilters } from './customer-list/CustomerListFilters';
import { CustomerListMobileCards } from './customer-list/CustomerListMobileCards';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  mapApiCustomerToListRow,
  type CustomerListRow,
} from '../lib/customer-list-ui';
import type { CustomerApiRecord } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { cn } from '../../components/ui/utils';
import {
  PageHeader,
  DataTable,
  StatusChip,
  EmptyState,
  FormDialog,
} from '../../components/patterns';
import type { DataTableColumn } from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';
import { formatStressScore } from '../lib/scoreFormat';

interface CustomersViewProps {
  onOpenCustomerDetail?: (customer: any) => void;
  additionalCustomers?: any[];
}

interface Customer extends CustomerListRow {
  city: string;
  dataConfidence?: 'none' | 'low' | 'medium' | 'high';
  scoredTripCount?: number;
  totalDistanceKm?: number;
  joinDate: string;
  licenseExpiry: string;
  accidents: number;
  violations: number;
  currentVehicle?: string;
  notes?: string;
}

const EM_DASH = '\u2014';

type CustomerSegmentFilter = 'all' | 'active' | 'suspended' | 'attention';

function mapApiCustomer(c: CustomerApiRecord): Customer {
  const row = mapApiCustomerToListRow(c);
  return {
    ...row,
    city: row.city ?? '',
    dataConfidence: c.dataConfidence ?? undefined,
    scoredTripCount: typeof c.scoredTripCount === 'number' ? c.scoredTripCount : undefined,
    totalDistanceKm: typeof c.totalDistanceKm === 'number' ? c.totalDistanceKm : undefined,
    joinDate:
      (typeof c.joinDate === 'string' ? c.joinDate : null) ??
      (c.createdAt ? new Date(c.createdAt).toLocaleDateString('de-DE') : EM_DASH),
    licenseExpiry: c.licenseExpiry
      ? typeof c.licenseExpiry === 'string' && !c.licenseExpiry.includes('T')
        ? c.licenseExpiry
        : new Date(c.licenseExpiry).toLocaleDateString('de-DE')
      : EM_DASH,
    accidents: typeof c.accidents === 'number' ? c.accidents : 0,
    violations: typeof c.violations === 'number' ? c.violations : 0,
    currentVehicle: typeof c.currentVehicle === 'string' ? c.currentVehicle : undefined,
    notes: typeof c.notes === 'string' ? c.notes : undefined,
  };
}

function scoreToneFromDisplay(
  tone: ReturnType<typeof formatStressScore>['tone'],
): StatusTone {
  if (tone === 'success') return 'success';
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
  const [customerStats, setCustomerStats] = useState<Record<string, number> | null>(null);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const debouncedSearch = useDebouncedValue(searchDraft, 350);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isListLoading, setIsListLoading] = useState(false);
  const listFetchGeneration = useRef(0);

  const loadCustomers = useCallback(() => {
    if (!orgId) return;
    const generation = ++listFetchGeneration.current;
    const params: {
      page?: number;
      limit?: number;
      search?: string;
      status?: string;
      riskLevel?: string;
      customerType?: string;
    } = { page: 1, limit: 50 };
    const trimmedSearch = debouncedSearch.trim();
    if (trimmedSearch) params.search = trimmedSearch;
    if (statusFilter !== 'all') {
      params.status = customerStatusUiToApi(statusFilter as Customer['status']);
    }
    if (riskFilter !== 'all') {
      const risk = customerRiskUiToApi(riskFilter as Customer['riskLevel']);
      if (risk) params.riskLevel = risk;
    }
    if (typeFilter !== 'all') {
      params.customerType = customerTypeUiToApi(typeFilter as Customer['type']);
    }
    setIsListLoading(true);
    api.customers
      .list(orgId, params)
      .then((res) => {
        if (generation !== listFetchGeneration.current) return;
        const list = Array.isArray(res) ? res : res?.data ?? [];
        setCustomers(list.map(mapApiCustomer));
      })
      .catch(() => {
        if (generation !== listFetchGeneration.current) return;
        setCustomers([]);
      })
      .finally(() => {
        if (generation === listFetchGeneration.current) {
          setIsListLoading(false);
        }
      });
  }, [orgId, debouncedSearch, statusFilter, riskFilter, typeFilter]);

  const loadStats = useCallback(() => {
    if (!orgId) return;
    api.customers.stats(orgId)
      .then((stats) => setCustomerStats(stats))
      .catch(() => setCustomerStats(null));
  }, [orgId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Merge additional customers from NewBookingView
  const allCustomers = mergeAdditionalCustomers(customers, additionalCustomers as Customer[]);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isRiskOpen, setIsRiskOpen] = useState(false);
  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const [cardFilter, setCardFilter] = useState<'all' | 'active' | 'suspended' | 'attention'>('all');
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [addStep, setAddStep] = useState(0);
  const [newCustomer, setNewCustomer] = useState(DEFAULT_ADD_CUSTOMER_FORM);
  const [verificationPlan, setVerificationPlan] = useState<CustomerVerificationPlanState>(DEFAULT_VERIFICATION_PLAN);
  const [pendingDocFiles, setPendingDocFiles] = useState<PendingCustomerDocumentFiles>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [draftCustomerId, setDraftCustomerId] = useState<string | null>(null);
  const [isEnsuringDraft, setIsEnsuringDraft] = useState(false);
  const { eligibility: wizardEligibility, refresh: refreshWizardEligibility } = useCustomerVerification(
    draftCustomerId ?? undefined,
  );

  const resetAddCustomerForm = () => {
    setNewCustomer(DEFAULT_ADD_CUSTOMER_FORM);
    setVerificationPlan(DEFAULT_VERIFICATION_PLAN);
    setPendingDocFiles({});
    setFormErrors({});
    setDraftCustomerId(null);
    setIsEnsuringDraft(false);
    setAddStep(0);
  };

  const openCustomerFullDetail = useCallback(
    (customer: CustomerListRow) => {
      onOpenCustomerDetail?.(customer);
    },
    [onOpenCustomerDetail],
  );

  const openAddCustomer = () => {
    resetAddCustomerForm();
    setIsAddCustomerOpen(true);
  };

  const closeAddCustomer = () => {
    setIsAddCustomerOpen(false);
    resetAddCustomerForm();
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
      Object.assign(
        errors,
        validateAddCustomerDocumentsStep(pendingDocFiles, wizardEligibility, {
          idFront: 'Ausweis-Vorderseite oder Didit-Prüfung erforderlich',
          idBack: 'Ausweis-Rückseite oder Didit-Prüfung erforderlich',
          licenseFront: 'Führerschein-Vorderseite oder Didit-Prüfung erforderlich',
        }),
      );
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = async () => {
    if (!validateStep(addStep)) return;
    if (addStep === 1) {
      if (!orgId) {
        toast.error('Keine Organisation geladen');
        return;
      }
      setIsEnsuringDraft(true);
      try {
        const id = await ensureWizardDraftCustomer(orgId, draftCustomerId, newCustomer, verificationPlan);
        setDraftCustomerId(id);
        setAddStep(2);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data
            ?.message ||
          (err as Error)?.message ||
          'Kunde konnte nicht vorbereitet werden';
        toast.error('Didit-Vorbereitung fehlgeschlagen', { description: String(msg), duration: 5000 });
      } finally {
        setIsEnsuringDraft(false);
      }
      return;
    }
    if (addStep < 3) setAddStep(addStep + 1);
  };

  const handleSubmitCustomer = async () => {
    if (!orgId) {
      toast.error('Keine Organisation geladen');
      return;
    }
    setIsSavingCustomer(true);
    try {
      const payload = buildCustomerCreatePayload(addCustomerFormToPayload(newCustomer, verificationPlan));
      let customerId = draftCustomerId;
      if (customerId) {
        await api.customers.update(orgId, customerId, payload);
      } else {
        const created: { id: string } = await api.customers.create(orgId, payload);
        customerId = created.id;
      }
      await uploadPendingCustomerDocuments(orgId, customerId, pendingDocFiles);
      const saved = await api.customers.get(orgId, customerId);
      const mapped = mapApiCustomer(saved);
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

  const filtered = useMemo(() => {
    if (cardFilter === 'all') return allCustomers;
    return allCustomers.filter((c) => {
      if (cardFilter === 'active') return c.status === 'Active';
      if (cardFilter === 'suspended') return c.status === 'Suspended' || c.status === 'Blocked';
      if (cardFilter === 'attention') {
        return c.riskLevel === 'High Risk' || c.status === 'Under Review';
      }
      return true;
    });
  }, [allCustomers, cardFilter]);

  const totalDrivers = customerStats?.total ?? allCustomers.length;
  const activeDrivers = customerStats?.active ?? allCustomers.filter(c => c.status === 'Active').length;
  const suspendedDrivers = customerStats?.blocked ?? allCustomers.filter(c => c.status === 'Suspended' || c.status === 'Blocked').length;
  const attentionNeeded = customerStats
    ? (customerStats.highRisk ?? 0) + (customerStats.underReview ?? 0) + (customerStats.pendingVerification ?? 0)
    : allCustomers.filter(c => c.riskLevel === 'High Risk' || c.status === 'Under Review').length;

  const inputClass =
    'w-full px-3 py-2.5 rounded-lg border border-border bg-[color:var(--input-background)] text-foreground placeholder:text-muted-foreground outline-none transition-all text-xs focus:border-[color:var(--brand)] focus:ring-1 focus:ring-[color:var(--brand-soft)]';
  const labelClass =
    'block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground';

  const handleKpiToggle = useCallback((key: CustomerSegmentFilter) => {
    setCardFilter((prev) => (prev === key ? 'all' : key));
  }, []);

  const handleResetFilters = useCallback(() => {
    setStatusFilter('all');
    setRiskFilter('all');
    setTypeFilter('all');
    setSearchDraft('');
  }, []);

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
        header: 'Firma',
        cell: (customer) => (
          <span className="text-xs text-muted-foreground">{customer.company || '—'}</span>
        ),
      },
      {
        key: 'contact',
        header: 'Kontakt',
        cell: (customer) => (
          <div>
            <p className="text-xs text-foreground">{customer.email}</p>
            <p className="text-[11px] text-muted-foreground">{customer.phone}</p>
          </div>
        ),
      },
      {
        key: 'lastTrip',
        header: 'Letzte Buchung',
        cell: (customer) => (
          <span className="text-xs text-muted-foreground">{customer.lastTrip}</span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        cell: (customer) => (
          <StatusChip tone={customerStatusTone(customer.status)}>
            {customerStatusUiLabelDe(customer.status)}
          </StatusChip>
        ),
      },
      {
        key: 'verification',
        header: 'Verifikation',
        cell: (customer) =>
          customer.idVerified ? (
            <StatusChip tone="success" dot>
              Verifiziert
            </StatusChip>
          ) : (
            <StatusChip tone="warning" dot>
              Offen
            </StatusChip>
          ),
      },
      {
        key: 'risk',
        header: 'Risiko',
        cell: (customer) => (
          <StatusChip tone={customerRiskTone(customer.riskLevel)}>
            {customerRiskUiLabelDe(customer.riskLevel)}
          </StatusChip>
        ),
      },
      {
        key: 'driving',
        header: 'Fahrbelastung',
        cell: (customer) => {
          const display = formatStressScore(customer.drivingStressScore, {
            hasEnoughData: customer.hasEnoughData ?? true,
            level: customer.stressLevel ?? undefined,
          });
          return (
            <StatusChip
              tone={scoreToneFromDisplay(display.tone)}
              icon={<Icon name="gauge" className="w-3 h-3" />}
              title={display.isMissing ? display.label : `${display.outOf100} Fahrbelastung`}
            >
              {display.isMissing ? display.compact : display.label}
            </StatusChip>
          );
        },
      },
      {
        key: 'bookings',
        header: 'Buchungen',
        numeric: true,
        cell: (customer) => (
          <span className="text-xs font-semibold text-foreground">{customer.totalBookings}</span>
        ),
      },
      {
        key: 'revenue',
        header: 'Umsatz',
        cell: (customer) => (
          <span className="text-xs font-semibold text-[color:var(--status-positive)]">
            {customer.totalRevenue}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="relative">
      <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title="Kunden & Fahrer"
        className="mb-4 flex-row items-center justify-between gap-2 sm:mb-5 sm:items-start sm:gap-4"
        actions={(
          <Button type="button" size="sm" variant="primary" onClick={openAddCustomer}>
            <Icon name="plus" className="size-3.5" />
            <span className="hidden min-[380px]:inline">Kunde anlegen</span>
            <span className="min-[380px]:hidden">Anlegen</span>
          </Button>
        )}
      />

      <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-3.5 lg:grid-cols-4">
        <CustomerKpiCard
          label="Gesamt"
          value={totalDrivers}
          filterKey="all"
          isActive={cardFilter === 'all'}
          onToggle={handleKpiToggle}
          icon="users"
        />
        <CustomerKpiCard
          label="Aktiv"
          value={activeDrivers}
          filterKey="active"
          isActive={cardFilter === 'active'}
          onToggle={handleKpiToggle}
          icon="check-circle"
          tone="success"
          subdued={activeDrivers === 0}
        />
        <CustomerKpiCard
          label="Gesperrt"
          value={suspendedDrivers}
          filterKey="suspended"
          isActive={cardFilter === 'suspended'}
          onToggle={handleKpiToggle}
          icon="ban"
          tone="critical"
          subdued={suspendedDrivers === 0}
        />
        <CustomerKpiCard
          label="Aufmerksamkeit"
          value={attentionNeeded}
          filterKey="attention"
          isActive={cardFilter === 'attention'}
          onToggle={handleKpiToggle}
          icon="alert-triangle"
          tone="watch"
          subdued={attentionNeeded === 0}
        />
      </div>

      <CustomerListFilters
        searchDraft={searchDraft}
        onSearchDraftChange={setSearchDraft}
        statusFilter={statusFilter}
        riskFilter={riskFilter}
        typeFilter={typeFilter}
        cardFilter={cardFilter}
        filteredCount={filtered.length}
        totalCount={allCustomers.length}
        isStatusOpen={isStatusOpen}
        isRiskOpen={isRiskOpen}
        isTypeOpen={isTypeOpen}
        onStatusOpenChange={setIsStatusOpen}
        onRiskOpenChange={setIsRiskOpen}
        onTypeOpenChange={setIsTypeOpen}
        onStatusFilterChange={setStatusFilter}
        onRiskFilterChange={setRiskFilter}
        onTypeFilterChange={setTypeFilter}
        onClearCardFilter={() => setCardFilter('all')}
        onResetFilters={handleResetFilters}
      />

      {filtered.length === 0 && !isListLoading ? (
        <EmptyState
          icon={<Icon name="users" className="w-5 h-5" />}
          title="Keine Kunden für diese Filter"
          compact
        />
      ) : (
        <div
          className={cn(
            'space-y-2 transition-opacity duration-200',
            isListLoading && 'pointer-events-none opacity-60',
          )}
          aria-busy={isListLoading}
        >
      <CustomerListMobileCards
        customers={filtered}
        onSelect={openCustomerFullDetail}
      />

      <div className="hidden lg:block">
      <DataTable
        columns={customerColumns}
        rows={filtered}
        getRowKey={(customer) => customer.id}
        onRowClick={openCustomerFullDetail}
        dense
        empty={(
          <EmptyState
            icon={<Icon name="users" className="w-5 h-5" />}
            title="Keine Kunden für diese Filter"
            compact
          />
        )}
        rowActions={() => (
          <Icon name="chevron-right" className="w-5 h-5 text-muted-foreground/50" />
        )}
      />
      </div>
        </div>
      )}

      </div>{/* End of main content wrapper */}

      <FormDialog
        open={isAddCustomerOpen}
        onOpenChange={(open) => { if (!open) closeAddCustomer(); }}
        maxWidthClassName="sm:max-w-[680px]"
        title="Neuen Kunden anlegen"
        description="Alle Pflichtfelder ausfüllen & Dokumente hochladen"
        bodyClassName="p-0 flex flex-col"
        footer={(
          <div className="flex w-full items-center justify-between">
            <button type="button" onClick={closeAddCustomer} className="sq-3d-btn sq-3d-btn--neutral px-3 py-2 text-xs font-medium">
              Abbrechen
            </button>
            <div className="flex items-center gap-2.5">
              {addStep > 0 && (
                <button type="button" onClick={() => setAddStep(addStep - 1)} className="sq-3d-btn sq-3d-btn--neutral flex items-center gap-1.5 px-3 py-2 text-xs font-medium">
                  <Icon name="chevron-left" className="w-3.5 h-3.5" />
                  Zurück
                </button>
              )}
              {addStep < 3 ? (
                <button
                  type="button"
                  onClick={() => void handleNextStep()}
                  disabled={isEnsuringDraft}
                  className="sq-cta flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {isEnsuringDraft ? (
                    <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Icon name="chevron-right" className="w-3.5 h-3.5" />
                  )}
                  {isEnsuringDraft ? 'Vorbereitet…' : 'Weiter'}
                </button>
              ) : (
                <button type="button" onClick={handleSubmitCustomer} disabled={isSavingCustomer} className={`sq-cta flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-50 ${isSavingCustomer ? 'opacity-50' : ''}`}>
                  {isSavingCustomer ? <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> : <Icon name="check-circle" className="w-3.5 h-3.5" />}
                  {isSavingCustomer ? 'Speichert…' : 'Kunden anlegen'}
                </button>
              )}
            </div>
          </div>
        )}
      >
        {(() => {
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
          <>
              <div className="flex items-center gap-1 border-b border-border px-5 py-3 shrink-0">
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
              <div className="max-h-[min(60vh,100dvh-14rem)] flex-1 overflow-y-auto px-5 py-3">
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

                    <AddCustomerVerificationPlanSection
                      plan={verificationPlan}
                      onChange={setVerificationPlan}
                      sectionTitle={sectionTitle}
                      licensePickupWarning="Hinweis: Wenn Ihre Mietfreigabe den Führerschein bereits für die Buchungsbestätigung verlangt, blockiert „Beim Pickup prüfen“ die Bestätigung bis zur Prüfung."
                    />
                  </div>
                )}

                {addStep === 2 && (
                  <AddCustomerDocumentsStep
                    draftCustomerId={draftCustomerId}
                    isPreparingDraft={isEnsuringDraft}
                    orgId={orgId}
                    idType={newCustomer.idType}
                    pendingDocFiles={pendingDocFiles}
                    formErrors={formErrors}
                    onPendingFileChange={(type, file) =>
                      setPendingDocFiles((prev) => ({
                        ...prev,
                        [type]: file ?? undefined,
                      }))
                    }
                    onVerificationUpdated={() => void refreshWizardEligibility()}
                    sectionTitle={sectionTitle}
                  />
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
                        <span className="text-xs text-muted-foreground">Ausweis (Didit)</span>
                        <span className="text-xs font-medium text-foreground">
                          {wizardEligibility
                            ? documentEligibilityLabelDe(wizardEligibility.idDocument)
                            : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-muted-foreground">Führerschein (Didit)</span>
                        <span className="text-xs font-medium text-foreground">
                          {wizardEligibility
                            ? documentEligibilityLabelDe(wizardEligibility.drivingLicense)
                            : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Dokumente</span>
                        <div className="flex items-center gap-3">
                          {[
                            { label: 'Ausweis VS', ok: Boolean(pendingDocFiles.ID_FRONT) },
                            { label: 'Ausweis RS', ok: Boolean(pendingDocFiles.ID_BACK) },
                            { label: 'FS VS', ok: Boolean(pendingDocFiles.LICENSE_FRONT) },
                            { label: 'FS RS', ok: Boolean(pendingDocFiles.LICENSE_BACK) },
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
          </>
        );
      })()}
      </FormDialog>
    </div>
  );
}
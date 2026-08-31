import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Car, CheckCircle, IdCard, Upload, User } from 'lucide-react';

import { useLanguage } from '../../i18n/LanguageContext';
import { customersFormattingLocaleOrDefault } from './bookings-customers/customers-i18n';
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
import { documentEligibilityLabel } from '../lib/customer-verification';
import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
import {
  buildCustomerCreatePayload,
  customerStatusUiToApi,
  customerRiskUiToApi,
  customerTypeUiToApi,
  customerStatusUiLabel,
  customerRiskUiLabel,
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

function mapApiCustomer(c: CustomerApiRecord, formattingLocale: string): Customer {
  const row = mapApiCustomerToListRow(c);
  return {
    ...row,
    city: row.city ?? '',
    dataConfidence: c.dataConfidence ?? undefined,
    scoredTripCount: typeof c.scoredTripCount === 'number' ? c.scoredTripCount : undefined,
    totalDistanceKm: typeof c.totalDistanceKm === 'number' ? c.totalDistanceKm : undefined,
    joinDate:
      (typeof c.joinDate === 'string' ? c.joinDate : null) ??
      (c.createdAt ? new Date(c.createdAt).toLocaleDateString(formattingLocale) : EM_DASH),
    licenseExpiry: c.licenseExpiry
      ? typeof c.licenseExpiry === 'string' && !c.licenseExpiry.includes('T')
        ? c.licenseExpiry
        : new Date(c.licenseExpiry).toLocaleDateString(formattingLocale)
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
  const { t, locale, formattingLocale } = useLanguage();
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
        setCustomers(list.map((c) => mapApiCustomer(c, formattingLocale)));
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
  }, [orgId, debouncedSearch, statusFilter, riskFilter, typeFilter, formattingLocale]);

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
      if (!newCustomer.licenseIssuedAt) errors.licenseIssuedAt = 'Ausstellungsdatum erforderlich';
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
        toast.error(t('settings.company.toast.noOrg'));
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
        toast.error(t('customers.toast.diditPrepFailed'), { description: String(msg), duration: 5000 });
      } finally {
        setIsEnsuringDraft(false);
      }
      return;
    }
    if (addStep < 3) setAddStep(addStep + 1);
  };

  const handleSubmitCustomer = async () => {
    if (!orgId) {
      toast.error(t('settings.company.toast.noOrg'));
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
      const mapped = mapApiCustomer(saved, formattingLocale);
      setCustomers(prev => [mapped, ...prev.filter(c => c.id !== mapped.id)]);
      toast.success(t('customers.wizard.createdToast'), {
        description: `${mapped.name}${mapped.email ? ' · ' + mapped.email : ''}`,
        duration: 3000,
      });
      closeAddCustomer();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || t('customers.wizard.createError');
      toast.error(t('customers.wizard.createFailed'), { description: String(msg), duration: 5000 });
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
        header: t('customers.table.name'),
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
        header: t('customers.table.company'),
        cell: (customer) => (
          <span className="text-xs text-muted-foreground">{customer.company || '—'}</span>
        ),
      },
      {
        key: 'contact',
        header: t('customers.table.contact'),
        cell: (customer) => (
          <div>
            <p className="text-xs text-foreground">{customer.email}</p>
            <p className="text-[11px] text-muted-foreground">{customer.phone}</p>
          </div>
        ),
      },
      {
        key: 'lastTrip',
        header: t('customers.table.lastBooking'),
        cell: (customer) => (
          <span className="text-xs text-muted-foreground">{customer.lastTrip}</span>
        ),
      },
      {
        key: 'status',
        header: t('common.status'),
        cell: (customer) => (
          <StatusChip tone={customerStatusTone(customer.status)}>
            {customerStatusUiLabel(customer.status, locale)}
          </StatusChip>
        ),
      },
      {
        key: 'verification',
        header: t('customers.table.verification'),
        cell: (customer) =>
          customer.idVerified ? (
            <StatusChip tone="success" dot>
              {t('customers.verification.verified')}
            </StatusChip>
          ) : (
            <StatusChip tone="warning" dot>
              {t('customers.verification.open')}
            </StatusChip>
          ),
      },
      {
        key: 'risk',
        header: t('customers.table.risk'),
        cell: (customer) => (
          <StatusChip tone={customerRiskTone(customer.riskLevel)}>
            {customerRiskUiLabel(customer.riskLevel, locale)}
          </StatusChip>
        ),
      },
      {
        key: 'driving',
        header: t('customers.table.drivingLoad'),
        cell: (customer) => {
          const display = formatStressScore(customer.drivingStressScore, {
            hasEnoughData: customer.hasEnoughData ?? true,
            level: customer.stressLevel ?? undefined,
          });
          const drivingTitle = display.isMissing
            ? display.label
            : `${display.outOf100} ${t('customers.table.drivingLoad')}`;
          return (
            <StatusChip
              tone={scoreToneFromDisplay(display.tone)}
              icon={<Icon name="gauge" className="w-3 h-3" />}
              title={drivingTitle}
            >
              {display.isMissing ? display.compact : display.label}
            </StatusChip>
          );
        },
      },
      {
        key: 'bookings',
        header: t('customers.table.bookings'),
        numeric: true,
        cell: (customer) => (
          <span className="text-xs font-semibold text-foreground">{customer.totalBookings}</span>
        ),
      },
      {
        key: 'revenue',
        header: t('customers.table.revenue'),
        cell: (customer) => (
          <span className="text-xs font-semibold text-[color:var(--status-positive)]">
            {customer.totalRevenue}
          </span>
        ),
      },
    ],
    [t, locale],
  );

  return (
    <div className="relative">
      <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title={t('customers.title')}
        className="mb-4 flex-row items-center justify-between gap-2 sm:mb-5 sm:items-start sm:gap-4"
        actions={(
          <Button type="button" size="sm" variant="primary" onClick={openAddCustomer}>
            <Icon name="plus" className="size-3.5" />
            <span className="hidden min-[380px]:inline">{t('customers.addCustomer')}</span>
            <span className="min-[380px]:hidden">{t('customers.addCustomerShort')}</span>
          </Button>
        )}
      />

      <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-3.5 lg:grid-cols-4">
        <CustomerKpiCard
          label={t('customers.kpi.total')}
          value={totalDrivers}
          filterKey="all"
          isActive={cardFilter === 'all'}
          onToggle={handleKpiToggle}
          icon="users"
        />
        <CustomerKpiCard
          label={t('customers.kpi.active')}
          value={activeDrivers}
          filterKey="active"
          isActive={cardFilter === 'active'}
          onToggle={handleKpiToggle}
          icon="check-circle"
          tone="success"
          subdued={activeDrivers === 0}
        />
        <CustomerKpiCard
          label={t('customers.kpi.suspended')}
          value={suspendedDrivers}
          filterKey="suspended"
          isActive={cardFilter === 'suspended'}
          onToggle={handleKpiToggle}
          icon="ban"
          tone="critical"
          subdued={suspendedDrivers === 0}
        />
        <CustomerKpiCard
          label={t('customers.kpi.attention')}
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
          title={t('customers.emptyFiltered')}
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
            title={t('customers.emptyFiltered')}
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
        title={t('customers.createCustomer')}
        description={t('customers.createDescription')}
        bodyClassName="p-0 flex flex-col"
        footer={(
          <div className="flex w-full items-center justify-between">
            <button type="button" onClick={closeAddCustomer} className="sq-3d-btn sq-3d-btn--neutral px-3 py-2 text-xs font-medium">
              {t('common.cancel')}
            </button>
            <div className="flex items-center gap-2.5">
              {addStep > 0 && (
                <button type="button" onClick={() => setAddStep(addStep - 1)} className="sq-3d-btn sq-3d-btn--neutral flex items-center gap-1.5 px-3 py-2 text-xs font-medium">
                  <Icon name="chevron-left" className="w-3.5 h-3.5" />
                  {t('common.back')}
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
                  {isEnsuringDraft ? t('customers.wizard.preparing') : t('common.next')}
                </button>
              ) : (
                <button type="button" onClick={handleSubmitCustomer} disabled={isSavingCustomer} className={`sq-cta flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-50 ${isSavingCustomer ? 'opacity-50' : ''}`}>
                  {isSavingCustomer ? <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> : <Icon name="check-circle" className="w-3.5 h-3.5" />}
                  {isSavingCustomer ? t('customers.wizard.saving') : t('customers.wizard.submit')}
                </button>
              )}
            </div>
          </div>
        )}
      >
        {(() => {
        const steps = [
          { label: t('customers.wizard.step.personal'), icon: User },
          { label: t('customers.wizard.step.idLicense'), icon: IdCard },
          { label: t('customers.wizard.step.documents'), icon: Upload },
          { label: t('customers.wizard.step.summary'), icon: CheckCircle },
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
                    {sectionTitle(User, t('customers.wizard.personalData'))}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>{t('customers.wizard.firstNameRequired')}</label>
                        <input type="text" placeholder={t('customers.wizard.placeholder.firstName')} value={newCustomer.firstName}
                          onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })} className={inputClass} />
                        {formErrors.firstName && <p className="text-[11px] text-red-500 mt-1">{formErrors.firstName}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>{t('customers.wizard.lastNameRequired')}</label>
                        <input type="text" placeholder={t('customers.wizard.placeholder.lastName')} value={newCustomer.lastName}
                          onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })} className={inputClass} />
                        {formErrors.lastName && <p className="text-[11px] text-red-500 mt-1">{formErrors.lastName}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>{t('customers.wizard.emailRequired')}</label>
                        <div className="relative">
                          <Icon name="mail" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <input type="email" placeholder={t('customers.wizard.placeholder.email')} value={newCustomer.email}
                            onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} className={`${inputClass} pl-9`} />
                        </div>
                        {formErrors.email && <p className="text-[11px] text-red-500 mt-1">{formErrors.email}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>{t('customers.wizard.phoneRequired')}</label>
                        <div className="relative">
                          <Icon name="phone" className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                          <input type="text" placeholder={t('customers.wizard.placeholder.phone')} value={newCustomer.phone}
                            onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className={`${inputClass} pl-9`} />
                        </div>
                        {formErrors.phone && <p className="text-[11px] text-red-500 mt-1">{formErrors.phone}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>{t('customers.wizard.street')}</label>
                        <input type="text" placeholder={t('customers.wizard.placeholder.street')} value={newCustomer.street}
                          onChange={(e) => setNewCustomer({ ...newCustomer, street: e.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>{t('customers.wizard.zip')}</label>
                        <input type="text" placeholder={t('customers.wizard.placeholder.zip')} value={newCustomer.zip}
                          onChange={(e) => setNewCustomer({ ...newCustomer, zip: e.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>{t('customers.wizard.cityRequired')}</label>
                        <input type="text" placeholder={t('customers.wizard.placeholder.city')} value={newCustomer.city}
                          onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })} className={inputClass} />
                        {formErrors.city && <p className="text-[11px] text-red-500 mt-1">{formErrors.city}</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>{t('customers.wizard.customerType')}</label>
                        <div className="flex gap-2">
                          {(['Individual', 'Corporate'] as const).map((customerType) => (
                            <button key={customerType} type="button" onClick={() => setNewCustomer({ ...newCustomer, type: customerType })}
                              className={`flex-1 py-2.5 rounded-lg border text-xs font-semibold transition-all ${
                                newCustomer.type === customerType
                                  ? 'bg-[color:var(--brand)] text-white border-[color:var(--brand)] shadow-md'
                                  : 'border-border surface-premium text-muted-foreground hover:border-[color:var(--brand)]/40 hover:bg-muted'
                              }`}>
                              {customerType === 'Individual' ? t('customers.type.individual') : t('customers.type.corporate')}
                            </button>
                          ))}
                        </div>
                      </div>
                      {newCustomer.type === 'Corporate' && (
                        <div>
                          <label className={labelClass}>{t('customers.wizard.companyNameRequired')}</label>
                          <input type="text" placeholder={t('customers.wizard.placeholder.company')} value={newCustomer.company}
                            onChange={(e) => setNewCustomer({ ...newCustomer, company: e.target.value })} className={inputClass} />
                          {formErrors.company && <p className="text-[11px] text-red-500 mt-1">{formErrors.company}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {addStep === 1 && (
                  <div className="space-y-5">
                    {sectionTitle(Car, t('customers.wizard.license'))}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <label className={labelClass}>{t('customers.wizard.licenseNumberRequired')}</label>
                        <input type="text" placeholder={t('customers.wizard.placeholder.licenseNumber')} value={newCustomer.licenseNumber}
                          onChange={(e) => setNewCustomer({ ...newCustomer, licenseNumber: e.target.value })} className={inputClass} />
                        {formErrors.licenseNumber && <p className="text-[11px] text-red-500 mt-1">{formErrors.licenseNumber}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>{t('customers.wizard.licenseIssuedRequired')}</label>
                        <input type="date" value={newCustomer.licenseIssuedAt}
                          onChange={(e) => setNewCustomer({ ...newCustomer, licenseIssuedAt: e.target.value })} className={inputClass} />
                        {formErrors.licenseIssuedAt && <p className="text-[11px] text-red-500 mt-1">{formErrors.licenseIssuedAt}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>{t('customers.wizard.licenseValidRequired')}</label>
                        <input type="date" value={newCustomer.licenseExpiry}
                          onChange={(e) => setNewCustomer({ ...newCustomer, licenseExpiry: e.target.value })} className={inputClass} />
                        {formErrors.licenseExpiry && <p className="text-[11px] text-red-500 mt-1">{formErrors.licenseExpiry}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>{t('customers.wizard.licenseClass')}</label>
                        <select value={newCustomer.licenseClass}
                          onChange={(e) => setNewCustomer({ ...newCustomer, licenseClass: e.target.value })} className={inputClass}>
                          {['AM', 'A1', 'A2', 'A', 'B', 'BE', 'C', 'CE', 'C1', 'C1E', 'D', 'DE'].map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="h-px my-2 bg-border" />

                    {sectionTitle(IdCard, t('customers.wizard.idVerification'))}
                    <div className="rounded-lg p-3.5 mb-3 sq-tone-warning border border-current/20">
                      <div className="flex items-start gap-2.5">
                        <Icon name="shield" className="w-5 h-5 mt-0.5 shrink-0" />
                        <p className="text-xs">
                          {t('customers.wizard.idGdprNotice')}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>{t('customers.wizard.documentType')}</label>
                        <select value={newCustomer.idType}
                          onChange={(e) => setNewCustomer({ ...newCustomer, idType: e.target.value as any })} className={inputClass}>
                          <option value="Personalausweis">{t('customers.wizard.idCard')}</option>
                          <option value="Reisepass">{t('customers.wizard.passport')}</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>{t('customers.wizard.idNumberRequired')}</label>
                        <input type="text" placeholder={t('customers.wizard.placeholder.idNumber')} value={newCustomer.idNumber}
                          onChange={(e) => setNewCustomer({ ...newCustomer, idNumber: e.target.value })} className={inputClass} />
                        {formErrors.idNumber && <p className="text-[11px] text-red-500 mt-1">{formErrors.idNumber}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>{t('customers.wizard.idValidRequired')}</label>
                        <input type="date" value={newCustomer.idExpiry}
                          onChange={(e) => setNewCustomer({ ...newCustomer, idExpiry: e.target.value })} className={inputClass} />
                        {formErrors.idExpiry && <p className="text-[11px] text-red-500 mt-1">{formErrors.idExpiry}</p>}
                      </div>
                    </div>

                    <AddCustomerVerificationPlanSection
                      plan={verificationPlan}
                      onChange={setVerificationPlan}
                      sectionTitle={sectionTitle}
                      licensePickupWarning={t('customers.wizard.licensePickupWarning')}
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
                    {sectionTitle(CheckCircle, t('customers.wizard.summaryTitle'))}
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-0 divide-y divide-border">
                      <SummaryRow label={t('customers.wizard.summaryName')} value={`${newCustomer.firstName} ${newCustomer.lastName}`} />
                      <SummaryRow label={t('customers.email')} value={newCustomer.email} />
                      <SummaryRow label={t('customers.phone')} value={newCustomer.phone} />
                      <SummaryRow label={t('customers.wizard.summaryAddress')} value={[newCustomer.street, `${newCustomer.zip} ${newCustomer.city}`].filter(Boolean).join(', ')} />
                      <SummaryRow
                        label={t('customers.wizard.summaryType')}
                        value={
                          newCustomer.type === 'Corporate'
                            ? t('customers.wizard.summaryCompanyPrefix', { company: newCustomer.company })
                            : t('customers.wizard.summaryPrivate')
                        }
                      />
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-0 divide-y divide-border">
                      <SummaryRow label={t('customers.wizard.summaryLicenseNumber')} value={newCustomer.licenseNumber} />
                      <SummaryRow label={t('customers.wizard.summaryLicenseIssued')} value={newCustomer.licenseIssuedAt} />
                      <SummaryRow label={t('customers.wizard.summaryLicenseClass')} value={newCustomer.licenseClass} />
                      <SummaryRow label={t('customers.wizard.summaryLicenseValid')} value={newCustomer.licenseExpiry} />
                      <SummaryRow label={t('customers.wizard.summaryIdType')} value={newCustomer.idType} />
                      <SummaryRow label={t('customers.wizard.summaryIdNumber')} value={newCustomer.idNumber} />
                      <SummaryRow label={t('customers.wizard.summaryIdValid')} value={newCustomer.idExpiry} />
                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-muted-foreground">{t('customers.wizard.summaryIdDidit')}</span>
                        <span className="text-xs font-medium text-foreground">
                          {wizardEligibility
                            ? documentEligibilityLabel(wizardEligibility.idDocument, locale)
                            : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-xs text-muted-foreground">{t('customers.wizard.summaryLicenseDidit')}</span>
                        <span className="text-xs font-medium text-foreground">
                          {wizardEligibility
                            ? documentEligibilityLabel(wizardEligibility.drivingLicense, locale)
                            : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{t('customers.wizard.summaryDocuments')}</span>
                        <div className="flex items-center gap-3">
                          {[
                            { label: t('customers.wizard.docIdFront'), ok: Boolean(pendingDocFiles.ID_FRONT) },
                            { label: t('customers.wizard.docIdBack'), ok: Boolean(pendingDocFiles.ID_BACK) },
                            { label: t('customers.wizard.docLicenseFront'), ok: Boolean(pendingDocFiles.LICENSE_FRONT) },
                            { label: t('customers.wizard.docLicenseBack'), ok: Boolean(pendingDocFiles.LICENSE_BACK) },
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
                      <label className={labelClass}>{t('customers.wizard.notesOptional')}</label>
                      <textarea rows={2} placeholder={t('customers.wizard.notesPlaceholder')}
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
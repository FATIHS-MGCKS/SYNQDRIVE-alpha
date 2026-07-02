import { ExternalLink, Mail, MapPin, Phone, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DataCard, StatusChip } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { api, getErrorMessage } from '../../lib/api';
import {
  customerRiskUiLabelDe,
  customerStatusApiToUi,
  customerStatusUiLabelDe,
  customerVerificationApiToUi,
  customerVerificationUiLabelDe,
} from '../lib/entityMappers';
import { changeCustomerStatus } from '../lib/customer-mutations.utils';
import { formatStressScore, resolveDrivingStressScore, stressToneToStatusTone } from '../lib/scoreFormat';
import { useRentalOrg } from '../RentalContext';
import { CustomerQuickViewDetailRow } from './customer-detail/CustomerQuickViewDetailRow';
import { CustomerQuickViewSummaryGrid } from './customer-detail/CustomerQuickViewSummaryGrid';
import {
  cqv,
  customerRiskTone,
  customerStatusTone,
  customerVerificationTone,
  resolveQuickViewStatusAction,
} from './customer-detail/customer-quick-view-ui';
import {
  EM_DASH,
  formatCurrencyCents,
  overallRentalClearanceLabel,
  overallRentalClearanceTone,
} from './customer-detail/customerDetailUtils';
import {
  useCustomerEligibility,
  useCustomerInvoices,
} from './customer-detail/useCustomerDetailData';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  type: 'Individual' | 'Corporate';
  status: 'Active' | 'Under Review' | 'Suspended' | 'Blocked' | 'Archived' | 'Inactive';
  riskLevel: 'Not Assessed' | 'Low Risk' | 'Medium Risk' | 'High Risk';
  drivingStressScore?: number | null;
  stressLevel?: 'low' | 'moderate' | 'high' | 'critical' | null;
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

interface CustomerDetailModalProps {
  customer: Customer;
  onClose: () => void;
  isAnimating?: boolean;
  onUpdateCustomer?: (updatedCustomer: Customer) => void;
  onOpenDetail?: () => void;
}

type ModalDetail = {
  totalRevenueCents?: number | null;
  lastBookingDate?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
  idVerified?: boolean | null;
  licenseVerified?: boolean | null;
  idVerificationStatus?: string | null;
  licenseVerificationStatus?: string | null;
  drivingStressScore?: number | null;
  stressLevel?: 'low' | 'moderate' | 'high' | 'critical' | null;
  hasEnoughData?: boolean | null;
  bookings?: Array<{ kmDriven?: number | null }> | null;
};

function customerInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function CustomerDetailModal({
  customer,
  onClose,
  isAnimating = true,
  onUpdateCustomer,
  onOpenDetail,
}: CustomerDetailModalProps) {
  const { orgId } = useRentalOrg();
  const [statusSaving, setStatusSaving] = useState(false);
  const [detail, setDetail] = useState<ModalDetail | null>(null);

  const {
    eligibility,
    loading: eligibilityLoading,
    error: eligibilityError,
    refresh: refreshEligibility,
  } = useCustomerEligibility(orgId, customer.id);
  const { invoices } = useCustomerInvoices(orgId, customer.id);

  const reloadDetail = useCallback(() => {
    if (!orgId || !customer.id) return;
    api.customers
      .get(orgId, customer.id)
      .then((row) => setDetail(row as unknown as ModalDetail))
      .catch(() => setDetail(null));
    refreshEligibility();
  }, [orgId, customer.id, refreshEligibility]);

  useEffect(() => {
    if (!orgId || !customer.id) return;
    api.customers
      .get(orgId, customer.id)
      .then((row) => setDetail(row as unknown as ModalDetail))
      .catch(() => setDetail(null));
  }, [orgId, customer.id]);

  const changeStatus = async (next: Customer['status']) => {
    if (!orgId || !customer.id || statusSaving) return;
    setStatusSaving(true);
    try {
      const updated = await changeCustomerStatus(orgId, customer.id, next);
      const mappedStatus = customerStatusApiToUi(
        updated.status ?? undefined,
        updated.archivedAt ?? undefined,
      );
      onUpdateCustomer?.({ ...customer, status: mappedStatus });
      reloadDetail();
      toast.success(`Status: ${customerStatusUiLabelDe(mappedStatus)}`);
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Fehler beim Speichern');
      toast.error('Status konnte nicht gespeichert werden', { description: msg });
    } finally {
      setStatusSaving(false);
    }
  };

  const openFullDetail = () => {
    onOpenDetail?.();
    onClose();
  };

  const drivingStressScore = resolveDrivingStressScore(detail ?? customer);
  const stressLevel = detail?.stressLevel ?? customer.stressLevel ?? null;
  const hasEnoughData =
    typeof detail?.hasEnoughData === 'boolean'
      ? detail.hasEnoughData
      : typeof customer.hasEnoughData === 'boolean'
        ? customer.hasEnoughData
        : true;
  const stressDisplay = formatStressScore(drivingStressScore, {
    hasEnoughData,
    level: stressLevel ?? undefined,
  });

  const totalRevenueCents = detail?.totalRevenueCents ?? null;
  const totalKmDriven = (detail?.bookings ?? []).reduce(
    (sum, b) => sum + (b.kmDriven ?? 0),
    0,
  );

  const idUi = customerVerificationApiToUi(
    detail?.idVerificationStatus ??
      (detail?.idVerified ?? customer.idVerified ? 'VERIFIED' : undefined),
  );
  const licenseUi = customerVerificationApiToUi(
    detail?.licenseVerificationStatus ??
      (detail?.licenseVerified ?? customer.licenseVerified ? 'VERIFIED' : undefined),
  );

  const shortId = customer.id.slice(0, 8).toUpperCase();
  const displayName = customer.company || customer.name;
  const statusAction = resolveQuickViewStatusAction(customer.status);

  const openInvoices = invoices.filter((i) => (i.status ?? '').toUpperCase() !== 'PAID');
  const overdueInvoices = invoices.filter((i) => (i.status ?? '').toUpperCase() === 'OVERDUE');
  const financeHasIssues = openInvoices.length > 0 || overdueInvoices.length > 0;

  const revenueLabel =
    totalRevenueCents != null && totalRevenueCents > 0
      ? formatCurrencyCents(totalRevenueCents)
      : EM_DASH;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="absolute inset-0 sq-backdrop transition-opacity duration-300"
        style={{ opacity: isAnimating ? 1 : 0 }}
      />

      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative ${cqv.modal} transition-all duration-300 ease-out`}
        style={{
          transform: isAnimating ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.98)',
          opacity: isAnimating ? 1 : 0,
        }}
      >
        <div className={cqv.header}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 pr-10">
              <h2 className="text-[15px] font-bold tracking-[-0.02em] text-foreground">
                Kundenübersicht
              </h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Operatives Kurzpanel — Status, Verifikation & Kennzahlen
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-2.5 right-2.5 size-8"
              onClick={onClose}
              aria-label="Schließen"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {statusAction ? (
              <Button
                type="button"
                size="sm"
                variant={statusAction.variant}
                disabled={statusSaving}
                onClick={() => changeStatus(statusAction.nextStatus)}
              >
                {statusSaving ? 'Speichert…' : statusAction.label}
              </Button>
            ) : null}
            {customer.phone ? (
              <Button type="button" size="sm" variant="neutral" asChild>
                <a href={`tel:${customer.phone.replace(/\s/g, '')}`}>
                  <Phone className="size-3.5" />
                  Kontakt
                </a>
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="neutral" onClick={openFullDetail}>
              <ExternalLink className="size-3.5" />
              Vollansicht
            </Button>
          </div>
        </div>

        <div className={cqv.body}>
          <div className="space-y-3">
            <div className={cqv.identityCard}>
              <div
                className={`${cqv.avatar} ${
                  customer.status === 'Active'
                    ? 'sq-tone-brand'
                    : customer.status === 'Under Review'
                      ? 'sq-tone-warning'
                      : customer.status === 'Suspended' || customer.status === 'Blocked'
                        ? 'sq-tone-critical'
                        : 'sq-tone-neutral'
                }`}
              >
                {customerInitials(customer.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-foreground">{displayName}</p>
                {customer.company ? (
                  <p className="truncate text-[11px] text-muted-foreground">{customer.name}</p>
                ) : null}
                <p className="mt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  CID-{shortId}
                </p>
                <div className={`mt-2 ${cqv.badgeRow}`}>
                  <StatusChip tone={customerStatusTone(customer.status)} dot>
                    {customerStatusUiLabelDe(customer.status)}
                  </StatusChip>
                  <StatusChip tone={customerRiskTone(customer.riskLevel)} dot>
                    Risiko: {customerRiskUiLabelDe(customer.riskLevel)}
                  </StatusChip>
                  <StatusChip tone={customerVerificationTone(idUi)} dot>
                    Ausweis: {customerVerificationUiLabelDe(idUi)}
                  </StatusChip>
                  <StatusChip tone={customerVerificationTone(licenseUi)} dot>
                    FS: {customerVerificationUiLabelDe(licenseUi)}
                  </StatusChip>
                  {eligibility && !eligibilityLoading ? (
                    <StatusChip tone={overallRentalClearanceTone(eligibility)} dot>
                      Mietfreigabe: {overallRentalClearanceLabel(eligibility)}
                    </StatusChip>
                  ) : null}
                </div>
              </div>
            </div>

            <CustomerQuickViewSummaryGrid
              totalBookings={customer.totalBookings}
              totalKmDriven={totalKmDriven}
              revenueLabel={revenueLabel}
              revenueSubdued={totalRevenueCents == null || totalRevenueCents <= 0}
              stressLabel={stressDisplay.isMissing ? EM_DASH : stressDisplay.label}
              stressSubdued={stressDisplay.isMissing}
              stressTone={stressDisplay.isMissing ? undefined : stressToneToStatusTone(stressDisplay.tone)}
            />

            {(eligibilityLoading || eligibilityError || eligibility) && (
              <DataCard title="Mietfreigabe" bodyClassName="py-3">
                {eligibilityLoading ? (
                  <p className="text-[12px] text-muted-foreground">Wird geladen…</p>
                ) : eligibilityError ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[12px] text-[color:var(--status-critical)]">{eligibilityError}</p>
                    <Button type="button" size="sm" variant="neutral" onClick={refreshEligibility}>
                      Erneut laden
                    </Button>
                  </div>
                ) : eligibility ? (
                  <div className="space-y-1.5">
                    <StatusChip tone={overallRentalClearanceTone(eligibility)} dot>
                      {overallRentalClearanceLabel(eligibility)}
                    </StatusChip>
                    {eligibility.blockingReasons[0] ? (
                      <p className="text-[11px] leading-snug text-[color:var(--status-critical)]">
                        {eligibility.blockingReasons[0]}
                      </p>
                    ) : eligibility.warnings[0] ? (
                      <p className="text-[11px] leading-snug text-[color:var(--status-attention)]">
                        {eligibility.warnings[0]}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </DataCard>
            )}

            {financeHasIssues ? (
              <DataCard title="Finanzen" bodyClassName="py-2.5">
                <p className="text-[12px] text-muted-foreground">
                  {openInvoices.length > 0 ? `${openInvoices.length} offene Rechnungen` : null}
                  {openInvoices.length > 0 && overdueInvoices.length > 0 ? ' · ' : null}
                  {overdueInvoices.length > 0 ? `${overdueInvoices.length} überfällig` : null}
                </p>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto px-0 text-xs"
                  onClick={openFullDetail}
                >
                  Details in Vollansicht
                </Button>
              </DataCard>
            ) : null}

            <DataCard title="Kontakt" bodyClassName="py-2">
              <CustomerQuickViewDetailRow
                label="Telefon"
                value={customer.phone}
                icon={<Phone />}
              />
              <CustomerQuickViewDetailRow
                label="E-Mail"
                value={customer.email}
                icon={<Mail />}
              />
              <CustomerQuickViewDetailRow
                label="Ort"
                value={detail?.city || customer.city || EM_DASH}
                icon={<MapPin />}
              />
            </DataCard>

            {customer.riskLevel === 'High Risk' && (
              <div className="sq-card flex items-start gap-2.5 border-[color:var(--status-critical)]/25 bg-[color:var(--status-critical)]/8 p-3">
                <span className="mt-0.5 size-2 shrink-0 rounded-full bg-[color:var(--status-critical)]" />
                <p className="text-[12px] leading-snug text-foreground">
                  Kunde ist als <span className="font-semibold">hohes Risiko</span> eingestuft — manuelle
                  Prüfung empfohlen.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

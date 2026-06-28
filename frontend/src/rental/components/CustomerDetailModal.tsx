import { ExternalLink, Mail, MapPin, Phone, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DataCard, StatusChip, Timeline } from '../../components/patterns';
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
  formatDate,
  formatDateTime,
  overallRentalClearanceLabel,
  overallRentalClearanceTone,
} from './customer-detail/customerDetailUtils';
import {
  useCustomerEligibility,
  useCustomerInvoices,
  useCustomerTimeline,
} from './customer-detail/useCustomerDetailData';

// ---------------------------------------------------------------------------
// V4.6.66 — Customer Quick View is fully grounded:
//   - Fabricated driverDOB / driverId / kmDriven / driving & abuse factor
//     formulas removed. They never reflected real telemetry and were derived
//     from `parseInt(customer.id)` which silently produced NaN for UUID ids.
//   - Fines are fetched from /customers/:id/fines (same source as the full
//     detail page).
//   - Notes come from `customer.notes`; there is no per-customer notes feed.
//   - Driving style / safety scores come straight from the API aggregate.
//   - Booking / KM / revenue stats come from the parent customer record
//     (which already carries totalRevenueCents + lastBookingDate since
//     V4.6.66) — no more synthetic "totalBookings * 312 km" multiplier.
// ---------------------------------------------------------------------------

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
  dateOfBirth?: string | null;
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
  idNumber?: string | null;
  idExpiry?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
  notes?: string | null;
  idVerified?: boolean | null;
  licenseVerified?: boolean | null;
  idVerificationStatus?: string | null;
  licenseVerificationStatus?: string | null;
  drivingStressScore?: number | null;
  stressLevel?: 'low' | 'moderate' | 'high' | 'critical' | null;
  hasEnoughData?: boolean | null;
  dataConfidence?: 'none' | 'low' | 'medium' | 'high' | null;
  scoredTripCount?: number | null;
  totalDistanceKm?: number | null;
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
  const [fines, setFines] = useState<Array<Record<string, unknown>>>([]);
  const [detail, setDetail] = useState<ModalDetail | null>(null);

  const {
    eligibility,
    loading: eligibilityLoading,
    error: eligibilityError,
    refresh: refreshEligibility,
  } = useCustomerEligibility(orgId, customer.id);
  const { events: timelineEvents } = useCustomerTimeline(orgId, customer.id);
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
    api.fines
      .byCustomer(orgId, customer.id)
      .then((rows) => setFines(Array.isArray(rows) ? rows : []))
      .catch(() => setFines([]));
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
  const openFines = fines.filter(
    (f) => !['RESOLVED', 'CLOSED', 'PAID'].includes(String(f.status ?? '').toUpperCase()),
  );

  const showFinancialSection = openInvoices.length > 0 || openFines.length > 0;
  const noteText = detail?.notes || customer.notes;
  const timelinePreview = useMemo(
    () =>
      timelineEvents.slice(0, 3).map((ev, idx) => ({
        id: String(ev.id ?? `tl-${idx}`),
        title: String(ev.title ?? ev.type ?? ev.action ?? 'Ereignis'),
        time: ev.createdAt ? formatDateTime(String(ev.createdAt)) : undefined,
        description: ev.description ? String(ev.description) : undefined,
      })),
    [timelineEvents],
  );

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
        {/* Header */}
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

        {/* Body */}
        <div className={cqv.body}>
          <div className="space-y-3">
            {/* Identity */}
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
                </div>
              </div>
            </div>

            {/* KPI summary */}
            <CustomerQuickViewSummaryGrid
              totalBookings={customer.totalBookings}
              totalKmDriven={totalKmDriven}
              revenueLabel={revenueLabel}
              revenueSubdued={totalRevenueCents == null || totalRevenueCents <= 0}
              stressLabel={stressDisplay.isMissing ? EM_DASH : stressDisplay.label}
              stressSubdued={stressDisplay.isMissing}
              stressTone={stressDisplay.isMissing ? undefined : stressToneToStatusTone(stressDisplay.tone)}
            />

            {/* Eligibility */}
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
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip tone={overallRentalClearanceTone(eligibility)} dot>
                      {overallRentalClearanceLabel(eligibility)}
                    </StatusChip>
                    {eligibility.blockingReasons.length > 0 ? (
                      <span className="text-[11px] text-muted-foreground">
                        {eligibility.blockingReasons[0]}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </DataCard>
            )}

            <div className={cqv.sectionGrid}>
              {/* Verification */}
              <DataCard
                title="Verifikation"
                actions={
                  <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={openFullDetail}>
                    Dokumente
                  </Button>
                }
                bodyClassName="py-2"
              >
                <CustomerQuickViewDetailRow
                  label="Personalausweis"
                  value={
                    <>
                      {customerVerificationUiLabelDe(idUi)}
                      {detail?.idNumber ? (
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          Nr. {detail.idNumber}
                          {detail.idExpiry ? ` · bis ${formatDate(detail.idExpiry)}` : ''}
                        </span>
                      ) : null}
                    </>
                  }
                />
                <CustomerQuickViewDetailRow
                  label="Führerschein"
                  value={
                    <>
                      {customerVerificationUiLabelDe(licenseUi)}
                      {detail?.licenseNumber || detail?.licenseExpiry || customer.licenseExpiry ? (
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          {detail?.licenseNumber ? `Nr. ${detail.licenseNumber}` : ''}
                          {(detail?.licenseExpiry || customer.licenseExpiry) &&
                            ` · bis ${formatDate(detail?.licenseExpiry ?? customer.licenseExpiry)}`}
                        </span>
                      ) : null}
                    </>
                  }
                />
              </DataCard>

              {/* Profile */}
              <DataCard title="Profil" bodyClassName="py-2">
                <CustomerQuickViewDetailRow label="Name" value={customer.name} />
                <CustomerQuickViewDetailRow
                  label="Geburtsdatum"
                  value={formatDate(detail?.dateOfBirth)}
                />
                <CustomerQuickViewDetailRow
                  label="Führerscheinnummer"
                  value={detail?.licenseNumber}
                />
                <CustomerQuickViewDetailRow
                  label="Kundentyp"
                  value={customer.type === 'Corporate' ? 'Firma' : 'Privat'}
                />
                <CustomerQuickViewDetailRow
                  label="FS gültig bis"
                  value={formatDate(detail?.licenseExpiry ?? customer.licenseExpiry)}
                />
              </DataCard>

              {/* Contact */}
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
                  label="Land"
                  value={detail?.country || EM_DASH}
                  icon={<MapPin />}
                />
              </DataCard>

              {/* Financial burden */}
              {showFinancialSection ? (
                <DataCard title="Finanzielle Belastung" bodyClassName="py-2">
                  <CustomerQuickViewDetailRow
                    label="Offene Rechnungen"
                    value={String(openInvoices.length)}
                  />
                  <CustomerQuickViewDetailRow
                    label="Überfällig"
                    value={String(overdueInvoices.length)}
                  />
                  <CustomerQuickViewDetailRow
                    label="Offene Bußgelder"
                    value={String(openFines.length)}
                  />
                  {openFines.length > 0 ? (
                    <div className="mt-2 space-y-1.5 border-t border-border/40 pt-2">
                      {openFines.slice(0, 2).map((f) => (
                        <div
                          key={String(f.id)}
                          className="flex items-center justify-between gap-2 text-[11px]"
                        >
                          <span className="truncate text-muted-foreground">
                            {String(f.offenseType ?? f.title ?? 'Bußgeld')}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-foreground">
                            {formatCurrencyCents(
                              f.amountCents as number | null | undefined,
                              String(f.currency ?? 'EUR'),
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </DataCard>
              ) : null}
            </div>

            {/* Notes / Timeline */}
            {(noteText || timelinePreview.length > 0) && (
              <DataCard
                title={timelinePreview.length > 0 ? 'Letzte Aktivität' : 'Interne Notiz'}
                actions={
                  <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={openFullDetail}>
                    Vollansicht
                  </Button>
                }
                bodyClassName="py-3"
              >
                {noteText ? (
                  <p className="mb-3 whitespace-pre-wrap text-[12px] text-muted-foreground">{noteText}</p>
                ) : null}
                {timelinePreview.length > 0 ? (
                  <Timeline items={timelinePreview} />
                ) : null}
              </DataCard>
            )}

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

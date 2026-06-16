import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from './ui/Icon';
import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
import {
  customerRiskApiToUi,
  customerStatusApiToUi,
  customerStatusUiLabelDe,
  customerRiskUiLabelDe,
  customerVerificationApiToUi,
  customerVerificationUiLabelDe,
  customerTypeApiToUi,
} from '../lib/entityMappers';
import { PageHeader, SkeletonCard, SkeletonMetricGrid, StatusChip } from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';
import { CustomerDecisionCards } from './customer-detail/CustomerDecisionCards';
import { CustomerOverviewTab } from './customer-detail/CustomerOverviewTab';
import { CustomerBookingsTab } from './customer-detail/CustomerBookingsTab';
import { CustomerDocumentsTab } from './customer-detail/CustomerDocumentsTab';
import { CustomerFinancesTab } from './customer-detail/CustomerFinancesTab';
import { CustomerDrivingTab } from './customer-detail/CustomerDrivingTab';
import { CustomerTimelineTab } from './customer-detail/CustomerTimelineTab';
import {
  CustomerNoteModal,
  CustomerRejectDocumentModal,
} from './customer-detail/CustomerDetailModals';
import {
  CustomerStatusModal,
  customerStatusUiToApi,
  type CustomerStatusChoice,
} from './customer-detail/CustomerStatusModal';
import {
  CustomerRiskModal,
  customerRiskUiToApi,
  type CustomerRiskChoice,
} from './customer-detail/CustomerRiskModal';
import type { CustomerDetailTab, CustomerListRow } from './customer-detail/customerDetailTypes';
import {
  buildKycDocSlots,
  computeBookingRevenueCents,
  formatDate,
  overallRentalClearanceLabel,
  overallRentalClearanceTone,
  sortBookingsNewestFirst,
} from './customer-detail/customerDetailUtils';
import {
  useCustomerDetail,
  useCustomerDocuments,
  useCustomerDrivingAggregate,
  useCustomerLatestRentalAnalysis,
  useCustomerEligibility,
  useCustomerFines,
  useCustomerInvoices,
  useCustomerTimeline,
} from './customer-detail/useCustomerDetailData';
import { resolveDrivingStressScore } from '../lib/scoreFormat';

export type { CustomerListRow as Customer };

interface CustomerDetailViewProps {
  customer: CustomerListRow;
  onBack: () => void;
  onUpdateCustomer?: (updatedCustomer: CustomerListRow) => void;
  onCreateBooking?: () => void;
  onOpenBooking?: (bookingId: string) => void;
}

const TABS: { key: CustomerDetailTab; label: string }[] = [
  { key: 'overview', label: 'Übersicht' },
  { key: 'bookings', label: 'Buchungen' },
  { key: 'documents', label: 'Dokumente & Verifikation' },
  { key: 'finances', label: 'Finanzen' },
  { key: 'driving', label: 'Fahrbelastung & Prüffälle' },
  { key: 'timeline', label: 'Timeline & Notizen' },
];

export function CustomerDetailView({
  customer,
  onBack,
  onUpdateCustomer,
  onCreateBooking,
  onOpenBooking,
}: CustomerDetailViewProps) {
  const { orgId } = useRentalOrg();
  const { detail, loading, error, refresh } = useCustomerDetail(orgId, customer.id);
  const { documents, loading: documentsLoading, error: documentsError, refresh: refreshDocuments } =
    useCustomerDocuments(orgId, customer.id);
  const { eligibility, loading: eligibilityLoading, error: eligibilityError, refresh: refreshEligibility } =
    useCustomerEligibility(orgId, customer.id);
  const { events: timelineEvents, loading: timelineLoading, error: timelineError, refresh: refreshTimeline } =
    useCustomerTimeline(orgId, customer.id);
  const { fines, error: finesError } = useCustomerFines(orgId, customer.id);
  const { invoices, error: invoicesError } = useCustomerInvoices(orgId, customer.id);
  const drivingAgg = useCustomerDrivingAggregate(orgId, customer.id);
  const { analysis: latestRentalAnalysis, loading: rentalAnalysisLoading } =
    useCustomerLatestRentalAnalysis(orgId, customer.id);

  const [activeTab, setActiveTab] = useState<CustomerDetailTab>('overview');
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [rejectDocId, setRejectDocId] = useState<string | null>(null);
  const [reviewingDocId, setReviewingDocId] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingRisk, setSavingRisk] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  const displayStatus =
    detail?.status != null
      ? customerStatusApiToUi(detail.status, detail.archivedAt)
      : customer.status;
  const displayRisk =
    detail?.riskLevel != null
      ? customerRiskApiToUi(detail.riskLevel)
      : customer.riskLevel;
  const displayType =
    detail?.customerType != null
      ? customerTypeApiToUi(detail.customerType)
      : customer.type;

  const bookings = useMemo(
    () => sortBookingsNewestFirst(detail?.bookings ?? []),
    [detail?.bookings],
  );

  const totalRevenueCents =
    detail?.totalRevenueCents ??
    bookings
      .filter(
        (b) =>
          !['CANCELLED', 'NO_SHOW'].includes((b.status || '').toUpperCase()),
      )
      .reduce((sum, b) => sum + computeBookingRevenueCents(b), 0);

  const totalKmDriven = bookings.reduce((sum, b) => sum + (b.kmDriven ?? 0), 0);
  const lastBookingDate = detail?.lastBookingDate ?? bookings[0]?.startDate ?? null;

  const openInvoices = invoices.filter((i) => (i.status ?? '').toUpperCase() !== 'PAID').length;
  const overdueInvoices = invoices.filter((i) => (i.status ?? '').toUpperCase() === 'OVERDUE').length;
  const openFines = fines.filter((f) => !['RESOLVED', 'CLOSED'].includes((f.status ?? '').toUpperCase())).length;

  const drivingStressScore = resolveDrivingStressScore(detail ?? customer);
  const stressLevel =
    detail?.stressLevel ?? customer.stressLevel ?? null;
  const hasEnoughData =
    typeof detail?.hasEnoughData === 'boolean'
      ? detail.hasEnoughData
      : customer.hasEnoughData ?? true;

  const kycDocSlots = useMemo(
    () => buildKycDocSlots(documents, detail),
    [documents, detail],
  );

  const idVerificationUi = customerVerificationApiToUi(detail?.idVerificationStatus ?? undefined);
  const licenseVerificationUi = customerVerificationApiToUi(
    detail?.licenseVerificationStatus ?? undefined,
  );

  const shortId = customer.id.slice(0, 8).toUpperCase();
  const displayName = customer.company
    ? `${customer.company} (${customer.name})`
    : customer.name;

  const reloadAll = () => {
    refresh();
    refreshDocuments();
    refreshEligibility();
    refreshTimeline();
  };

  const handleStatusChange = async (next: CustomerStatusChoice, reason?: string) => {
    if (!orgId) return;
    setSavingStatus(true);
    try {
      await api.customers.updateStatus(orgId, customer.id, {
        status: customerStatusUiToApi(next),
        reason,
      });
      onUpdateCustomer?.({ ...customer, status: next });
      toast.success(`Status: ${customerStatusUiLabelDe(next)}`);
      setStatusModalOpen(false);
      reloadAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Status konnte nicht gespeichert werden';
      toast.error('Fehler', { description: msg });
    } finally {
      setSavingStatus(false);
    }
  };

  const handleRiskChange = async (next: CustomerRiskChoice, reason?: string) => {
    if (!orgId) return;
    setSavingRisk(true);
    try {
      const apiRisk = customerRiskUiToApi(next);
      if (!apiRisk) throw new Error('Ungültige Risikostufe');
      await api.customers.updateRisk(orgId, customer.id, {
        riskLevel: apiRisk,
        riskReason: reason,
      });
      onUpdateCustomer?.({ ...customer, riskLevel: next });
      toast.success(`Risiko: ${customerRiskUiLabelDe(next)}`);
      setRiskModalOpen(false);
      reloadAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Risiko konnte nicht gespeichert werden';
      toast.error('Fehler', { description: msg });
    } finally {
      setSavingRisk(false);
    }
  };

  const handleAddNote = async (note: string, title?: string) => {
    if (!orgId) return;
    setSavingNote(true);
    try {
      await api.customers.customerTimeline.addNote(orgId, customer.id, { note, title });
      toast.success('Notiz gespeichert');
      setNoteModalOpen(false);
      refreshTimeline();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Notiz konnte nicht gespeichert werden';
      toast.error('Fehler', { description: msg });
    } finally {
      setSavingNote(false);
    }
  };

  const reviewDocument = async (
    documentId: string,
    status: 'VERIFIED' | 'REJECTED',
    rejectedReason?: string,
  ) => {
    if (!orgId) return;
    setReviewingDocId(documentId);
    try {
      await api.customers.customerDocuments.review(orgId, customer.id, documentId, {
        status,
        ...(rejectedReason ? { rejectedReason } : {}),
      });
      toast.success(status === 'VERIFIED' ? 'Dokument verifiziert' : 'Dokument abgelehnt');
      reloadAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Prüfung fehlgeschlagen';
      toast.error('Fehler', { description: msg });
    } finally {
      setReviewingDocId(null);
      setRejectDocId(null);
    }
  };

  if (loading && !detail) {
    return (
      <div className="space-y-4 max-w-[1400px] mx-auto">
        <SkeletonCard className="h-16 w-full" />
        <SkeletonMetricGrid count={4} />
        <SkeletonCard className="h-64 w-full" />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-4">
        <Icon name="alert-circle" className="w-10 h-10 mx-auto text-[color:var(--status-critical)]" />
        <p className="text-sm font-semibold">Kunde konnte nicht geladen werden</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <button type="button" onClick={refresh} className="text-xs font-semibold sq-tone-brand px-3 py-2 rounded-lg">
          Erneut laden
        </button>
        <button type="button" onClick={onBack} className="block mx-auto text-xs text-muted-foreground">
          ← Zurück zur Liste
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto">
      <PageHeader
        eyebrow={(
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Icon name="arrow-left" className="w-3.5 h-3.5" />
            Kunden
          </button>
        )}
        title={displayName}
        description={(
          <span className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground">CID-{shortId}</span>
            <span>·</span>
            <span>{displayType === 'Corporate' ? 'Firma' : 'Privat'}</span>
            <span>·</span>
            <span>Kunde seit {formatDate(detail?.createdAt)}</span>
          </span>
        )}
        status={(
          <div className="flex flex-wrap gap-1.5">
            <StatusChip tone={customerStatusTone(displayStatus)} dot>
              {customerStatusUiLabelDe(displayStatus)}
            </StatusChip>
            <StatusChip tone={customerRiskTone(displayRisk)}>
              {customerRiskUiLabelDe(displayRisk)}
            </StatusChip>
            <StatusChip tone={verificationTone(idVerificationUi)}>
              Ausweis: {customerVerificationUiLabelDe(idVerificationUi)}
            </StatusChip>
            <StatusChip tone={verificationTone(licenseVerificationUi)}>
              FS: {customerVerificationUiLabelDe(licenseVerificationUi)}
            </StatusChip>
            {eligibility && (
              <StatusChip tone={overallRentalClearanceTone(eligibility)} dot>
                Mietfreigabe: {overallRentalClearanceLabel(eligibility)}
              </StatusChip>
            )}
          </div>
        )}
        actions={(
          <div className="flex flex-wrap gap-2">
            {onCreateBooking && (
              <button type="button" onClick={onCreateBooking} className="sq-press px-3 py-2 rounded-xl text-[10px] font-semibold sq-tone-brand">
                Neue Buchung
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setActiveTab('documents');
              }}
              className="sq-press px-3 py-2 rounded-xl text-[10px] font-semibold border border-border bg-card"
            >
              Dokument hochladen
            </button>
            <button
              type="button"
              onClick={() => setNoteModalOpen(true)}
              className="sq-press px-3 py-2 rounded-xl text-[10px] font-semibold border border-border bg-card"
            >
              Notiz hinzufügen
            </button>
            <button
              type="button"
              onClick={() => setStatusModalOpen(true)}
              className="sq-press px-3 py-2 rounded-xl text-[10px] font-semibold border border-border bg-card"
            >
              Status ändern
            </button>
            <button
              type="button"
              onClick={() => setRiskModalOpen(true)}
              className="sq-press px-3 py-2 rounded-xl text-[10px] font-semibold border border-border bg-card"
            >
              Risiko setzen
            </button>
          </div>
        )}
      />

      <CustomerDecisionCards
        eligibility={eligibility}
        eligibilityLoading={eligibilityLoading}
        eligibilityError={eligibilityError}
        idVerificationStatus={detail?.idVerificationStatus}
        licenseVerificationStatus={detail?.licenseVerificationStatus}
        idExpiry={detail?.idExpiry}
        licenseExpiry={detail?.licenseExpiry}
        onOpenDocuments={() => setActiveTab('documents')}
        openInvoices={openInvoices}
        overdueInvoices={overdueInvoices}
        openFines={openFines}
        totalRevenueCents={totalRevenueCents}
        totalBookings={bookings.length}
        lastBookingDate={lastBookingDate}
        drivingStressScore={drivingStressScore}
        stressLevel={stressLevel}
        hasEnoughData={hasEnoughData}
        drivingEvents={drivingAgg.drivingEvents}
        abuseEvents={drivingAgg.abuseEvents}
      />

      <div className="flex gap-1 flex-wrap overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
              activeTab === tab.key
                ? 'bg-card text-foreground shadow-sm border border-border'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
          >
            {tab.label}
            {tab.key === 'bookings' ? ` (${bookings.length})` : ''}
          </button>
        ))}
      </div>

      <div>
        {activeTab === 'overview' && (
          <CustomerOverviewTab
            customer={{ ...customer, status: displayStatus, riskLevel: displayRisk, type: displayType }}
            detail={detail}
            eligibility={eligibility}
            totalRevenueCents={totalRevenueCents}
            totalBookings={bookings.length}
            openInvoices={openInvoices}
            openFines={openFines}
            lastBookingDate={lastBookingDate}
            timelinePreview={timelineEvents}
            onOpenDocuments={() => setActiveTab('documents')}
            onOpenTimeline={() => setActiveTab('timeline')}
          />
        )}
        {activeTab === 'bookings' && (
          <CustomerBookingsTab
            bookings={bookings}
            totalRevenueCents={totalRevenueCents}
            totalKmDriven={totalKmDriven}
            onOpenBooking={onOpenBooking}
          />
        )}
        {activeTab === 'documents' && (
          <CustomerDocumentsTab
            orgId={orgId ?? undefined}
            customerId={customer.id}
            detail={detail}
            kycDocSlots={kycDocSlots}
            documentsLoading={documentsLoading}
            documentsError={documentsError}
            reviewingDocId={reviewingDocId}
            onDocumentUploaded={reloadAll}
            onVerify={(id) => reviewDocument(id, 'VERIFIED')}
            onReject={(id) => setRejectDocId(id)}
          />
        )}
        {activeTab === 'finances' && (
          <CustomerFinancesTab
            invoices={invoices}
            fines={fines}
            invoicesError={invoicesError}
            finesError={finesError}
          />
        )}
        {activeTab === 'driving' && (
          <CustomerDrivingTab
            orgId={orgId ?? undefined}
            customerId={customer.id}
            drivingAgg={drivingAgg}
            drivingStressScore={drivingStressScore}
            stressLevel={stressLevel}
            hasEnoughData={hasEnoughData}
            dataConfidence={detail?.dataConfidence ?? customer.dataConfidence}
            scoredTripCount={detail?.scoredTripCount ?? customer.scoredTripCount}
            totalDistanceKm={detail?.totalDistanceKm ?? customer.totalDistanceKm}
            latestAnalysis={latestRentalAnalysis}
            analysisLoading={rentalAnalysisLoading}
          />
        )}
        {activeTab === 'timeline' && (
          <CustomerTimelineTab
            events={timelineEvents}
            loading={timelineLoading}
            error={timelineError}
            onAddNote={() => setNoteModalOpen(true)}
          />
        )}
      </div>

      <CustomerStatusModal
        open={statusModalOpen}
        currentStatus={displayStatus}
        saving={savingStatus}
        onClose={() => setStatusModalOpen(false)}
        onConfirm={handleStatusChange}
      />
      <CustomerRiskModal
        open={riskModalOpen}
        currentRisk={displayRisk}
        saving={savingRisk}
        onClose={() => setRiskModalOpen(false)}
        onConfirm={handleRiskChange}
      />
      <CustomerNoteModal
        open={noteModalOpen}
        saving={savingNote}
        onClose={() => setNoteModalOpen(false)}
        onConfirm={handleAddNote}
      />
      <CustomerRejectDocumentModal
        open={!!rejectDocId}
        saving={reviewingDocId === rejectDocId}
        onClose={() => setRejectDocId(null)}
        onConfirm={(reason) => {
          if (rejectDocId) void reviewDocument(rejectDocId, 'REJECTED', reason);
        }}
      />
    </div>
  );
}

function customerStatusTone(status: CustomerListRow['status']): StatusTone {
  if (status === 'Active') return 'success';
  if (status === 'Under Review') return 'warning';
  if (status === 'Suspended' || status === 'Blocked') return 'critical';
  return 'neutral';
}

function customerRiskTone(level: CustomerListRow['riskLevel']): StatusTone {
  if (level === 'Not Assessed') return 'noData';
  if (level === 'Low Risk') return 'success';
  if (level === 'Medium Risk') return 'warning';
  return 'critical';
}

function verificationTone(
  ui: ReturnType<typeof customerVerificationApiToUi>,
): StatusTone {
  if (ui === 'Verified') return 'success';
  if (ui === 'Pending Review') return 'warning';
  if (ui === 'Rejected' || ui === 'Expired') return 'critical';
  return 'neutral';
}

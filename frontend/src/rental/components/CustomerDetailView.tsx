import { Fragment, useMemo, useState } from 'react';

import { AlertCircle } from 'lucide-react';

import { toast } from 'sonner';



import { useRentalOrg } from '../RentalContext';

import { api, getErrorMessage } from '../../lib/api';

import {

  customerRiskApiToUi,

  customerStatusApiToUi,

  customerStatusUiLabelDe,

  customerRiskUiLabelDe,

  customerVerificationApiToUi,

  customerTypeApiToUi,

} from '../lib/entityMappers';

import { changeCustomerRisk, changeCustomerStatus } from '../lib/customer-mutations.utils';

import { SkeletonCard, SkeletonMetricGrid } from '../../components/patterns';

import { Button } from '../../components/ui/button';

import { CustomerDecisionCards } from './customer-detail/CustomerDecisionCards';

import { CustomerOverviewTab } from './customer-detail/CustomerOverviewTab';

import { CustomerBookingsTab } from './customer-detail/CustomerBookingsTab';

import { CustomerDocumentsTab } from './customer-detail/CustomerDocumentsTab';

import { CustomerFinancesTab } from './customer-detail/CustomerFinancesTab';

import { CustomerDrivingTab } from './customer-detail/CustomerDrivingTab';

import { CustomerTimelineTab } from './customer-detail/CustomerTimelineTab';

import { CustomerDetailHeader } from './customer-detail/CustomerDetailHeader';

import { CustomerDetailTabBar } from './customer-detail/CustomerDetailTabBar';

import {

  CustomerNoteModal,

  CustomerRejectDocumentModal,

} from './customer-detail/CustomerDetailModals';

import {

  CustomerStatusModal,

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

  overallRentalClearanceLabel,

  overallRentalClearanceTone,

  sortBookingsNewestFirst,

} from './customer-detail/customerDetailUtils';

import { cdv, ELIGIBILITY_LOAD_ERROR_USER } from './customer-detail/customer-detail-ui';

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

  { key: 'driving', label: 'Fahrbelastung & Verdacht' },

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



  const rentalClearanceLabel = useMemo(() => {

    if (eligibilityLoading) return 'Lädt…';

    if (eligibilityError) return 'Nicht geladen';

    if (eligibility) return overallRentalClearanceLabel(eligibility);

    return 'Offen';

  }, [eligibility, eligibilityLoading, eligibilityError]);



  const rentalClearanceTone = useMemo(() => {

    if (eligibilityLoading) return 'neutral' as const;

    if (eligibilityError) return 'noData' as const;

    if (eligibility) return overallRentalClearanceTone(eligibility);

    return 'neutral' as const;

  }, [eligibility, eligibilityLoading, eligibilityError]);



  const rentalClearanceTitle = eligibilityError

    ? `${ELIGIBILITY_LOAD_ERROR_USER} ${eligibilityError}`

    : null;



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

      const updated = await changeCustomerStatus(orgId, customer.id, next, reason);

      const mappedStatus = customerStatusApiToUi(updated.status ?? undefined, updated.archivedAt ?? undefined);

      onUpdateCustomer?.({ ...customer, status: mappedStatus });

      toast.success(`Status: ${customerStatusUiLabelDe(mappedStatus)}`);

      setStatusModalOpen(false);

      reloadAll();

    } catch (err: unknown) {

      const msg = getErrorMessage(err, 'Status konnte nicht gespeichert werden');

      toast.error('Fehler', { description: msg });

    } finally {

      setSavingStatus(false);

    }

  };



  const handleStatusShortcut = async (next: CustomerListRow['status']) => {

    const choice: CustomerStatusChoice = next === 'Archived' ? 'Inactive' : next;

    await handleStatusChange(choice);

  };



  const handleRiskChange = async (next: CustomerRiskChoice, reason?: string) => {

    if (!orgId) return;

    setSavingRisk(true);

    try {

      const apiRisk = customerRiskUiToApi(next);

      if (!apiRisk) throw new Error('Ungültige Risikostufe');

      const updated = await changeCustomerRisk(orgId, customer.id, apiRisk, reason);

      const mappedRisk = customerRiskApiToUi(updated.riskLevel);

      onUpdateCustomer?.({ ...customer, riskLevel: mappedRisk });

      toast.success(`Risiko: ${customerRiskUiLabelDe(mappedRisk)}`);

      setRiskModalOpen(false);

      reloadAll();

    } catch (err: unknown) {

      const msg = getErrorMessage(err, 'Risiko konnte nicht gespeichert werden');

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

      <div className={`${cdv.page} space-y-4`}>

        <SkeletonCard className="h-28 w-full" />

        <SkeletonMetricGrid count={4} />

        <SkeletonCard className="h-64 w-full" />

      </div>

    );

  }



  if (error && !detail) {

    return (

      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">

        <AlertCircle className="mx-auto size-10 text-[color:var(--status-critical)]" />

        <p className="text-sm font-semibold">Kunde konnte nicht geladen werden</p>

        <p className="text-xs text-muted-foreground">{error}</p>

        <div className="flex flex-wrap items-center justify-center gap-2">

          <Button type="button" size="sm" variant="primary" onClick={refresh}>

            Erneut laden

          </Button>

          <Button type="button" size="sm" variant="neutral" onClick={onBack}>

            Zurück zur Liste

          </Button>

        </div>

      </div>

    );

  }



  return (

    <div className={cdv.page}>

      <CustomerDetailHeader

        displayName={displayName}

        shortId={shortId}

        displayType={displayType}

        customerSince={detail?.createdAt}

        displayStatus={displayStatus}

        displayRisk={displayRisk}

        idVerificationUi={idVerificationUi}

        licenseVerificationUi={licenseVerificationUi}

        rentalClearanceLabel={rentalClearanceLabel}

        rentalClearanceTone={rentalClearanceTone}

        rentalClearanceTitle={rentalClearanceTitle}

        phone={customer.phone}

        email={customer.email}

        statusShortcutSaving={savingStatus}

        onBack={onBack}

        onAddNote={() => setNoteModalOpen(true)}

        onStatusShortcut={handleStatusShortcut}

      />



      <CustomerDecisionCards

        eligibility={eligibility}

        eligibilityLoading={eligibilityLoading}

        eligibilityError={eligibilityError}

        onRetryEligibility={refreshEligibility}

        idVerificationStatus={detail?.idVerificationStatus}

        licenseVerificationStatus={detail?.licenseVerificationStatus}

        onOpenDocuments={() => setActiveTab('documents')}

        onOpenFinances={() => setActiveTab('finances')}

        onOpenDriving={() => setActiveTab('driving')}

        openInvoices={openInvoices}

        overdueInvoices={overdueInvoices}

        openFines={openFines}

        drivingStressScore={drivingStressScore}

        stressLevel={stressLevel}

        hasEnoughData={hasEnoughData}

        drivingEvents={drivingAgg.drivingEvents}

        abuseEvents={drivingAgg.abuseEvents}

      />



      <CustomerDetailTabBar

        tabs={TABS.map((t) =>

          t.key === 'bookings' ? { ...t, count: bookings.length } : t,

        )}

        activeTab={activeTab}

        onTabChange={setActiveTab}

      />



      <div>

        {activeTab === 'overview' && (

          <CustomerOverviewTab

            customer={{ ...customer, status: displayStatus, riskLevel: displayRisk, type: displayType }}

            detail={detail}

            totalBookings={bookings.length}

            lastBookingDate={lastBookingDate}

            timelinePreview={timelineEvents}

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

            eligibilityBlockingReasons={eligibility?.blockingReasons}

            documentsLoading={documentsLoading}

            documentsError={documentsError}

            reviewingDocId={reviewingDocId}

            onDocumentUploaded={reloadAll}

            onVerify={(id) => reviewDocument(id, 'VERIFIED')}

            onReject={(id) => setRejectDocId(id)}

            onVerificationUpdated={reloadAll}

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



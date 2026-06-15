import { Calendar, Car, Receipt, Star } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { useRentalOrg } from '../RentalContext';
import { api } from '../../lib/api';
import { customerStatusUiToApi } from '../lib/entityMappers';
import { CustomerDocumentUploadBox } from './CustomerDocumentUploadBox';
import { MisuseCasesPanel } from './MisuseCasesPanel';
import { PageHeader, StatusChip } from '../../components/patterns';
import type { StatusTone } from '../../components/patterns';


// ---------------------------------------------------------------------------
// V4.6.66 — Customer Detail is now 100% backend-wired. Every previously
// fabricated generator (generateBookings, generateTrips, generateDocuments,
// generateAlerts, generateNotes, driverDOB / driverId / customerId derived
// by Math on the UUID, and the harshBraking/abuse factor formulas) has been
// removed. Canonical data sources are:
//
//   - api.customers.get(orgId, id) — returns the customer row including the
//     full bookings[] with nested vehicle, the KYC document URLs, style &
//     safety score aggregates.
//   - api.fines.byCustomer(orgId, id) — /customers/:id/fines
//   - api.invoices.byCustomer(orgId, id) — /customers/:id/invoices
//   - api.rentalDrivingAnalyses.list(orgId, { driverId: id }) — aggregated
//     driving behavior / abuse detection counts from completed rentals.
//
// If there is no data yet (fresh tenant), the tab shows a grounded empty
// state rather than inventing numbers.
// ---------------------------------------------------------------------------

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  type: 'Individual' | 'Corporate';
  status: 'Active' | 'Under Review' | 'Suspended' | 'Blocked' | 'Archived' | 'Inactive';
  // V4.6.95 — Customer.riskLevel default neutral state is 'Not Assessed'.
  riskLevel: 'Not Assessed' | 'Low Risk' | 'Medium Risk' | 'High Risk';
  // V4.6.95 — `drivingStyleScore` is the canonical 0–100 scalar. The legacy
  // `drivingScore` mirror is optional and must never be rendered as a
  // separate score. Kept only so older API payloads keep type-checking.
  drivingScore?: number | null;
  drivingStyleScore?: number | null;
  safetyScore?: number | null;
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

interface CustomerDetailViewProps {
  customer: Customer;
  onBack: () => void;
  onUpdateCustomer?: (updatedCustomer: Customer) => void;
}

type DetailTab =
  | 'overview'
  | 'bookings'
  | 'driving'
  | 'fines'
  | 'documents'
  | 'invoices'
  | 'alerts'
  | 'timeline';

type CustomerDetail = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
  company?: string | null;
  customerType?: string | null;
  riskLevel?: string | null;
  status?: string | null;
  notes?: string | null;
  dateOfBirth?: string | null;
  licenseNumber?: string | null;
  licenseExpiry?: string | null;
  licenseClass?: string | null;
  licenseVerified?: boolean | null;
  idType?: string | null;
  idNumber?: string | null;
  idExpiry?: string | null;
  idVerified?: boolean | null;
  idFrontUrl?: string | null;
  idBackUrl?: string | null;
  licenseFrontUrl?: string | null;
  licenseBackUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  bookings?: BookingRow[] | null;
  drivingStyleScore?: number | null;
  safetyScore?: number | null;
  scoreEligibleTripCount?: number | null;
  // V4.6.95 — backend-canonical aggregate metadata.
  scoredTripCount?: number | null;
  safetyScoredTripCount?: number | null;
  totalDistanceKm?: number | null;
  hasEnoughData?: boolean | null;
  dataConfidence?: 'none' | 'low' | 'medium' | 'high' | null;
  totalRevenueCents?: number | null;
  lastBookingDate?: string | null;
};

type BookingRow = {
  id: string;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  totalPriceCents?: number | null;
  dailyRateCents?: number | null;
  currency?: string | null;
  kmDriven?: number | null;
  kmIncluded?: number | null;
  pickupStationId?: string | null;
  returnStationId?: string | null;
  vehicle?: {
    id?: string;
    licensePlate?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
  } | null;
};

// V4.6.95 — Frontend metadata aggregator only.
// Scores are NEVER recomputed in the frontend — they are backend-canonical
// and live on the customer/detail DTO (drivingStyleScore, safetyScore,
// hasEnoughData, dataConfidence). This hook only summarizes operational
// metadata derived from rental driving analyses (counts, last analysis).
type DrivingAggregateMeta = {
  analysisCount: number;
  drivingEvents: number;
  abuseEvents: number;
  lastAnalysisAt: string | null;
};

const EM_DASH = '\u2014';

function formatDate(raw?: string | Date | null): string {
  if (!raw) return EM_DASH;
  const d = typeof raw === 'string' ? new Date(raw) : raw;
  if (!d || Number.isNaN(d.getTime())) return EM_DASH;
  return d.toLocaleDateString('de-DE');
}

function formatCurrencyCents(cents?: number | null, currency: string = 'EUR'): string {
  if (cents == null) return EM_DASH;
  try {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: (currency || 'EUR').toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} EUR`;
  }
}

function bookingStatusLabel(raw?: string | null): string {
  switch ((raw || '').toUpperCase()) {
    case 'PENDING':
      return 'Pending';
    case 'CONFIRMED':
      return 'Confirmed';
    case 'ACTIVE':
      return 'Active';
    case 'COMPLETED':
      return 'Completed';
    case 'CANCELLED':
    case 'NO_SHOW':
      return 'Cancelled';
    default:
      return raw || EM_DASH;
  }
}

function computeBookingRevenueCents(row: BookingRow): number {
  if (row.totalPriceCents) return row.totalPriceCents;
  if (row.dailyRateCents && row.startDate && row.endDate) {
    const start = new Date(row.startDate).getTime();
    const end = new Date(row.endDate).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      const days = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
      return row.dailyRateCents * days;
    }
  }
  return 0;
}

function sumBookingKm(bookings: BookingRow[]): number {
  return bookings.reduce((sum, b) => sum + (b.kmDriven ?? 0), 0);
}

function useCustomerDetail(orgId: string | null | undefined, customerId: string) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(() => {
    if (!orgId || !customerId) return;
    setLoading(true);
    api.customers
      .get(orgId, customerId)
      .then((row) => setDetail(row as unknown as CustomerDetail))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [orgId, customerId]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { detail, loading, refresh };
}

function useCustomerFines(orgId: string | null | undefined, customerId: string) {
  const [fines, setFines] = useState<any[]>([]);
  useEffect(() => {
    if (!orgId || !customerId) return;
    api.fines
      .byCustomer(orgId, customerId)
      .then((rows) => setFines(Array.isArray(rows) ? rows : []))
      .catch(() => setFines([]));
  }, [orgId, customerId]);
  return fines;
}

function useCustomerInvoices(orgId: string | null | undefined, customerId: string) {
  const [invoices, setInvoices] = useState<any[]>([]);
  useEffect(() => {
    if (!orgId || !customerId) return;
    api.invoices
      .byCustomer(orgId, customerId)
      .then((rows) => setInvoices(Array.isArray(rows) ? rows : []))
      .catch(() => setInvoices([]));
  }, [orgId, customerId]);
  return invoices;
}

// V4.6.95 — Metadata-only hook.
// IMPORTANT: Customer Driving Style / Safety scores are backend-canonical
// (see DriverScoreService.aggregateRows in the backend). The frontend MUST
// NOT compute, average or otherwise derive these scores. This hook only
// returns operational metadata used by the UI (number of analyses,
// total events / abuse counters, last analysis date).
function useCustomerDrivingAggregate(
  orgId: string | null | undefined,
  customerId: string,
): DrivingAggregateMeta {
  const [agg, setAgg] = useState<DrivingAggregateMeta>({
    analysisCount: 0,
    drivingEvents: 0,
    abuseEvents: 0,
    lastAnalysisAt: null,
  });
  useEffect(() => {
    if (!orgId || !customerId) return;
    api.rentalDrivingAnalyses
      .list(orgId, { driverId: customerId, limit: 100 })
      .then((res) => {
        const rows = Array.isArray(res?.data) ? res.data : [];
        let drivingEvents = 0;
        let abuseEvents = 0;
        let lastAnalysisAt: string | null = null;
        for (const row of rows) {
          const payload = (row as any).payload ?? {};
          const ev = payload.eventSummary ?? {};
          drivingEvents += Number(ev.drivingEventsCount ?? 0) || 0;
          abuseEvents += Number(ev.abuseDetectionCount ?? 0) || 0;
          const ts = (row as any).periodEnd || (row as any).createdAt;
          if (ts && (!lastAnalysisAt || new Date(ts) > new Date(lastAnalysisAt))) {
            lastAnalysisAt = ts;
          }
        }
        setAgg({
          analysisCount: rows.length,
          drivingEvents,
          abuseEvents,
          lastAnalysisAt,
        });
      })
      .catch(() => {
        /* leave default aggregate in place */
      });
  }, [orgId, customerId]);
  return agg;
}

export function CustomerDetailView({
  customer,
  onBack,
  onUpdateCustomer,
}: CustomerDetailViewProps) {
  const { orgId } = useRentalOrg();
  const { detail, refresh } = useCustomerDetail(orgId, customer.id);
  const fines = useCustomerFines(orgId, customer.id);
  const invoices = useCustomerInvoices(orgId, customer.id);
  const drivingAgg = useCustomerDrivingAggregate(orgId, customer.id);

  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [statusSaving, setStatusSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<{
    canCreatePendingBooking: boolean;
    canConfirmBooking: boolean;
    canStartRental: boolean;
    blockingReasons: string[];
    warnings: string[];
    requiredActions: string[];
  } | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!orgId) return;
    api.customers
      .eligibility(orgId, customer.id)
      .then(setEligibility)
      .catch(() => setEligibility(null));
  }, [orgId, customer.id, detail?.id]);

  useEffect(() => {
    if (!orgId || activeTab !== 'timeline') return;
    api.customers.customerTimeline
      .list(orgId, customer.id, { limit: 50 })
      .then((res) => setTimelineEvents(res.data ?? []))
      .catch(() => setTimelineEvents([]));
  }, [orgId, customer.id, activeTab]);

  const bookings = detail?.bookings ?? [];

  const totalRevenueCents =
    detail?.totalRevenueCents ??
    bookings
      .filter(
        (b) =>
          (b.status || '').toUpperCase() !== 'CANCELLED' &&
          (b.status || '').toUpperCase() !== 'NO_SHOW',
      )
      .reduce((sum, b) => sum + computeBookingRevenueCents(b), 0);

  const totalKmDriven = sumBookingKm(bookings);
  const lastBookingDate = detail?.lastBookingDate
    ? detail.lastBookingDate
    : bookings[0]?.startDate ?? null;

  const shortId = customer.id.slice(0, 8).toUpperCase();
  const displayDob = formatDate(detail?.dateOfBirth);
  const displayLicenseNumber = detail?.licenseNumber || EM_DASH;
  const displayLicenseExpiry = detail?.licenseExpiry
    ? formatDate(detail.licenseExpiry)
    : customer.licenseExpiry || EM_DASH;
  const displayIdNumber = detail?.idNumber || EM_DASH;
  const displayIdExpiry = formatDate(detail?.idExpiry);
  const displayCity = detail?.city || customer.city || EM_DASH;
  const displayStreet = detail?.address || EM_DASH;
  const displayZip = detail?.zip || '';
  const displayCountry = detail?.country || 'DE';
  const displayJoinDate = formatDate(detail?.createdAt);

  // V4.6.95 — Scores are backend-canonical. Do not aggregate in the frontend.
  // Prefer detail (full DTO) → list-row customer → legacy `drivingScore`
  // compatibility mirror. `combinedScore` is intentionally NOT a third
  // score: it is purely a compact display metric for the hero badge and
  // is therefore only synthesized when both canonical scalars are present.
  const drivingStyleScore =
    detail?.drivingStyleScore ??
    customer.drivingStyleScore ??
    customer.drivingScore ??
    null;
  const safetyScore = detail?.safetyScore ?? customer.safetyScore ?? null;
  const hasEnoughData =
    typeof detail?.hasEnoughData === 'boolean'
      ? detail.hasEnoughData
      : typeof customer.hasEnoughData === 'boolean'
        ? customer.hasEnoughData
        : true;
  const dataConfidence =
    detail?.dataConfidence ?? customer.dataConfidence ?? null;
  const scoredTripCount =
    detail?.scoredTripCount ?? customer.scoredTripCount ?? null;
  const totalDistanceKm =
    detail?.totalDistanceKm ?? customer.totalDistanceKm ?? null;
  const combinedScore =
    drivingStyleScore != null && safetyScore != null && hasEnoughData
      ? Math.round(((drivingStyleScore + safetyScore) / 2) * 10) / 10
      : null;

  const kycDocs = useMemo(() => {
    const rows: Array<{
      slot: 'id-front' | 'id-back' | 'license-front' | 'license-back';
      label: string;
      type: string;
      url: string | null;
    }> = [
      { slot: 'id-front', label: 'Personalausweis – Vorderseite', type: detail?.idType || 'Personalausweis', url: detail?.idFrontUrl ?? null },
      { slot: 'id-back', label: 'Personalausweis – Rückseite', type: detail?.idType || 'Personalausweis', url: detail?.idBackUrl ?? null },
      { slot: 'license-front', label: 'Führerschein – Vorderseite', type: 'Führerschein', url: detail?.licenseFrontUrl ?? null },
      { slot: 'license-back', label: 'Führerschein – Rückseite', type: 'Führerschein', url: detail?.licenseBackUrl ?? null },
    ];
    return rows;
  }, [detail?.idFrontUrl, detail?.idBackUrl, detail?.licenseFrontUrl, detail?.licenseBackUrl, detail?.idType]);

  const idVerified = detail?.idVerified ?? customer.idVerified;
  const licenseVerified = detail?.licenseVerified ?? customer.licenseVerified;

  const textPrimary = 'text-foreground';
  const textSecondary = 'text-muted-foreground';
  const textTertiary = 'text-muted-foreground';
  const borderColor = 'border-border';
  const cardBg = 'rounded-lg border border-border bg-card';
  const rowHover = 'hover:bg-muted/60';
  const thClass = `text-left text-xs uppercase tracking-wider font-semibold px-3 py-2 ${textTertiary}`;
  const tdClass = `px-3 py-2 text-xs`;

  const changeStatus = async (next: Customer['status']) => {
    if (!orgId || statusSaving) return;
    setStatusSaving(true);
    try {
      await api.customers.updateStatus(orgId, customer.id, {
        status: customerStatusUiToApi(next),
      });
      onUpdateCustomer?.({ ...customer, status: next });
      toast.success(`Status aktualisiert: ${next}`);
      refresh();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Fehler beim Speichern';
      toast.error('Status konnte nicht gespeichert werden', { description: String(msg) });
    } finally {
      setStatusSaving(false);
    }
  };

  const persistDocument = async (
    slot: 'id-front' | 'id-back' | 'license-front' | 'license-back',
    url: string | null,
  ) => {
    if (!orgId) return;
    const field =
      slot === 'id-front'
        ? 'idFrontUrl'
        : slot === 'id-back'
        ? 'idBackUrl'
        : slot === 'license-front'
        ? 'licenseFrontUrl'
        : 'licenseBackUrl';
    setUploadingSlot(slot);
    try {
      await api.customers.update(orgId, customer.id, { [field]: url });
      toast.success(url ? 'Dokument gespeichert' : 'Dokument entfernt');
      refresh();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Fehler beim Speichern';
      toast.error('Dokument konnte nicht gespeichert werden', { description: String(msg) });
    } finally {
      setUploadingSlot(null);
    }
  };

  const customerStatusTone = (status: string): StatusTone => {
    if (status === 'Active') return 'success';
    if (status === 'Under Review') return 'warning';
    if (status === 'Suspended') return 'critical';
    return 'neutral';
  };

  const customerRiskTone = (level: string): StatusTone => {
    if (level === 'Not Assessed') return 'noData';
    if (level === 'Low Risk') return 'success';
    if (level === 'Medium Risk') return 'warning';
    return 'critical';
  };

  const bookingStatusTone = (status: string): StatusTone => {
    if (status === 'Completed') return 'info';
    if (status === 'Active') return 'success';
    if (status === 'Confirmed') return 'info';
    if (status === 'Pending') return 'warning';
    return 'neutral';
  };

  const customerAvatarTone =
    customer.status === 'Active'
      ? 'sq-tone-brand'
      : customer.status === 'Under Review'
        ? 'sq-tone-warning'
        : customer.status === 'Suspended'
          ? 'sq-tone-critical'
          : 'sq-tone-neutral';

  const tabs: { key: DetailTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'bookings', label: `Bookings (${bookings.length})` },
    { key: 'driving', label: 'Driving Behavior' },
    { key: 'fines', label: `Fines (${fines.length})` },
    { key: 'documents', label: 'Documents' },
    { key: 'invoices', label: `Invoices (${invoices.length})` },
    { key: 'timeline', label: 'Timeline & Notes' },
    { key: 'alerts', label: 'Alerts & Notes' },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={(
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 rounded-lg transition-all hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <Icon name="arrow-left" className="w-4 h-4" />
            </button>
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-muted/60">
              <Icon name="hash" className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-mono font-semibold text-foreground">CID-{shortId}</span>
            </span>
          </div>
        )}
        title="Customer Details"
        status={(
          <StatusChip tone={customerStatusTone(customer.status)} dot>
            {customer.status}
          </StatusChip>
        )}
        actions={(
          <>
            {customer.status === 'Active' ? (
              <button
                type="button"
                onClick={() => changeStatus('Suspended')}
                disabled={statusSaving}
                className={`sq-press px-3 py-2 rounded-xl text-[10px] font-semibold transition-all sq-tone-critical ${
                  statusSaving ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
                }`}
              >
                {statusSaving ? 'Speichert…' : 'Suspend Customer'}
              </button>
            ) : customer.status === 'Suspended' || customer.status === 'Blocked' ? (
              <button
                type="button"
                onClick={() => changeStatus('Active')}
                disabled={statusSaving}
                className={`sq-press px-3 py-2 rounded-xl text-[10px] font-semibold transition-all sq-tone-success ${
                  statusSaving ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
                }`}
              >
                {statusSaving ? 'Speichert…' : 'Reactivate'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => changeStatus('Active')}
                disabled={statusSaving}
                className={`sq-press px-3 py-2 rounded-xl text-[10px] font-semibold transition-all sq-tone-warning ${
                  statusSaving ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
                }`}
              >
                {statusSaving ? 'Speichert…' : 'Complete Review'}
              </button>
            )}
            {customer.phone && (
              <a
                href={`tel:${customer.phone.replace(/\s/g, '')}`}
                className="sq-press px-3 py-2 rounded-xl border border-border/60 bg-card text-[10px] font-semibold text-foreground transition-all hover:bg-muted flex items-center gap-2 no-underline"
              >
                <Icon name="phone" className="w-3.5 h-3.5 text-[color:var(--brand)]" />
                Contact
              </a>
            )}
          </>
        )}
      />

      {/* Customer Identity */}
      <div className={cardBg + ' p-4'}>
        <div className="flex items-center gap-3 mb-3">
          <div
            className={`w-14 h-14 rounded-lg flex items-center justify-center text-xs font-bold ${customerAvatarTone}`}
          >
            {customer.name
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h3 className={`text-base font-bold ${textPrimary}`}>
                {customer.company ? customer.company : customer.name}
              </h3>
              {customer.company && (
                <span className={`text-xs ${textSecondary}`}>({customer.name})</span>
              )}
              {idVerified && licenseVerified ? (
                <StatusChip tone="success" icon={<Icon name="check-circle" className="w-3 h-3" />}>
                  Verified
                </StatusChip>
              ) : (
                <StatusChip tone="warning" icon={<Icon name="clock" className="w-3 h-3" />}>
                  Unverified
                </StatusChip>
              )}
            </div>
            <div className="flex items-center gap-2.5 mt-1">
              <span className={`text-xs font-mono ${textSecondary}`}>CID-{shortId}</span>
              <span className={textTertiary}>·</span>
              <StatusChip tone={customerRiskTone(customer.riskLevel)}>{customer.riskLevel}</StatusChip>
              <span className={textTertiary}>·</span>
              <StatusChip tone={customerStatusTone(customer.status)}>{customer.status}</StatusChip>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-all ${
                activeTab === tab.key
                  ? 'bg-card text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {/* Summary Stats Bar */}
            <div className="grid grid-cols-4 gap-3">
              {[
                {
                  label: 'Total Bookings',
                  value: String(bookings.length),
                  icon: Calendar,
                  bg: 'bg-blue-100',
                  color: 'text-blue-600',
                },
                {
                  label: 'Distance Driven',
                  value:
                    totalKmDriven > 0 ? `${totalKmDriven.toLocaleString('de-DE')} km` : EM_DASH,
                  icon: Car,
                  bg: 'bg-green-100',
                  color: 'text-green-600',
                },
                {
                  label: 'Revenue',
                  value: totalRevenueCents > 0 ? formatCurrencyCents(totalRevenueCents) : EM_DASH,
                  icon: Receipt,
                  bg: 'bg-emerald-100',
                  color: 'text-emerald-600',
                },
                {
                  // V4.6.95 — Driving Style Score (0–100, never %).
                  // Renders "—" when missing or insufficient data.
                  label: 'Driving Style',
                  value:
                    drivingStyleScore != null && hasEnoughData
                      ? `${Math.round(drivingStyleScore)} / 100`
                      : EM_DASH,
                  icon: Star,
                  bg:
                    drivingStyleScore == null || !hasEnoughData
                      ? 'bg-gray-100'
                      : drivingStyleScore >= 80
                      ? 'bg-green-100'
                      : drivingStyleScore >= 60
                      ? 'bg-amber-100'
                      : 'bg-red-100',
                  color:
                    drivingStyleScore == null || !hasEnoughData
                      ? 'text-gray-500'
                      : drivingStyleScore >= 80
                      ? 'text-green-600'
                      : drivingStyleScore >= 60
                      ? 'text-amber-600'
                      : 'text-red-600',
                },
              ].map((stat) => (
                <div key={stat.label} className={`rounded-lg border p-4 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}
                    >
                      {stat.label}
                    </span>
                    <div
                      className={`w-7 h-7 rounded-lg ${stat.bg} flex items-center justify-center`}
                    >
                      <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                    </div>
                  </div>
                  <p className={`text-xs font-bold ${textPrimary}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {eligibility && (
              <div className={`rounded-lg border p-4 ${cardBg}`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${textTertiary}`}>
                  Mietfreigabe
                </h3>
                <div className="flex items-center gap-2 mb-2">
                  <StatusChip
                    tone={
                      eligibility.blockingReasons.length > 0
                        ? 'critical'
                        : eligibility.warnings.length > 0
                          ? 'warning'
                          : 'success'
                    }
                    dot
                  >
                    {eligibility.blockingReasons.length > 0
                      ? 'Blockiert'
                      : eligibility.warnings.length > 0
                        ? 'Warnung'
                        : 'Freigegeben'}
                  </StatusChip>
                </div>
                {eligibility.blockingReasons.map((r) => (
                  <p key={r} className={`text-xs ${textSecondary}`}>• {r}</p>
                ))}
                {eligibility.warnings.map((w) => (
                  <p key={w} className={`text-xs ${textSecondary}`}>⚠ {w}</p>
                ))}
                {eligibility.requiredActions.map((a) => (
                  <p key={a} className={`text-xs ${textSecondary}`}>→ {a}</p>
                ))}
              </div>
            )}

            {/* Two Column Layout */}
            <div className="grid grid-cols-2 gap-3">
              {/* Left Column */}
              <div className="space-y-5">
                {/* Profile Card */}
                <div className={`rounded-lg border p-4 ${cardBg}`}>
                  <h4 className={`text-xs font-bold mb-3 ${textPrimary}`}>Profile</h4>
                  <div className="space-y-3">
                    {[
                      { label: 'Name', value: customer.name },
                      { label: 'Date of Birth', value: displayDob },
                      { label: 'License Number', value: displayLicenseNumber },
                      ...(customer.company ? [{ label: 'Company', value: customer.company }] : []),
                      { label: 'Customer Type', value: customer.type },
                      { label: 'License Expiry', value: displayLicenseExpiry },
                      { label: 'License Class', value: detail?.licenseClass || EM_DASH },
                      { label: 'Joined', value: displayJoinDate },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between">
                        <span className={`text-xs ${textSecondary}`}>{item.label}</span>
                        <span className={`text-xs font-medium ${textPrimary}`}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contact Card */}
                <div className={`rounded-lg border p-4 ${cardBg}`}>
                  <h4 className={`text-xs font-bold mb-3 ${textPrimary}`}>Contact</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Icon name="phone" className={`w-5 h-5 ${textTertiary}`} />
                      <span className={`text-xs ${textPrimary}`}>{customer.phone || EM_DASH}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Icon name="mail" className={`w-5 h-5 ${textTertiary}`} />
                      <span className={`text-xs ${textPrimary}`}>{customer.email || EM_DASH}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Icon name="globe" className={`w-5 h-5 ${textTertiary}`} />
                      <span className={`text-xs ${textPrimary}`}>{displayCountry}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Icon name="map-pin" className={`w-5 h-5 ${textTertiary}`} />
                      <span className={`text-xs ${textPrimary}`}>
                        {[displayStreet !== EM_DASH ? displayStreet : null, [displayZip, displayCity].filter(Boolean).join(' ')]
                          .filter(Boolean)
                          .join(', ') || EM_DASH}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes Card */}
                <div className={`rounded-lg border p-4 ${cardBg}`}>
                  <h4 className={`text-xs font-bold mb-3 ${textPrimary}`}>Internal Note</h4>
                  {detail?.notes ? (
                    <p className={`text-xs ${textSecondary} whitespace-pre-wrap`}>{detail.notes}</p>
                  ) : (
                    <p className={`text-xs ${textTertiary}`}>
                      Keine Notiz hinterlegt. Notizen können aktuell beim Anlegen oder Bearbeiten
                      eines Kunden gepflegt werden.
                    </p>
                  )}
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-5">
                {/* Driving Behavior Summary */}
                <div className={`rounded-lg border p-4 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`text-xs font-bold ${textPrimary}`}>Driving Behavior</h4>
                    <button
                      onClick={() => setActiveTab('driving')}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Details
                    </button>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative w-16 h-16">
                      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                        <circle
                          cx="32"
                          cy="32"
                          r="28"
                          fill="none"
                          strokeWidth="5"
                          className="stroke-border"
                        />
                        {combinedScore != null && (
                          <circle
                            cx="32"
                            cy="32"
                            r="28"
                            fill="none"
                            strokeWidth="5"
                            strokeDasharray={`${(combinedScore / 100) * 175.93} 175.93`}
                            strokeLinecap="round"
                            className={
                              combinedScore >= 80
                                ? 'stroke-green-500'
                                : combinedScore >= 60
                                ? 'stroke-amber-500'
                                : 'stroke-red-500'
                            }
                          />
                        )}
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-xs font-bold ${textPrimary}`}>
                          {combinedScore != null ? Math.round(combinedScore) : EM_DASH}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      {[
                        { label: 'Driving Events', value: drivingAgg.drivingEvents },
                        { label: 'Abuse Events', value: drivingAgg.abuseEvents },
                        {
                          label: 'Analysed Rentals',
                          value: drivingAgg.analysisCount,
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="flex items-center justify-between"
                        >
                          <span className={`text-xs ${textSecondary}`}>{item.label}</span>
                          <span className={`text-xs font-semibold ${textPrimary}`}>
                            {item.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div
                    className="p-3 rounded-lg text-center bg-muted/50"
                  >
                    {drivingAgg.analysisCount === 0 ? (
                      <span className={`text-[11px] ${textTertiary}`}>
                        Noch keine Rental-Driving-Analysen für diesen Kunden vorhanden.
                      </span>
                    ) : (
                      <>
                        <span className={`text-[11px] ${textTertiary}`}>Score rated </span>
                        <span
                          className={`text-[11px] font-semibold ${
                            combinedScore != null && combinedScore >= 80
                              ? 'text-green-500'
                              : combinedScore != null && combinedScore >= 60
                              ? 'text-amber-500'
                              : 'text-red-500'
                          }`}
                        >
                          {combinedScore != null && combinedScore >= 80
                            ? 'Good'
                            : combinedScore != null && combinedScore >= 60
                            ? 'Average'
                            : combinedScore != null
                            ? 'Poor'
                            : EM_DASH}
                        </span>
                        <span className={`text-[11px] ${textTertiary}`}>
                          {' — '}
                          aggregiert aus {drivingAgg.analysisCount} Analyse
                          {drivingAgg.analysisCount === 1 ? '' : 'n'}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Fines Card (summary) */}
                <div className={`rounded-lg border p-4 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`text-xs font-bold ${textPrimary}`}>Fines</h4>
                    <button
                      onClick={() => setActiveTab('fines')}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Details
                    </button>
                  </div>
                  {fines.length > 0 ? (
                    <div className={`rounded-lg border overflow-hidden ${borderColor}`}>
                      <table className="w-full">
                        <thead>
                          <tr
                            className={`border-b ${borderColor} bg-muted/30`}
                          >
                            <th className={thClass}>Date</th>
                            <th className={thClass}>Type</th>
                            <th className={thClass}>Status</th>
                            <th className={thClass}>Amount</th>
                          </tr>
                        </thead>
                        <tbody
                          className="divide-y divide-border/60"
                        >
                          {fines.slice(0, 3).map((f: any) => (
                            <tr key={f.id}>
                              <td className={`px-3 py-2 text-xs ${textPrimary}`}>
                                {formatDate(f.offenseDate)}
                              </td>
                              <td className={`px-3 py-2 text-xs ${textSecondary}`}>
                                {f.offenseType || f.title || EM_DASH}
                              </td>
                              <td
                                className={`px-3 py-2 text-xs font-medium ${
                                  f.status === 'RESOLVED' || f.status === 'CLOSED'
                                    ? textPrimary
                                    : 'text-red-500'
                                }`}
                              >
                                {f.status || EM_DASH}
                              </td>
                              <td className={`px-3 py-2 text-xs font-semibold ${textPrimary}`}>
                                {formatCurrencyCents(f.amountCents, f.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 py-3">
                      <Icon name="shield" className={`w-5 h-5 ${textTertiary}`} />
                      <span className={`text-xs ${textSecondary}`}>
                        Keine Bußgelder für diesen Kunden.
                      </span>
                    </div>
                  )}
                </div>

                {/* Verification summary */}
                <div className={`rounded-lg border p-4 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`text-xs font-bold ${textPrimary}`}>Verification</h4>
                    <button
                      onClick={() => setActiveTab('documents')}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Dokumente
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`p-3 rounded-lg border ${borderColor}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${textSecondary}`}>Personalausweis</span>
                        {idVerified ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                            <Icon name="shield-check" className="w-3.5 h-3.5" />
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                            <Icon name="shield" className="w-3.5 h-3.5" />
                            Unverified
                          </span>
                        )}
                      </div>
                      <p className={`text-[11px] mt-1 ${textTertiary}`}>
                        Nr. {displayIdNumber} · gültig bis {displayIdExpiry}
                      </p>
                    </div>
                    <div className={`p-3 rounded-lg border ${borderColor}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${textSecondary}`}>Führerschein</span>
                        {licenseVerified ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                            <Icon name="shield-check" className="w-3.5 h-3.5" />
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                            <Icon name="shield" className="w-3.5 h-3.5" />
                            Unverified
                          </span>
                        )}
                      </div>
                      <p className={`text-[11px] mt-1 ${textTertiary}`}>
                        Nr. {displayLicenseNumber} · gültig bis {displayLicenseExpiry}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BOOKINGS TAB */}
        {activeTab === 'bookings' && (
          <div className="space-y-5">
            <div className={`flex items-center gap-3 p-4 rounded-lg border ${cardBg}`}>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${textSecondary}`}>Total Bookings:</span>
                <span className={`text-xs font-bold ${textPrimary}`}>{bookings.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${textSecondary}`}>Letzte Buchung:</span>
                <span className={`text-xs font-bold ${textPrimary}`}>
                  {formatDate(lastBookingDate)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${textSecondary}`}>Kilometers Driven:</span>
                <span className={`text-xs font-bold ${textPrimary}`}>
                  {totalKmDriven > 0 ? `${totalKmDriven.toLocaleString('de-DE')} km` : EM_DASH}
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className={`text-xs ${textSecondary}`}>Total Revenue:</span>
                <span className="text-xs font-bold text-green-600">
                  {totalRevenueCents > 0 ? formatCurrencyCents(totalRevenueCents) : EM_DASH}
                </span>
              </div>
            </div>

            {bookings.length > 0 ? (
              <div className={`rounded-lg border overflow-hidden ${borderColor}`}>
                <table className="w-full">
                  <thead>
                    <tr
                        className={`border-b ${borderColor} bg-muted/30`}
                    >
                      <th className={thClass}>Booking ID</th>
                      <th className={thClass}>Vehicle</th>
                      <th className={thClass}>Start</th>
                      <th className={thClass}>End</th>
                      <th className={thClass}>Duration</th>
                      <th className={thClass}>Status</th>
                      <th className={thClass}>Total</th>
                    </tr>
                  </thead>
                  <tbody
                    className="divide-y divide-border"
                  >
                    {bookings.map((b) => {
                      const statusLabel = bookingStatusLabel(b.status);
                      const priceCents = computeBookingRevenueCents(b);
                      let durationLabel = EM_DASH;
                      if (b.startDate && b.endDate) {
                        const ms =
                          new Date(b.endDate).getTime() - new Date(b.startDate).getTime();
                        if (ms > 0) {
                          const days = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
                          durationLabel = `${days} Tag${days === 1 ? '' : 'e'}`;
                        }
                      }
                      return (
                        <tr key={b.id} className={`transition-colors ${rowHover}`}>
                          <td className={`${tdClass} font-semibold ${textPrimary}`}>
                            #{b.id.slice(0, 8).toUpperCase()}
                          </td>
                          <td className={tdClass}>
                            <p className={`text-xs font-medium ${textPrimary}`}>
                              {b.vehicle?.licensePlate || EM_DASH}
                            </p>
                            <p className={`text-[11px] ${textTertiary}`}>
                              {[b.vehicle?.make, b.vehicle?.model].filter(Boolean).join(' ') ||
                                EM_DASH}
                            </p>
                          </td>
                          <td className={`${tdClass} ${textSecondary}`}>
                            {formatDate(b.startDate)}
                          </td>
                          <td className={`${tdClass} ${textSecondary}`}>
                            {formatDate(b.endDate)}
                          </td>
                          <td className={`${tdClass} ${textSecondary}`}>{durationLabel}</td>
                          <td className={tdClass}>
                            <StatusChip tone={bookingStatusTone(statusLabel)}>{statusLabel}</StatusChip>
                          </td>
                          <td className={`${tdClass} font-semibold ${textPrimary}`}>
                            {priceCents > 0
                              ? formatCurrencyCents(priceCents, b.currency || 'EUR')
                              : EM_DASH}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={`p-12 rounded-lg border text-center ${cardBg}`}>
                <Icon name="calendar" className={`w-5 h-5 mx-auto mb-3 ${textTertiary}`} />
                <p className={`text-xs font-medium ${textSecondary}`}>
                  Noch keine Buchungen für diesen Kunden
                </p>
                <p className={`text-xs mt-1 ${textTertiary}`}>
                  Erstellen Sie eine neue Buchung über „New Booking".
                </p>
              </div>
            )}
          </div>
        )}

        {/* DRIVING BEHAVIOR TAB */}
        {activeTab === 'driving' && (
          <div className="space-y-5">
            {drivingAgg.analysisCount === 0 ? (
              <div className={`p-12 rounded-lg border text-center ${cardBg}`}>
                <Icon name="activity" className={`w-5 h-5 mx-auto mb-3 ${textTertiary}`} />
                <p className={`text-xs font-medium ${textSecondary}`}>
                  Noch keine Rental-Driving-Analysen vorhanden
                </p>
                <p className={`text-xs mt-1 ${textTertiary}`}>
                  Sobald eine Buchung abgeschlossen und ausgewertet wurde, erscheinen hier
                  aggregierte Fahrverhaltens- und Abuse-Metriken.
                </p>
              </div>
            ) : (
              <>
                <div className={`rounded-lg border p-4 ${cardBg}`}>
                  <div className="flex items-center gap-3">
                    <div className="relative w-24 h-24">
                      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                        <circle
                          cx="48"
                          cy="48"
                          r="42"
                          fill="none"
                          strokeWidth="6"
                          className="stroke-border"
                        />
                        {combinedScore != null && (
                          <circle
                            cx="48"
                            cy="48"
                            r="42"
                            fill="none"
                            strokeWidth="6"
                            strokeDasharray={`${(combinedScore / 100) * 263.89} 263.89`}
                            strokeLinecap="round"
                            className={
                              combinedScore >= 80
                                ? 'stroke-green-500'
                                : combinedScore >= 60
                                ? 'stroke-amber-500'
                                : 'stroke-red-500'
                            }
                          />
                        )}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-xs font-bold ${textPrimary}`}>
                          {combinedScore != null ? Math.round(combinedScore) : EM_DASH}
                        </span>
                        <span
                          className={`text-xs uppercase tracking-wider ${textTertiary}`}
                        >
                          Score
                        </span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h4 className={`text-base font-bold mb-1 ${textPrimary}`}>
                        Driving Style & Safety
                      </h4>
                      <p className={`text-xs mb-3 ${textSecondary}`}>
                        Aggregiert aus {drivingAgg.analysisCount} abgeschlossenen
                        Rental-Driving-Analysen
                        {drivingAgg.lastAnalysisAt
                          ? ` · zuletzt ${formatDate(drivingAgg.lastAnalysisAt)}`
                          : ''}
                        .
                        {scoredTripCount != null && totalDistanceKm != null
                          ? ` · ${scoredTripCount} bewertete Trips, ${Math.round(totalDistanceKm)} km`
                          : ''}
                      </p>
                      {!hasEnoughData && (
                        <StatusChip tone="warning" icon={<Icon name="alert-triangle" className="w-3 h-3" />} className="mb-3">
                          Not enough scored trip data
                        </StatusChip>
                      )}
                      {hasEnoughData && dataConfidence && (
                        <StatusChip tone="neutral" className="mb-3">
                          Data confidence:{' '}
                          {dataConfidence.charAt(0).toUpperCase() +
                            dataConfidence.slice(1)}
                        </StatusChip>
                      )}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          {
                            // V4.6.95 — Backend-canonical Driving Style Score.
                            label: 'Style Score',
                            value:
                              drivingStyleScore != null && hasEnoughData
                                ? `${Math.round(drivingStyleScore)} / 100`
                                : EM_DASH,
                          },
                          {
                            // V4.6.95 — Safety Score is null when route /
                            // speed-limit data is unavailable. Never coerce.
                            label: 'Safety Score',
                            value:
                              safetyScore != null && hasEnoughData
                                ? `${Math.round(safetyScore)} / 100`
                                : EM_DASH,
                          },
                          {
                            label: 'Rentals',
                            value: String(drivingAgg.analysisCount),
                          },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="p-2.5 rounded-lg bg-muted/50"
                          >
                            <span
                              className={`text-xs uppercase tracking-wider ${textTertiary}`}
                            >
                              {item.label}
                            </span>
                            <p className={`text-xs font-semibold mt-0.5 ${textPrimary}`}>
                              {item.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-lg border p-4 ${cardBg}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Icon name="trending-up" className={`w-4 h-4 ${textTertiary}`} />
                      <h4 className={`text-xs font-bold ${textPrimary}`}>
                        Driving Events (Total)
                      </h4>
                    </div>
                    <p className={`text-2xl font-bold ${textPrimary}`}>
                      {drivingAgg.drivingEvents}
                    </p>
                    <p className={`text-[11px] mt-1 ${textTertiary}`}>
                      Harsh acceleration, cornering & braking kombiniert über alle Analysen.
                    </p>
                  </div>
                  <div className={`rounded-lg border p-4 ${cardBg}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Icon name="zap" className={`w-4 h-4 ${textTertiary}`} />
                      <h4 className={`text-xs font-bold ${textPrimary}`}>
                        Abuse Events (Total)
                      </h4>
                    </div>
                    <p className={`text-2xl font-bold ${textPrimary}`}>
                      {drivingAgg.abuseEvents}
                    </p>
                    <p className={`text-[11px] mt-1 ${textTertiary}`}>
                      Kaltstarts, Kickdown, Dauerlast, Idle-Revving aus DIMO-Events summiert.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-border p-3 text-xs flex items-center gap-2 sq-tone-info">
                  <Icon name="info" className="w-4 h-4 shrink-0" />
                  <span>
                    Für Event-Breakdown pro Trip / Vehicle öffnen Sie die Rental Driving
                    Analysis Seite — dort ist jeder der {drivingAgg.drivingEvents +
                      drivingAgg.abuseEvents}{' '}
                    Einträge einer konkreten Buchung zugeordnet.
                  </span>
                </div>

                {orgId && (
                  <MisuseCasesPanel
                    orgId={orgId}
                    customerId={customer.id}
                    title="Nutzungsauffälligkeiten / Prüffälle"
                    limit={15}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* FINES TAB */}
        {activeTab === 'fines' && (
          <div className="space-y-5">
            {fines.length > 0 ? (
              <>
                <div className={`rounded-lg border overflow-hidden ${borderColor}`}>
                  <table className="w-full">
                    <thead>
                      <tr
                        className={`border-b ${borderColor} bg-muted/30`}
                      >
                        <th className={thClass}>Title</th>
                        <th className={thClass}>Date</th>
                        <th className={thClass}>Type</th>
                        <th className={thClass}>Location</th>
                        <th className={thClass}>Amount</th>
                        <th className={thClass}>Status</th>
                      </tr>
                    </thead>
                    <tbody
                        className="divide-y divide-border"
                    >
                      {fines.map((f: any) => (
                        <tr key={f.id} className={`transition-colors ${rowHover}`}>
                          <td className={`${tdClass} font-semibold ${textPrimary}`}>
                            {f.title || EM_DASH}
                          </td>
                          <td className={`${tdClass} ${textSecondary}`}>
                            {formatDate(f.offenseDate)}
                          </td>
                          <td className={`${tdClass} font-medium ${textPrimary}`}>
                            {f.offenseType || EM_DASH}
                          </td>
                          <td className={`${tdClass} ${textSecondary} max-w-[200px]`}>
                            {f.location || EM_DASH}
                          </td>
                          <td className={`${tdClass} font-semibold ${textPrimary}`}>
                            {formatCurrencyCents(f.amountCents, f.currency)}
                          </td>
                          <td className={tdClass}>
                            <StatusChip
                              tone={bookingStatusTone(
                                f.status === 'RESOLVED' || f.status === 'CLOSED'
                                  ? 'Completed'
                                  : f.status === 'MATCHED'
                                    ? 'Active'
                                    : 'Pending',
                              )}
                            >
                              {f.status === 'RESOLVED' || f.status === 'CLOSED'
                                ? 'Completed'
                                : f.status === 'MATCHED'
                                  ? 'Active'
                                  : 'Pending'}
                            </StatusChip>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={`flex items-center gap-3 p-4 rounded-lg border ${cardBg}`}>
                  <span className={`text-xs ${textSecondary}`}>
                    Total Fines:{' '}
                    <span className={`font-bold ${textPrimary}`}>{fines.length}</span>
                  </span>
                  <span className={`text-xs ${textSecondary}`}>
                    Open:{' '}
                    <span className="font-bold text-red-500">
                      {fines.filter((f: any) => !['RESOLVED', 'CLOSED'].includes(f.status)).length}
                    </span>
                  </span>
                  <span className={`text-xs ml-auto ${textSecondary}`}>
                    Total Amount:{' '}
                    <span className="font-bold text-red-500">
                      {formatCurrencyCents(
                        fines.reduce((sum: number, f: any) => sum + (f.amountCents || 0), 0),
                      )}
                    </span>
                  </span>
                </div>
              </>
            ) : (
              <div className={`p-12 rounded-lg border text-center ${cardBg}`}>
                <Icon name="shield" className={`w-5 h-5 mx-auto mb-3 ${textTertiary}`} />
                <p className={`text-xs font-medium ${textSecondary}`}>Keine Bußgelder erfasst</p>
                <p className={`text-xs mt-1 ${textTertiary}`}>
                  Dieser Kunde hat eine saubere Fahrhistorie.
                </p>
              </div>
            )}
          </div>
        )}

        {/* DOCUMENTS TAB */}
        {activeTab === 'documents' && (
          <div className="space-y-5">
            {/* KYC Status */}
            <div
              className={`flex items-center gap-3 p-4 rounded-lg border ${
                idVerified && licenseVerified ? 'sq-tone-success border-current/30' : 'sq-tone-warning border-current/30'
              }`}
            >
              {idVerified && licenseVerified ? (
                <>
                  <Icon name="check-circle" className="w-5 h-5 text-green-500" />
                  <div>
                    <p className={`text-xs font-semibold ${textPrimary}`}>
                      KYC-Verifizierung abgeschlossen
                    </p>
                    <p className={`text-xs ${textSecondary}`}>
                      Angelegt am {displayJoinDate}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Icon name="alert-triangle" className="w-5 h-5 text-amber-500" />
                  <div>
                    <p className={`text-xs font-semibold ${textPrimary}`}>
                      KYC-Verifizierung unvollständig
                    </p>
                    <p className={`text-xs ${textSecondary}`}>
                      {!idVerified
                        ? 'Personalausweis noch nicht verifiziert'
                        : 'Führerschein noch nicht verifiziert'}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* KYC Document Grid */}
            <div className={`rounded-lg border p-4 ${cardBg}`}>
              <h4 className={`text-xs font-bold mb-3 ${textPrimary}`}>
                Ausweis- & Führerscheindokumente
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {kycDocs.map((doc) => (
                  <div key={doc.slot} className="space-y-1.5">
                    <p className={`text-[11px] font-semibold ${textTertiary}`}>{doc.label}</p>
                    <CustomerDocumentUploadBox
                      label={doc.label}
                      slot={doc.slot}
                      orgId={orgId}
                      url={doc.url}
                      onUploaded={(url) => persistDocument(doc.slot, url)}
                      onCleared={() => persistDocument(doc.slot, null)}
                    />
                    {uploadingSlot === doc.slot && (
                      <p className={`text-[11px] ${textTertiary}`}>Speichert…</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Document list */}
            <div className={`rounded-lg border overflow-hidden ${borderColor}`}>
              <table className="w-full">
                <thead>
                  <tr
                        className={`border-b ${borderColor} bg-muted/30`}
                  >
                    <th className={thClass}>Document</th>
                    <th className={thClass}>Type</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Actions</th>
                  </tr>
                </thead>
                <tbody
                  className="divide-y divide-border"
                >
                  {kycDocs.map((doc) => (
                    <tr key={doc.slot} className={`transition-colors ${rowHover}`}>
                      <td className={tdClass}>
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-lg ${
                              doc.url ? 'bg-blue-100' : 'bg-gray-100'
                            } flex items-center justify-center`}
                          >
                            <Icon name="file-text"
                              className={`w-3.5 h-3.5 ${
                                doc.url ? 'text-blue-500' : 'text-gray-400'
                              }`}
                            />
                          </div>
                          <span className={`text-[11px] font-medium ${textPrimary}`}>
                            {doc.label}
                          </span>
                        </div>
                      </td>
                      <td className={`${tdClass} ${textSecondary}`}>{doc.type}</td>
                      <td className={tdClass}>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold ${
                            doc.url ? 'text-green-600' : 'text-amber-600'
                          }`}
                        >
                          {doc.url ? (
                            <Icon name="check-circle" className="w-3.5 h-3.5" />
                          ) : (
                            <Icon name="clock" className="w-3.5 h-3.5" />
                          )}
                          {doc.url ? 'Uploaded' : 'Fehlt'}
                        </span>
                      </td>
                      <td className={tdClass}>
                        {doc.url ? (
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-colors w-fit"
                          >
                            <Icon name="download" className="w-3 h-3" />
                            Öffnen
                          </a>
                        ) : (
                          <span className={`text-xs ${textTertiary}`}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* INVOICES TAB */}
        {activeTab === 'invoices' && (
          <div className="space-y-5">
            {invoices.length > 0 ? (
              <>
                <div className={`rounded-lg border overflow-hidden ${borderColor}`}>
                  <table className="w-full">
                    <thead>
                      <tr
                        className={`border-b ${borderColor} bg-muted/30`}
                      >
                        <th className={thClass}>Nr.</th>
                        <th className={thClass}>Date</th>
                        <th className={thClass}>Title</th>
                        <th className={thClass}>Type</th>
                        <th className={thClass}>Amount</th>
                        <th className={thClass}>Status</th>
                      </tr>
                    </thead>
                    <tbody
                        className="divide-y divide-border"
                    >
                      {invoices.map((inv: any) => (
                        <tr key={inv.id} className={`transition-colors ${rowHover}`}>
                          <td className={`${tdClass} font-semibold text-blue-600`}>
                            #{inv.invoiceNumber}
                          </td>
                          <td className={`${tdClass} ${textSecondary}`}>
                            {formatDate(inv.invoiceDate)}
                          </td>
                          <td className={`${tdClass} font-medium ${textPrimary}`}>
                            {inv.title || EM_DASH}
                          </td>
                          <td className={`${tdClass} ${textSecondary}`}>
                            {inv.type === 'OUTGOING_BOOKING'
                              ? 'Buchung'
                              : inv.type === 'OUTGOING_MANUAL'
                              ? 'Manuell'
                              : 'Eingehend'}
                          </td>
                          <td className={`${tdClass} font-semibold ${textPrimary}`}>
                            {formatCurrencyCents(inv.totalCents, inv.currency)}
                          </td>
                          <td className={tdClass}>
                            <StatusChip
                              tone={bookingStatusTone(
                                inv.status === 'PAID'
                                  ? 'Completed'
                                  : inv.status === 'OVERDUE'
                                    ? 'Pending'
                                    : 'Active',
                              )}
                            >
                              {inv.status === 'PAID'
                                ? 'Completed'
                                : inv.status === 'OVERDUE'
                                  ? 'Pending'
                                  : 'Active'}
                            </StatusChip>
                            {inv.status === 'OVERDUE' && (
                              <span className="ml-1 text-[10px] text-red-500 font-semibold">
                                Overdue
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={`flex items-center gap-3 p-4 rounded-lg border ${cardBg}`}>
                  <span className={`text-xs ${textSecondary}`}>
                    Total:{' '}
                    <span className={`font-bold ${textPrimary}`}>{invoices.length}</span>
                  </span>
                  <span className={`text-xs ${textSecondary}`}>
                    Paid:{' '}
                    <span className="font-bold text-green-600">
                      {invoices.filter((i: any) => i.status === 'PAID').length}
                    </span>
                  </span>
                  <span className={`text-xs ${textSecondary}`}>
                    Unpaid:{' '}
                    <span className="font-bold text-amber-600">
                      {invoices.filter((i: any) => i.status !== 'PAID').length}
                    </span>
                  </span>
                  <span className={`text-xs ml-auto ${textSecondary}`}>
                    Total:{' '}
                    <span className="font-bold">
                      {formatCurrencyCents(
                        invoices.reduce((s: number, i: any) => s + (i.totalCents || 0), 0),
                      )}
                    </span>
                  </span>
                </div>
              </>
            ) : (
              <div className={`p-12 rounded-lg border text-center ${cardBg}`}>
                <Icon name="file-text" className={`w-5 h-5 mx-auto mb-3 ${textTertiary}`} />
                <p className={`text-xs font-medium ${textSecondary}`}>Keine Rechnungen</p>
                <p className={`text-xs mt-1 ${textTertiary}`}>
                  Rechnungen erscheinen hier automatisch, sobald Buchungen abgerechnet werden.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && (
          <div className={`rounded-lg border ${cardBg}`}>
            {timelineEvents.length === 0 ? (
              <div className="p-6 text-center">
                <p className={`text-xs ${textSecondary}`}>Noch keine Timeline-Einträge.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {timelineEvents.map((ev) => (
                  <div key={String(ev.id)} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-semibold ${textPrimary}`}>
                        {String(ev.title ?? ev.type ?? 'Event')}
                      </span>
                      <span className={`text-[10px] ${textTertiary}`}>
                        {ev.createdAt
                          ? formatDate(String(ev.createdAt))
                          : EM_DASH}
                      </span>
                    </div>
                    {ev.description ? (
                      <p className={`text-xs mt-1 ${textSecondary} whitespace-pre-wrap`}>
                        {String(ev.description)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ALERTS & NOTES TAB */}
        {activeTab === 'alerts' && (
          <div className="space-y-5">
            <div className={`p-6 rounded-lg border text-center ${cardBg}`}>
              <Icon name="alert-triangle" className={`w-5 h-5 mx-auto mb-3 ${textTertiary}`} />
              <p className={`text-xs font-medium ${textSecondary}`}>
                Kundenspezifische Alerts sind noch nicht verdrahtet
              </p>
              <p className={`text-xs mt-1 ${textTertiary}`}>
                Live-Warnungen entstehen heute auf Fahrzeug-Ebene (Vehicle Alerts /
                Business-Insights). Für den aktuellen Kunden werden Fahrverhaltens-Events und
                Bußgelder in den jeweiligen Tabs oben gezeigt.
              </p>
            </div>
            <div className={`rounded-lg border p-4 ${cardBg}`}>
              <h4 className={`text-xs font-bold mb-2 ${textPrimary}`}>Interne Notiz</h4>
              {detail?.notes ? (
                <p className={`text-xs ${textSecondary} whitespace-pre-wrap`}>
                  {detail.notes}
                </p>
              ) : (
                <p className={`text-xs ${textTertiary}`}>
                  Keine Notiz hinterlegt. Notizen können aktuell in der Customer-Create /
                  -Edit-Maske gepflegt werden.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

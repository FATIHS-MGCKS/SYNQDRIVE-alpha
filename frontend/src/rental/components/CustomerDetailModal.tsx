import { Calendar, Car, Receipt, Star } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useEffect, useState } from 'react';

import { toast } from 'sonner';
import { api } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { customerStatusUiToApi } from '../lib/entityMappers';

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
  status: 'Active' | 'Under Review' | 'Suspended' | 'Blocked';
  // V4.6.95 — neutral 'Not Assessed' default (no fake "Low Risk").
  riskLevel: 'Not Assessed' | 'Low Risk' | 'Medium Risk' | 'High Risk';
  // V4.6.95 — `drivingScore` is a legacy compatibility mirror; canonical
  // public scalar is `drivingStyleScore`. Both kept optional.
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

interface CustomerDetailModalProps {
  customer: Customer;
  isDarkMode: boolean;
  onClose: () => void;
  isAnimating?: boolean;
  onUpdateCustomer?: (updatedCustomer: Customer) => void;
  onOpenDetail?: () => void;
}

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
  drivingStyleScore?: number | null;
  safetyScore?: number | null;
  hasEnoughData?: boolean | null;
  dataConfidence?: 'none' | 'low' | 'medium' | 'high' | null;
  scoredTripCount?: number | null;
  totalDistanceKm?: number | null;
  bookings?: Array<{ kmDriven?: number | null }> | null;
};

export function CustomerDetailModal({
  customer,
  isDarkMode,
  onClose,
  isAnimating = true,
  onUpdateCustomer,
  onOpenDetail,
}: CustomerDetailModalProps) {
  const { orgId } = useRentalOrg();
  const [statusSaving, setStatusSaving] = useState(false);
  const [fines, setFines] = useState<any[]>([]);
  const [detail, setDetail] = useState<ModalDetail | null>(null);

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
      await api.customers.update(orgId, customer.id, {
        status: customerStatusUiToApi(next),
      });
      onUpdateCustomer?.({ ...customer, status: next });
      toast.success(`Status aktualisiert: ${next}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Fehler beim Speichern';
      toast.error('Status konnte nicht gespeichert werden', { description: String(msg) });
    } finally {
      setStatusSaving(false);
    }
  };

  // V4.6.95 — Backend-canonical scores. Frontend never aggregates.
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
  const combinedScore =
    drivingStyleScore != null && safetyScore != null && hasEnoughData
      ? Math.round(((drivingStyleScore + safetyScore) / 2) * 10) / 10
      : null;

  const totalRevenueCents = detail?.totalRevenueCents ?? null;
  const totalKmDriven = (detail?.bookings ?? []).reduce(
    (sum, b) => sum + (b.kmDriven ?? 0),
    0,
  );

  const idVerified = detail?.idVerified ?? customer.idVerified;
  const licenseVerified = detail?.licenseVerified ?? customer.licenseVerified;

  const shortId = customer.id.slice(0, 8).toUpperCase();

  const bg = 'bg-card';
  const borderColor = 'border-border/60';
  const textPrimary = 'text-foreground';
  const textSecondary = 'text-muted-foreground';
  const textTertiary = 'text-muted-foreground';
  const cardBg = 'bg-muted/20 border-border/60';

  const StatusPill = ({ status }: { status: string }) => {
    const s: Record<string, string> = {
      Active: 'sq-tone-success',
      'Under Review': 'sq-tone-warning',
      Suspended: 'sq-tone-critical',
      Blocked: 'sq-tone-neutral',
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
          s[status] || 'sq-tone-neutral'
        }`}
      >
        {status}
      </span>
    );
  };

  const RiskPill = ({ level }: { level: string }) => {
    // V4.6.95 — neutral 'Not Assessed' default replaces previous fake green.
    const s: Record<string, string> = {
      'Not Assessed': 'sq-tone-neutral',
      'Low Risk': 'sq-tone-success',
      'Medium Risk': 'sq-tone-warning',
      'High Risk': 'sq-tone-critical',
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
          s[level] || 'sq-tone-neutral'
        }`}
      >
        {level}
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 transition-all duration-500 ease-out"
        style={{
          backgroundColor: isAnimating ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0)',
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-3xl border shadow-[var(--shadow-2)] transition-all duration-500 ease-out ${bg} ${borderColor}`}
        style={{
          transform: isAnimating
            ? 'scale(1) translateY(0)'
            : 'scale(0.9) translateY(30px)',
          opacity: isAnimating ? 1 : 0,
        }}
      >
        {/* Header */}
        <div className={`flex-shrink-0 px-6 sm:px-8 pt-6 pb-5 border-b ${borderColor}`}>
          <div className="flex items-start justify-between mb-5 gap-4">
            <div>
              <h2 className="text-[16px] leading-[1.12] font-bold tracking-[-0.02em] text-foreground">
                Customer Quick View
              </h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {customer.status === 'Active' ? (
                <button
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
                  onClick={() => changeStatus('Active')}
                  disabled={statusSaving}
                  className={`sq-press px-3 py-2 rounded-xl text-[10px] font-semibold transition-all sq-tone-success ${
                    statusSaving
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:opacity-90'
                  }`}
                >
                  {statusSaving ? 'Speichert…' : 'Reactivate'}
                </button>
              ) : (
                <button
                  onClick={() => changeStatus('Active')}
                  disabled={statusSaving}
                  className={`sq-press px-3 py-2 rounded-xl text-[10px] font-semibold transition-all sq-tone-warning ${
                    statusSaving
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:opacity-90'
                  }`}
                >
                  {statusSaving ? 'Speichert…' : 'Complete Review'}
                </button>
              )}
              {customer.phone && (
                <a
                  href={`tel:${customer.phone.replace(/\s/g, '')}`}
                  className="sq-press px-3 py-2 rounded-xl border border-border/60 bg-card text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border flex items-center gap-2 no-underline"
                >
                  <Icon name="phone" className="w-3.5 h-3.5 text-[color:var(--brand)]" />
                  Contact
                </a>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-xl transition-colors hover:bg-muted text-muted-foreground"
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Customer Identity */}
          <div className="flex items-center gap-4 mb-4">
            <div
              className={`w-[52px] h-[52px] rounded-2xl flex items-center justify-center text-[13px] font-bold ${
                customer.status === 'Active'
                  ? 'sq-tone-brand'
                  : customer.status === 'Under Review'
                    ? 'sq-tone-warning'
                    : customer.status === 'Suspended'
                      ? 'sq-tone-critical'
                      : 'sq-tone-neutral'
              }`}
            >
              {customer.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-[15px] leading-tight font-bold text-foreground">
                  {customer.company ? customer.company : customer.name}
                </h3>
                {customer.company && (
                  <span className="text-[11px] text-muted-foreground">({customer.name})</span>
                )}
                {idVerified && licenseVerified ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold sq-tone-success">
                    <Icon name="check-circle" className="w-3 h-3" /> Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold sq-tone-warning">
                    <Icon name="clock" className="w-3 h-3" /> Unverified
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5 mt-1">
                <Icon name="hash" className={`w-3.5 h-3.5 ${textTertiary}`} />
                <span className={`text-xs font-mono ${textSecondary}`}>CID-{shortId}</span>
                <span className={textTertiary}>·</span>
                <RiskPill level={customer.riskLevel} />
                <span className={textTertiary}>·</span>
                <StatusPill status={customer.status} />
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => {
                  onOpenDetail?.();
                  onClose();
                }}
                className="sq-press flex items-center gap-2 px-3 py-2 rounded-xl border border-border/60 bg-card text-[10px] font-semibold text-foreground transition-all hover:bg-muted hover:border-border"
              >
                <Icon name="external-link" className="w-3.5 h-3.5 text-[color:var(--brand)]" />
                Full Detail
              </button>
            </div>
          </div>

          {/* Quick View label */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1.5 text-[10px] font-semibold rounded-full sq-tone-neutral">
              Quick View
            </span>
            <span className="text-xs text-muted-foreground">
              Compact customer, verification and operations summary
            </span>
          </div>
        </div>

        {/* Content - Overview Only */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6">
          <div className="space-y-5">
            {/* Summary Stats Bar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                {
                  label: 'Total Bookings',
                  value: String(customer.totalBookings),
                  icon: Calendar,
                  tone: 'sq-tone-brand',
                },
                {
                  label: 'Distance Driven',
                  value:
                    totalKmDriven > 0
                      ? `${totalKmDriven.toLocaleString('de-DE')} km`
                      : EM_DASH,
                  icon: Car,
                  tone: 'sq-tone-neutral',
                },
                {
                  label: 'Revenue',
                  value:
                    totalRevenueCents != null && totalRevenueCents > 0
                      ? formatCurrencyCents(totalRevenueCents)
                      : EM_DASH,
                  icon: Receipt,
                  tone: 'sq-tone-success',
                },
                {
                  // V4.6.95 — both scalars are 0–100 model scores. Show "—"
                  // for missing or insufficient data; never coerce to 0/100.
                  label: 'Style / Safety',
                  value: !hasEnoughData
                    ? EM_DASH
                    : drivingStyleScore != null || safetyScore != null
                      ? `${drivingStyleScore != null ? Math.round(drivingStyleScore) : EM_DASH} / ${
                          safetyScore != null ? Math.round(safetyScore) : EM_DASH
                        }`
                      : EM_DASH,
                  icon: Star,
                  tone:
                    combinedScore == null
                      ? 'sq-tone-neutral'
                      : combinedScore >= 80
                        ? 'sq-tone-success'
                        : combinedScore >= 60
                          ? 'sq-tone-warning'
                          : 'sq-tone-critical',
                },
              ].map((stat) => (
                <div key={stat.label} className={`rounded-xl p-3 text-left transition-all duration-200 ${stat.tone}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[9px] uppercase tracking-wider font-semibold opacity-75">
                      {stat.label}
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-current/10 flex items-center justify-center">
                      <stat.icon className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <p className="text-[16px] leading-none font-bold tabular-nums">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left Column */}
              <div className="space-y-5">
                {/* Profile Card */}
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <h4 className="text-[12px] font-semibold tracking-[-0.003em] mb-4 text-foreground">Profile</h4>
                  <div className="space-y-3">
                    {[
                      { label: 'Name', value: customer.name },
                      { label: 'Date of Birth', value: formatDate(detail?.dateOfBirth) },
                      { label: 'License Number', value: detail?.licenseNumber || EM_DASH },
                      ...(customer.company
                        ? [{ label: 'Company', value: customer.company }]
                        : []),
                      { label: 'Customer Type', value: customer.type },
                      {
                        label: 'License Expiry',
                        value: detail?.licenseExpiry
                          ? formatDate(detail.licenseExpiry)
                          : customer.licenseExpiry || EM_DASH,
                      },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex items-center justify-between"
                      >
                        <span className="text-[11px] text-muted-foreground">{item.label}</span>
                        <span className="text-[12px] font-medium text-foreground">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contact Card */}
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <h4 className="text-[12px] font-semibold tracking-[-0.003em] mb-4 text-foreground">Contact</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Icon name="phone" className="w-4 h-4 text-muted-foreground" />
                      <span className="text-[12px] text-foreground">
                        {customer.phone || EM_DASH}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Icon name="mail" className="w-4 h-4 text-muted-foreground" />
                      <span className="text-[12px] text-foreground">
                        {customer.email || EM_DASH}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Icon name="globe" className="w-4 h-4 text-muted-foreground" />
                      <span className="text-[12px] text-foreground">
                        {detail?.country || 'DE'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Icon name="map-pin" className="w-4 h-4 text-muted-foreground" />
                      <span className="text-[12px] text-foreground">
                        {[
                          detail?.address,
                          [detail?.zip, detail?.city || customer.city]
                            .filter(Boolean)
                            .join(' '),
                        ]
                          .filter(Boolean)
                          .join(', ') || EM_DASH}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Notes Card */}
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <h4 className="text-[12px] font-semibold tracking-[-0.003em] mb-2 text-foreground">
                    Interne Notiz
                  </h4>
                  {detail?.notes || customer.notes ? (
                    <p className="text-[12px] text-muted-foreground whitespace-pre-wrap">
                      {detail?.notes || customer.notes}
                    </p>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">
                      Keine Notiz hinterlegt. Notizen pflegen Sie beim Anlegen oder Bearbeiten
                      eines Kunden.
                    </p>
                  )}
                  <button
                    onClick={() => {
                      onOpenDetail?.();
                      onClose();
                    }}
                    className="mt-3 text-[12px] text-[color:var(--brand)] hover:opacity-80 font-medium"
                  >
                    Details öffnen →
                  </button>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-5">
                {/* Verification */}
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Verification</h4>
                    <button
                      onClick={() => {
                        onOpenDetail?.();
                        onClose();
                      }}
                      className="text-xs text-[color:var(--brand)] hover:opacity-80 font-medium"
                    >
                      Details
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          Personalausweis
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Nr. {detail?.idNumber || EM_DASH} · gültig bis{' '}
                          {formatDate(detail?.idExpiry)}
                        </p>
                      </div>
                      {idVerified ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--status-success)]">
                          <Icon name="shield-check" className="w-3.5 h-3.5" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--status-attention)]">
                          <Icon name="shield" className="w-3.5 h-3.5" />
                          Unverified
                        </span>
                      )}
                    </div>
                    <div
                      className="h-px bg-border/60"
                    />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-foreground">Führerschein</p>
                        <p className="text-[11px] text-muted-foreground">
                          Nr. {detail?.licenseNumber || EM_DASH} · gültig bis{' '}
                          {detail?.licenseExpiry
                            ? formatDate(detail.licenseExpiry)
                            : customer.licenseExpiry || EM_DASH}
                        </p>
                      </div>
                      {licenseVerified ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--status-success)]">
                          <Icon name="shield-check" className="w-3.5 h-3.5" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--status-attention)]">
                          <Icon name="shield" className="w-3.5 h-3.5" />
                          Unverified
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Driving scores */}
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Driving Behavior</h4>
                    <button
                      onClick={() => {
                        onOpenDetail?.();
                        onClose();
                      }}
                      className="text-xs text-[color:var(--brand)] hover:opacity-80 font-medium"
                    >
                      Details
                    </button>
                  </div>
                  <div className="flex items-center gap-4 mb-4">
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
                                ? 'stroke-[color:var(--status-success)]'
                                : combinedScore >= 60
                                  ? 'stroke-[color:var(--status-attention)]'
                                  : 'stroke-[color:var(--status-critical)]'
                            }
                          />
                        )}
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[12px] font-bold text-foreground">
                          {combinedScore != null ? Math.round(combinedScore) : EM_DASH}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Style Score</span>
                        <span className="text-xs font-semibold text-foreground">
                          {drivingStyleScore != null && hasEnoughData
                            ? `${Math.round(drivingStyleScore)} / 100`
                            : EM_DASH}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Safety Score</span>
                        <span className="text-xs font-semibold text-foreground">
                          {safetyScore != null && hasEnoughData
                            ? `${Math.round(safetyScore)} / 100`
                            : EM_DASH}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {!hasEnoughData
                      ? 'Not enough scored trip data yet.'
                      : combinedScore == null
                        ? 'Noch keine Rental-Driving-Analysen vorhanden — Werte erscheinen nach der ersten abgeschlossenen Buchung.'
                        : 'Aggregiert aus abgeschlossenen Rental-Driving-Analysen.'}
                  </p>
                </div>

                {/* Fines Card */}
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[12px] font-semibold tracking-[-0.003em] text-foreground">Fines</h4>
                    <button
                      onClick={() => {
                        onOpenDetail?.();
                        onClose();
                      }}
                      className="text-xs text-[color:var(--brand)] hover:opacity-80 font-medium"
                    >
                      Details
                    </button>
                  </div>
                  {fines.length > 0 ? (
                    <div className={`rounded-xl border overflow-hidden ${borderColor}`}>
                      <table className="w-full">
                        <thead>
                          <tr className={`border-b bg-muted/30 ${borderColor}`}>
                            <th
                              className="text-left text-[9px] uppercase tracking-wider font-semibold px-3 py-2 text-muted-foreground"
                            >
                              Date
                            </th>
                            <th
                              className="text-left text-[9px] uppercase tracking-wider font-semibold px-3 py-2 text-muted-foreground"
                            >
                              Type
                            </th>
                            <th
                              className="text-left text-[9px] uppercase tracking-wider font-semibold px-3 py-2 text-muted-foreground"
                            >
                              Status
                            </th>
                            <th
                              className="text-left text-[9px] uppercase tracking-wider font-semibold px-3 py-2 text-muted-foreground"
                            >
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody
                          className="divide-y divide-border/50"
                        >
                          {fines.slice(0, 3).map((f: any) => (
                            <tr key={f.id}>
                              <td className="px-3 py-2 text-xs text-foreground">
                                {formatDate(f.offenseDate)}
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {f.offenseType || f.title || EM_DASH}
                              </td>
                              <td
                                className={`px-3 py-2 text-xs font-medium ${
                                  f.status === 'RESOLVED' || f.status === 'CLOSED'
                                    ? 'text-foreground'
                                    : 'text-[color:var(--status-critical)]'
                                }`}
                              >
                                {f.status || EM_DASH}
                              </td>
                              <td className="px-3 py-2 text-xs font-semibold text-foreground">
                                {formatCurrencyCents(f.amountCents, f.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 py-3">
                      <Icon name="shield" className="w-4 h-4 text-muted-foreground" />
                        <span className="text-[12px] text-muted-foreground">
                        Keine Bußgelder erfasst.
                      </span>
                    </div>
                  )}
                </div>

                {/* High-risk banner */}
                {customer.riskLevel === 'High Risk' && (
                  <div className="rounded-2xl p-4 flex items-center gap-3 sq-tone-critical">
                    <Icon name="alert-triangle" className="w-5 h-5" />
                    <p className="text-xs">
                      Kunde ist als <span className="font-bold">High Risk</span> eingestuft —
                      manuelle Prüfung empfohlen.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

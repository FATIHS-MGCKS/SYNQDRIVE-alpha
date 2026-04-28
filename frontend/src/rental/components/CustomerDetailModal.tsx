import { useEffect, useState } from 'react';
import {
  X,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Car,
  Star,
  AlertTriangle,
  ExternalLink,
  Globe,
  Shield,
  CheckCircle,
  Clock,
  Receipt,
  ShieldCheck,
  Hash,
} from 'lucide-react';
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

  const bg = isDarkMode ? 'bg-neutral-900' : 'bg-white';
  const borderColor = isDarkMode ? 'border-neutral-700/50' : 'border-gray-200/60';
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const textTertiary = isDarkMode ? 'text-gray-500' : 'text-gray-400';
  const cardBg = isDarkMode
    ? 'bg-neutral-800/50 border-neutral-700/50'
    : 'bg-gray-50/80 border-gray-200/50';

  const StatusPill = ({ status }: { status: string }) => {
    const s: Record<string, string> = {
      Active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'Under Review': 'bg-amber-100 text-amber-700 border-amber-200',
      Suspended: 'bg-red-100 text-red-700 border-red-200',
      Blocked: 'bg-gray-200 text-gray-700 border-gray-300',
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
          s[status] || 'bg-gray-100 text-gray-600 border-gray-200'
        }`}
      >
        {status}
      </span>
    );
  };

  const RiskPill = ({ level }: { level: string }) => {
    // V4.6.95 — neutral 'Not Assessed' default replaces previous fake green.
    const s: Record<string, string> = {
      'Not Assessed': 'bg-gray-100 text-gray-600 border-gray-200',
      'Low Risk': 'bg-green-50 text-green-700 border-green-200',
      'Medium Risk': 'bg-amber-50 text-amber-700 border-amber-200',
      'High Risk': 'bg-red-50 text-red-700 border-red-200',
    };
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
          s[level] || 'bg-gray-100 text-gray-600 border-gray-200'
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
        className={`relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl transition-all duration-500 ease-out ${bg} ${borderColor}`}
        style={{
          transform: isAnimating
            ? 'scale(1) translateY(0)'
            : 'scale(0.9) translateY(30px)',
          opacity: isAnimating ? 1 : 0,
          boxShadow: isAnimating
            ? '0 25px 60px -12px rgba(0, 0, 0, 0.35), 0 0 40px -8px rgba(59, 130, 246, 0.15)'
            : '0 10px 30px -12px rgba(0, 0, 0, 0)',
        }}
      >
        {/* Header */}
        <div className={`flex-shrink-0 px-8 pt-7 pb-5 border-b ${borderColor}`}>
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className={`text-xl font-bold ${textPrimary}`}>
                <span className={textTertiary}>Customer </span>Quick View
              </h2>
            </div>
            <div className="flex items-center gap-2.5">
              {customer.status === 'Active' ? (
                <button
                  onClick={() => changeStatus('Suspended')}
                  disabled={statusSaving}
                  className={`px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all shadow-sm ${
                    statusSaving ? 'bg-red-300 cursor-not-allowed' : 'bg-red-500 hover:bg-red-600'
                  }`}
                >
                  {statusSaving ? 'Speichert…' : 'Suspend Customer'}
                </button>
              ) : customer.status === 'Suspended' || customer.status === 'Blocked' ? (
                <button
                  onClick={() => changeStatus('Active')}
                  disabled={statusSaving}
                  className={`px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all shadow-sm ${
                    statusSaving
                      ? 'bg-green-300 cursor-not-allowed'
                      : 'bg-green-500 hover:bg-green-600'
                  }`}
                >
                  {statusSaving ? 'Speichert…' : 'Reactivate'}
                </button>
              ) : (
                <button
                  onClick={() => changeStatus('Active')}
                  disabled={statusSaving}
                  className={`px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all shadow-sm ${
                    statusSaving
                      ? 'bg-amber-300 cursor-not-allowed'
                      : 'bg-amber-500 hover:bg-amber-600'
                  }`}
                >
                  {statusSaving ? 'Speichert…' : 'Complete Review'}
                </button>
              )}
              {customer.phone && (
                <a
                  href={`tel:${customer.phone.replace(/\s/g, '')}`}
                  className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-all shadow-sm flex items-center gap-2 no-underline"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Contact
                </a>
              )}
              <button
                onClick={onClose}
                className={`p-2 rounded-xl transition-colors ${
                  isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Customer Identity */}
          <div className="flex items-center gap-4 mb-5">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold text-white ${
                customer.status === 'Active'
                  ? 'bg-gradient-to-br from-blue-500 to-blue-600'
                  : customer.status === 'Under Review'
                  ? 'bg-gradient-to-br from-amber-500 to-amber-600'
                  : customer.status === 'Suspended'
                  ? 'bg-gradient-to-br from-red-500 to-red-600'
                  : 'bg-gradient-to-br from-gray-500 to-gray-600'
              }`}
            >
              {customer.name
                .split(' ')
                .map((n) => n[0])
                .join('')}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className={`text-xl font-bold ${textPrimary}`}>
                  {customer.company ? customer.company : customer.name}
                </h3>
                {customer.company && (
                  <span className={`text-sm ${textSecondary}`}>({customer.name})</span>
                )}
                {idVerified && licenseVerified ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200">
                    <CheckCircle className="w-3 h-3" /> Verified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                    <Clock className="w-3 h-3" /> Unverified
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5 mt-1">
                <Hash className={`w-3.5 h-3.5 ${textTertiary}`} />
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
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-medium transition-all ${
                  isDarkMode
                    ? 'bg-neutral-800/60 border-neutral-700/50 text-gray-300 hover:bg-neutral-800'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Detail
              </button>
            </div>
          </div>

          {/* Quick View label */}
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                isDarkMode ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-600'
              }`}
            >
              Quick View
            </span>
            <span className={`text-xs ${textTertiary}`}>·</span>
            <button
              onClick={() => {
                onOpenDetail?.();
                onClose();
              }}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Open Full Detail Page
            </button>
          </div>
        </div>

        {/* Content - Overview Only */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="space-y-5">
            {/* Summary Stats Bar */}
            <div className="grid grid-cols-4 gap-4">
              {[
                {
                  label: 'Total Bookings',
                  value: String(customer.totalBookings),
                  icon: Calendar,
                  bg: 'bg-blue-100',
                  color: 'text-blue-600',
                },
                {
                  label: 'Distance Driven',
                  value:
                    totalKmDriven > 0
                      ? `${totalKmDriven.toLocaleString('de-DE')} km`
                      : EM_DASH,
                  icon: Car,
                  bg: 'bg-green-100',
                  color: 'text-green-600',
                },
                {
                  label: 'Revenue',
                  value:
                    totalRevenueCents != null && totalRevenueCents > 0
                      ? formatCurrencyCents(totalRevenueCents)
                      : EM_DASH,
                  icon: Receipt,
                  bg: 'bg-emerald-100',
                  color: 'text-emerald-600',
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
                  bg:
                    combinedScore == null
                      ? 'bg-gray-100'
                      : combinedScore >= 80
                      ? 'bg-green-100'
                      : combinedScore >= 60
                      ? 'bg-amber-100'
                      : 'bg-red-100',
                  color:
                    combinedScore == null
                      ? 'text-gray-500'
                      : combinedScore >= 80
                      ? 'text-green-600'
                      : combinedScore >= 60
                      ? 'text-amber-600'
                      : 'text-red-600',
                },
              ].map((stat) => (
                <div key={stat.label} className={`rounded-2xl border p-4 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-semibold ${textTertiary}`}
                    >
                      {stat.label}
                    </span>
                    <div
                      className={`w-7 h-7 rounded-lg ${stat.bg} flex items-center justify-center`}
                    >
                      <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${textPrimary}`}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-2 gap-5">
              {/* Left Column */}
              <div className="space-y-5">
                {/* Profile Card */}
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <h4 className={`text-sm font-bold mb-4 ${textPrimary}`}>Profile</h4>
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
                        <span className={`text-sm ${textSecondary}`}>{item.label}</span>
                        <span className={`text-sm font-medium ${textPrimary}`}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contact Card */}
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <h4 className={`text-sm font-bold mb-4 ${textPrimary}`}>Contact</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Phone className={`w-4 h-4 ${textTertiary}`} />
                      <span className={`text-sm ${textPrimary}`}>
                        {customer.phone || EM_DASH}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className={`w-4 h-4 ${textTertiary}`} />
                      <span className={`text-sm ${textPrimary}`}>
                        {customer.email || EM_DASH}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Globe className={`w-4 h-4 ${textTertiary}`} />
                      <span className={`text-sm ${textPrimary}`}>
                        {detail?.country || 'DE'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <MapPin className={`w-4 h-4 ${textTertiary}`} />
                      <span className={`text-sm ${textPrimary}`}>
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
                  <h4 className={`text-sm font-bold mb-2 ${textPrimary}`}>
                    Interne Notiz
                  </h4>
                  {detail?.notes || customer.notes ? (
                    <p className={`text-sm ${textSecondary} whitespace-pre-wrap`}>
                      {detail?.notes || customer.notes}
                    </p>
                  ) : (
                    <p className={`text-sm ${textTertiary}`}>
                      Keine Notiz hinterlegt. Notizen pflegen Sie beim Anlegen oder Bearbeiten
                      eines Kunden.
                    </p>
                  )}
                  <button
                    onClick={() => {
                      onOpenDetail?.();
                      onClose();
                    }}
                    className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
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
                    <h4 className={`text-sm font-bold ${textPrimary}`}>Verification</h4>
                    <button
                      onClick={() => {
                        onOpenDetail?.();
                        onClose();
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Details
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-xs font-medium ${textPrimary}`}>
                          Personalausweis
                        </p>
                        <p className={`text-[11px] ${textTertiary}`}>
                          Nr. {detail?.idNumber || EM_DASH} · gültig bis{' '}
                          {formatDate(detail?.idExpiry)}
                        </p>
                      </div>
                      {idVerified ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                          <Shield className="w-3.5 h-3.5" />
                          Unverified
                        </span>
                      )}
                    </div>
                    <div
                      className={`h-px ${isDarkMode ? 'bg-neutral-700/40' : 'bg-gray-200/60'}`}
                    />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-xs font-medium ${textPrimary}`}>Führerschein</p>
                        <p className={`text-[11px] ${textTertiary}`}>
                          Nr. {detail?.licenseNumber || EM_DASH} · gültig bis{' '}
                          {detail?.licenseExpiry
                            ? formatDate(detail.licenseExpiry)
                            : customer.licenseExpiry || EM_DASH}
                        </p>
                      </div>
                      {licenseVerified ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Verified
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                          <Shield className="w-3.5 h-3.5" />
                          Unverified
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Driving scores */}
                <div className={`rounded-2xl border p-5 ${cardBg}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`text-sm font-bold ${textPrimary}`}>Driving Behavior</h4>
                    <button
                      onClick={() => {
                        onOpenDetail?.();
                        onClose();
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
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
                          className={isDarkMode ? 'stroke-neutral-700' : 'stroke-gray-200'}
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
                        <span className={`text-sm font-bold ${textPrimary}`}>
                          {combinedScore != null ? Math.round(combinedScore) : EM_DASH}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${textSecondary}`}>Style Score</span>
                        <span className={`text-xs font-semibold ${textPrimary}`}>
                          {drivingStyleScore != null && hasEnoughData
                            ? `${Math.round(drivingStyleScore)} / 100`
                            : EM_DASH}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${textSecondary}`}>Safety Score</span>
                        <span className={`text-xs font-semibold ${textPrimary}`}>
                          {safetyScore != null && hasEnoughData
                            ? `${Math.round(safetyScore)} / 100`
                            : EM_DASH}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className={`text-[11px] ${textTertiary}`}>
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
                    <h4 className={`text-sm font-bold ${textPrimary}`}>Fines</h4>
                    <button
                      onClick={() => {
                        onOpenDetail?.();
                        onClose();
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Details
                    </button>
                  </div>
                  {fines.length > 0 ? (
                    <div className={`rounded-xl border overflow-hidden ${borderColor}`}>
                      <table className="w-full">
                        <thead>
                          <tr
                            className={`border-b ${borderColor} ${
                              isDarkMode ? 'bg-neutral-800/30' : 'bg-gray-50/50'
                            }`}
                          >
                            <th
                              className={`text-left text-[9px] uppercase tracking-wider font-semibold px-3 py-2 ${textTertiary}`}
                            >
                              Date
                            </th>
                            <th
                              className={`text-left text-[9px] uppercase tracking-wider font-semibold px-3 py-2 ${textTertiary}`}
                            >
                              Type
                            </th>
                            <th
                              className={`text-left text-[9px] uppercase tracking-wider font-semibold px-3 py-2 ${textTertiary}`}
                            >
                              Status
                            </th>
                            <th
                              className={`text-left text-[9px] uppercase tracking-wider font-semibold px-3 py-2 ${textTertiary}`}
                            >
                              Amount
                            </th>
                          </tr>
                        </thead>
                        <tbody
                          className={`divide-y ${
                            isDarkMode ? 'divide-neutral-700/30' : 'divide-gray-100'
                          }`}
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
                      <Shield className={`w-4 h-4 ${textTertiary}`} />
                      <span className={`text-sm ${textSecondary}`}>
                        Keine Bußgelder erfasst.
                      </span>
                    </div>
                  )}
                </div>

                {/* High-risk banner */}
                {customer.riskLevel === 'High Risk' && (
                  <div
                    className={`rounded-2xl border p-4 flex items-center gap-3 ${
                      isDarkMode
                        ? 'bg-red-900/20 border-red-500/30'
                        : 'bg-red-50/70 border-red-200/60'
                    }`}
                  >
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <p className={`text-xs ${textPrimary}`}>
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

import { Car, MapPin, User, Wrench } from 'lucide-react';
import { Icon } from '../ui/Icon';
import { useEffect, useMemo, useState } from 'react';

import { api, type Station } from '../../../lib/api';
import { stationsForPickup, stationsForReturn } from '../../lib/stationBookingUtils';
import { SignaturePad } from './SignaturePad';

// V4.6.75 — Pickup / Return Übergabeprotokoll dialog.
//
// This is the single canonical UI used by all three booking entry points
// (BookingsView detail sheet, Dashboard "Pick Up Today" tile rows, and the
// RightSidebar termine list). It posts to
//   POST /organizations/:orgId/bookings/:bookingId/handover/(pickup|return)
// and, on success, transitions the booking to ACTIVE (pickup) or COMPLETED
// (return) on the server side. The parent is responsible for refreshing
// bookings + fleet state via onSuccess().

export type HandoverDialogKind = 'PICKUP' | 'RETURN';

export interface HandoverDialogBookingInfo {
  id: string;
  vehicleId: string;
  vehicleName: string;
  plate: string;
  customerName: string;
  startDate: string;
  endDate: string;
  pickupLocation: string;
  returnLocation?: string;
  pickupStationId?: string | null;
  returnStationId?: string | null;
  handoverInstructions?: string | null;
  returnInstructions?: string | null;
  status?: string;
  includedKm?: number;
  pickupOdometerKm?: number | null;
}

interface HandoverProtocolDialogProps {
  isOpen: boolean;
  onClose: () => void;
  kind: HandoverDialogKind;
  orgId: string;
  booking: HandoverDialogBookingInfo | null;
  staffOptions: { id: string; name: string }[];
  isDarkMode: boolean;
  onSuccess?: () => void;
}

interface DamageRow {
  id: string;
  damageType: string;
  severity: string;
  description: string | null;
  locationLabel: string | null;
}

type CheckField =
  | 'exteriorClean'
  | 'interiorClean'
  | 'tiresSeasonOk'
  | 'warningLightsOn'
  | 'documentsAcknowledged';

const DAMAGE_TYPE_OPTIONS = [
  'SCRATCH',
  'DENT',
  'CHIP',
  'CRACK',
  'TEAR',
  'STAIN',
  'MECHANICAL',
  'OTHER',
];
const DAMAGE_SEVERITY_OPTIONS = ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'];

export function HandoverProtocolDialog({
  isOpen,
  onClose,
  kind,
  orgId,
  booking,
  staffOptions,
  isDarkMode,
  onSuccess,
}: HandoverProtocolDialogProps) {
  const [animating, setAnimating] = useState(false);
  const [loadingDamages, setLoadingDamages] = useState(false);
  const [damages, setDamages] = useState<DamageRow[]>([]);
  const [selectedDamageIds, setSelectedDamageIds] = useState<Set<string>>(new Set());
  const [newDamageOpen, setNewDamageOpen] = useState(false);
  const [newDamage, setNewDamage] = useState({
    damageType: 'SCRATCH',
    severity: 'MINOR',
    description: '',
    locationLabel: '',
  });
  const [creatingDamage, setCreatingDamage] = useState(false);
  const [misuseCaseCount, setMisuseCaseCount] = useState(0);

  // Form state
  const [odometerKm, setOdometerKm] = useState<string>('');
  const [fuelPercent, setFuelPercent] = useState<number>(100);
  const [fuelFull, setFuelFull] = useState<boolean>(true);
  // V4.6.81 — optional backdated pickup timestamp. Empty string means
  // "use now()" (server default). Only exposed for PICKUP since the
  // RETURN flow intentionally keeps its kmDriven / completedAt logic
  // anchored to the moment the return dialog is submitted.
  const [performedAtLocal, setPerformedAtLocal] = useState<string>('');
  const [checks, setChecks] = useState<Record<CheckField, boolean>>({
    exteriorClean: true,
    interiorClean: true,
    tiresSeasonOk: true,
    warningLightsOn: false,
    documentsAcknowledged: false,
  });
  const [warningLightsNotes, setWarningLightsNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [staffId, setStaffId] = useState('');
  const [staffName, setStaffName] = useState('');
  const [customerSigData, setCustomerSigData] = useState<string | null>(null);
  const [customerSigName, setCustomerSigName] = useState('');
  const [staffSigData, setStaffSigData] = useState<string | null>(null);
  const [staffSigName, setStaffSigName] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orgStations, setOrgStations] = useState<Station[]>([]);
  const [actualStationId, setActualStationId] = useState<string>('');

  useEffect(() => {
    if (!isOpen) {
      setAnimating(false);
      return;
    }
    const id = requestAnimationFrame(() => setAnimating(true));
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  // Reset when opened for a new booking
  useEffect(() => {
    if (!isOpen || !booking) return;
    setOdometerKm(
      booking.pickupOdometerKm != null ? String(booking.pickupOdometerKm) : '',
    );
    setFuelPercent(100);
    setFuelFull(true);
    setChecks({
      exteriorClean: true,
      interiorClean: true,
      tiresSeasonOk: true,
      warningLightsOn: false,
      documentsAcknowledged: false,
    });
    setWarningLightsNotes('');
    setNotes('');
    setStaffId('');
    setStaffName('');
    setCustomerSigData(null);
    setCustomerSigName('');
    setStaffSigData(null);
    setStaffSigName('');
    setSelectedDamageIds(new Set());
    setNewDamageOpen(false);
    setSubmitError(null);
    setSubmitting(false);
    setPerformedAtLocal('');
    const plannedId =
      kind === 'PICKUP' ? booking.pickupStationId : booking.returnStationId;
    setActualStationId(plannedId ?? '');
  }, [isOpen, booking?.id, kind, booking?.pickupStationId, booking?.returnStationId]);

  useEffect(() => {
    if (!isOpen || !orgId) return;
    let cancelled = false;
    api.stations
      .list(orgId)
      .then((rows) => {
        if (!cancelled) setOrgStations(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setOrgStations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, orgId]);

  // Informative hint only — no return blockade.
  useEffect(() => {
    if (!isOpen || !booking || kind !== 'RETURN' || !orgId) {
      setMisuseCaseCount(0);
      return;
    }
    let cancelled = false;
    api.misuseCases
      .list(orgId, { bookingId: booking.id, limit: 1, page: 1 })
      .then((res) => {
        if (!cancelled) setMisuseCaseCount(res.meta?.total ?? 0);
      })
      .catch(() => {
        if (!cancelled) setMisuseCaseCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, booking?.id, kind, orgId]);

  // Load damages for the selected vehicle when the dialog opens
  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !booking) return;
    setLoadingDamages(true);
    api.vehicleIntelligence
      .damagesActive(booking.vehicleId)
      .then((rows) => {
        if (cancelled) return;
        const list: DamageRow[] = Array.isArray(rows)
          ? rows.map((r: any) => ({
              id: String(r.id),
              damageType: String(r.damageType ?? 'OTHER'),
              severity: String(r.severity ?? 'MINOR'),
              description: r.description ?? null,
              locationLabel: r.locationLabel ?? null,
            }))
          : [];
        setDamages(list);
        if (kind === 'PICKUP') {
          setSelectedDamageIds(new Set(list.map((d) => d.id)));
        }
      })
      .catch(() => {
        if (!cancelled) setDamages([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingDamages(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, booking?.vehicleId, kind]);

  const title = kind === 'PICKUP' ? 'Fahrzeugübergabe (Pickup)' : 'Rücknahme (Return)';
  const primaryLabel =
    kind === 'PICKUP' ? 'Pickup bestätigen & Buchung aktivieren' : 'Rückgabe bestätigen & abschließen';
  const primaryColor = kind === 'PICKUP' ? 'blue' : 'emerald';

  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textMuted = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const textTertiary = isDarkMode ? 'text-gray-500' : 'text-gray-400';
  const bg = isDarkMode ? 'bg-neutral-900' : 'bg-white';
  const borderColor = isDarkMode ? 'border-neutral-700' : 'border-gray-200';
  const cardBg = isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/60';
  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm ${
    isDarkMode
      ? 'bg-neutral-900 border-neutral-700 text-gray-100 placeholder-gray-500'
      : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400'
  } focus:outline-none focus:ring-2 focus:ring-blue-500/40`;

  const canSubmit = useMemo(() => {
    if (!booking) return false;
    if (!odometerKm || Number.isNaN(Number(odometerKm))) return false;
    if (kind === 'RETURN' && booking.pickupOdometerKm != null) {
      if (Number(odometerKm) < booking.pickupOdometerKm) return false;
    }
    if (!checks.documentsAcknowledged) return false;
    const hasStaff = !!(staffId || staffName.trim());
    if (!hasStaff) return false;
    const hasCustSig = !!(customerSigData || customerSigName.trim());
    const hasStaffSig = !!(staffSigData || staffSigName.trim());
    if (!hasCustSig || !hasStaffSig) return false;
    return true;
  }, [
    booking,
    odometerKm,
    kind,
    checks.documentsAcknowledged,
    staffId,
    staffName,
    customerSigData,
    customerSigName,
    staffSigData,
    staffSigName,
  ]);

  const toggleCheck = (field: CheckField) =>
    setChecks((prev) => ({ ...prev, [field]: !prev[field] }));

  const toggleDamage = (id: string) => {
    setSelectedDamageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateDamage = async () => {
    if (!booking) return;
    if (creatingDamage) return;
    setCreatingDamage(true);
    try {
      const created = await api.vehicleIntelligence.createDamage(booking.vehicleId, {
        damageType: newDamage.damageType,
        severity: newDamage.severity,
        description: newDamage.description || undefined,
        locationLabel: newDamage.locationLabel || undefined,
        reportedBy: staffName || 'Handover',
      });
      const row: DamageRow = {
        id: String(created.id),
        damageType: String(created.damageType ?? newDamage.damageType),
        severity: String(created.severity ?? newDamage.severity),
        description: created.description ?? newDamage.description ?? null,
        locationLabel: created.locationLabel ?? newDamage.locationLabel ?? null,
      };
      setDamages((prev) => [row, ...prev]);
      setSelectedDamageIds((prev) => new Set([...prev, row.id]));
      setNewDamage({
        damageType: 'SCRATCH',
        severity: 'MINOR',
        description: '',
        locationLabel: '',
      });
      setNewDamageOpen(false);
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Schaden konnte nicht angelegt werden');
    } finally {
      setCreatingDamage(false);
    }
  };

  const handleSubmit = async () => {
    if (!booking) return;
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // V4.6.81 — Convert the optional backdate input (which comes from
      // <input type="datetime-local"> in the local timezone) to a proper
      // ISO-8601 timestamp. The server validates it cannot be in the
      // future and cannot be more than 7 days before the scheduled
      // pickup. RETURN ignores this field entirely.
      let performedAtIso: string | null = null;
      if (kind === 'PICKUP' && performedAtLocal) {
        const d = new Date(performedAtLocal);
        if (!Number.isNaN(d.getTime())) {
          performedAtIso = d.toISOString();
        }
      }

      const payload = {
        performedAt: performedAtIso,
        performedByUserId: staffId || null,
        performedByName: staffName || null,
        odometerKm: Number(odometerKm),
        fuelPercent: Math.max(0, Math.min(100, Math.round(fuelPercent))),
        fuelFull,
        exteriorClean: checks.exteriorClean,
        interiorClean: checks.interiorClean,
        tiresSeasonOk: checks.tiresSeasonOk,
        warningLightsOn: checks.warningLightsOn,
        warningLightsNotes: checks.warningLightsOn ? warningLightsNotes || null : null,
        notes: notes || null,
        customerSignatureName: customerSigName || null,
        customerSignatureDataUrl: customerSigData,
        staffSignatureName: staffSigName || null,
        staffSignatureDataUrl: staffSigData,
        documentsAcknowledged: checks.documentsAcknowledged,
        damageIds: Array.from(selectedDamageIds),
        actualStationId: actualStationId || null,
      };
      if (kind === 'PICKUP') {
        await api.bookings.createPickupHandover(orgId, booking.id, payload);
      } else {
        await api.bookings.createReturnHandover(orgId, booking.id, payload);
      }
      onSuccess?.();
      onClose();
    } catch (err: any) {
      const msg =
        err?.data?.message ??
        err?.message ??
        'Übergabe konnte nicht gespeichert werden';
      setSubmitError(typeof msg === 'string' ? msg : 'Übergabe fehlgeschlagen');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !booking) return null;

  const fuelLabel = fuelFull ? 'Voll' : `${fuelPercent}%`;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center" onClick={onClose}>
      <div
        className="absolute inset-0 transition-all duration-300 ease-out"
        style={{ backgroundColor: animating ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)' }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl transition-all duration-300 ease-out ${bg} ${borderColor}`}
        style={{
          transform: animating ? 'scale(1) translateY(0)' : 'scale(0.96) translateY(18px)',
          opacity: animating ? 1 : 0,
        }}
      >
        {/* Header */}
        <div className={`flex-shrink-0 px-6 pt-5 pb-4 border-b ${borderColor}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  kind === 'PICKUP'
                    ? isDarkMode
                      ? 'bg-blue-500/20'
                      : 'bg-blue-50'
                    : isDarkMode
                    ? 'bg-emerald-500/20'
                    : 'bg-emerald-50'
                }`}
              >
                <Icon name="file-signature"
                  className={`w-5 h-5 ${
                    kind === 'PICKUP'
                      ? isDarkMode
                        ? 'text-blue-400'
                        : 'text-blue-600'
                      : isDarkMode
                      ? 'text-emerald-400'
                      : 'text-emerald-600'
                  }`}
                />
              </div>
              <div className="min-w-0">
                <h2 className={`text-base font-bold ${textPrimary}`}>{title}</h2>
                <p className={`text-[11px] ${textMuted}`}>
                  {booking.vehicleName} ({booking.plate}) · {booking.customerName}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${
                isDarkMode
                  ? 'text-gray-500 hover:text-gray-300 hover:bg-neutral-800'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {kind === 'RETURN' && misuseCaseCount > 0 && (
            <div
              className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-xs ${
                isDarkMode
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <Icon name="alert-triangle" className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Für diese Buchung liegen {misuseCaseCount} Prüffall
                {misuseCaseCount === 1 ? '' : 'e'} vor. Bitte in der Buchungsdetailansicht
                einsehen — keine automatische Sperre.
              </span>
            </div>
          )}

          {/* Quick facts */}
          <div className={`rounded-xl border p-4 ${borderColor} ${cardBg}`}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <Fact icon={Car} label="Fahrzeug" value={booking.vehicleName} mutedCls={textMuted} primaryCls={textPrimary} />
              <Fact icon={User} label="Kunde" value={booking.customerName} mutedCls={textMuted} primaryCls={textPrimary} />
              <Fact
                icon={MapPin}
                label={kind === 'PICKUP' ? 'Abholstation' : 'Rückgabestation'}
                value={
                  kind === 'PICKUP'
                    ? booking.pickupLocation || '—'
                    : booking.returnLocation || booking.pickupLocation || '—'
                }
                mutedCls={textMuted}
                primaryCls={textPrimary}
              />
              <Fact
                icon={Wrench}
                label={kind === 'PICKUP' ? 'Abholung' : 'Rückgabe'}
                value={new Date(kind === 'PICKUP' ? booking.startDate : booking.endDate).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
                mutedCls={textMuted}
                primaryCls={textPrimary}
              />
            </div>
            {(kind === 'PICKUP' ? booking.handoverInstructions : booking.returnInstructions) && (
              <p className={`text-xs mt-3 pt-3 border-t ${borderColor} whitespace-pre-wrap ${textMuted}`}>
                {kind === 'PICKUP' ? booking.handoverInstructions : booking.returnInstructions}
              </p>
            )}
          </div>

          {orgStations.length > 0 && (
            <div className={`rounded-xl border p-4 ${borderColor} ${cardBg}`}>
              <label className={`text-xs font-semibold block mb-2 ${textPrimary}`}>
                Tatsächliche Station
              </label>
              <select
                value={actualStationId}
                onChange={(e) => setActualStationId(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-xs outline-none ${borderColor} ${cardBg} ${textPrimary}`}
              >
                <option value="">Geplante Station übernehmen</option>
                {(kind === 'PICKUP' ? stationsForPickup(orgStations) : stationsForReturn(orgStations)).map(
                  (s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ),
                )}
              </select>
              {kind === 'RETURN' &&
                booking.returnStationId &&
                actualStationId &&
                actualStationId !== booking.returnStationId && (
                  <p className={`text-xs mt-2 sq-tone-warning px-2 py-1.5 rounded-lg`}>
                    Rückgabe an abweichender Station — optional Transfer prüfen.
                  </p>
                )}
            </div>
          )}

          {/* V4.6.81 — Backdate pickup timestamp (PICKUP only).
              Defaults to empty (= server uses now()). Operators who need
              to record a pickup that physically happened earlier (late
              customer, dispatcher logs after the fact) type the actual
              time here. Server validates it cannot be in the future
              and cannot be more than 7 days before the scheduled
              pickup, so a typo rejects loudly instead of silently. */}
          {kind === 'PICKUP' && (
            <div className={`rounded-xl border p-4 ${borderColor} ${cardBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon name="clock" className={`w-4 h-4 ${isDarkMode ? 'text-sky-400' : 'text-sky-500'}`} />
                <label className={`text-xs font-semibold ${textPrimary}`}>
                  Tatsächlicher Pickup-Zeitpunkt
                </label>
                <span className={`text-[10px] uppercase tracking-wider ${textTertiary}`}>
                  optional
                </span>
              </div>
              <input
                type="datetime-local"
                value={performedAtLocal}
                max={new Date().toISOString().slice(0, 16)}
                onChange={(e) => setPerformedAtLocal(e.target.value)}
                className={inputCls}
              />
              <p className={`text-[11px] mt-1.5 ${textMuted}`}>
                Leer lassen = jetzt. Nur ausfüllen, wenn die Übergabe früher stattgefunden hat
                (z. B. Kunde war verspätet und wurde nachgetragen). Max. 7 Tage rückwirkend.
              </p>
              {performedAtLocal && (() => {
                const d = new Date(performedAtLocal);
                if (Number.isNaN(d.getTime())) return null;
                const scheduled = new Date(booking.startDate);
                const deltaMin = Math.round((d.getTime() - scheduled.getTime()) / 60_000);
                if (deltaMin <= 0) return null;
                const hours = Math.floor(deltaMin / 60);
                const mins = deltaMin % 60;
                const label = hours > 0 ? `${hours} h ${mins} Min.` : `${deltaMin} Min.`;
                return (
                  <div
                    className={`mt-2 flex items-center gap-1.5 text-[11px] font-semibold ${
                      isDarkMode ? 'text-amber-300' : 'text-amber-700'
                    }`}
                  >
                    <Icon name="alert-triangle" className="w-3 h-3" />
                    {label} nach geplantem Pickup — wird als Rückdatierung erfasst.
                  </div>
                );
              })()}
            </div>
          )}

          {/* Odometer + Fuel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`rounded-xl border p-4 ${borderColor} ${cardBg}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon name="gauge" className={`w-4 h-4 ${isDarkMode ? 'text-blue-400' : 'text-blue-500'}`} />
                <label className={`text-xs font-semibold ${textPrimary}`}>Kilometerstand *</label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={odometerKm}
                  onChange={(e) => setOdometerKm(e.target.value)}
                  placeholder="z.B. 48500"
                  className={inputCls}
                />
                <span className={`text-xs font-semibold ${textMuted}`}>km</span>
              </div>
              {kind === 'RETURN' && booking.pickupOdometerKm != null && (
                <p className={`text-[11px] mt-1.5 ${textMuted}`}>
                  Stand bei Pickup: {booking.pickupOdometerKm.toLocaleString('de-DE')} km
                  {odometerKm && Number(odometerKm) >= booking.pickupOdometerKm && (
                    <span className={`ml-1.5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                      · {Math.max(0, Number(odometerKm) - booking.pickupOdometerKm).toLocaleString('de-DE')} km gefahren
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className={`rounded-xl border p-4 ${borderColor} ${cardBg}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon name="fuel" className={`w-4 h-4 ${isDarkMode ? 'text-amber-400' : 'text-amber-500'}`} />
                  <label className={`text-xs font-semibold ${textPrimary}`}>Tankstand / SoC *</label>
                </div>
                <span className={`text-xs font-bold ${textPrimary}`}>{fuelLabel}</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={fuelPercent}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setFuelPercent(v);
                  setFuelFull(v >= 98);
                }}
                className="w-full accent-amber-500"
                disabled={fuelFull && fuelPercent >= 98 ? false : false}
              />
              <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fuelFull}
                  onChange={(e) => {
                    setFuelFull(e.target.checked);
                    if (e.target.checked) setFuelPercent(100);
                  }}
                  className="w-3.5 h-3.5 accent-amber-500"
                />
                <span className={`text-[11px] ${textMuted}`}>Tank voll / vollständig geladen</span>
              </label>
            </div>
          </div>

          {/* Checks */}
          <div className={`rounded-xl border p-4 ${borderColor} ${cardBg}`}>
            <div className="flex items-center gap-2 mb-3">
              <Icon name="sparkles" className={`w-4 h-4 ${isDarkMode ? 'text-purple-400' : 'text-purple-500'}`} />
              <h3 className={`text-xs font-semibold ${textPrimary}`}>Fahrzeugkontrolle</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              <CheckRow isDarkMode={isDarkMode} label="Außen sauber" checked={checks.exteriorClean} onToggle={() => toggleCheck('exteriorClean')} />
              <CheckRow isDarkMode={isDarkMode} label="Innen sauber" checked={checks.interiorClean} onToggle={() => toggleCheck('interiorClean')} />
              <CheckRow isDarkMode={isDarkMode} label="Bereifung jahreszeitgerecht" checked={checks.tiresSeasonOk} onToggle={() => toggleCheck('tiresSeasonOk')} />
              <CheckRow isDarkMode={isDarkMode} label="Warnleuchten aktiv" checked={checks.warningLightsOn} onToggle={() => toggleCheck('warningLightsOn')} accent="red" />
            </div>
            {checks.warningLightsOn && (
              <textarea
                value={warningLightsNotes}
                onChange={(e) => setWarningLightsNotes(e.target.value)}
                placeholder="Welche Warnleuchten / Fehlermeldungen?"
                rows={2}
                className={`mt-3 ${inputCls}`}
              />
            )}
          </div>

          {/* Damages */}
          <div className={`rounded-xl border p-4 ${borderColor} ${cardBg}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="shield-alert" className={`w-4 h-4 ${isDarkMode ? 'text-orange-400' : 'text-orange-500'}`} />
                <h3 className={`text-xs font-semibold ${textPrimary}`}>Schäden</h3>
                <span className={`text-[10px] ${textTertiary}`}>
                  ({selectedDamageIds.size}/{damages.length} ausgewählt)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setNewDamageOpen((v) => !v)}
                className={`text-[11px] font-semibold inline-flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                  isDarkMode
                    ? 'bg-neutral-700 text-gray-200 hover:bg-neutral-600'
                    : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Icon name="plus" className="w-3 h-3" />
                Neuen Schaden erfassen
              </button>
            </div>

            {newDamageOpen && (
              <div className={`mb-3 rounded-lg border p-3 ${borderColor} ${isDarkMode ? 'bg-neutral-900' : 'bg-white'}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <select
                    value={newDamage.damageType}
                    onChange={(e) => setNewDamage((d) => ({ ...d, damageType: e.target.value }))}
                    className={inputCls}
                  >
                    {DAMAGE_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <select
                    value={newDamage.severity}
                    onChange={(e) => setNewDamage((d) => ({ ...d, severity: e.target.value }))}
                    className={inputCls}
                  >
                    {DAMAGE_SEVERITY_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Position (z.B. Stoßstange vorne links)"
                    value={newDamage.locationLabel}
                    onChange={(e) => setNewDamage((d) => ({ ...d, locationLabel: e.target.value }))}
                    className={inputCls}
                  />
                  <input
                    type="text"
                    placeholder="Beschreibung"
                    value={newDamage.description}
                    onChange={(e) => setNewDamage((d) => ({ ...d, description: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div className="flex justify-end gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={() => setNewDamageOpen(false)}
                    className={`text-[11px] px-3 py-1.5 rounded-md ${
                      isDarkMode ? 'text-gray-400 hover:bg-neutral-800' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateDamage}
                    disabled={creatingDamage}
                    className={`text-[11px] font-semibold px-3 py-1.5 rounded-md inline-flex items-center gap-1 ${
                      creatingDamage
                        ? 'bg-orange-300 text-white cursor-not-allowed'
                        : 'bg-orange-500 text-white hover:bg-orange-600'
                    }`}
                  >
                    {creatingDamage ? <Icon name="loader-2" className="w-3 h-3 animate-spin" /> : <Icon name="plus" className="w-3 h-3" />}
                    Anlegen
                  </button>
                </div>
              </div>
            )}

            {loadingDamages ? (
              <div className={`flex items-center gap-2 text-xs ${textMuted}`}>
                <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> Schäden werden geladen…
              </div>
            ) : damages.length === 0 ? (
              <p className={`text-[11px] ${textMuted}`}>
                Keine Schäden dokumentiert. Falls beim {kind === 'PICKUP' ? 'Pickup' : 'Return'} etwas auffällt, bitte
                oben „Neuen Schaden erfassen" nutzen.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {damages.map((d) => {
                  const selected = selectedDamageIds.has(d.id);
                  return (
                    <label
                      key={d.id}
                      className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                        selected
                          ? isDarkMode
                            ? 'bg-orange-500/10 border-orange-500/40'
                            : 'bg-orange-50 border-orange-200'
                          : isDarkMode
                          ? 'border-neutral-700 hover:bg-neutral-800/60'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleDamage(d.id)}
                        className="mt-0.5 accent-orange-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-semibold ${textPrimary}`}>{d.damageType}</span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                              d.severity === 'MINOR'
                                ? isDarkMode
                                  ? 'bg-green-500/20 text-green-300'
                                  : 'bg-green-100 text-green-700'
                                : d.severity === 'MODERATE'
                                ? isDarkMode
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-amber-100 text-amber-700'
                                : isDarkMode
                                ? 'bg-red-500/20 text-red-300'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {d.severity}
                          </span>
                          {d.locationLabel && (
                            <span className={`text-[10px] ${textMuted}`}>· {d.locationLabel}</span>
                          )}
                        </div>
                        {d.description && (
                          <p className={`text-[11px] mt-0.5 ${textMuted}`}>{d.description}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Staff */}
          <div className={`rounded-xl border p-4 ${borderColor} ${cardBg}`}>
            <div className="flex items-center gap-2 mb-3">
              <Icon name="user" className={`w-4 h-4 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-500'}`} />
              <h3 className={`text-xs font-semibold ${textPrimary}`}>Übergabe durch *</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {staffOptions.length > 0 ? (
                <select
                  value={staffId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setStaffId(id);
                    const match = staffOptions.find((s) => s.id === id);
                    setStaffName(match?.name ?? '');
                  }}
                  className={inputCls}
                >
                  <option value="">— Mitarbeiter wählen —</option>
                  {staffOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="Name"
                  className={inputCls}
                />
              )}
              {staffOptions.length > 0 && (
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="oder Name frei eingeben"
                  className={inputCls}
                />
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={`text-xs font-semibold ${textPrimary}`}>Notizen</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Zusätzliche Bemerkungen zur Übergabe"
              className={`mt-1.5 ${inputCls}`}
            />
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SignaturePad
              isDarkMode={isDarkMode}
              label="Unterschrift Kunde"
              typedName={customerSigName}
              onTypedNameChange={setCustomerSigName}
              dataUrl={customerSigData}
              onDataUrlChange={setCustomerSigData}
              required
            />
            <SignaturePad
              isDarkMode={isDarkMode}
              label="Unterschrift Mitarbeiter"
              typedName={staffSigName}
              onTypedNameChange={setStaffSigName}
              dataUrl={staffSigData}
              onDataUrlChange={setStaffSigData}
              required
            />
          </div>

          {/* Ack */}
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checks.documentsAcknowledged}
              onChange={() => toggleCheck('documentsAcknowledged')}
              className="mt-0.5 accent-blue-500"
            />
            <span className={`text-[11px] ${textMuted}`}>
              Hiermit wird bestätigt, dass Mietvertrag, Fahrzeugschein und alle Übergabedokumente mit dem Kunden
              durchgesprochen wurden und die Angaben zum Fahrzeugzustand, Kilometerstand und Tankstand korrekt sind. *
            </span>
          </label>

          {submitError && (
            <div
              className={`flex items-start gap-2 p-3 rounded-lg border ${
                isDarkMode
                  ? 'bg-red-900/20 border-red-800/40 text-red-300'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}
            >
              <Icon name="alert-triangle" className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="text-xs">{submitError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex-shrink-0 px-6 py-4 border-t ${borderColor} flex items-center justify-between gap-3`}>
          <div className={`text-[11px] ${textTertiary}`}>
            {kind === 'PICKUP' ? 'CONFIRMED → ACTIVE' : 'ACTIVE → COMPLETED'}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={`text-xs font-semibold px-4 py-2 rounded-lg ${
                isDarkMode
                  ? 'text-gray-300 hover:bg-neutral-800'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className={`inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg text-white shadow-sm transition-all ${
                !canSubmit || submitting
                  ? primaryColor === 'blue'
                    ? 'bg-blue-300 cursor-not-allowed'
                    : 'bg-emerald-300 cursor-not-allowed'
                  : primaryColor === 'blue'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {submitting ? <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> : <Icon name="check-circle" className="w-3.5 h-3.5" />}
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  mutedCls,
  primaryCls,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mutedCls: string;
  primaryCls: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className={`w-3.5 h-3.5 mt-0.5 ${mutedCls}`} />
      <div className="min-w-0">
        <div className={`text-[10px] uppercase tracking-wider ${mutedCls}`}>{label}</div>
        <div className={`text-xs font-semibold truncate ${primaryCls}`}>{value}</div>
      </div>
    </div>
  );
}

function CheckRow({
  isDarkMode,
  label,
  checked,
  onToggle,
  accent = 'blue',
}: {
  isDarkMode: boolean;
  label: string;
  checked: boolean;
  onToggle: () => void;
  accent?: 'blue' | 'red';
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className={accent === 'red' ? 'accent-red-500' : 'accent-blue-500'}
      />
      <span className={`text-[11px] ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{label}</span>
    </label>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api, type BookingDetailDto, type CustomerApiRecord, type OperatorBookingUpdatePayload, type Station } from '../../lib/api';
import { buildBookingCreatePayload } from '../../rental/lib/entityMappers';
import { StationSelectFields } from '../../rental/components/stations/StationSelectFields';
import { useRentalOrg } from '../../rental/RentalContext';
import { OperatorGlassCard } from '../components/OperatorGlassCard';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useOperatorVehiclesData } from '../hooks/useOperatorVehiclesData';
import { useOperatorBookingMutations } from '../hooks/useOperatorBookingMutations';
import type { OperatorSheetAction } from '../lib/operatorTypes';
import { OperatorBookingSheetShell } from './operatorBookingSheetShell';
import {
  customerDisplayName,
  isSameLocalInstant,
  localDateTimeToIso,
  operatorBookingFieldClass,
  operatorBookingTextareaClass,
  splitLocalDateTime,
  toLocalDateTimeInput,
  vehicleDisplayLabel,
} from './operatorBooking.utils';

type BookingFormAction =
  | Extract<OperatorSheetAction, { type: 'booking-create' }>
  | Extract<OperatorSheetAction, { type: 'booking-edit' }>;

interface OperatorBookingFormSheetProps {
  action: BookingFormAction;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{children}</h3>
  );
}

export function OperatorBookingFormSheet({ action }: OperatorBookingFormSheetProps) {
  const { orgId } = useRentalOrg();
  const { closeSheet } = useOperatorShell();
  const { allVehicles } = useOperatorVehiclesData();
  const { mutating, error, clearError, createBooking, updateBooking } = useOperatorBookingMutations();

  const isEdit = action.type === 'booking-edit';
  const mode = isEdit ? 'edit' : 'create';
  const bookingId = action.bookingId;

  const [detail, setDetail] = useState<BookingDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(isEdit);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<CustomerApiRecord[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerId, setCustomerId] = useState(action.prefillCustomerId ?? '');

  const [vehicleId, setVehicleId] = useState(action.prefillVehicleId ?? '');
  const [vehicleSearch, setVehicleSearch] = useState('');

  const [startLocal, setStartLocal] = useState(action.prefillStartDate ? toLocalDateTimeInput(action.prefillStartDate) : '');
  const [endLocal, setEndLocal] = useState(action.prefillEndDate ? toLocalDateTimeInput(action.prefillEndDate) : '');

  const [pickupStationId, setPickupStationId] = useState('');
  const [returnStationId, setReturnStationId] = useState('');
  const [sameReturnStation, setSameReturnStation] = useState(true);
  const [stations, setStations] = useState<Station[]>([]);

  const [status, setStatus] = useState<'PENDING' | 'CONFIRMED'>('PENDING');
  const [notes, setNotes] = useState('');
  const [kmIncluded, setKmIncluded] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const filteredVehicles = useMemo(() => {
    const q = vehicleSearch.trim().toLowerCase();
    if (!q) return allVehicles;
    return allVehicles.filter((v) => vehicleDisplayLabel(v).toLowerCase().includes(q));
  }, [allVehicles, vehicleSearch]);

  const selectedVehicle = allVehicles.find((v) => v.id === vehicleId);
  const selectedCustomer = customers.find((c) => c.id === customerId);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    api.stations
      .list(orgId, { selectableOnly: true })
      .then((rows) => {
        if (!cancelled) setStations(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setStations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId || isEdit || !action.prefillCustomerId) return;
    let cancelled = false;
    api.customers
      .get(orgId, action.prefillCustomerId)
      .then((c) => {
        if (!cancelled) {
          setCustomers([c]);
          setCustomerId(c.id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [orgId, isEdit, action.prefillCustomerId]);

  useEffect(() => {
    if (!orgId || isEdit) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setCustomersLoading(true);
      api.customers
        .list(orgId, { search: customerSearch.trim() || undefined, limit: 50 })
        .then((res) => {
          if (!cancelled) setCustomers(res.data ?? []);
        })
        .catch(() => {
          if (!cancelled) setCustomers([]);
        })
        .finally(() => {
          if (!cancelled) setCustomersLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [orgId, customerSearch, isEdit]);

  useEffect(() => {
    if (!isEdit || !orgId || !bookingId) {
      if (isEdit && !bookingId) {
        setDetailLoading(false);
        setDetailError('Buchungs-ID fehlt');
      }
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    api.bookings
      .detail(orgId, bookingId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setVehicleId(d.vehicle.vehicleId);
        setCustomerId(d.customer.customerId);
        setStartLocal(toLocalDateTimeInput(d.core.startDate));
        setEndLocal(toLocalDateTimeInput(d.core.endDate));
        setPickupStationId(d.core.pickupStationId ?? '');
        setReturnStationId(d.core.returnStationId ?? '');
        setSameReturnStation(
          !d.core.pickupStationId ||
            !d.core.returnStationId ||
            d.core.pickupStationId === d.core.returnStationId,
        );
        setNotes(d.core.notes ?? '');
        setKmIncluded(d.core.kmIncluded != null ? String(d.core.kmIncluded) : '');
        setCustomers([
          {
            id: d.customer.customerId,
            name: d.customer.fullName,
            email: d.customer.email,
            phone: d.customer.phone,
          },
        ]);
      })
      .catch((e) => {
        if (!cancelled) setDetailError(e instanceof Error ? e.message : 'Details nicht verfügbar');
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isEdit, orgId, bookingId]);

  useEffect(() => {
    if (isEdit || !selectedVehicle?.stationId || pickupStationId) return;
    const match = stations.find((s) => s.id === selectedVehicle.stationId);
    if (match) {
      setPickupStationId(match.id);
      if (sameReturnStation) setReturnStationId(match.id);
    }
  }, [isEdit, selectedVehicle, stations, pickupStationId, sameReturnStation]);

  const handleSuccess = useCallback(() => {
    action.onSuccess?.();
    closeSheet();
  }, [action, closeSheet]);

  const handleSubmit = async () => {
    setFormError(null);
    clearError();

    if (!orgId) {
      setFormError('Organisation nicht geladen');
      return;
    }

    const startIso = localDateTimeToIso(startLocal);
    const endIso = localDateTimeToIso(endLocal);
    if (!startIso || !endIso) {
      setFormError('Bitte gültigen Abhol- und Rückgabezeitpunkt angeben.');
      return;
    }
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      setFormError('Rückgabe muss nach der Abholung liegen.');
      return;
    }

    const effectiveReturnStationId = sameReturnStation ? pickupStationId : returnStationId;
    if (!pickupStationId || !effectiveReturnStationId) {
      setFormError('Bitte Abhol- und Rückgabestation wählen.');
      return;
    }

    if (mode === 'create') {
      if (!customerId) {
        setFormError('Bitte einen Kunden wählen.');
        return;
      }
      if (!vehicleId) {
        setFormError('Bitte ein Fahrzeug wählen.');
        return;
      }

      const { date: pickupDate, time: pickupTime } = splitLocalDateTime(startLocal);
      const { date: returnDate, time: returnTime } = splitLocalDateTime(endLocal);
      const km = kmIncluded.trim() ? Number(kmIncluded) : undefined;

      const payload = buildBookingCreatePayload({
        customerId,
        vehicleId,
        pickupDate,
        pickupTime,
        returnDate,
        returnTime,
        pickupStationId,
        returnStationId: effectiveReturnStationId,
        notes: notes.trim(),
        status,
        includedKm: km != null && Number.isFinite(km) ? km : undefined,
        currency: 'eur',
      });

      await createBooking(payload, handleSuccess);
      return;
    }

    if (!detail || !bookingId) {
      setFormError('Buchungsdetails nicht geladen');
      return;
    }

    const patch: OperatorBookingUpdatePayload = {};
    if (!isSameLocalInstant(detail.core.startDate, startLocal)) patch.startDate = startIso;
    if (!isSameLocalInstant(detail.core.endDate, endLocal)) patch.endDate = endIso;
    if (notes !== (detail.core.notes ?? '')) patch.notes = notes;

    const km = kmIncluded.trim() ? Number(kmIncluded) : null;
    if (km != null && Number.isFinite(km) && km !== detail.core.kmIncluded) {
      patch.kmIncluded = km;
    }

    if (vehicleId && vehicleId !== detail.vehicle.vehicleId) {
      patch.vehicle = { connect: { id: vehicleId } };
    }

    if (pickupStationId && pickupStationId !== detail.core.pickupStationId) {
      patch.pickupStationId = pickupStationId;
    }
    if (effectiveReturnStationId && effectiveReturnStationId !== detail.core.returnStationId) {
      patch.returnStationId = effectiveReturnStationId;
    }

    if (Object.keys(patch).length === 0) {
      setFormError('Keine Änderungen zum Speichern');
      return;
    }

    await updateBooking(bookingId, patch, handleSuccess);
  };

  const title = isEdit ? 'Buchung bearbeiten' : 'Buchung aufnehmen';
  const displayError = formError || error || detailError;

  return (
    <OperatorBookingSheetShell
      title={title}
      subtitle={detail?.core.bookingNumber}
      onClose={closeSheet}
    >
      {detailLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="space-y-5 pb-24">
          {/* 1. Kunde */}
          <OperatorGlassCard className="space-y-3 p-4">
            <SectionTitle>Kunde</SectionTitle>
            {isEdit ? (
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {detail?.customer.fullName ?? '—'}
                </p>
                {detail?.customer.phone && (
                  <p className="text-xs text-muted-foreground">{detail.customer.phone}</p>
                )}
                {detail?.customer.email && (
                  <p className="text-xs text-muted-foreground">{detail.customer.email}</p>
                )}
              </div>
            ) : (
              <>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Suchen</span>
                  <input
                    type="search"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Name, E-Mail, Telefon…"
                    className={operatorBookingFieldClass}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-muted-foreground">Kunde *</span>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className={operatorBookingFieldClass}
                    disabled={customersLoading}
                  >
                    <option value="">Kunde wählen…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {customerDisplayName(c)}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedCustomer && (
                  <p className="text-xs text-muted-foreground">{customerDisplayName(selectedCustomer)}</p>
                )}
              </>
            )}
          </OperatorGlassCard>

          {/* 2. Fahrzeug */}
          <OperatorGlassCard className="space-y-3 p-4">
            <SectionTitle>Fahrzeug</SectionTitle>
            {!isEdit && (
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Suchen</span>
                <input
                  type="search"
                  value={vehicleSearch}
                  onChange={(e) => setVehicleSearch(e.target.value)}
                  placeholder="Kennzeichen, Modell…"
                  className={operatorBookingFieldClass}
                />
              </label>
            )}
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Fahrzeug *</span>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className={operatorBookingFieldClass}
              >
                <option value="">Fahrzeug wählen…</option>
                {filteredVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleDisplayLabel(v)}
                    {v.station ? ` · ${v.station}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </OperatorGlassCard>

          {/* 3. Zeitraum */}
          <OperatorGlassCard className="space-y-3 p-4">
            <SectionTitle>Zeitraum</SectionTitle>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Abholung *</span>
              <input
                type="datetime-local"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                className={operatorBookingFieldClass}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Rückgabe *</span>
              <input
                type="datetime-local"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
                className={operatorBookingFieldClass}
              />
            </label>
            {!isEdit && (
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'PENDING' | 'CONFIRMED')}
                  className={operatorBookingFieldClass}
                >
                  <option value="PENDING">Ausstehend</option>
                  <option value="CONFIRMED">Bestätigt</option>
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Bestätigung wird vom Backend anhand der Kundenfreigabe geprüft.
                </p>
              </label>
            )}
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Km inklusive (optional)</span>
              <input
                type="number"
                min={0}
                value={kmIncluded}
                onChange={(e) => setKmIncluded(e.target.value)}
                placeholder="z. B. 300"
                className={operatorBookingFieldClass}
              />
            </label>
          </OperatorGlassCard>

          {/* 4. Stationen */}
          <OperatorGlassCard className="space-y-3 p-4">
            <SectionTitle>Stationen</SectionTitle>
            <StationSelectFields
              stations={stations}
              pickupStationId={pickupStationId}
              returnStationId={returnStationId}
              sameReturnStation={sameReturnStation}
              onPickupChange={(id) => {
                setPickupStationId(id);
                if (sameReturnStation) setReturnStationId(id);
              }}
              onReturnChange={setReturnStationId}
              onSameReturnChange={setSameReturnStation}
              compact
              touchFriendly
            />
          </OperatorGlassCard>

          {/* 5. Hinweise */}
          <OperatorGlassCard className="space-y-3 p-4">
            <SectionTitle>Hinweise</SectionTitle>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Notizen</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Interne Hinweise zur Buchung…"
                className={operatorBookingTextareaClass}
              />
            </label>
          </OperatorGlassCard>

          {displayError && (
            <OperatorGlassCard className="border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] p-4">
              <p className="text-sm font-semibold text-[color:var(--status-critical)]">{displayError}</p>
            </OperatorGlassCard>
          )}

          <div className="fixed inset-x-0 bottom-0 z-[131] border-t border-border/50 bg-background/95 px-4 py-3 backdrop-blur-md"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <button
              type="button"
              disabled={mutating || detailLoading}
              onClick={() => void handleSubmit()}
              className="sq-press min-h-[48px] w-full rounded-xl bg-[color:var(--brand)] font-semibold text-white disabled:opacity-50"
            >
              {mutating ? 'Speichern…' : isEdit ? 'Änderungen speichern' : 'Buchung anlegen'}
            </button>
          </div>
        </div>
      )}
    </OperatorBookingSheetShell>
  );
}

import { useEffect, useState } from 'react';
import { Icon } from '../ui/Icon';
import type { BookingDetailDto, Station } from '../../../lib/api';
import { api } from '../../../lib/api';
import { StationSelectFields } from '../stations/StationSelectFields';
import {
  bookingEditBaselineFromDetail,
  bookingEditFormFromDetail,
  type BookingEditFormState,
} from '../../lib/booking-commands';
import { useBookingMutations } from '../../hooks/useBookingMutations';

interface BookingEditDialogProps {
  orgId: string;
  detail: BookingDetailDto;
  onClose: () => void;
  onSaved: () => void;
}

export function BookingEditDialog({ orgId, detail, onClose, onSaved }: BookingEditDialogProps) {
  const baseline = bookingEditBaselineFromDetail(detail);
  const [form, setForm] = useState<BookingEditFormState>(() => bookingEditFormFromDetail(detail));
  const [stations, setStations] = useState<Station[]>([]);
  const { mutating, error, clearError, updateBookingFields } = useBookingMutations();

  useEffect(() => {
    setForm(bookingEditFormFromDetail(detail));
    clearError();
  }, [detail, clearError]);

  useEffect(() => {
    let cancelled = false;
    api.stations
      .list(orgId)
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

  const save = async () => {
    const result = await updateBookingFields(baseline, form, {
      previousVehicleId: detail.vehicle.vehicleId,
      onSuccess: async () => {
        onSaved();
      },
    });
    if (result) onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 overlay-scrim" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg mx-4 rounded-lg shadow-2xl border surface-premium border-border overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-bold">Buchung bearbeiten</h3>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted">
            <Icon name="x" className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4 text-xs">
          <p className="text-muted-foreground">
            {detail.core.bookingNumber} · Kunde #{detail.customer.customerId.slice(0, 8)} · Fahrzeug #
            {detail.vehicle.vehicleId.slice(0, 8)}
          </p>

          {error && (
            <div className="rounded-lg p-3 sq-tone-critical text-[11px]">
              <p className="font-semibold">{error.title}</p>
              <p className="mt-1">{error.description}</p>
            </div>
          )}

          <Field label="Abholung">
            <input
              type="datetime-local"
              value={form.startLocal}
              onChange={(e) => setForm((f) => ({ ...f, startLocal: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-[color:var(--input-background)]"
            />
          </Field>
          <Field label="Rückgabe">
            <input
              type="datetime-local"
              value={form.endLocal}
              onChange={(e) => setForm((f) => ({ ...f, endLocal: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-[color:var(--input-background)]"
            />
          </Field>
          <Field label="Km inklusive">
            <input
              type="number"
              value={form.kmIncluded}
              onChange={(e) => setForm((f) => ({ ...f, kmIncluded: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-[color:var(--input-background)]"
            />
          </Field>
          <Field label="Stationen">
            <StationSelectFields
              stations={stations}
              pickupStationId={form.pickupStationId}
              returnStationId={form.returnStationId}
              sameReturnStation={form.sameReturnStation}
              onPickupChange={(id) => {
                setForm((f) => ({
                  ...f,
                  pickupStationId: id,
                  returnStationId: f.sameReturnStation ? id : f.returnStationId,
                }));
              }}
              onReturnChange={(id) => setForm((f) => ({ ...f, returnStationId: id }))}
              onSameReturnChange={(same) =>
                setForm((f) => ({
                  ...f,
                  sameReturnStation: same,
                  returnStationId: same ? f.pickupStationId : f.returnStationId,
                }))
              }
              compact
            />
          </Field>
          <Field label="Notizen">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-border bg-[color:var(--input-background)] resize-none"
            />
          </Field>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-xs border border-border hover:bg-muted">
            Abbrechen
          </button>
          <button
            type="button"
            disabled={mutating}
            onClick={() => void save()}
            className="px-4 py-2 rounded-lg text-xs font-semibold sq-tone-brand disabled:opacity-60"
          >
            {mutating ? 'Speichern…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}

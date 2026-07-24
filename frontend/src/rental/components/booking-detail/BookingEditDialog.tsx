import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { FormDialog } from '../../../components/patterns';
import type { BookingDetailDto, Station } from '../../../lib/api';
import { api } from '../../../lib/api';
import { StationSelectFields } from '../stations/StationSelectFields';
import {
  bookingEditBaselineFromDetail,
  bookingEditFormFromDetail,
  type BookingEditFormState,
} from '../../lib/booking-commands';
import { useBookingMutations } from '../../hooks/useBookingMutations';
import { useOrgTimezone } from '../../hooks/useOrgTimezone';

interface BookingEditDialogProps {
  open: boolean;
  orgId: string;
  detail: BookingDetailDto;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function BookingEditDialog({
  open,
  orgId,
  detail,
  onOpenChange,
  onSaved,
}: BookingEditDialogProps) {
  const { timezone } = useOrgTimezone(orgId);
  const baseline = bookingEditBaselineFromDetail(detail);
  const [form, setForm] = useState<BookingEditFormState>(() =>
    bookingEditFormFromDetail(detail, timezone),
  );
  const [stations, setStations] = useState<Station[]>([]);
  const { mutating, error, clearError, updateBookingFields } = useBookingMutations();

  useEffect(() => {
    if (!open) return;
    setForm(bookingEditFormFromDetail(detail, timezone));
    clearError();
  }, [detail, timezone, clearError, open]);

  useEffect(() => {
    if (!open) return;
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
  }, [orgId, open]);

  const save = async () => {
    const result = await updateBookingFields(baseline, form, {
      previousVehicleId: detail.vehicle.vehicleId,
      onSuccess: async () => {
        onSaved();
      },
    });
    if (result) onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Buchung bearbeiten"
      description={`${detail.core.bookingNumber} · Kunde #${detail.customer.customerId.slice(0, 8)} · Fahrzeug #${detail.vehicle.vehicleId.slice(0, 8)}`}
      bodyClassName="text-xs"
      footer={
        <>
          <Button type="button" variant="neutral" size="sm" disabled={mutating} onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button type="button" size="sm" disabled={mutating} onClick={() => void save()}>
            {mutating ? 'Speichern…' : 'Speichern'}
          </Button>
        </>
      }
    >
      {error && (
        <div className="rounded-lg p-3 sq-tone-critical text-[11px] mb-4" role="alert">
          <p className="font-semibold">{error.title}</p>
          <p className="mt-1">{error.description}</p>
        </div>
      )}

      <div className="space-y-4">
        <Field label="Abholung" htmlFor="booking-edit-start">
          <input
            id="booking-edit-start"
            type="datetime-local"
            value={form.startLocal}
            onChange={(e) => setForm((f) => ({ ...f, startLocal: e.target.value }))}
            className="w-full min-h-11 px-3 py-2 rounded-lg border border-border bg-[color:var(--input-background)]"
          />
        </Field>
        <Field label="Rückgabe" htmlFor="booking-edit-end">
          <input
            id="booking-edit-end"
            type="datetime-local"
            value={form.endLocal}
            onChange={(e) => setForm((f) => ({ ...f, endLocal: e.target.value }))}
            className="w-full min-h-11 px-3 py-2 rounded-lg border border-border bg-[color:var(--input-background)]"
          />
        </Field>
        <Field label="Km inklusive" htmlFor="booking-edit-km">
          <input
            id="booking-edit-km"
            type="number"
            value={form.kmIncluded}
            onChange={(e) => setForm((f) => ({ ...f, kmIncluded: e.target.value }))}
            className="w-full min-h-11 px-3 py-2 rounded-lg border border-border bg-[color:var(--input-background)]"
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
        <Field label="Notizen" htmlFor="booking-edit-notes">
          <textarea
            id="booking-edit-notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={4}
            className="w-full px-3 py-2 rounded-lg border border-border bg-[color:var(--input-background)] resize-none"
          />
        </Field>
      </div>
    </FormDialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1" htmlFor={htmlFor}>
      <span className="font-semibold text-foreground">{label}</span>
      {children}
    </label>
  );
}

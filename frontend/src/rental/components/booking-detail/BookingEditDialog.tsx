import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Icon } from '../ui/Icon';
import { api, type BookingDetailDto, type Station } from '../../../lib/api';
import { StationSelectFields } from '../stations/StationSelectFields';

interface BookingEditDialogProps {
  orgId: string;
  detail: BookingDetailDto;
  onClose: () => void;
  onSaved: () => void;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BookingEditDialog({ orgId, detail, onClose, onSaved }: BookingEditDialogProps) {
  const [startLocal, setStartLocal] = useState(toLocalInput(detail.core.startDate));
  const [endLocal, setEndLocal] = useState(toLocalInput(detail.core.endDate));
  const [notes, setNotes] = useState(detail.core.notes ?? '');
  const [kmIncluded, setKmIncluded] = useState(
    detail.core.kmIncluded != null ? String(detail.core.kmIncluded) : '',
  );
  const [pickupStationId, setPickupStationId] = useState(detail.core.pickupStationId ?? '');
  const [returnStationId, setReturnStationId] = useState(detail.core.returnStationId ?? '');
  const [sameReturnStation, setSameReturnStation] = useState(
    !detail.core.pickupStationId ||
      !detail.core.returnStationId ||
      detail.core.pickupStationId === detail.core.returnStationId,
  );
  const [stations, setStations] = useState<Station[]>([]);
  const [saving, setSaving] = useState(false);

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
    const patch: Record<string, unknown> = {};
    if (startLocal) {
      const d = new Date(startLocal);
      if (!Number.isNaN(d.getTime())) patch.startDate = d.toISOString();
    }
    if (endLocal) {
      const d = new Date(endLocal);
      if (!Number.isNaN(d.getTime())) patch.endDate = d.toISOString();
    }
    if (notes !== (detail.core.notes ?? '')) patch.notes = notes;
    const km = kmIncluded.trim() ? Number(kmIncluded) : null;
    if (km != null && Number.isFinite(km) && km !== detail.core.kmIncluded) {
      patch.kmIncluded = km;
    }
    if (pickupStationId && pickupStationId !== detail.core.pickupStationId) {
      patch.pickupStationId = pickupStationId;
    }
    const effectiveReturn = sameReturnStation ? pickupStationId : returnStationId;
    if (effectiveReturn && effectiveReturn !== detail.core.returnStationId) {
      patch.returnStationId = effectiveReturn;
    }

    if (Object.keys(patch).length === 0) {
      toast.error('Keine Änderungen zum Speichern');
      return;
    }

    setSaving(true);
    try {
      await api.bookings.update(orgId, detail.core.bookingId, patch);
      toast.success('Buchung gespeichert');
      onSaved();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Speichern fehlgeschlagen';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
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
          <Field label="Abholung">
            <input
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-[color:var(--input-background)]"
            />
          </Field>
          <Field label="Rückgabe">
            <input
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-[color:var(--input-background)]"
            />
          </Field>
          <Field label="Km inklusive">
            <input
              type="number"
              value={kmIncluded}
              onChange={(e) => setKmIncluded(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-[color:var(--input-background)]"
            />
          </Field>
          <Field label="Stationen">
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
            />
          </Field>
          <Field label="Notizen">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
            disabled={saving}
            onClick={save}
            className="px-4 py-2 rounded-lg text-xs font-semibold sq-tone-brand disabled:opacity-60"
          >
            {saving ? 'Speichern…' : 'Speichern'}
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

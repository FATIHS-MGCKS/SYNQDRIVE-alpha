import { Sparkles } from 'lucide-react';
import {
  formatDamageSource,
  formatDamageType,
  formatSeverity,
  type DamageSource,
} from '../../rental/lib/damage.types';
import {
  OPERATOR_DAMAGE_LOCATION_CHIPS,
  type OperatorDamageFormState,
} from './operatorDamagePayload';
import type { OperatorDamagePhotoItem } from './OperatorDamagePhotoStep';

const RENTAL_IMPACT_LABELS: Record<string, string> = {
  NONE: 'Kein Einfluss',
  WATCH: 'Beobachten',
  BLOCK_RENTAL: 'Vermietung blockiert',
  SAFETY_CRITICAL: 'Sicherheitskritisch',
};

interface Props {
  vehicleLabel: string;
  plate: string;
  bookingLabel?: string | null;
  customerName?: string | null;
  source: DamageSource;
  form: OperatorDamageFormState;
  photos: OperatorDamagePhotoItem[];
  onOpenAiUpload?: () => void;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 py-2.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="max-w-[60%] text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function OperatorDamageReviewStep({
  vehicleLabel,
  plate,
  bookingLabel,
  customerName,
  source,
  form,
  photos,
  onOpenAiUpload,
}: Props) {
  const location =
    form.locationLabel.trim() ||
    OPERATOR_DAMAGE_LOCATION_CHIPS.find((c) => c.id === form.locationChipId)?.label ||
    '—';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border surface-premium p-4">
        <ReviewRow label="Fahrzeug" value={vehicleLabel} />
        <ReviewRow label="Kennzeichen" value={plate || '—'} />
        {bookingLabel && <ReviewRow label="Buchung" value={bookingLabel} />}
        {customerName && <ReviewRow label="Kunde" value={customerName} />}
        <ReviewRow label="Quelle" value={formatDamageSource(source)} />
        <ReviewRow label="Typ" value={formatDamageType(form.damageType)} />
        <ReviewRow label="Schweregrad" value={formatSeverity(form.severity)} />
        <ReviewRow label="Position" value={location} />
        <ReviewRow label="Vermietung" value={RENTAL_IMPACT_LABELS[form.rentalImpact] ?? form.rentalImpact} />
        {form.description.trim() && (
          <ReviewRow label="Beschreibung" value={form.description.trim()} />
        )}
        <ReviewRow label="Fotos" value={`${photos.length}`} />
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <img
              key={p.id}
              src={p.previewUrl}
              alt="Vorschau"
              className="aspect-square rounded-xl border border-border object-cover"
            />
          ))}
        </div>
      )}

      {onOpenAiUpload && (
        <button
          type="button"
          onClick={onOpenAiUpload}
          className="sq-press flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-border/60 surface-premium px-4 text-left"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]">
            <Sparkles className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-foreground">
              Schadensbeleg per AI Upload
            </span>
            <span className="text-[11px] text-muted-foreground">
              Optional — Schadensbericht per AI extrahieren (nach Speichern mit damageId verknüpfbar)
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

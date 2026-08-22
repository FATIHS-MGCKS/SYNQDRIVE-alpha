import { Sparkles } from 'lucide-react';
import type { DamageSource } from '../../rental/lib/damage.types';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  operatorDamageCaptureDamageTypeLabel,
  operatorDamageCaptureLocationChipLabel,
  operatorDamageCaptureRentalImpactLabel,
  operatorDamageCaptureSeverityLabel,
  operatorDamageCaptureSourceLabel,
} from '../lib/operator-damage-capture-i18n';
import {
  OPERATOR_DAMAGE_LOCATION_CHIPS,
  type OperatorDamageFormState,
} from './operatorDamagePayload';
import type { OperatorDamagePhotoItem } from './OperatorDamagePhotoStep';

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
  const { t, locale } = useLanguage();
  const emptyValue = t('invoices.list.emptyValue');

  const location =
    form.locationLabel.trim() ||
    (form.locationChipId
      ? operatorDamageCaptureLocationChipLabel(locale, form.locationChipId)
      : emptyValue);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border surface-premium p-4">
        <ReviewRow label={t('operator.damageCapture.field.vehicle')} value={vehicleLabel} />
        <ReviewRow label={t('operator.damageCapture.field.plate')} value={plate || emptyValue} />
        {bookingLabel && (
          <ReviewRow label={t('operator.damageCapture.field.booking')} value={bookingLabel} />
        )}
        {customerName && (
          <ReviewRow label={t('operator.damageCapture.field.customer')} value={customerName} />
        )}
        <ReviewRow
          label={t('operator.damageCapture.field.source')}
          value={operatorDamageCaptureSourceLabel(locale, source)}
        />
        <ReviewRow
          label={t('operator.damageCapture.field.type')}
          value={operatorDamageCaptureDamageTypeLabel(locale, form.damageType)}
        />
        <ReviewRow
          label={t('operator.damageCapture.field.severity')}
          value={operatorDamageCaptureSeverityLabel(locale, form.severity)}
        />
        <ReviewRow label={t('operator.damageCapture.field.location')} value={location} />
        <ReviewRow
          label={t('operator.damageCapture.field.rentalImpact')}
          value={operatorDamageCaptureRentalImpactLabel(locale, form.rentalImpact)}
        />
        {form.description.trim() && (
          <ReviewRow
            label={t('operator.damageCapture.field.description')}
            value={form.description.trim()}
          />
        )}
        <ReviewRow
          label={t('operator.damageCapture.field.photos')}
          value={`${photos.length}`}
        />
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <img
              key={p.id}
              src={p.previewUrl}
              alt={t('operator.damageCapture.review.previewAlt')}
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
              {t('operator.damageCapture.aiUpload.title')}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {t('operator.damageCapture.aiUpload.hint')}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

import {
  DAMAGE_RENTAL_IMPACT_OPTIONS,
  DAMAGE_TYPE_OPTIONS,
  type DamageRentalImpact,
  type DamageSeverity,
} from '../../rental/lib/damage.types';
import { DESCRIPTION_MAX_LENGTH } from '../../rental/lib/damage.types';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  operatorDamageCaptureDamageTypeLabel,
  operatorDamageCaptureLocationChipLabel,
  operatorDamageCaptureRentalImpactLabel,
  operatorDamageCaptureSeverityLabel,
} from '../lib/operator-damage-capture-i18n';
import {
  applyLocationChip,
  OPERATOR_DAMAGE_LOCATION_CHIPS,
  type OperatorDamageFormState,
} from './operatorDamagePayload';
import { operatorFieldClass } from '../handover/operatorHandoverUi';

const SEVERITY_OPTIONS: DamageSeverity[] = ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'];

interface Props {
  form: OperatorDamageFormState;
  onChange: (form: OperatorDamageFormState) => void;
}

export function OperatorDamageDetailsStep({ form, onChange }: Props) {
  const { t, locale } = useLanguage();

  const set = <K extends keyof OperatorDamageFormState>(key: K, value: OperatorDamageFormState[K]) => {
    onChange({ ...form, [key]: value });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('operator.damageCapture.details.damageType')}
        </p>
        <div className="flex flex-wrap gap-2">
          {DAMAGE_TYPE_OPTIONS.map((type) => {
            const active = form.damageType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => set('damageType', type)}
                className={`sq-press min-h-[44px] rounded-xl border px-3 py-2 text-sm font-semibold ${
                  active
                    ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                    : 'border-border surface-premium text-foreground'
                }`}
              >
                {operatorDamageCaptureDamageTypeLabel(locale, type)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('operator.damageCapture.details.severity')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {SEVERITY_OPTIONS.map((severity) => {
            const active = form.severity === severity;
            return (
              <button
                key={severity}
                type="button"
                onClick={() => set('severity', severity)}
                className={`sq-press min-h-[48px] rounded-xl border px-3 text-sm font-semibold ${
                  active
                    ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                    : 'border-border surface-premium text-foreground'
                }`}
              >
                {operatorDamageCaptureSeverityLabel(locale, severity)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('operator.damageCapture.details.location')}
        </p>
        <div className="flex flex-wrap gap-2">
          {OPERATOR_DAMAGE_LOCATION_CHIPS.map((chip) => {
            const active = form.locationChipId === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => onChange(applyLocationChip(form, chip))}
                className={`sq-press min-h-[40px] rounded-full border px-3 py-2 text-xs font-semibold ${
                  active
                    ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                    : 'border-border surface-premium text-foreground'
                }`}
              >
                {operatorDamageCaptureLocationChipLabel(locale, chip.id)}
              </button>
            );
          })}
        </div>
        <input
          type="text"
          placeholder={t('operator.damageCapture.details.locationPlaceholder')}
          value={form.locationLabel}
          onChange={(e) => set('locationLabel', e.target.value)}
          className={`${operatorFieldClass} mt-2`}
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('operator.damageCapture.details.description')}
        </label>
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
          maxLength={DESCRIPTION_MAX_LENGTH}
          placeholder={t('operator.damageCapture.details.descriptionPlaceholder')}
          className={`${operatorFieldClass} min-h-[88px] resize-y`}
        />
        <p className="mt-1 text-[10px] text-muted-foreground">
          {form.description.length}/{DESCRIPTION_MAX_LENGTH}
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('operator.damageCapture.details.rentalImpact')}
        </p>
        <div className="flex flex-wrap gap-2">
          {DAMAGE_RENTAL_IMPACT_OPTIONS.map((impact) => {
            const active = form.rentalImpact === impact;
            return (
              <button
                key={impact}
                type="button"
                onClick={() => set('rentalImpact', impact)}
                className={`sq-press min-h-[40px] rounded-xl border px-3 py-2 text-xs font-semibold ${
                  active
                    ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                    : 'border-border surface-premium text-foreground'
                }`}
              >
                {operatorDamageCaptureRentalImpactLabel(locale, impact)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

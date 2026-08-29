import { useEffect, useState } from 'react';
import { FormDialog } from '../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import type {
  CreateVehicleDamageInput,
  DamageLocationView,
  DamageRentalImpact,
  DamageSeverity,
} from '../../lib/damage.types';
import {
  DAMAGE_LOCATION_VIEW_OPTIONS,
  DAMAGE_RENTAL_IMPACT_OPTIONS,
  DAMAGE_TYPE_OPTIONS,
  DESCRIPTION_MAX_LENGTH,
} from '../../lib/damage.types';
import { readFileAsDataUrl, validateDamageImageCode } from '../../lib/damage-image.utils';
import {
  resolveDamageLocationViewLabel,
  resolveDamageSeverityLabel,
  resolveDamageTypeLabel,
  resolveDamageValidationMessage,
  resolveRentalImpactLabel,
  type VehicleDamageValidationCode,
} from '../../lib/rental-vehicle-damages-i18n';

export interface CreateDamageFormValues {
  damageType: string;
  severity: DamageSeverity;
  rentalImpact: DamageRentalImpact;
  description: string;
  locationLabel: string;
  locationView: DamageLocationView;
  locationX: string;
  locationY: string;
  estimatedCostEuro: string;
  placeAfterCreate: boolean;
  photoFiles: File[];
}

interface CreateDamageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  onSubmit: (input: CreateVehicleDamageInput, options: { placeAfterCreate: boolean }) => Promise<void>;
}

const DEFAULT_FORM: CreateDamageFormValues = {
  damageType: 'SCRATCH',
  severity: 'MODERATE',
  rentalImpact: 'WATCH',
  description: '',
  locationLabel: '',
  locationView: 'UNKNOWN',
  locationX: '',
  locationY: '',
  estimatedCostEuro: '',
  placeAfterCreate: true,
  photoFiles: [],
};

function parseEuroToCents(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (!trimmed) return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100);
}

export function CreateDamageDialog({ open, onOpenChange, busy, onSubmit }: CreateDamageDialogProps) {
  const { t } = useLanguage();
  const [form, setForm] = useState<CreateDamageFormValues>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(DEFAULT_FORM);
      setError(null);
      setPhotoError(null);
    }
  }, [open]);

  const set = <K extends keyof CreateDamageFormValues>(key: K, value: CreateDamageFormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validate = (): VehicleDamageValidationCode | null => {
    if (!form.damageType) return 'DAMAGE_TYPE_REQUIRED';
    if (!form.severity) return 'SEVERITY_REQUIRED';
    if (form.description.length > DESCRIPTION_MAX_LENGTH) return 'DESCRIPTION_TOO_LONG';
    const cents = form.estimatedCostEuro.trim() ? parseEuroToCents(form.estimatedCostEuro) : null;
    if (form.estimatedCostEuro.trim() && cents === null) return 'ESTIMATED_COST_INVALID';
    if (form.locationView !== 'UNKNOWN') {
      const x = form.locationX.trim() ? Number(form.locationX) : NaN;
      const y = form.locationY.trim() ? Number(form.locationY) : NaN;
      if (!form.placeAfterCreate && (Number.isNaN(x) || Number.isNaN(y))) {
        return 'COORDINATES_REQUIRED';
      }
      if (!form.placeAfterCreate && (x < 0 || x > 100 || y < 0 || y > 100)) {
        return 'COORDINATES_RANGE';
      }
    }
    return null;
  };

  const handlePhotoPick = (files: FileList | null) => {
    if (!files?.length) return;
    setPhotoError(null);
    const next: File[] = [];
    for (const file of Array.from(files)) {
      const code = validateDamageImageCode(file);
      if (code) {
        setPhotoError(resolveDamageValidationMessage(code, t));
        return;
      }
      next.push(file);
    }
    set('photoFiles', [...form.photoFiles, ...next].slice(0, 4));
  };

  const handleSubmit = async () => {
    setError(null);
    const validationCode = validate();
    if (validationCode) {
      setError(resolveDamageValidationMessage(validationCode, t));
      return;
    }

    const estimatedCostCents = form.estimatedCostEuro.trim()
      ? parseEuroToCents(form.estimatedCostEuro) ?? undefined
      : undefined;

    try {
      const images: { imageData: string; caption?: string }[] = [];
      for (const file of form.photoFiles) {
        images.push({ imageData: await readFileAsDataUrl(file) });
      }

      const hasCoords =
        form.locationView !== 'UNKNOWN' &&
        !form.placeAfterCreate &&
        form.locationX.trim() &&
        form.locationY.trim();

      const input: CreateVehicleDamageInput = {
        damageType: form.damageType,
        severity: form.severity,
        rentalImpact: form.rentalImpact,
        source: 'MANUAL',
        description: form.description.trim() || undefined,
        locationLabel: form.locationLabel.trim() || undefined,
        locationView: form.locationView,
        estimatedCostCents,
        ...(hasCoords
          ? {
              locationX: Number(form.locationX),
              locationY: Number(form.locationY),
            }
          : {}),
        ...(images.length ? { images } : {}),
      };

      const placeAfterCreate =
        form.locationView !== 'UNKNOWN' && form.placeAfterCreate && !hasCoords;

      await onSubmit(input, { placeAfterCreate });
      onOpenChange(false);
    } catch {
      setError(resolveDamageValidationMessage('CREATE_FAILED', t));
    }
  };

  const needsPlacement =
    form.locationView !== 'UNKNOWN' && form.placeAfterCreate && !form.locationX.trim();

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('vehicleDamages.create.title')}
      description={t('vehicleDamages.create.description')}
      maxWidthClassName="sm:max-w-xl"
      footer={
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="sq-press px-3 py-2 rounded-lg text-xs font-semibold border border-border/70"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleSubmit()}
            className="sq-cta px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            {busy ? t('vehicleDamages.create.submitting') : t('vehicleDamages.create.submit')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <p className="text-[12px] text-red-600 dark:text-red-400 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('vehicleDamages.create.field.damageType')}>
            <select
              value={form.damageType}
              onChange={(e) => set('damageType', e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {DAMAGE_TYPE_OPTIONS.map((typeOption) => (
                <option key={typeOption} value={typeOption}>
                  {resolveDamageTypeLabel(t, typeOption)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('vehicleDamages.create.field.severity')}>
            <select
              value={form.severity}
              onChange={(e) => set('severity', e.target.value as DamageSeverity)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              {(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'] as DamageSeverity[]).map((s) => (
                <option key={s} value={s}>
                  {resolveDamageSeverityLabel(t, s)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label={t('vehicleDamages.create.field.rentalImpact')}>
          <select
            value={form.rentalImpact}
            onChange={(e) => set('rentalImpact', e.target.value as DamageRentalImpact)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {DAMAGE_RENTAL_IMPACT_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {resolveRentalImpactLabel(t, r)}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('vehicleDamages.create.field.description')}>
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            maxLength={DESCRIPTION_MAX_LENGTH}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
            placeholder={t('vehicleDamages.create.field.descriptionPlaceholder')}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {form.description.length}/{DESCRIPTION_MAX_LENGTH}
          </p>
        </Field>

        <Field label={t('vehicleDamages.create.field.estimatedCost')}>
          <input
            type="text"
            inputMode="decimal"
            value={form.estimatedCostEuro}
            onChange={(e) => set('estimatedCostEuro', e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder={t('vehicleDamages.create.field.estimatedCostPlaceholder')}
          />
        </Field>

        <Field label={t('vehicleDamages.create.field.locationView')}>
          <select
            value={form.locationView}
            onChange={(e) => set('locationView', e.target.value as DamageLocationView)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {DAMAGE_LOCATION_VIEW_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v === 'UNKNOWN'
                  ? t('vehicleDamages.create.locationView.unknown')
                  : resolveDamageLocationViewLabel(t, v)}
              </option>
            ))}
          </select>
        </Field>

        {form.locationView !== 'UNKNOWN' && (
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-2">
            <label className="flex items-center gap-2 text-[12px]">
              <input
                type="checkbox"
                checked={form.placeAfterCreate}
                onChange={(e) => set('placeAfterCreate', e.target.checked)}
              />
              {t('vehicleDamages.create.placeAfterCreate')}
            </label>
            {!form.placeAfterCreate && (
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('vehicleDamages.create.field.coordX')}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.locationX}
                    onChange={(e) => set('locationX', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </Field>
                <Field label={t('vehicleDamages.create.field.coordY')}>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={form.locationY}
                    onChange={(e) => set('locationY', e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </Field>
              </div>
            )}
            {needsPlacement && (
              <p className="text-[10px] text-muted-foreground">
                {t('vehicleDamages.create.placementHint', {
                  view: resolveDamageLocationViewLabel(t, form.locationView),
                })}
              </p>
            )}
            <Field label={t('vehicleDamages.create.field.locationLabel')}>
              <input
                value={form.locationLabel}
                onChange={(e) => set('locationLabel', e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder={t('vehicleDamages.create.locationLabelPlaceholder')}
              />
            </Field>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[12px] font-medium text-foreground">{t('vehicleDamages.create.photos')}</span>
            <label className="sq-press text-[11px] font-semibold px-2 py-1 rounded-lg border border-border/70 cursor-pointer">
              {t('vehicleDamages.create.addPhotos')}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => handlePhotoPick(e.target.files)}
              />
            </label>
          </div>
          {photoError && <p className="text-[11px] text-red-600 mb-1">{photoError}</p>}
          {form.photoFiles.length > 0 ? (
            <ul className="text-[11px] text-muted-foreground space-y-1">
              {form.photoFiles.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex justify-between gap-2">
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    className="text-red-600 shrink-0"
                    onClick={() => set('photoFiles', form.photoFiles.filter((_, idx) => idx !== i))}
                  >
                    {t('vehicleDamages.create.removePhoto')}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10px] text-muted-foreground">{t('vehicleDamages.create.photosHint')}</p>
          )}
        </div>
      </div>
    </FormDialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[12px] font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

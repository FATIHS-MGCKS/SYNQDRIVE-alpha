import { useMemo } from 'react';
import { toast } from 'sonner';
import { FormDialog, StatusChip } from '../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import { useDamageAiIntake } from '../../hooks/useDamageAiIntake';
import { isLowConfidenceSuggestion } from '../../lib/damage-ai-intake';
import {
  DAMAGE_LOCATION_VIEW_OPTIONS,
  DAMAGE_RENTAL_IMPACT_OPTIONS,
  DAMAGE_TYPE_OPTIONS,
  type DamageSeverity,
} from '../../lib/damage.types';
import type { VehicleExteriorViewKey } from '../../../lib/api';
import { validateDamageImageCode } from '../../lib/damage-image.utils';
import { DocumentIntakeLaunchButton } from '../documents/DocumentIntakeLaunchButton';
import {
  resolveDamageLocationViewLabel,
  resolveDamageSeverityLabel,
  resolveDamageTypeLabel,
  resolveDamageValidationMessage,
  resolveRentalImpactLabel,
} from '../../lib/rental-vehicle-damages-i18n';

interface DamageAiIntakeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string | undefined;
  onConfirmed: () => void;
}

export function DamageAiIntakeDialog({
  open,
  onOpenChange,
  vehicleId,
  onConfirmed,
}: DamageAiIntakeDialogProps) {
  const { t } = useLanguage();
  const intake = useDamageAiIntake({
    vehicleId,
    onConfirmed: () => {
      onConfirmed();
      onOpenChange(false);
    },
  });

  const reviewPins = useMemo(
    () =>
      intake.suggestions.filter(
        (s) =>
          s.accepted &&
          !s.rejected &&
          s.suggestedLocationView === intake.activeReviewView &&
          s.suggestedLocationX != null &&
          s.suggestedLocationY != null,
      ),
    [intake.activeReviewView, intake.suggestions],
  );

  const previewForActiveView =
    intake.slots.find((s) => s.view === intake.activeReviewView)?.previews[0] ?? null;

  const handleClose = (next: boolean) => {
    if (!next) intake.reset();
    onOpenChange(next);
  };

  const handleFilePick = (view: VehicleExteriorViewKey, fileList: FileList | null) => {
    if (!fileList?.length) return;
    const valid: File[] = [];
    for (const file of Array.from(fileList)) {
      const code = validateDamageImageCode(file);
      if (code) {
        toast.error(t('vehicleDamages.aiIntake.invalidImage'), {
          description: resolveDamageValidationMessage(code, t),
        });
        continue;
      }
      valid.push(file);
    }
    if (valid.length) intake.addFiles(view, valid);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={handleClose}
      title={t('vehicleDamages.aiIntake.title')}
      description={t('vehicleDamages.aiIntake.description')}
      maxWidthClassName="sm:max-w-3xl"
      footer={
        <>
          <button
            type="button"
            onClick={() => handleClose(false)}
            className="sq-press px-3 py-2 rounded-lg text-xs font-semibold border border-border/70"
          >
            {t('common.close')}
          </button>
          {intake.step === 'upload' && (
            <button
              type="button"
              disabled={!intake.enabled || intake.totalFiles === 0}
              title={
                intake.enabled ? undefined : t('vehicleDamages.aiIntake.notAvailableTitle')
              }
              onClick={() => void intake.analyze()}
              className="sq-cta px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              {intake.enabled
                ? t('vehicleDamages.aiIntake.analyzePhotos')
                : t('vehicleDamages.aiIntake.notAvailable')}
            </button>
          )}
          {intake.step === 'review' && (
            <button
              type="button"
              onClick={() => void intake.confirmAccepted()}
              className="sq-cta px-3 py-2 rounded-lg text-xs font-semibold"
            >
              {t('vehicleDamages.aiIntake.confirmSelected')}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {!intake.enabled && (
          <div className="text-[12px] rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-amber-800 dark:text-amber-200">
            <p>{t('vehicleDamages.aiIntake.disabledBanner')}</p>
            {vehicleId ? (
              <DocumentIntakeLaunchButton
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[11px] font-semibold text-brand-foreground"
                request={{
                  optionalContextType: 'VEHICLE',
                  optionalContextId: vehicleId,
                  contextVehicleId: vehicleId,
                  sourceSurface: 'damage_page',
                  returnView: 'damages',
                  returnEntityId: vehicleId,
                  documentTab: 'upload',
                }}
              >
                {t('vehicleDamages.aiIntake.openDocumentIntake')}
              </DocumentIntakeLaunchButton>
            ) : null}
          </div>
        )}

        {intake.error && (
          <p className="text-[12px] text-red-600 dark:text-red-400 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            {intake.error}
          </p>
        )}

        {intake.step === 'upload' && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">{t('vehicleDamages.aiIntake.confirmationWarning')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {intake.slots.map((slot) => (
                <div
                  key={slot.view}
                  className="rounded-xl border border-border/70 p-3 bg-muted/15 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold">
                      {resolveDamageLocationViewLabel(t, slot.view)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{slot.files.length}/4</span>
                  </div>
                  {slot.previews.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {slot.previews.map((src, i) => (
                        <div key={src} className="relative">
                          <img src={src} alt="" className="w-14 h-14 object-cover rounded-md border" />
                          <button
                            type="button"
                            onClick={() => intake.removeFile(slot.view, i)}
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-background border text-[10px]"
                            aria-label={t('common.remove')}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className="sq-press block text-center px-2 py-2 rounded-lg border border-dashed border-border/70 text-[11px] font-semibold cursor-pointer">
                    {t('vehicleDamages.aiIntake.addPhoto')}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      multiple
                      className="sr-only"
                      disabled={!intake.enabled}
                      onChange={(e) => handleFilePick(slot.view, e.target.files)}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {intake.step === 'analyzing' && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Icon name="loader-2" className="w-4 h-4 animate-spin" />
            {t('vehicleDamages.aiIntake.analyzing')}
          </p>
        )}

        {intake.step === 'review' && (
          <div className="space-y-4">
            {intake.analysisWarning && (
              <p className="text-[11px] text-muted-foreground">{intake.analysisWarning}</p>
            )}
            <div className="flex flex-wrap gap-1">
              {intake.slots
                .filter((s) => s.files.length > 0)
                .map((s) => (
                  <button
                    key={s.view}
                    type="button"
                    onClick={() => intake.setActiveReviewView(s.view)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold border ${
                      intake.activeReviewView === s.view
                        ? 'border-primary bg-primary/10'
                        : 'border-border/70'
                    }`}
                  >
                    {resolveDamageLocationViewLabel(t, s.view)}
                  </button>
                ))}
            </div>
            {previewForActiveView && (
              <div className="relative rounded-xl border border-border/70 overflow-hidden bg-muted/20 aspect-[16/10] max-h-56">
                <img
                  src={previewForActiveView}
                  alt=""
                  className="w-full h-full object-contain"
                />
                {reviewPins.map((s) => (
                  <span
                    key={s.id}
                    className="absolute w-3 h-3 -ml-1.5 -mt-1.5 rounded-full bg-amber-500 border-2 border-white shadow"
                    style={{
                      left: `${s.suggestedLocationX}%`,
                      top: `${s.suggestedLocationY}%`,
                    }}
                    title={resolveDamageTypeLabel(t, s.suggestedDamageType)}
                  />
                ))}
              </div>
            )}
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {intake.suggestions.map((s) => (
                <SuggestionEditor
                  key={s.id}
                  suggestion={s}
                  onChange={(patch) => intake.updateSuggestion(s.id, patch)}
                />
              ))}
            </ul>
          </div>
        )}

        {intake.step === 'confirming' && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Icon name="loader-2" className="w-4 h-4 animate-spin" />
            {t('vehicleDamages.aiIntake.saving')}
          </p>
        )}

        {intake.step === 'done' && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
            <Icon name="check-circle-2" className="w-4 h-4" />
            {t('vehicleDamages.aiIntake.done')}
          </p>
        )}
      </div>
    </FormDialog>
  );
}

function SuggestionEditor({
  suggestion,
  onChange,
}: {
  suggestion: import('../../lib/damage-ai-intake').EditableAiDamageSuggestion;
  onChange: (patch: Partial<typeof suggestion>) => void;
}) {
  const { t } = useLanguage();
  const low = isLowConfidenceSuggestion(suggestion.confidence);

  return (
    <li
      className={`rounded-lg border p-3 space-y-2 ${
        suggestion.rejected
          ? 'opacity-50 border-border/50'
          : suggestion.accepted
            ? 'border-primary/30 bg-primary/5'
            : 'border-border/70'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusChip tone="info">{t('vehicleDamages.aiIntake.suggestion')}</StatusChip>
        {low && <StatusChip tone="warning">{t('vehicleDamages.aiIntake.lowConfidence')}</StatusChip>}
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {(suggestion.confidence * 100).toFixed(0)}%
        </span>
        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => onChange({ accepted: true, rejected: false })}
            className="sq-press px-2 py-1 text-[10px] rounded border border-border/70"
          >
            {t('vehicleDamages.aiIntake.accept')}
          </button>
          <button
            type="button"
            onClick={() => onChange({ rejected: true, accepted: false })}
            className="sq-press px-2 py-1 text-[10px] rounded border border-border/70"
          >
            {t('vehicleDamages.aiIntake.reject')}
          </button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">{suggestion.warning}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px]">
          {t('tasks.detail.technical.type')}
          <select
            value={suggestion.suggestedDamageType}
            onChange={(e) => onChange({ suggestedDamageType: e.target.value })}
            className="mt-0.5 w-full rounded border border-border/70 bg-background px-2 py-1 text-[11px]"
          >
            {DAMAGE_TYPE_OPTIONS.map((typeOption) => (
              <option key={typeOption} value={typeOption}>
                {resolveDamageTypeLabel(t, typeOption)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px]">
          {t('vehicleDamages.aiIntake.field.severity')}
          <select
            value={suggestion.suggestedSeverity}
            onChange={(e) => onChange({ suggestedSeverity: e.target.value as DamageSeverity })}
            className="mt-0.5 w-full rounded border border-border/70 bg-background px-2 py-1 text-[11px]"
          >
            {(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'] as const).map((v) => (
              <option key={v} value={v}>
                {resolveDamageSeverityLabel(t, v)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px]">
          {t('vehicleDamages.aiIntake.field.view')}
          <select
            value={suggestion.suggestedLocationView}
            onChange={(e) =>
              onChange({
                suggestedLocationView: e.target.value as typeof suggestion.suggestedLocationView,
              })
            }
            className="mt-0.5 w-full rounded border border-border/70 bg-background px-2 py-1 text-[11px]"
          >
            {DAMAGE_LOCATION_VIEW_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {resolveDamageLocationViewLabel(t, v)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px]">
          {t('vehicleDamages.aiIntake.field.rentalImpact')}
          <select
            value={suggestion.suggestedRentalImpact}
            onChange={(e) =>
              onChange({
                suggestedRentalImpact: e.target.value as typeof suggestion.suggestedRentalImpact,
              })
            }
            className="mt-0.5 w-full rounded border border-border/70 bg-background px-2 py-1 text-[11px]"
          >
            {DAMAGE_RENTAL_IMPACT_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {resolveRentalImpactLabel(t, v)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px]">
          {t('vehicleDamages.aiIntake.field.pinX')}
          <input
            type="number"
            min={0}
            max={100}
            value={suggestion.suggestedLocationX ?? ''}
            onChange={(e) =>
              onChange({
                suggestedLocationX: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            className="mt-0.5 w-full rounded border border-border/70 bg-background px-2 py-1 text-[11px]"
          />
        </label>
        <label className="text-[11px]">
          {t('vehicleDamages.aiIntake.field.pinY')}
          <input
            type="number"
            min={0}
            max={100}
            value={suggestion.suggestedLocationY ?? ''}
            onChange={(e) =>
              onChange({
                suggestedLocationY: e.target.value === '' ? null : Number(e.target.value),
              })
            }
            className="mt-0.5 w-full rounded border border-border/70 bg-background px-2 py-1 text-[11px]"
          />
        </label>
      </div>
      <label className="text-[11px] block">
        {t('tasks.form.description')}
        <textarea
          value={suggestion.suggestedDescription ?? ''}
          onChange={(e) => onChange({ suggestedDescription: e.target.value })}
          rows={2}
          className="mt-0.5 w-full rounded border border-border/70 bg-background px-2 py-1 text-[11px] resize-none"
        />
      </label>
    </li>
  );
}

import { Loader2, Pencil } from 'lucide-react';
import { StatusChip } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatSpecsNumber,
  motionPhysicsEvidenceTierLabelKey,
  type MotionPhysicsEvidenceTierUi,
} from './connected-vehicle-technical-specs.util';
import type { ConnectedVehicleTechnicalSpecsView } from './connected-vehicle-technical-specs.util';

type ConnectedVehicleTechnicalSpecsSectionProps = {
  specs: ConnectedVehicleTechnicalSpecsView | null;
  evidenceTier: MotionPhysicsEvidenceTierUi;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  editLoading?: boolean;
  onEdit?: () => void;
  onRetry?: () => void;
};

export function ConnectedVehicleTechnicalSpecsSection({
  specs,
  evidenceTier,
  loading,
  error,
  canEdit,
  editLoading = false,
  onEdit,
  onRetry,
}: ConnectedVehicleTechnicalSpecsSectionProps) {
  const { t } = useLanguage();

  const evidenceTone =
    evidenceTier === 'VERIFIED'
      ? 'success'
      : evidenceTier === 'CONFIRMED'
        ? 'info'
        : evidenceTier === 'ESTIMATED'
          ? 'warning'
          : 'neutral';

  return (
    <section className="space-y-3" data-testid="cv-technical-specs-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('master.cv.technicalSpecs.sectionTitle')}
        </h3>
        {canEdit && onEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={editLoading}
            onClick={onEdit}
            data-testid="cv-edit-specifications-button"
          >
            {editLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden />
            ) : (
              <Pencil className="h-4 w-4 mr-2" aria-hidden />
            )}
            {t('master.cv.technicalSpecs.editAction')}
          </Button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('master.cv.technicalSpecs.loading')}
        </p>
      ) : error ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground" role="alert">{t('master.cv.technicalSpecs.loadError')}</p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t('master.cv.technicalSpecs.retry')}
            </Button>
          ) : null}
        </div>
      ) : specs ? (
        <>
          <div className="flex flex-wrap gap-2">
            <StatusChip tone={evidenceTone} dot>
              {t(motionPhysicsEvidenceTierLabelKey(evidenceTier))}
            </StatusChip>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <SpecItem label={t('master.cv.technicalSpecs.make')} value={specs.make} />
            <SpecItem label={t('master.cv.technicalSpecs.model')} value={specs.model} />
            <SpecItem
              label={t('master.cv.technicalSpecs.year')}
              value={specs.year != null ? String(specs.year) : '—'}
            />
            <SpecItem label={t('master.cv.technicalSpecs.drivetrainType')} value={specs.fuelType} />
            <SpecItem
              label={t('master.cv.technicalSpecs.curbWeight')}
              value={
                specs.curbWeightKg != null
                  ? `${formatSpecsNumber(specs.curbWeightKg)} ${t('master.cv.technicalSpecs.unitKg')}`
                  : '—'
              }
            />
            <SpecItem
              label={t('master.cv.technicalSpecs.systemPower')}
              value={
                specs.systemMotorPowerKw != null
                  ? `${formatSpecsNumber(specs.systemMotorPowerKw)} ${t('master.cv.technicalSpecs.unitKw')}`
                  : '—'
              }
            />
            <SpecItem
              label={t('master.cv.technicalSpecs.accel0To100')}
              value={
                specs.accel0To100S != null
                  ? `${formatSpecsNumber(specs.accel0To100S)} ${t('master.cv.technicalSpecs.unitSeconds')}`
                  : '—'
              }
            />
            {specs.variantAssumption ? (
              <SpecItem
                className="sm:col-span-2"
                label={t('master.motionPhysics.variantAssumption')}
                value={specs.variantAssumption}
              />
            ) : null}
          </dl>
        </>
      ) : null}
    </section>
  );
}

function SpecItem({
  label,
  value,
  className = '',
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-border p-3 ${className}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium break-words">{value}</dd>
    </div>
  );
}

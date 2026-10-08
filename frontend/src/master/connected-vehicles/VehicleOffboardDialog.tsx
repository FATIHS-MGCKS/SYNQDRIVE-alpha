import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { VehicleOffboardReasonCode } from './vehicle-offboard.types';

const REASONS: VehicleOffboardReasonCode[] = [
  'OFFBOARD_SOLD',
  'REMOVE_FROM_PRODUCT',
  'ADMINISTRATIVE_OFFBOARD',
];

const REASON_KEYS: Record<VehicleOffboardReasonCode, TranslationKey> = {
  OFFBOARD_SOLD: 'master.cv.offboard.reason.OFFBOARD_SOLD',
  REMOVE_FROM_PRODUCT: 'master.cv.offboard.reason.REMOVE_FROM_PRODUCT',
  ADMINISTRATIVE_OFFBOARD: 'master.cv.offboard.reason.ADMINISTRATIVE_OFFBOARD',
};

export interface VehicleOffboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  displayTitle: string;
  organizationName: string | null;
  onConfirm: (input: { reason: VehicleOffboardReasonCode; note?: string }) => void;
}

export function VehicleOffboardDialog({
  open,
  onOpenChange,
  loading,
  displayTitle,
  organizationName,
  onConfirm,
}: VehicleOffboardDialogProps) {
  const { t } = useLanguage();
  const [reason, setReason] = useState<VehicleOffboardReasonCode>('REMOVE_FROM_PRODUCT');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) {
      setReason('REMOVE_FROM_PRODUCT');
      setNote('');
    }
  }, [open]);

  const explainerItems = useMemo(
    () => [
      t('master.cv.offboard.explainer.canonicalRetained'),
      t('master.cv.offboard.explainer.historyRetained'),
      t('master.cv.offboard.explainer.leavesActiveFleet'),
      t('master.cv.offboard.explainer.billingAsync'),
      t('master.cv.offboard.explainer.localLinksDeactivated'),
      t('master.cv.offboard.explainer.noProviderDisconnect'),
      t('master.cv.offboard.explainer.noReOnboard'),
    ],
    [t],
  );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('master.cv.offboard.dialog.title')}
      description={t('master.cv.offboard.dialog.description')}
      confirmLabel={loading ? t('master.cv.offboard.dialog.submitting') : t('master.cv.offboard.dialog.confirm')}
      tone="critical"
      loading={loading}
      onConfirm={() => onConfirm({ reason, note: note.trim() || undefined })}
    >
      <div className="space-y-4 mt-3 text-sm">
        <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-1">
          <p className="font-medium text-foreground">{displayTitle}</p>
          {organizationName ? (
            <p className="text-muted-foreground">
              {t('master.cv.offboard.organizationLabel')}: {organizationName}
            </p>
          ) : null}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t('master.cv.offboard.reason.label')}</legend>
          {REASONS.map((code) => (
            <label key={code} className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="offboard-reason"
                value={code}
                checked={reason === code}
                onChange={() => setReason(code)}
                className="mt-1"
              />
              <span>{t(REASON_KEYS[code])}</span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="offboard-note">
            {t('master.cv.offboard.note.label')}
          </label>
          <textarea
            id="offboard-note"
            className="w-full rounded-xl border border-border bg-background p-3 text-sm min-h-[72px]"
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('master.cv.offboard.note.hint')}
          />
        </div>

        <div className="rounded-xl border border-[color:var(--status-warning)]/30 bg-muted/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-foreground font-medium">
            <AlertTriangle className="h-4 w-4 text-[color:var(--status-warning)]" aria-hidden />
            {t('master.cv.offboard.explainer.title')}
          </div>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-xs">
            {explainerItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </ConfirmDialog>
  );
}

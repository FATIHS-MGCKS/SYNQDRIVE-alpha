import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  OPERATOR_PICKUP_CHECK_FIELDS,
  operatorPickupCheckFieldLabel,
} from '../lib/operator-pickup-check-i18n';
import {
  buildManualPickupCheckPayload,
  DEFAULT_OPERATOR_PICKUP_CHECK_FORM,
  type OperatorPickupCheckFieldKey,
  type OperatorPickupCheckFormState,
} from './operatorPickupCheckPayload';

interface OperatorPickupCheckSheetProps {
  customerId: string;
  bookingId: string;
  customerName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function OperatorPickupCheckSheet({
  customerId,
  bookingId,
  customerName,
  onClose,
  onSuccess,
}: OperatorPickupCheckSheetProps) {
  const { t, locale } = useLanguage();
  const [form, setForm] = useState<OperatorPickupCheckFormState>(DEFAULT_OPERATOR_PICKUP_CHECK_FORM);
  const [saving, setSaving] = useState(false);

  const toggle = (key: OperatorPickupCheckFieldKey) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const submit = async () => {
    setSaving(true);
    try {
      const payload = buildManualPickupCheckPayload({
        customerId,
        bookingId,
        ...form,
      });
      await api.customerVerification.submitManualPickupCheck(payload);
      toast.success(t('operator.pickupCheck.toast.success'));
      onSuccess?.();
      onClose();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : t('operator.pickupCheck.toast.error'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-background"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="dialog"
      aria-modal
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {t('operator.pickupCheck.eyebrow')}
          </p>
          <h2 className="truncate text-base font-bold">{t('operator.pickupCheck.title')}</h2>
          <p className="text-xs text-muted-foreground truncate">{customerName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="sq-press flex h-11 w-11 items-center justify-center rounded-xl border border-border/60"
          aria-label={t('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 space-y-4">
        <p className="text-sm text-muted-foreground">{t('operator.pickupCheck.hint')}</p>

        <div className="rounded-2xl border border-border/60 surface-premium divide-y divide-border/40">
          {OPERATOR_PICKUP_CHECK_FIELDS.map((item) => (
            <label
              key={item.field}
              className="flex items-start gap-3 px-4 py-3 text-sm cursor-pointer"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={Boolean(form[item.field])}
                onChange={() => toggle(item.field)}
              />
              <span>
                {operatorPickupCheckFieldLabel(locale, item.field)}
                {item.optional && (
                  <span className="text-[10px] text-muted-foreground ml-1">
                    {t('operator.pickupCheck.checklist.optionalHint')}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase text-muted-foreground mb-1.5">
            {t('operator.pickupCheck.fields.notes')}
          </label>
          <textarea
            rows={3}
            value={form.notes ?? ''}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            className="w-full rounded-xl border border-border/60 surface-premium px-3 py-2 text-sm"
            placeholder={t('operator.pickupCheck.fields.notesPlaceholder')}
          />
        </div>
      </div>

      <footer className="border-t border-border/50 p-4 space-y-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void submit()}
          className="sq-3d-btn sq-3d-btn--primary min-h-[48px] w-full font-semibold disabled:opacity-50"
        >
          {saving ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('common.saving')}
            </span>
          ) : (
            t('operator.pickupCheck.actions.save')
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="sq-press min-h-[44px] w-full rounded-xl border border-border/60 text-sm font-medium"
        >
          {t('common.cancel')}
        </button>
      </footer>
    </div>
  );
}

import { useState } from 'react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { diditConsentText } from '../../lib/customer-verification';
import { Icon } from '../ui/Icon';

interface DiditConsentNoticeProps {
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

export function DiditConsentNotice({ onConfirm, onCancel, busy }: DiditConsentNoticeProps) {
  const { t, locale } = useLanguage();
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center sq-tone-info shrink-0">
          <Icon name="external-link" className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-foreground">{t('customers.verification.diditConsentTitle')}</h4>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{diditConsentText(locale)}</p>
        </div>
      </div>
      <label className="flex items-start gap-2 text-[11px] text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
        />
        <span>{t('customers.verification.diditAcknowledge')}</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!acknowledged || busy}
          onClick={onConfirm}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[color:var(--brand)] text-white disabled:opacity-50"
        >
          {busy ? <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" /> : <Icon name="shield" className="w-3.5 h-3.5" />}
          {t('customers.verification.continueDidit')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 rounded-lg text-xs font-medium border border-border surface-premium"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

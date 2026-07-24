import { Users } from 'lucide-react';
import { useLanguage } from '../../../../../i18n/LanguageContext';

interface Props {
  fourEyesRequired?: boolean;
  reviewCycleStatus?: string;
}

export function FourEyesBanner({ fourEyesRequired, reviewCycleStatus }: Props) {
  const { t } = useLanguage();
  if (!fourEyesRequired) return null;

  return (
    <div
      className="rounded-xl border border-[var(--brand)]/25 bg-[var(--brand)]/5 p-3 flex gap-2.5"
      role="status"
      aria-label={t('dataProcessing.detail.fourEyes.aria')}
    >
      <Users className="w-4 h-4 text-[var(--brand)] shrink-0 mt-0.5" aria-hidden />
      <div>
        <p className="text-[12px] font-semibold text-foreground">{t('dataProcessing.detail.fourEyes.title')}</p>
        <p className="text-[11.5px] text-muted-foreground mt-1 leading-relaxed">
          {t('dataProcessing.detail.fourEyes.description')}
        </p>
        {reviewCycleStatus ? (
          <p className="text-[11px] font-medium text-foreground mt-1.5">
            {t('dataProcessing.detail.fourEyes.cycleStatus', { status: reviewCycleStatus })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

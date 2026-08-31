import { useLanguage } from '../../LanguageContext';

/** Negative fixture: translated presentation */
export function GoodTranslatedPresentation() {
  const { t } = useLanguage();
  return (
    <>
      <button type="button" title={t('common.save')} aria-label={t('common.cancel')}>
        X
      </button>
      <input placeholder={t('common.search')} />
    </>
  );
}

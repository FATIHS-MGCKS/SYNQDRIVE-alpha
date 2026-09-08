import { useLanguage } from '../../LanguageContext';

/** Negative fixture: translated interpolation with raw provider data */
export function GoodTranslatedInterpolation() {
  const { t } = useLanguage();
  const stationName = 'Provider Station X7';
  return <span title={t('fleet.geofence.tooltip.home', { stationName })}>HOME</span>;
}

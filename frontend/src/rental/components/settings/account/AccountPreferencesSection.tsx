import { Loader2, MapPin } from 'lucide-react';
import type { Station } from '../../../../lib/api';
import { DataCard, EmptyState } from '../../../../components/patterns';
import { Button } from '../../../../components/ui/button';
import { accountFieldLabelClass, accountSelectClass } from './account-ui';
import {
  DATE_FORMAT_OPTIONS,
  getLanguageOptions,
  getLandingPageOptions,
  TIMEZONE_OPTIONS,
  type PreferencesDraft,
} from './account-utils';
import { useLanguage } from '../../../i18n/LanguageContext';

interface AccountPreferencesSectionProps {
  draft: PreferencesDraft;
  saved: PreferencesDraft;
  dirty: boolean;
  saving: boolean;
  stations: Station[];
  stationsLoading: boolean;
  onDraftChange: (patch: Partial<PreferencesDraft>) => void;
  onSave: () => void;
  onReset: () => void;
}

export function AccountPreferencesSection({
  draft,
  dirty,
  saving,
  stations,
  stationsLoading,
  onDraftChange,
  onSave,
  onReset,
}: AccountPreferencesSectionProps) {
  const { t, locale } = useLanguage();
  const languageOptions = getLanguageOptions(locale);
  const landingPageOptions = getLandingPageOptions(locale);
  const hasStations = stations.length > 0;

  return (
    <div id="account-section-preferences">
      <DataCard
        title={t('settings.account.preferences.title')}
        description={t('settings.account.preferences.description')}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={!dirty || saving}
            >
              {t('common.reset')}
            </Button>
            <Button type="button" size="sm" onClick={onSave} disabled={!dirty || saving}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={accountFieldLabelClass}>{t('settings.account.preferences.language')}</label>
            <select
              className={accountSelectClass}
              value={draft.language}
              onChange={(e) => onDraftChange({ language: e.target.value as 'de' | 'en' })}
            >
              {languageOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={accountFieldLabelClass}>{t('settings.account.preferences.timezone')}</label>
            <select
              className={accountSelectClass}
              value={draft.timezone}
              onChange={(e) => onDraftChange({ timezone: e.target.value })}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
              {!TIMEZONE_OPTIONS.includes(draft.timezone as (typeof TIMEZONE_OPTIONS)[number]) && (
                <option value={draft.timezone}>{draft.timezone}</option>
              )}
            </select>
          </div>
          <div>
            <label className={accountFieldLabelClass}>{t('settings.account.preferences.dateFormat')}</label>
            <select
              className={accountSelectClass}
              value={draft.dateFormat}
              onChange={(e) =>
                onDraftChange({ dateFormat: e.target.value as PreferencesDraft['dateFormat'] })
              }
            >
              {DATE_FORMAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={accountFieldLabelClass}>{t('settings.account.preferences.landingPage')}</label>
            <select
              className={accountSelectClass}
              value={draft.defaultLandingPage}
              onChange={(e) =>
                onDraftChange({
                  defaultLandingPage: e.target.value as PreferencesDraft['defaultLandingPage'],
                })
              }
            >
              {landingPageOptions.map((o) => (
                <option key={o.value || 'default'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={accountFieldLabelClass}>{t('settings.account.preferences.defaultStation')}</label>
            {stationsLoading ? (
              <p className="py-2 text-xs text-muted-foreground">{t('settings.account.preferences.stationsLoading')}</p>
            ) : hasStations ? (
              <select
                className={accountSelectClass}
                value={draft.defaultStationId}
                onChange={(e) => onDraftChange({ defaultStationId: e.target.value })}
              >
                <option value="">Keine {t('settings.account.preferences.defaultStation')}</option>
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.city ? ` · ${s.city}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <EmptyState
                compact
                icon={<MapPin className="h-5 w-5" />}
                title={t('settings.account.preferences.noStationsTitle')}
                description="Legen Sie unter Administration → Stationen mindestens einen Standort an, um eine {t('settings.account.preferences.defaultStation')} zu wählen."
              />
            )}
          </div>
        </div>
      </DataCard>
    </div>
  );
}

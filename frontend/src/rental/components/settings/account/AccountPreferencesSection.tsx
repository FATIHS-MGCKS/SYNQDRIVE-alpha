import { Loader2, MapPin } from 'lucide-react';
import type { Station } from '../../../../lib/api';
import { DataCard, EmptyState } from '../../../../components/patterns';
import { Button } from '../../../../components/ui/button';
import { accountFieldLabelClass, accountSelectClass } from './account-ui';
import {
  DATE_FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  LANDING_PAGE_OPTIONS,
  TIMEZONE_OPTIONS,
  type PreferencesDraft,
} from './account-utils';

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
  const hasStations = stations.length > 0;

  return (
    <div id="account-section-preferences">
      <DataCard
        title="Arbeitspräferenzen"
        description="Sprache, Zeitzone und persönliche Standardwerte für Ihre Organisation."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={!dirty || saving}
            >
              Zurücksetzen
            </Button>
            <Button type="button" size="sm" onClick={onSave} disabled={!dirty || saving}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              Speichern
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={accountFieldLabelClass}>Sprache</label>
            <select
              className={accountSelectClass}
              value={draft.language}
              onChange={(e) => onDraftChange({ language: e.target.value as 'de' | 'en' })}
            >
              {LANGUAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={accountFieldLabelClass}>Zeitzone</label>
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
            <label className={accountFieldLabelClass}>Datumsformat</label>
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
            <label className={accountFieldLabelClass}>Startseite nach Login</label>
            <select
              className={accountSelectClass}
              value={draft.defaultLandingPage}
              onChange={(e) =>
                onDraftChange({
                  defaultLandingPage: e.target.value as PreferencesDraft['defaultLandingPage'],
                })
              }
            >
              {LANDING_PAGE_OPTIONS.map((o) => (
                <option key={o.value || 'default'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className={accountFieldLabelClass}>Standard-Station</label>
            {stationsLoading ? (
              <p className="py-2 text-xs text-muted-foreground">Stationen werden geladen…</p>
            ) : hasStations ? (
              <select
                className={accountSelectClass}
                value={draft.defaultStationId}
                onChange={(e) => onDraftChange({ defaultStationId: e.target.value })}
              >
                <option value="">Keine Standard-Station</option>
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
                title="Noch keine Stationen angelegt"
                description="Legen Sie unter Administration → Stationen mindestens einen Standort an, um eine Standard-Station zu wählen."
              />
            )}
          </div>
        </div>
      </DataCard>
    </div>
  );
}

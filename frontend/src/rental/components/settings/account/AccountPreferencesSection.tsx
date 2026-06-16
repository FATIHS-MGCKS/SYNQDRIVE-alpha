import { Loader2, MapPin } from 'lucide-react';
import type { Station } from '../../../../lib/api';
import { DataCard, EmptyState } from '../../../../components/patterns';
import {
  DATE_FORMAT_OPTIONS,
  LANGUAGE_OPTIONS,
  LANDING_PAGE_OPTIONS,
  TIMEZONE_OPTIONS,
  type PreferencesDraft,
} from './account-utils';

const selectClass =
  'w-full px-3 py-2.5 rounded-xl border border-border/70 bg-card text-xs text-foreground outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]';
const labelClass = 'block text-[11px] font-semibold mb-1.5 text-muted-foreground';

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
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onReset}
            disabled={!dirty || saving}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            Zurücksetzen
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Speichern
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Sprache</label>
          <select
            className={selectClass}
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
          <label className={labelClass}>Zeitzone</label>
          <select
            className={selectClass}
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
          <label className={labelClass}>Datumsformat</label>
          <select
            className={selectClass}
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
          <label className={labelClass}>Startseite nach Login</label>
          <select
            className={selectClass}
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
          <label className={labelClass}>Standard-Station</label>
          {stationsLoading ? (
            <p className="text-xs text-muted-foreground py-2">Stationen werden geladen…</p>
          ) : hasStations ? (
            <select
              className={selectClass}
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
              icon={<MapPin className="w-5 h-5" />}
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

import { LayoutGrid, List, RefreshCw, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import { useEvaluationsForecasts } from '../../hooks/useEvaluationsForecasts';
import type { EvaluationsForecastCardModel } from '../../lib/evaluations-forecast-view-model';
import { ForecastCard } from './ForecastCard';
import { ForecastDrilldown } from './ForecastDrilldown';
import { ForecastTable } from './ForecastTable';
import { ForecastTermTooltip } from './ForecastTermTooltip';

export function EvaluationsForecastsSection({
  stationLabel,
}: {
  isDarkMode?: boolean;
  stationLabel?: string | null;
}) {
  const { intlLocale } = useLanguage();
  const { loading, error, section, refresh } = useEvaluationsForecasts(stationLabel);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selected, setSelected] = useState<EvaluationsForecastCardModel | null>(null);

  return (
    <section
      className="pt-2 border-t border-border"
      aria-labelledby="evaluations-forecasts-heading"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div>
          <h2
            id="evaluations-forecasts-heading"
            className="text-[14px] font-bold text-foreground flex items-center gap-2"
          >
            <TrendingUp className="h-4 w-4 text-[color:var(--brand)]" aria-hidden />
            Prognosen
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-2xl">
            Statistische und regelbasierte Baselines — klar getrennt von Istwerten. Nur freigegebene
            Modelle (Release Gate) werden angezeigt. Flottenaggregate ohne personenbezogene Daten.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <span className="rounded-full px-2 py-0.5 sq-tone-neutral font-semibold">
              Scope: {section?.filterContext.scopeKey ?? 'fleet'}
            </span>
            <span className="rounded-full px-2 py-0.5 sq-tone-brand font-semibold">
              Währung: {section?.filterContext.currency ?? 'EUR'}
            </span>
            {stationLabel ? (
              <span className="rounded-full px-2 py-0.5 border border-border font-semibold text-muted-foreground">
                Station: {stationLabel}
              </span>
            ) : (
              <span className="rounded-full px-2 py-0.5 border border-dashed border-border text-muted-foreground">
                Gesamte Organisation
              </span>
            )}
            <span className="rounded-full px-2 py-0.5 sq-tone-neutral">
              <ForecastTermTooltip term="observed" label="Istwert" /> vs{' '}
              <ForecastTermTooltip term="forecast" label="Prognose" />
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 self-start">
          <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="Ansicht">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium',
                viewMode === 'cards' ? 'bg-muted text-foreground' : 'text-muted-foreground',
              )}
              aria-pressed={viewMode === 'cards'}
            >
              <LayoutGrid className="h-3 w-3" aria-hidden />
              <span className="hidden sm:inline">Karten</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium',
                viewMode === 'table' ? 'bg-muted text-foreground' : 'text-muted-foreground',
              )}
              aria-pressed={viewMode === 'table'}
            >
              <List className="h-3 w-3" aria-hidden />
              <span className="hidden sm:inline">Tabelle</span>
            </button>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-50"
            aria-label="Prognosen aktualisieren"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl border border-border/50 bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[color:var(--status-critical)]/30 p-4 sq-tone-critical text-[11px]">
          {error}
        </div>
      ) : !section?.displayableCards.length ? (
        <EmptyState
          title="Keine freigegebenen Prognosen"
          description={
            section?.hiddenCount
              ? `${section.hiddenCount} Prognose(n) ausgeblendet — Release Gate nicht erfüllt, unzureichende Historie oder Modell deaktiviert.`
              : 'Sobald Modelle backgetestet und freigegeben sind, erscheinen Prognosen hier mit Unsicherheitsintervall.'
          }
        />
      ) : viewMode === 'table' ? (
        <ForecastTable
          cards={section.displayableCards}
          locale={intlLocale}
          onOpen={setSelected}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {section.displayableCards.map((card) => (
            <ForecastCard
              key={card.id}
              card={card}
              locale={intlLocale}
              onOpen={setSelected}
              compact={section.displayableCards.length > 4}
            />
          ))}
        </div>
      )}

      {section && section.hiddenCount > 0 && section.displayableCards.length > 0 ? (
        <p className="mt-3 text-[10px] text-muted-foreground" role="status">
          {section.hiddenCount} weitere Prognose(n) nicht angezeigt:{' '}
          {section.hiddenReasons.slice(0, 2).join(' · ')}
        </p>
      ) : null}

      {selected ? (
        <ForecastDrilldown card={selected} locale={intlLocale} onClose={() => setSelected(null)} />
      ) : null}
    </section>
  );
}

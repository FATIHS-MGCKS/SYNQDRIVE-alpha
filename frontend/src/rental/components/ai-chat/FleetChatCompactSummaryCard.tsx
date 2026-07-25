import { Icon } from '../../components/ui/Icon';
import type { FleetChatStructuredPayload } from '../../lib/ai-chat/fleet-chat-response.types';
import {
  buildLocalCompactSummary,
  compactToneBgClass,
  compactToneTextClass,
  shouldCollapseNarrative,
} from '../../lib/ai-chat/fleet-chat-compact-display';
import {
  fleetChatResponseTypeLabel,
  isClarificationResponseType,
  isWarningResponseType,
} from '../../lib/ai-chat/fleet-chat-response-display';

export interface FleetChatCompactSummaryCardProps {
  structured: FleetChatStructuredPayload;
  content: string;
  isDarkMode: boolean;
  locale?: 'de' | 'en';
}

export function FleetChatCompactSummaryCard({
  structured,
  content,
  isDarkMode,
  locale = 'de',
}: FleetChatCompactSummaryCardProps) {
  const summary = structured.compactSummary ?? buildLocalCompactSummary(structured, locale);
  if (!summary || summary.facts.length === 0) {
    return null;
  }

  const responseLabel = fleetChatResponseTypeLabel(structured.responseType, locale);
  const vehicleLabel = structured.vehicle
    ? [structured.vehicle.licensePlate, structured.vehicle.displayName].filter(Boolean).join(' · ')
    : null;

  const showLastKnownWarning = structured.dataFreshness.isLastKnown;
  const showLimitedWarning =
    structured.warnings.some((w) => /limited|begrenzt|teil/i.test(w)) ||
    structured.responseType === 'PARTIAL_DATA';
  const showInconsistentWarning =
    isWarningResponseType(structured.responseType) &&
    structured.responseType === 'INCONSISTENT_STATE';

  const borderClass = isDarkMode ? 'border-neutral-800' : 'border-gray-200/60';
  const surfaceClass = isDarkMode ? 'surface-premium' : 'bg-gray-50/80';

  const headline =
    summary.headline && shouldCollapseNarrative(structured, content)
      ? summary.headline
      : null;

  return (
    <div
      className={`mt-2 rounded-lg border ${borderClass} ${surfaceClass} overflow-hidden`}
      data-testid="fleet-chat-compact-summary"
      data-response-type={structured.responseType}
      role="region"
      aria-label={locale === 'en' ? 'Structured summary' : 'Strukturierte Zusammenfassung'}
    >
      <div className={`px-2.5 py-2 border-b ${borderClass} flex flex-wrap items-center gap-1.5`}>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${compactToneBgClass(summary.statusTone)} ${compactToneTextClass(summary.statusTone)}`}
        >
          {responseLabel}
        </span>
        {vehicleLabel && (
          <span className={`inline-flex items-center gap-1 text-[10px] ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
            <Icon name="car" className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span className="break-all">{vehicleLabel}</span>
          </span>
        )}
        {structured.partial && (
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${isDarkMode ? 'bg-status-attention-soft text-[color:var(--status-attention)]' : 'bg-status-attention-soft text-[color:var(--status-attention)]'}`}
            role="status"
          >
            {locale === 'en' ? 'Partial' : 'Teil'}
          </span>
        )}
      </div>

      {headline && (
        <p className={`px-2.5 pt-2 text-xs font-semibold leading-snug ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
          {headline}
        </p>
      )}

      {(showLastKnownWarning || showLimitedWarning || showInconsistentWarning) && (
        <div className="px-2.5 pt-2 space-y-1" role="status" aria-live="polite">
          {showLastKnownWarning && (
            <p className="text-[10px] flex items-start gap-1.5 text-[color:var(--status-attention)]">
              <Icon name="alert-triangle" className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{locale === 'en' ? 'Last-known position — not live' : 'Letzte bekannte Position — nicht live'}</span>
            </p>
          )}
          {showLimitedWarning && (
            <p className="text-[10px] flex items-start gap-1.5 text-[color:var(--status-attention)]">
              <Icon name="alert-circle" className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{locale === 'en' ? 'Limited data available' : 'Begrenzte Datenlage'}</span>
            </p>
          )}
          {showInconsistentWarning && (
            <p className="text-[10px] flex items-start gap-1.5 text-[color:var(--status-attention)]">
              <Icon name="alert-triangle" className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{locale === 'en' ? 'Inconsistent data state' : 'Inkonsistenter Datenstand'}</span>
            </p>
          )}
        </div>
      )}

      <dl className="px-2.5 py-2 space-y-1.5 min-w-0">
        {summary.facts.map((fact) => (
          <div key={fact.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,38%)_1fr] gap-x-2 gap-y-0.5 min-w-0">
            <dt className={`text-[10px] font-semibold shrink-0 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
              {fact.label}
            </dt>
            <dd
              className={`text-[10px] break-words font-mono tabular-nums min-w-0 ${
                fact.tone ? compactToneTextClass(fact.tone) : isDarkMode ? 'text-gray-300' : 'text-gray-700'
              }`}
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      {structured.actions && structured.actions.length > 0 && (
        <div className={`px-2.5 py-2 border-t ${borderClass}`}>
          <p className={`text-[10px] font-semibold mb-1 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
            {locale === 'en' ? 'Next action' : 'Nächste Aktion'}
          </p>
          <p className="text-[10px] leading-snug">
            {locale === 'en' ? structured.actions[0].messageEn : structured.actions[0].messageDe}
          </p>
        </div>
      )}

      {isClarificationResponseType(structured.responseType) && (
        <div className={`px-2.5 py-2 border-t ${borderClass} text-[10px] text-[color:var(--status-info)]`}>
          {locale === 'en' ? 'Please clarify your question.' : 'Bitte Anfrage präzisieren.'}
        </div>
      )}
    </div>
  );
}

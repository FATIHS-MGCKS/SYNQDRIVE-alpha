import { Icon } from '../../components/ui/Icon';
import type { FleetChatStructuredPayload } from '../../lib/ai-chat/fleet-chat-response.types';
import {
  fleetChatResponseTypeLabel,
  isWarningResponseType,
  formatFleetDataAgeLabel,
  formatVehicleRefLabel,
  sanitizeSourceLabel,
} from '../../lib/ai-chat/fleet-chat-response-display';

export interface FleetChatResponseMetadataProps {
  structured: FleetChatStructuredPayload;
  isDarkMode: boolean;
  locale?: 'de' | 'en';
  showTechnicalDetails?: boolean;
  technicalDetails?: { correlationId?: string; code?: string };
}

export function FleetChatResponseMetadata({
  structured,
  isDarkMode,
  locale = 'de',
  showTechnicalDetails = false,
  technicalDetails,
}: FleetChatResponseMetadataProps) {
  const responseLabel = fleetChatResponseTypeLabel(structured.responseType, locale);
  const vehicleLabel = formatVehicleRefLabel(structured.vehicle, locale);
  const freshnessLabel = formatFleetDataAgeLabel(structured.dataFreshness, locale);
  const sourceLabels = structured.sources.map((s: { label: string }) => sanitizeSourceLabel(s.label, locale));
  const hasWarnings = structured.warnings.length > 0;
  const showStatusBanner = isWarningResponseType(structured.responseType) || structured.partial || hasWarnings;

  const muted = isDarkMode ? 'text-muted-foreground' : 'text-gray-500';
  const warnBg = isDarkMode ? 'bg-amber-900/20 border-amber-800/40' : 'bg-amber-50 border-amber-200';
  const infoBg = isDarkMode ? 'surface-premium border-neutral-800' : 'bg-gray-50/80 border-gray-200/60';

  return (
    <div
      className="mt-2 space-y-2"
      role="region"
      aria-label={locale === 'en' ? 'Response metadata' : 'Antwort-Metadaten'}
      data-testid="fleet-chat-response-metadata"
      data-response-type={structured.responseType}
    >
      <div className={`flex flex-wrap items-center gap-1.5 text-[10px] ${muted}`}>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold ${
            isDarkMode ? 'bg-purple-500/10 text-purple-300' : 'bg-purple-50 text-purple-700'
          }`}
        >
          {responseLabel}
        </span>
        {vehicleLabel && (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${infoBg} border`}>
            <Icon name="car" className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>{vehicleLabel}</span>
          </span>
        )}
        {structured.partial && (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold ${warnBg} border`}
            role="status"
          >
            {locale === 'en' ? 'Partial result' : 'Teilergebnis'}
          </span>
        )}
      </div>

      {showStatusBanner && (
        <div
          className={`rounded-lg px-2.5 py-2 text-[10px] border ${warnBg}`}
          role="status"
          aria-live="polite"
        >
          {structured.responseType === 'PERMISSION_RESTRICTED' && (
            <p className="font-semibold mb-0.5">
              {locale === 'en' ? 'Permission required' : 'Fehlende Berechtigung'}
            </p>
          )}
          {structured.responseType === 'AMBIGUITY_QUESTION' && (
            <p className="font-semibold mb-0.5">
              {locale === 'en' ? 'Clarification needed' : 'Mehrdeutigkeit — Rückfrage'}
            </p>
          )}
          {structured.responseType === 'TEMPORARY_UNAVAILABLE' && (
            <p className="font-semibold mb-0.5">
              {locale === 'en' ? 'Temporarily unavailable' : 'Vorübergehend nicht verfügbar'}
            </p>
          )}
          {structured.responseType === 'INCONSISTENT_STATE' && (
            <p className="font-semibold mb-0.5">
              {locale === 'en' ? 'Inconsistent data state' : 'Inkonsistenter Datenstand'}
            </p>
          )}
          {structured.responseType === 'PARTIAL_DATA' && (
            <p className="font-semibold mb-0.5">
              {locale === 'en' ? 'Partial data available' : 'Nur Teildaten verfügbar'}
            </p>
          )}
        </div>
      )}

      <div className={`rounded-lg px-2.5 py-2 border text-[10px] ${infoBg}`}>
        <div className={`flex items-center gap-1.5 font-semibold mb-1 ${muted}`}>
          <Icon name="clock" className="w-3 h-3" aria-hidden="true" />
          <span>{locale === 'en' ? 'Data freshness' : 'Datenfrische'}</span>
        </div>
        <p>{freshnessLabel}</p>
      </div>

      {sourceLabels.length > 0 && (
        <div className={`rounded-lg px-2.5 py-2 border text-[10px] ${infoBg}`}>
          <div className={`flex items-center gap-1.5 font-semibold mb-1 ${muted}`}>
            <Icon name="database" className="w-3 h-3" aria-hidden="true" />
            <span>{locale === 'en' ? 'Sources' : 'Quellen'}</span>
          </div>
          <ul className="space-y-0.5" aria-label={locale === 'en' ? 'Sources' : 'Quellen'}>
            {sourceLabels.map((label: string, idx: number) => (
              <li key={`${label}-${idx}`}>{label}</li>
            ))}
          </ul>
        </div>
      )}

      {hasWarnings && (
        <div
          className={`rounded-lg px-2.5 py-2 text-[10px] border ${warnBg}`}
          role="alert"
        >
          <div className="flex items-center gap-1.5 font-semibold mb-1">
            <Icon name="alert-triangle" className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>{locale === 'en' ? 'Warnings' : 'Warnungen'}</span>
          </div>
          <ul>
            {structured.warnings.map((warning: string, idx: number) => (
              <li key={`warn-${idx}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {structured.actions && structured.actions.length > 0 && (
        <div className={`rounded-lg px-2.5 py-2 border text-[10px] ${infoBg}`}>
          <p className={`font-semibold mb-1 ${muted}`}>
            {locale === 'en' ? 'Suggested actions' : 'Empfohlene Schritte'}
          </p>
          <ul>
            {structured.actions.map((action: { kind: string; messageDe: string; messageEn: string }) => (
              <li key={action.kind}>
                {locale === 'en' ? action.messageEn : action.messageDe}
              </li>
            ))}
          </ul>
        </div>
      )}

      {showTechnicalDetails && technicalDetails?.correlationId && (
        <details className={`text-[10px] ${muted}`} data-testid="fleet-chat-technical-details">
          <summary className="cursor-pointer hover:underline">
            {locale === 'en' ? 'Technical error details' : 'Technische Fehlerdetails'}
          </summary>
          <p className="mt-1 font-mono break-all">
            Correlation ID: {technicalDetails.correlationId}
          </p>
          {technicalDetails.code && (
            <p className="font-mono break-all">Code: {technicalDetails.code}</p>
          )}
        </details>
      )}
    </div>
  );
}

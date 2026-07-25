import type { FleetChatStructuredPayload } from '../../lib/ai-chat/fleet-chat-response.types';
import { FleetChatCompactSummaryCard } from './FleetChatCompactSummaryCard';
import { FleetChatTechnicalErrorDetails } from './FleetChatTechnicalErrorDetails';
import { renderSafeMarkdown } from '../../lib/ai-chat/safe-markdown';
import { shouldCollapseNarrative } from '../../lib/ai-chat/fleet-chat-compact-display';
import { sanitizeSourceLabel } from '../../lib/ai-chat/fleet-chat-response-display';

export interface FleetChatStructuredContentProps {
  structured: FleetChatStructuredPayload;
  content: string;
  isDarkMode: boolean;
  locale?: 'de' | 'en';
  isError?: boolean;
  technicalDetails?: { correlationId?: string; code?: string };
}

export function FleetChatStructuredContent({
  structured,
  content,
  isDarkMode,
  locale = 'de',
  isError,
  technicalDetails,
}: FleetChatStructuredContentProps) {
  const collapseNarrative = shouldCollapseNarrative(structured, content);
  const muted = isDarkMode ? 'text-muted-foreground' : 'text-gray-500';

  return (
    <div data-testid="fleet-chat-structured-content">
      <FleetChatCompactSummaryCard
        structured={structured}
        content={content}
        isDarkMode={isDarkMode}
        locale={locale}
      />

      {!collapseNarrative && (
        <div className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>
          {renderSafeMarkdown(content, { isDarkMode })}
        </div>
      )}

      {collapseNarrative && content.trim() && (
        <details className={`mt-2 text-[10px] ${muted}`}>
          <summary className="cursor-pointer hover:underline">
            {locale === 'en' ? 'Full answer' : 'Vollständige Antwort'}
          </summary>
          <div className={`mt-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            {renderSafeMarkdown(content, { isDarkMode })}
          </div>
        </details>
      )}

      {!isError && structured.warnings.length > 0 && (
        <div
          className={`mt-2 rounded-lg px-2.5 py-2 text-[10px] border ${
            isDarkMode ? 'bg-status-attention-soft border-amber-800/40' : 'bg-amber-50 border-amber-200'
          }`}
          role="alert"
        >
          <ul className="space-y-0.5">
            {structured.warnings.map((warning, idx) => (
              <li key={`w-${idx}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {!isError && structured.sources.length > 0 && (
        <p className={`mt-2 text-[10px] ${muted}`}>
          <span className="font-semibold">{locale === 'en' ? 'Sources' : 'Quellen'}: </span>
          <span className="break-words">
            {structured.sources.map((s) => sanitizeSourceLabel(s.label, locale)).join(' · ')}
          </span>
        </p>
      )}

      {isError && technicalDetails && (
        <FleetChatTechnicalErrorDetails
          technicalDetails={technicalDetails}
          locale={locale}
          isDarkMode={isDarkMode}
        />
      )}
    </div>
  );
}

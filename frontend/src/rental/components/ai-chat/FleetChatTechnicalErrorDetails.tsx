export interface FleetChatTechnicalErrorDetailsProps {
  technicalDetails?: { correlationId?: string; code?: string };
  locale?: 'de' | 'en';
  isDarkMode?: boolean;
}

export function FleetChatTechnicalErrorDetails({
  technicalDetails,
  locale = 'de',
  isDarkMode = false,
}: FleetChatTechnicalErrorDetailsProps) {
  if (!technicalDetails?.correlationId && !technicalDetails?.code) {
    return null;
  }

  const muted = isDarkMode ? 'text-muted-foreground' : 'text-gray-500';

  return (
    <details className={`mt-2 text-[10px] ${muted}`} data-testid="fleet-chat-technical-details">
      <summary className="cursor-pointer hover:underline">
        {locale === 'en' ? 'Technical error details' : 'Technische Fehlerdetails'}
      </summary>
      {technicalDetails.correlationId && (
        <p className="mt-1 font-mono break-all">
          Correlation ID: {technicalDetails.correlationId}
        </p>
      )}
      {technicalDetails.code && (
        <p className="font-mono break-all">Code: {technicalDetails.code}</p>
      )}
    </details>
  );
}

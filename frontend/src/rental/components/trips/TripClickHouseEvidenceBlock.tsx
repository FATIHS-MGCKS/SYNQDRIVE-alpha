import type { TripClickHouseEvidence } from '../../../lib/api';
import {
  clickhouseStatusHintDe,
  signalQualityLabelDe,
} from './trip-evidence-ui';

interface TripClickHouseEvidenceBlockProps {
  evidence?: TripClickHouseEvidence | null;
}

/**
 * Minimal read-only CH evidence hints for Trip Detail — not a score panel.
 */
export function TripClickHouseEvidenceBlock({
  evidence,
}: TripClickHouseEvidenceBlockProps) {
  if (!evidence) return null;

  const statusHint = clickhouseStatusHintDe(evidence.clickhouseStatus);
  const showSummary =
    evidence.evidenceAvailable ||
    evidence.evidenceSummary.length > 0 ||
    evidence.degraded;

  if (!showSummary) return null;

  return (
    <details className="mt-2 rounded-md border border-border/40 bg-muted/20 px-2.5 py-2 text-[10px]">
      <summary className="cursor-pointer select-none font-medium text-muted-foreground">
        Telemetrie-Evidence (read-only)
        {evidence.signalQuality && (
          <span className="ml-1.5 font-normal">
            · Signalqualität {signalQualityLabelDe(evidence.signalQuality)}
          </span>
        )}
      </summary>
      <div className="mt-1.5 space-y-1 text-muted-foreground">
        {statusHint && (
          <p className="text-amber-700 dark:text-amber-400">{statusHint}</p>
        )}
        <ul className="list-disc space-y-0.5 pl-4">
          {evidence.evidenceSummary.slice(0, 6).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {evidence.missingSignals.length > 0 && (
          <p className="pt-0.5">
            Fehlende Schlüsselsignale: {evidence.missingSignals.join(', ')}
          </p>
        )}
      </div>
    </details>
  );
}

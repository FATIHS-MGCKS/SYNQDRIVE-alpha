import type { TripBehaviorEvent } from './timeline.types';
import {
  confidenceLabelDisplay,
  contextDisplayClassifications,
  contextHeadline,
  contextClassificationLabel,
  contextKeyValues,
  contextReasonCodes,
  contextSparseSignalNotes,
  evidenceGradeShort,
  formatMissingSignals,
  isContextInsufficient,
  shouldRenderContextBlock,
} from './event-context-ui';

interface TripEventContextBlockProps {
  event: TripBehaviorEvent;
}

/**
 * Prominent, non-detecting display of backend `contextAssessment` for native events.
 * UI only labels data the backend already produced.
 */
export function TripEventContextBlock({ event }: TripEventContextBlockProps) {
  const ca = event.contextAssessment;
  if (!shouldRenderContextBlock(ca)) return null;

  const insufficient = isContextInsufficient(ca);
  const headline = contextHeadline(ca);
  const classificationChips = insufficient ? [] : contextDisplayClassifications(ca);
  const keyValues = insufficient ? [] : contextKeyValues(ca);
  const reasonCodes = contextReasonCodes(ca);
  const sparseNotes = insufficient ? [] : contextSparseSignalNotes(ca);
  const missingSignals = insufficient ? formatMissingSignals(ca) : [];

  return (
    <div className="mt-2.5 rounded-xl border border-sky-500/25 bg-sky-500/[0.06] px-3 py-2.5 dark:bg-sky-500/[0.08]">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full border border-sky-500/35 bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
          Kontextbewertung
        </span>
        {ca!.status === 'FAILED' && (
          <span className="text-[9px] font-medium text-amber-600 dark:text-amber-400">
            Auswertung fehlgeschlagen
          </span>
        )}
      </div>

      <p
        className={`mt-1.5 text-[12px] font-semibold leading-snug ${
          insufficient ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'
        }`}
      >
        {headline}
      </p>

      {classificationChips.length > 1 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {classificationChips.map((code) => (
            <span
              key={code}
              className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-800 dark:text-sky-200"
            >
              {contextClassificationLabel(code)}
            </span>
          ))}
        </div>
      )}

      {!insufficient && (ca!.confidence || ca!.evidenceGrade) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {ca!.confidence && ca!.confidence !== 'INSUFFICIENT' && (
            <span className="rounded-md border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] font-medium text-foreground">
              {confidenceLabelDisplay(ca!.confidence)}
            </span>
          )}
          {ca!.evidenceGrade && (
            <span className="rounded-md border border-border/60 bg-background/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {evidenceGradeShort(ca!.evidenceGrade)}
            </span>
          )}
        </div>
      )}

      {keyValues.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {keyValues.map((item) => (
            <span key={item.label} className="text-[10px] text-muted-foreground tabular-nums">
              {item.label}:{' '}
              <span className="font-semibold text-foreground">{item.value}</span>
            </span>
          ))}
        </div>
      )}

      {sparseNotes.length > 0 && (
        <p className="mt-1.5 text-[10px] text-amber-700/90 dark:text-amber-300/90">
          Signalqualität: {sparseNotes.join(' · ')}
        </p>
      )}

      {reasonCodes.length > 0 && !insufficient && (
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground/80">Hinweise: </span>
          {reasonCodes.join(' · ')}
        </p>
      )}

      {insufficient && missingSignals.length > 0 && (
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground/80">Fehlende Signale: </span>
          {missingSignals.join(' · ')}
        </p>
      )}

      {insufficient && (
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          Das native DIMO-Ereignis ist erkannt; die Kontextanalyse konnte wegen unzureichender
          Signaldaten keine belastbare Einordnung liefern.
        </p>
      )}
    </div>
  );
}

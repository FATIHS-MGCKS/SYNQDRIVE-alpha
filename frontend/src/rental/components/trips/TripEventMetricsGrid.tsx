import type { TripBehaviorEvent } from './trips.types';
import {
  contextKeyValues,
  isContextInsufficient,
  shouldRenderContextBlock,
} from './event-context-ui';
import {
  formatLegacyMeasurements,
  formatEventEvidence,
  type EventEvidenceItem,
} from './behavior-ui.utils';

function uncertaintyLabels(event: TripBehaviorEvent): string[] {
  const ca = event.contextAssessment;
  if (!ca || !shouldRenderContextBlock(ca)) return [];

  const labels: string[] = [];
  if (isContextInsufficient(ca) || ca.confidence === 'INSUFFICIENT') {
    labels.push('Unsichere Datenlage');
  } else if (ca.confidence === 'LOW') {
    labels.push('Niedrige Sicherheit');
  }

  if (ca.evidenceGrade === 'C' || ca.evidenceGrade === 'D') {
    labels.push('Unvollständiger Kontext');
  }

  return labels;
}

function collectMetrics(event: TripBehaviorEvent): EventEvidenceItem[] {
  const ca = event.contextAssessment;
  const hasContext = shouldRenderContextBlock(ca);

  if (hasContext && ca && !isContextInsufficient(ca)) {
    const fromContext = contextKeyValues(ca);
    if (fromContext.length > 0) {
      return fromContext.map((item) => ({ label: item.label, value: item.value }));
    }
  }

  const legacy = formatLegacyMeasurements(event);
  const extra = formatEventEvidence(event).filter(
    (item) => !legacy.some((l) => l.label === item.label),
  );

  return [...legacy, ...extra];
}

interface TripEventMetricsGridProps {
  event: TripBehaviorEvent;
}

export function TripEventMetricsGrid({ event }: TripEventMetricsGridProps) {
  const metrics = collectMetrics(event);
  if (metrics.length === 0) return null;

  return (
    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
      {metrics.map((item) => (
        <div key={item.label} className="min-w-0">
          <p className="text-[9px] font-medium text-muted-foreground">{item.label}</p>
          <p className="text-[10px] font-semibold tabular-nums text-foreground break-words">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

interface TripEventUncertaintyBadgesProps {
  event: TripBehaviorEvent;
}

export function TripEventUncertaintyBadges({ event }: TripEventUncertaintyBadgesProps) {
  const labels = uncertaintyLabels(event);
  if (labels.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-full border border-amber-500/25 bg-amber-500/8 px-1.5 py-0.5 text-[8px] font-semibold text-amber-700 dark:text-amber-400"
        >
          {label}
        </span>
      ))}
    </div>
  );
}

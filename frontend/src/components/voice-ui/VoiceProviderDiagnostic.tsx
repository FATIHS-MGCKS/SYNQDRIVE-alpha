import { Skeleton } from '../ui/skeleton';
import { StatusDot } from '../patterns';
import { cn } from '../ui/utils';
import { VOICE_PANEL_CLASS } from './voice-ui.tokens';
import type { VoiceDiagnosticRow } from './voice-ui.types';
import { VoiceSectionHeader } from './VoiceSectionHeader';

export interface VoiceProviderDiagnosticProps {
  title?: string;
  description?: string;
  rows: VoiceDiagnosticRow[];
  className?: string;
}

function diagnosticTone(status: VoiceDiagnosticRow['status']) {
  switch (status) {
    case 'ok':
      return 'success' as const;
    case 'warn':
      return 'watch' as const;
    case 'error':
      return 'critical' as const;
    default:
      return 'neutral' as const;
  }
}

/**
 * Generic integration diagnostic grid — labels and values are caller-provided.
 * No provider identifiers or business logic in this presentation component.
 */
export function VoiceProviderDiagnostic({
  title = 'Integration diagnostics',
  description,
  rows,
  className,
}: VoiceProviderDiagnosticProps) {
  return (
    <section className={cn(VOICE_PANEL_CLASS, 'p-4', className)} aria-label={title}>
      <VoiceSectionHeader title={title} description={description} />
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5"
          >
            <div className="flex min-w-0 items-start gap-2">
              {row.status === 'loading' ? (
                <Skeleton className="mt-1 h-2 w-2 rounded-full" />
              ) : (
                <StatusDot tone={diagnosticTone(row.status)} className="mt-1.5" />
              )}
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground">{row.label}</p>
                {row.hint && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{row.hint}</p>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right text-[12px] font-medium tabular-nums text-foreground">
              {row.status === 'loading' ? (
                <Skeleton className="ml-auto h-3.5 w-16" />
              ) : (
                row.value ?? '—'
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

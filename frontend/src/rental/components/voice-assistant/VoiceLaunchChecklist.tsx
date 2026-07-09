import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { TAB_DISPLAY_NAMES, type LaunchChecklistItem, type VoiceTab } from './voice-assistant.ops';

interface VoiceLaunchChecklistProps {
  items: LaunchChecklistItem[];
  onNavigate: (tab: VoiceTab) => void;
}

export function VoiceLaunchChecklist({ items, onNavigate }: VoiceLaunchChecklistProps) {
  const required = items.filter(i => !i.optional);
  const complete = required.filter(i => i.ok).length;

  return (
    <section className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)] sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold tracking-[-0.02em] text-foreground">Launch checklist</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Pre-flight validation before activating your voice assistant.
          </p>
        </div>
        <StatusChip tone={complete === required.length ? 'success' : 'watch'} className="text-[10px]">
          {complete}/{required.length} required
        </StatusChip>
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <div
            key={item.id}
            className={cn(
              'flex flex-col gap-2 rounded-xl border px-3 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between',
              item.ok
                ? 'border-[color:var(--status-positive)]/20 bg-[color:var(--status-positive)]/[0.03]'
                : 'border-border/50 bg-muted/20',
            )}
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <Icon
                name={item.ok ? 'check-circle-2' : 'circle'}
                className={cn('mt-0.5 h-4 w-4 shrink-0', item.ok ? 'text-[color:var(--status-positive)]' : 'text-muted-foreground')}
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[12px] font-semibold text-foreground">{item.label}</p>
                  {item.optional && (
                    <StatusChip tone="neutral" className="text-[9px]">Optional</StatusChip>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{item.description}</p>
              </div>
            </div>
            {!item.ok && (
              <button
                type="button"
                onClick={() => onNavigate(item.tab)}
                className="sq-press shrink-0 self-start rounded-lg border border-border/60 surface-premium px-3 py-1.5 text-[10px] font-semibold text-foreground transition-all hover:bg-muted sm:self-center"
              >
                Fix in {TAB_DISPLAY_NAMES[item.tab]}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';
import { NAV_GROUPS, type VoiceTab } from './voice-assistant.ops';

interface VoiceSectionNavProps {
  activeTab: VoiceTab;
  onChange: (tab: VoiceTab) => void;
}

export function VoiceSectionNav({ activeTab, onChange }: VoiceSectionNavProps) {
  return (
    <nav
      className="sq-card rounded-2xl border border-border/40 p-2 shadow-[var(--shadow-1)]"
      aria-label="Voice assistant sections"
    >
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_GROUPS.map(group => (
          <div
            key={group.id}
            className="flex min-w-0 shrink-0 flex-col gap-1 rounded-xl border border-border/30 bg-muted/20 p-1.5"
          >
            <p className="px-2 text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {group.label}
            </p>
            <div className="flex flex-wrap gap-1">
              {group.items.map(item => {
                const active = activeTab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onChange(item.key)}
                    className={cn(
                      'sq-press inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold whitespace-nowrap transition-all',
                      active
                        ? 'bg-card text-foreground shadow-[var(--shadow-1)] ring-1 ring-[color:var(--brand)]/20'
                        : 'text-muted-foreground hover:bg-card/80 hover:text-foreground',
                    )}
                  >
                    <Icon name={item.icon as 'settings'} className="h-3.5 w-3.5 shrink-0" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

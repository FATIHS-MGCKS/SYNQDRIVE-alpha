import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';
import { NAV_ITEMS, type WhatsAppTab } from './whatsapp.ops';

interface WhatsAppSectionNavProps {
  activeTab: WhatsAppTab;
  unreadTotal?: number;
  onChange: (tab: WhatsAppTab) => void;
}

export function WhatsAppSectionNav({ activeTab, unreadTotal, onChange }: WhatsAppSectionNavProps) {
  return (
    <nav
      className="sq-card rounded-2xl border border-border/40 p-2 shadow-[var(--shadow-1)]"
      aria-label="WhatsApp sections"
    >
      <div className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_ITEMS.map(item => {
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              title={item.desc}
              className={cn(
                'sq-press inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-semibold transition-all',
                active
                  ? 'bg-card text-foreground shadow-[var(--shadow-1)] ring-1 ring-[color:var(--brand)]/20'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground',
              )}
            >
              <Icon name={item.icon as 'settings'} className="h-3.5 w-3.5" />
              {item.label}
              {item.key === 'inbox' && (unreadTotal ?? 0) > 0 && (
                <span className="rounded-md bg-[color:var(--status-watch)]/15 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-[color:var(--status-watch)]">
                  {unreadTotal}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

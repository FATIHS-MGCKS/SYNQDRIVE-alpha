import { Icon } from '../ui/Icon';
import {
  chromeSectionNavClass,
  chromeSectionNavItemClass,
} from '../../../components/patterns/chrome-tab-bar';
import { NAV_ITEMS, type WhatsAppTab } from './whatsapp.ops';

interface WhatsAppSectionNavProps {
  activeTab: WhatsAppTab;
  unreadTotal?: number;
  onChange: (tab: WhatsAppTab) => void;
}

export function WhatsAppSectionNav({ activeTab, unreadTotal, onChange }: WhatsAppSectionNavProps) {
  return (
    <nav className={chromeSectionNavClass()} aria-label="WhatsApp sections">
      <div className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              title={item.desc}
              className={chromeSectionNavItemClass(active)}
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

import {
  CalendarDays,
  Car,
  ListTodo,
  MoreHorizontal,
  ScanLine,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { OperatorTab } from '../lib/operatorTypes';
import { useOperatorShell } from '../context/OperatorShellContext';
import {
  operatorShellNavigationAriaLabel,
  operatorShellNavigationTabLabel,
} from '../lib/operator-shell-navigation-i18n';

const NAV_ITEMS: { id: OperatorTab; icon: typeof CalendarDays }[] = [
  { id: 'today', icon: CalendarDays },
  { id: 'scan', icon: ScanLine },
  { id: 'vehicles', icon: Car },
  { id: 'tasks', icon: ListTodo },
  { id: 'more', icon: MoreHorizontal },
];

export function OperatorBottomNav() {
  const { locale } = useLanguage();
  const { activeTab, setActiveTab } = useOperatorShell();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 surface-frosted"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      aria-label={operatorShellNavigationAriaLabel(locale)}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1 md:max-w-none">
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              data-active={active ? 'true' : undefined}
              className={`sq-press flex min-h-[52px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors ${
                active
                  ? 'text-[color:var(--brand-ink)]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                  active ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]' : ''
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 2} />
              </span>
              <span>{operatorShellNavigationTabLabel(locale, item.id)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

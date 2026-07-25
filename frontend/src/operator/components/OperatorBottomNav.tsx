import {
  CalendarDays,
  Car,
  ListTodo,
  MoreHorizontal,
  ScanLine,
} from 'lucide-react';
import type { OperatorTab } from '../lib/operatorTypes';
import { useOperatorShell } from '../context/OperatorShellContext';
import { OPERATOR_TAB_PERMISSIONS } from '../lib/operatorPermissionGate.utils';
import { useOperatorPermissions } from '../hooks/useOperatorPermissions';

const NAV_ITEMS: { id: OperatorTab; label: string; icon: typeof CalendarDays }[] = [
  { id: 'today', label: 'Heute', icon: CalendarDays },
  { id: 'scan', label: 'Scan', icon: ScanLine },
  { id: 'vehicles', label: 'Fahrzeuge', icon: Car },
  { id: 'tasks', label: 'Aufgaben', icon: ListTodo },
  { id: 'more', label: 'Mehr', icon: MoreHorizontal },
];

export function OperatorBottomNav() {
  const { activeTab, setActiveTab } = useOperatorShell();
  const { loading, can, reason } = useOperatorPermissions();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-border/60 surface-frosted"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      aria-label="Operator navigation"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1 md:max-w-none">
        {NAV_ITEMS.map((item) => {
          const active = activeTab === item.id;
          const Icon = item.icon;
          const permitted = loading || can(OPERATOR_TAB_PERMISSIONS[item.id]);
          const denial = reason(OPERATOR_TAB_PERMISSIONS[item.id]);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (!permitted) return;
                setActiveTab(item.id);
              }}
              disabled={!permitted}
              aria-disabled={!permitted || undefined}
              title={!permitted ? denial : undefined}
              data-active={active ? 'true' : undefined}
              className={`sq-press flex min-h-[52px] min-w-[56px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors ${
                active
                  ? 'text-[color:var(--brand-ink)]'
                  : 'text-muted-foreground hover:text-foreground'
              } disabled:cursor-not-allowed disabled:opacity-40`}
              aria-current={active ? 'page' : undefined}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                  active ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]' : ''
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 2} />
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

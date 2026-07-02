import type { CustomerDetailTab } from './customerDetailTypes';

interface CustomerDetailTabBarProps {
  tabs: { key: CustomerDetailTab; label: string; count?: number }[];
  activeTab: CustomerDetailTab;
  onTabChange: (tab: CustomerDetailTab) => void;
}

export function CustomerDetailTabBar({ tabs, activeTab, onTabChange }: CustomerDetailTabBarProps) {
  return (
    <div className="sq-tab-bar p-1 flex items-center w-full" role="tablist" aria-label="Kundendetail Bereiche">
      <div className="flex flex-nowrap gap-0.5 flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((tab) => {
          const active = activeTab === tab.key;
          const label = tab.count != null ? `${tab.label} (${tab.count})` : tab.label;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange(tab.key)}
              className={`min-w-0 shrink-0 px-3.5 py-1.5 rounded-[calc(var(--radius-md)-2px)] text-[11px] leading-[16.2px] font-semibold tracking-[-0.003em] whitespace-nowrap transition-all duration-200 ${
                active
                  ? 'bg-card text-foreground shadow-[var(--shadow-1)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
              }`}
            >
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

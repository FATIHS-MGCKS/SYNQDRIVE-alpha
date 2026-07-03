import type { AccountSection } from './account-utils';

const SECTIONS: Array<{ id: AccountSection; label: string }> = [
  { id: 'profile', label: 'Profil' },
  { id: 'preferences', label: 'Arbeitspräferenzen' },
  { id: 'notifications', label: 'Benachrichtigungen' },
  { id: 'security', label: 'Sicherheit & Sitzungen' },
];

interface AccountSectionTabBarProps {
  activeSection: AccountSection;
  onSectionChange: (section: AccountSection) => void;
}

export function AccountSectionTabBar({
  activeSection,
  onSectionChange,
}: AccountSectionTabBarProps) {
  return (
    <div
      className="sq-tab-bar p-1 flex items-center w-full"
      role="tablist"
      aria-label="Kontobereiche"
    >
      <div className="flex flex-nowrap gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-thin [scrollbar-width:thin]">
        {SECTIONS.map((section) => {
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSectionChange(section.id)}
              className={`min-w-0 shrink-0 px-3.5 py-1.5 rounded-[calc(var(--radius-md)-2px)] text-[11px] leading-[16.2px] font-semibold tracking-[-0.003em] whitespace-nowrap transition-all duration-200 ${
                isActive
                  ? 'bg-card text-foreground shadow-[var(--shadow-1)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
              }`}
            >
              <span className="truncate">{section.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

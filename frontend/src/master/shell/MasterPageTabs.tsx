import type { ReactNode } from 'react';
import {
  CHROME_TAB_BAR_SCROLL_CLASS,
  chromeTabBarClass,
  chromeTabTriggerClass,
} from '../../components/patterns/chrome-tab-bar';
import { cn } from '../../components/ui/utils';

export interface MasterPageTab<T extends string = string> {
  id: T;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface MasterPageTabsProps<T extends string> {
  tabs: MasterPageTab<T>[];
  activeId: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  level?: 'primary' | 'secondary';
  testIdPrefix?: string;
  className?: string;
}

export function MasterPageTabs<T extends string>({
  tabs,
  activeId,
  onChange,
  ariaLabel,
  level = 'primary',
  testIdPrefix,
  className,
}: MasterPageTabsProps<T>) {
  return (
    <div
      className={cn(chromeTabBarClass('p-1'), className)}
      role="tablist"
      aria-label={ariaLabel}
      data-level={level}
      data-testid={testIdPrefix ? `${testIdPrefix}-tabbar` : undefined}
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {tabs.map((tab) => {
          const isActive = activeId === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={tab.disabled}
              data-testid={testIdPrefix ? `${testIdPrefix}-tab-${tab.id}` : undefined}
              onClick={() => onChange(tab.id)}
              className={chromeTabTriggerClass(isActive, 'max-sm:px-3 inline-flex items-center gap-1.5')}
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
              {tab.badge}
            </button>
          );
        })}
      </div>
    </div>
  );
}

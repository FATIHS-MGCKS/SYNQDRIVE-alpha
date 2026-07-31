import { cn } from '../ui/utils';
import {
  chromeSectionNavClass,
  chromeSectionNavItemClass,
  chromeTabBarClass,
  chromeTabTriggerClass,
} from '../patterns/chrome-tab-bar';
import { VOICE_FOCUS_RING, VOICE_TOUCH_TARGET } from './voice-ui.tokens';
import type { VoiceTabItem } from './voice-ui.types';

export interface VoiceResponsiveTabsProps {
  items: VoiceTabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  ariaLabel: string;
  /** Section nav (frosted chrome) or compact inset tab bar. */
  variant?: 'section' | 'tabs';
  className?: string;
}

/**
 * Mobile-first scrollable tabs shared by org ops and master admin voice surfaces.
 */
export function VoiceResponsiveTabs({
  items,
  activeKey,
  onChange,
  ariaLabel,
  variant = 'section',
  className,
}: VoiceResponsiveTabsProps) {
  const shellClass = variant === 'section' ? chromeSectionNavClass() : chromeTabBarClass();

  return (
    <nav className={cn(shellClass, className)} aria-label={ariaLabel}>
      <div className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active = item.key === activeKey;
          const itemClass =
            variant === 'section'
              ? chromeSectionNavItemClass(active, cn(VOICE_TOUCH_TARGET, 'shrink-0 rounded-lg px-3 py-2'))
              : chromeTabTriggerClass(active, cn(VOICE_TOUCH_TARGET, 'px-3.5'));

          return (
            <button
              key={item.key}
              type="button"
              disabled={item.disabled}
              onClick={() => onChange(item.key)}
              className={cn(itemClass, VOICE_FOCUS_RING, item.disabled && 'opacity-50')}
              aria-current={active ? 'page' : undefined}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

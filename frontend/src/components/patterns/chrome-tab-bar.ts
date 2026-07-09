import { cn } from '../ui/utils';

/** L2 frosted shell for sticky/floating tab bars and section nav chrome. */
export const CHROME_TAB_BAR_CLASS =
  'surface-frosted inline-flex items-center gap-0.5 rounded-xl p-[3px]';

export const CHROME_TAB_BAR_SCROLL_CLASS =
  'flex flex-nowrap gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-thin [scrollbar-width:thin]';

/** Base trigger — compact segmented control inside chrome shells. */
export const CHROME_TAB_TRIGGER_BASE =
  'min-w-0 shrink-0 rounded-[calc(var(--radius-md)-2px)] border border-transparent px-3.5 py-1.5 text-[11px] font-semibold leading-[16.2px] tracking-[-0.003em] whitespace-nowrap transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export const CHROME_TAB_TRIGGER_ACTIVE = 'surface-premium text-foreground';

export const CHROME_TAB_TRIGGER_INACTIVE =
  'text-muted-foreground hover:text-foreground hover:bg-background/40';

/** Radix TabsTrigger — full class string (static for Tailwind). */
export const CHROME_RADIX_TAB_TRIGGER_CLASS = [
  'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-[calc(var(--radius)-1px)] border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow,background-color,border-color] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50',
  CHROME_TAB_TRIGGER_INACTIVE,
  'data-[state=active]:surface-premium data-[state=active]:text-foreground',
].join(' ');

/** L0 solid segmented bar for tab controls embedded inside content cards (not chrome). */
export const INSET_SEGMENTED_BAR_CLASS = 'sq-tab-bar sq-tab-bar--inset';

export function chromeTabBarClass(className?: string): string {
  return cn(CHROME_TAB_BAR_CLASS, 'flex w-full items-center', className);
}

export function chromeTabTriggerClass(active: boolean, className?: string): string {
  return cn(
    CHROME_TAB_TRIGGER_BASE,
    active ? CHROME_TAB_TRIGGER_ACTIVE : CHROME_TAB_TRIGGER_INACTIVE,
    className,
  );
}

/** Section nav chrome (Voice/WhatsApp operator surfaces). */
export function chromeSectionNavClass(className?: string): string {
  return cn(
    'surface-frosted rounded-2xl p-2',
    className,
  );
}

export function chromeSectionNavItemClass(active: boolean, className?: string): string {
  return cn(
    'sq-press inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]',
    active ? CHROME_TAB_TRIGGER_ACTIVE : CHROME_TAB_TRIGGER_INACTIVE,
    className,
  );
}

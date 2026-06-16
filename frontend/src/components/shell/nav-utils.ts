import { cn } from '../ui/utils';

/** Shared section label for rental + master sidebars. */
export const navSectionLabelClass =
  'sq-section-label !text-[10px] !font-black !text-muted-foreground/80';

/** Primary sidebar nav item (expanded rail). */
export function navItemClass(active: boolean, collapsed = false): string {
  if (collapsed) {
    return cn(
      'w-8 h-8 flex items-center justify-center rounded-md transition-all duration-200 ease-out relative group',
      active
        ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
    );
  }
  return cn(
    'sq-nav-rail w-full flex items-center gap-2.5 px-2.5 py-[8px] rounded-lg transition-all duration-200 ease-out !text-[12px] font-semibold tracking-[-0.003em] group',
    active
      ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)] active ring-1 ring-[color:var(--brand-soft)] shadow-[var(--shadow-1)]'
      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground hover:translate-x-[1px]',
  );
}

/** Nested / sub-nav item (expanded rail). */
export function subNavItemClass(active: boolean): string {
  return cn(
    'sq-nav-rail w-full flex items-center gap-2.5 pl-4 pr-2.5 py-[7px] rounded-lg transition-all duration-200 ease-out !text-[12px] font-medium group',
    active
      ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)] active ring-1 ring-[color:var(--brand-soft)] shadow-[var(--shadow-1)]'
      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground hover:translate-x-[1px]',
  );
}

/** Collapsible section header button in the sidebar. */
export function navSectionHeaderClass(isOpen: boolean, isActive: boolean): string {
  return cn(
    'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer group transition-all duration-150',
    isActive
      ? 'bg-[color:var(--brand-soft)]/70 text-[color:var(--brand-ink)]'
      : isOpen
        ? 'bg-accent/25 text-foreground'
        : 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
  );
}

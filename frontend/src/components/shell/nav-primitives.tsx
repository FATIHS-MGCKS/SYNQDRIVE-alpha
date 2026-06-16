import type { ReactNode } from 'react';

/** Tooltip shown when the sidebar is collapsed. */
export function CollapsedNavTooltip({ label }: { label: string }) {
  return (
    <div className="sq-overlay absolute left-full ml-2 px-2 py-1 text-[10.5px] font-medium whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-foreground">
      {label}
    </div>
  );
}

export function NavComingSoonBadge({ children }: { children: ReactNode }) {
  return (
    <span className="sq-chip sq-chip-neutral !text-[8.5px] !px-1.5 !py-[1px] shrink-0">
      {children}
    </span>
  );
}

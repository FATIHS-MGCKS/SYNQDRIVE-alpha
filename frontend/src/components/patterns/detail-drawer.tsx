import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../ui/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '../ui/sheet';
import { type DialogSurface, type FooterSurface, surfaceClassName } from './surface';

/* ════════════════════════════════════════════════════════════════════
   DetailDrawer — one slide-over for every entity detail (vehicle,
   customer, booking, vendor, task, alert, health detail).
   Full-screen sheet on mobile, constrained panel on larger screens.
   ════════════════════════════════════════════════════════════════════ */

export interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Status chip / live indicator shown beside the title. */
  status?: ReactNode;
  /** Sticky footer (primary actions). */
  footer?: ReactNode;
  side?: 'right' | 'left';
  /** Width on >= sm screens. Defaults to a comfortable detail width. */
  widthClassName?: string;
  /** Radix Sheet open focus — use to keep mobile keyboard closed on drawer open. */
  onContentOpenAutoFocus?: (event: Event) => void;
  /** Accessible label for the header close control. */
  closeLabel?: string;
  children: ReactNode;
  className?: string;
  /** Drawer body surface — solid (L0) or elevated (L1). No glass/liquid. */
  surface?: DialogSurface;
  /** Sticky footer chrome — frosted (L2) or solid (L0). */
  footerSurface?: FooterSurface;
}

export function DetailDrawer({
  open,
  onOpenChange,
  title,
  eyebrow,
  description,
  status,
  footer,
  side = 'right',
  widthClassName = 'sm:max-w-lg',
  onContentOpenAutoFocus,
  closeLabel = 'Schließen',
  children,
  className,
  surface = 'solid',
  footerSurface = 'frosted',
}: DetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        showCloseButton={false}
        onOpenAutoFocus={onContentOpenAutoFocus}
        className={cn(
          'w-full gap-0 p-0 border-0 bg-transparent shadow-none text-foreground',
          surfaceClassName(surface),
          widthClassName,
          className,
        )}
      >
        <SheetHeader
          className={cn(
            'sticky top-0 z-10 border-b border-border/70 px-5 py-4',
            surfaceClassName('frosted'),
          )}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              {eyebrow && <div className="sq-section-label">{eyebrow}</div>}
              <div className="flex min-w-0 items-center gap-2.5">
                <SheetTitle className="min-w-0 truncate text-[16px]" data-slot="sheet-title">
                  {title}
                </SheetTitle>
                {status}
              </div>
              {description && (
                <SheetDescription className="text-[12.5px]">{description}</SheetDescription>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="sq-press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-foreground shadow-sm transition-colors hover:bg-muted"
              aria-label={closeLabel}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))]">
          {children}
        </div>

        {footer && (
          <div
            className={cn(
              'sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-border/70 px-5 py-3.5',
              surfaceClassName(footerSurface),
            )}
          >
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

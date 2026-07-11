import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';

export function NotificationCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 px-2 py-2" aria-busy aria-label="Loading notifications">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="flex gap-2.5 rounded-xl border border-border/25 px-3 py-2.5"
        >
          <div className={cnSkeleton(NOTIFICATION_PANEL_TYPO.iconWrap, 'rounded-lg')} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex gap-2">
              <div className={cnSkeleton('h-4 w-14 rounded-md')} />
              <div className={cnSkeleton('h-4 w-20 rounded-md')} />
              <div className={cnSkeleton('h-4 w-16 rounded-md')} />
            </div>
            <div className={cnSkeleton('h-4 w-[85%] rounded-md')} />
            <div className={cnSkeleton('h-3.5 w-[70%] rounded-md')} />
            <div className={cnSkeleton('h-3.5 w-full rounded-md')} />
            <div className={cnSkeleton('h-3.5 w-[90%] rounded-md')} />
            <div className={cnSkeleton('mt-1 h-8 w-28 rounded-md')} />
          </div>
        </div>
      ))}
    </div>
  );
}

function cnSkeleton(...parts: string[]): string {
  return ['animate-pulse bg-muted/50 motion-reduce:animate-none', ...parts].join(' ');
}

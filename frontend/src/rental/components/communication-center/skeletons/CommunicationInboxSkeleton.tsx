import { Skeleton } from '../../../../components/ui/skeleton';

export function CommunicationInboxSkeleton() {
  return (
    <div className="space-y-2 p-3" data-testid="communication-inbox-skeleton">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-start gap-2 rounded-lg border border-border/30 p-2.5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

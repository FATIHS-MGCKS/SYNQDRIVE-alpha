import { Skeleton } from '../../../../components/ui/skeleton';

export function CommunicationContextSkeleton() {
  return (
    <div className="space-y-4 p-4" data-testid="communication-context-skeleton">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-5/6" />
        </div>
      ))}
    </div>
  );
}

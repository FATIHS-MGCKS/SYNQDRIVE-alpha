import { Skeleton } from '../../../../components/ui/skeleton';

export function CommunicationDetailSkeleton({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div data-testid="communication-detail-skeleton" className="space-y-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-28" />
      </div>
    );
  }

  return (
    <div data-testid="communication-detail-skeleton" className="space-y-2 p-3">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

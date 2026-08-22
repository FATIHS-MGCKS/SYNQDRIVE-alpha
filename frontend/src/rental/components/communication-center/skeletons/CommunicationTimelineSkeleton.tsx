import { Skeleton } from '../../../../components/ui/skeleton';

export function CommunicationTimelineSkeleton() {
  return (
    <div className="space-y-3 p-4" data-testid="communication-timeline-skeleton">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className={index % 2 === 0 ? 'mr-12' : 'ml-12'}
        >
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function TripTimelineSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-4 w-32 rounded-md trips-skeleton" />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="trips-card-skeleton rounded-xl border border-border/40 overflow-hidden">
          <div className="px-4 py-3.5 space-y-2.5">
            <div className="h-4 w-36 rounded-md trips-skeleton" />
            <div className="h-3 w-48 max-w-full rounded-md trips-skeleton" />
            <div className="h-3 w-28 rounded-md trips-skeleton" />
            <div className="flex gap-1.5 pt-1">
              <div className="h-5 w-14 rounded-full trips-skeleton" />
              <div className="h-5 w-16 rounded-full trips-skeleton" />
              <div className="h-5 w-12 rounded-full trips-skeleton" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

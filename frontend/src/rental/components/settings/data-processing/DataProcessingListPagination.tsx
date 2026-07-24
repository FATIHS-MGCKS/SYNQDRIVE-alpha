interface Props {
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  itemCount: number;
  label?: string;
}

export function DataProcessingListPagination({
  loading,
  hasMore,
  onLoadMore,
  itemCount,
  label = 'Load more',
}: Props) {
  if (!hasMore) return null;

  return (
    <div className="flex justify-center pt-3">
      <button
        type="button"
        disabled={loading}
        onClick={onLoadMore}
        className="px-4 py-2 text-xs font-semibold rounded-xl border border-border hover:bg-muted/40 disabled:opacity-50"
        aria-busy={loading}
      >
        {loading ? '…' : `${label} (${itemCount})`}
      </button>
    </div>
  );
}

interface Props {
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  itemCount: number;
  label: string;
  loadingLabel?: string;
}

export function DataProcessingListPagination({
  loading,
  hasMore,
  onLoadMore,
  itemCount,
  label,
  loadingLabel = '…',
}: Props) {
  if (!hasMore) return null;

  return (
    <div className="flex justify-center pt-3">
      <button
        type="button"
        disabled={loading}
        onClick={onLoadMore}
        className="min-h-11 px-4 py-2 text-xs font-semibold rounded-xl border border-border hover:bg-muted/40 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
        aria-busy={loading || undefined}
      >
        {loading ? loadingLabel : `${label} (${itemCount})`}
      </button>
    </div>
  );
}

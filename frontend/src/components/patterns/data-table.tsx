import type { ReactNode } from 'react';
import { cn } from '../ui/utils';
import { EmptyState } from './states';

/* ════════════════════════════════════════════════════════════════════
   DataTable — one table layout for the whole app.
   Header, row hover, compact density, loading skeleton and empty state
   are all built in, so views stop hand-rolling <table> markup with
   ad-hoc gray borders.
   ════════════════════════════════════════════════════════════════════ */

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Render numeric cells with tabular mono figures. */
  numeric?: boolean;
  className?: string;
  headerClassName?: string;
  width?: string | number;
  /** Applied to `<th scope="col">` for sortable columns (not on nested buttons). */
  ariaSort?: 'ascending' | 'descending' | 'none';
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  loading?: boolean;
  skeletonRows?: number;
  /** Empty-state node, or a string title. */
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Per-row trailing action cell (rendered in its own sticky-right column). */
  rowActions?: (row: T) => ReactNode;
  dense?: boolean;
  /** Wrap in a bordered card (default true). */
  card?: boolean;
  stickyHeader?: boolean;
  className?: string;
  /** Optional per-row class (e.g. overdue highlight). */
  getRowClassName?: (row: T, index: number) => string | undefined;
  /** Optional stable Playwright selector per row. */
  getRowTestId?: (row: T, index: number) => string | undefined;
  /** Accessible name for the table (recommended when no visible caption). */
  ariaLabel?: string;
  /** Visible or screen-reader-only table caption. */
  caption?: ReactNode;
  /** Optional per-row ref (e.g. scroll-into-view on deep link). */
  rowRef?: (row: T, el: HTMLTableRowElement | null) => void;
}

const alignClass: Record<NonNullable<DataTableColumn<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  loading,
  skeletonRows = 6,
  empty,
  onRowClick,
  rowActions,
  dense,
  card = true,
  stickyHeader,
  className,
  getRowClassName,
  getRowTestId,
  rowRef,
  ariaLabel,
  caption,
}: DataTableProps<T>) {
  const cellPad = dense ? 'px-3 py-2' : 'px-3 py-2.5';
  const totalCols = columns.length + (rowActions ? 1 : 0);

  const body = (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-[13px]" aria-label={ariaLabel}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className={cn('sq-table-head', stickyHeader && 'sticky top-0 z-10')}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                aria-sort={col.ariaSort}
                style={{ width: col.width }}
                className={cn(
                  col.align ? alignClass[col.align] : 'text-left',
                  col.headerClassName,
                )}
              >
                {col.header}
              </th>
            ))}
            {rowActions && <th className="w-px text-right" aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={`skeleton-${i}`} className="border-b border-border/60">
                {Array.from({ length: totalCols }).map((__, j) => (
                  <td key={j} className={cellPad}>
                    <div
                      className="h-3.5 rounded bg-accent animate-pulse"
                      style={{ width: j === 0 ? '60%' : `${40 + ((i + j) % 4) * 12}%` }}
                    />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={totalCols} className="p-0">
                {typeof empty === 'string' || empty == null ? (
                  <EmptyState title={(empty as string) ?? 'No records found'} compact />
                ) : (
                  empty
                )}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={getRowKey(row, index)}
                ref={rowRef ? (el) => rowRef(row, el) : undefined}
                data-testid={getRowTestId?.(row, index)}
                className={cn(
                  'sq-table-row border-b border-border/60 last:border-0',
                  onRowClick && 'cursor-pointer',
                  getRowClassName?.(row, index),
                )}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      cellPad,
                      'align-middle text-foreground',
                      col.align ? alignClass[col.align] : 'text-left',
                      col.numeric && 'font-mono tabular-nums',
                      col.className,
                    )}
                  >
                    {col.cell(row, index)}
                  </td>
                ))}
                {rowActions && (
                  <td className={cn(cellPad, 'text-right')} onClick={(e) => e.stopPropagation()}>
                    {rowActions(row)}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  if (!card) return <div className={className}>{body}</div>;
  return <div className={cn('surface-premium overflow-hidden', className)}>{body}</div>;
}

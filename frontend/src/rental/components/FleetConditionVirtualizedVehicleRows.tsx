import { useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

const DEFAULT_ROW_ESTIMATE_PX = 88;
const VIRTUAL_LIST_MAX_HEIGHT_PX = 480;

export interface FleetConditionVirtualizedVehicleRowsProps<T> {
  items: T[];
  estimateSize?: number;
  getItemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
}

export function FleetConditionVirtualizedVehicleRows<T>({
  items,
  estimateSize = DEFAULT_ROW_ESTIMATE_PX,
  getItemKey,
  renderItem,
}: FleetConditionVirtualizedVehicleRowsProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 6,
    getItemKey: (index) => getItemKey(items[index]!, index),
  });

  return (
    <div
      ref={parentRef}
      className="max-h-[480px] overflow-y-auto"
      style={{ maxHeight: VIRTUAL_LIST_MAX_HEIGHT_PX }}
      data-testid="fleet-condition-virtualized-list"
    >
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index]!;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full border-b border-border/40"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {renderItem(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

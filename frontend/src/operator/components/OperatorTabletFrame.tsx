import type { ReactNode } from 'react';

interface OperatorTabletFrameProps {
  list: ReactNode;
  detail: ReactNode;
  showDetail: boolean;
}

/** Tablet split: list left, detail right. Mobile uses stacked children from parent. */
export function OperatorTabletFrame({ list, detail, showDetail }: OperatorTabletFrameProps) {
  return (
    <div className="flex h-full min-h-0 flex-1 gap-0 md:gap-4">
      <div
        className={`min-h-0 flex-shrink-0 overflow-hidden ${
          showDetail ? 'hidden md:flex md:w-[min(42%,360px)] md:flex-col' : 'flex w-full flex-col'
        }`}
      >
        {list}
      </div>
      {showDetail && (
        <div className="hidden min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex">{detail}</div>
      )}
    </div>
  );
}

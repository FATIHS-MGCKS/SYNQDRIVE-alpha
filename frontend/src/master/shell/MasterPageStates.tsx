import type { ReactNode } from 'react';
import {
  EmptyState,
  ErrorState,
  SkeletonCard,
  SkeletonMetricGrid,
  SkeletonRows,
} from '../../components/patterns/states';

export { EmptyState as MasterEmptyState, ErrorState as MasterErrorState };

export type MasterLoadingVariant = 'metric' | 'card' | 'rows' | 'table';

export interface MasterLoadingStateProps {
  variant?: MasterLoadingVariant;
  count?: number;
  className?: string;
}

export function MasterLoadingState({ variant = 'card', count = 3, className }: MasterLoadingStateProps) {
  if (variant === 'metric') {
    return <SkeletonMetricGrid count={count} className={className} />;
  }
  if (variant === 'rows') {
    return <SkeletonRows rows={count} className={className} />;
  }
  if (variant === 'table') {
    return <SkeletonCard className={className ?? 'h-48'} />;
  }
  return <SkeletonCard className={className ?? 'h-32'} />;
}

export interface MasterPermissionDeniedProps {
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function MasterPermissionDenied({
  title = 'Kein Zugriff',
  description = 'Sie haben keine Berechtigung, diesen Bereich anzuzeigen.',
  action,
}: MasterPermissionDeniedProps) {
  return <EmptyState title={title} description={description} action={action} />;
}

export interface MasterStaleDataHintProps {
  label: string;
  onRefresh?: () => void;
}

export function MasterStaleDataHint({ label, onRefresh }: MasterStaleDataHintProps) {
  return (
    <p className="text-[12px] text-muted-foreground" aria-live="polite">
      {label}
      {onRefresh && (
        <>
          {' '}
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={onRefresh}>
            Aktualisieren
          </button>
        </>
      )}
    </p>
  );
}

import type { ReactNode } from 'react';
import { DetailDrawer, PriorityBadge, StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { TaskDetailViewModel } from '../taskDetailView.utils';
import { TaskDetailBody, TaskDetailCompactHeader, TaskDetailLoadingSkeleton } from './TaskDetailBody';

export type TaskDetailShellVariant = 'drawer' | 'inline';

export interface TaskDetailShellProps {
  variant: TaskDetailShellVariant;
  model: TaskDetailViewModel | null;
  loading?: boolean;
  density?: 'desktop' | 'mobile';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  widthClassName?: string;
  closeLabel?: string;
  footer?: ReactNode;
  hideDrawerHeader?: boolean;
  children?: ReactNode;
  bodyProps?: Omit<
    React.ComponentProps<typeof TaskDetailBody>,
    'model' | 'density' | 'hideHeader'
  >;
  className?: string;
}

export function TaskDetailShell({
  variant,
  model,
  loading = false,
  density = 'desktop',
  open = false,
  onOpenChange,
  widthClassName = 'sm:max-w-xl',
  closeLabel = 'Schließen',
  footer,
  hideDrawerHeader = false,
  children,
  bodyProps,
  className,
}: TaskDetailShellProps) {
  if (variant === 'drawer') {
    return (
      <DetailDrawer
        open={open}
        onOpenChange={onOpenChange ?? (() => undefined)}
        title={hideDrawerHeader ? 'Aufgabe' : model?.header.title ?? 'Aufgabe'}
        eyebrow={hideDrawerHeader ? undefined : model?.header.eyebrow ?? undefined}
        description={
          hideDrawerHeader
            ? undefined
            : model
              ? <TaskDetailDrawerMeta model={model} />
              : undefined
        }
        status={
          hideDrawerHeader || !model ? undefined : (
            <StatusChip tone={model.header.statusTone}>
              {model.header.statusLabel}
              {model.flags.isOverdue && !model.flags.isTerminal ? ' · Überfällig' : ''}
            </StatusChip>
          )
        }
        widthClassName={widthClassName}
        closeLabel={closeLabel}
        footer={footer}
        className={className}
      >
        {loading && <TaskDetailLoadingSkeleton density={density} />}
        {!loading && model && (
          <TaskDetailBody
            model={model}
            density={density}
            hideHeader={!hideDrawerHeader}
            {...bodyProps}
          />
        )}
        {!loading && children}
      </DetailDrawer>
    );
  }

  return (
    <div
      className={cn('flex min-h-0 flex-col', className)}
      data-testid="task-detail-shell-inline"
      data-density={density}
    >
      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        }}
      >
        {loading && <TaskDetailLoadingSkeleton density={density} />}
        {!loading && model && (
          <TaskDetailBody model={model} density={density} {...bodyProps} />
        )}
        {!loading && children}
      </div>
      {footer}
    </div>
  );
}

function TaskDetailDrawerMeta({ model }: { model: TaskDetailViewModel }) {
  const { header } = model;

  return (
    <span className="flex flex-wrap items-center gap-2">
      {header.showPriority && (
        <PriorityBadge priority={header.priority} label={header.priorityLabel} />
      )}
      {header.timingLabel && (
        <span
          className={cn(
            'text-[12px] font-medium',
            header.timingWarn ? 'text-[color:var(--status-critical)]' : 'text-muted-foreground',
          )}
        >
          {header.timingLabel}
        </span>
      )}
      {header.subtitle && (
        <>
          {(header.showPriority || header.timingLabel) && (
            <span className="text-muted-foreground">·</span>
          )}
          <span className="text-muted-foreground">{header.subtitle}</span>
        </>
      )}
    </span>
  );
}

export { TaskDetailCompactHeader, TaskDetailLoadingSkeleton };

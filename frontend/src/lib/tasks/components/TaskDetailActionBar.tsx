import { Loader2, MoreHorizontal } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { cn } from '../../../components/ui/utils';
import type { TaskDetailActionItem, TaskDetailActionKind } from '../taskDetailActions.utils';

export type TaskDetailActionBarVariant = 'mobile-sticky' | 'desktop-footer';

export interface TaskDetailActionBarProps {
  variant: TaskDetailActionBarVariant;
  primary: TaskDetailActionItem | null;
  secondaries: TaskDetailActionItem[];
  overflow: TaskDetailActionItem[];
  pendingAction?: TaskDetailActionKind | 'complete' | 'cancel' | null;
  blockerSummary?: string | null;
  mobileBottomOffset?: 'tab' | 'sheet';
  onAction: (kind: TaskDetailActionKind) => void;
}

export function TaskDetailActionBar({
  variant,
  primary,
  secondaries,
  overflow,
  pendingAction,
  blockerSummary,
  mobileBottomOffset = 'tab',
  onAction,
}: TaskDetailActionBarProps) {
  const mobile = variant === 'mobile-sticky';
  const busy = pendingAction != null;

  const content = (
    <div
      className={cn(
        'flex w-full items-center gap-2',
        mobile ? 'mx-auto max-w-lg md:max-w-none' : 'flex-wrap',
      )}
      data-testid="task-detail-action-bar"
      data-variant={variant}
    >
      {primary && (
        <ActionButton
          item={primary}
          mobile={mobile}
          busy={busy}
          pending={pendingAction === primary.kind || pendingAction === 'complete'}
          onClick={() => onAction(primary.kind)}
          className={mobile ? 'min-h-[52px] flex-[2]' : undefined}
          primary
        />
      )}

      {secondaries.map((item) => (
        <ActionButton
          key={item.kind}
          item={item}
          mobile={mobile}
          busy={busy}
          pending={pendingAction === item.kind}
          onClick={() => onAction(item.kind)}
          className={mobile ? 'min-h-[52px] flex-1' : undefined}
        />
      ))}

      {overflow.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={busy}
              className={cn(
                'sq-press inline-flex items-center justify-center rounded-xl border border-border bg-muted/20 text-foreground disabled:opacity-50',
                mobile ? 'min-h-[52px] min-w-[52px]' : 'h-9 w-9',
              )}
              aria-label="Weitere Aktionen"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {overflow.map((item) => (
              <DropdownMenuItem
                key={item.kind}
                disabled={!item.enabled || busy}
                onClick={() => onAction(item.kind)}
                className={item.kind === 'cancel' ? 'text-[color:var(--status-critical)]' : undefined}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );

  if (mobile) {
    return (
      <div
        className="fixed inset-x-0 z-[45] border-t border-border/50 surface-frosted px-4 py-3"
        style={{
          bottom:
            mobileBottomOffset === 'sheet'
              ? 'max(0px, env(safe-area-inset-bottom))'
              : 'calc(4.5rem + max(0px, env(safe-area-inset-bottom)))',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        }}
        data-testid="task-detail-action-bar-mobile"
      >
        {content}
        {blockerSummary && (
          <p className="mx-auto mt-2 max-w-lg px-1 text-center text-xs text-[color:var(--status-watch)]" role="status">
            {blockerSummary}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="task-detail-action-bar-desktop">
      {content}
      {blockerSummary && (
        <p className="mt-2 w-full text-[10px] text-[color:var(--status-watch)]" role="status">
          {blockerSummary}
        </p>
      )}
    </div>
  );
}

function ActionButton({
  item,
  mobile,
  busy,
  pending,
  onClick,
  className,
  primary = false,
}: {
  item: TaskDetailActionItem;
  mobile: boolean;
  busy: boolean;
  pending: boolean;
  onClick: () => void;
  className?: string;
  primary?: boolean;
}) {
  if (mobile) {
    return (
      <button
        type="button"
        disabled={!item.enabled || busy}
        title={item.disabledReason ?? undefined}
        onClick={onClick}
        className={cn(
          'sq-press rounded-2xl text-sm font-semibold disabled:opacity-50',
          primary
            ? 'bg-[color:var(--status-success)] font-bold text-white'
            : 'border border-border text-foreground',
          className,
        )}
      >
        {pending ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : item.label}
      </button>
    );
  }

  const variant =
    item.kind === 'complete'
      ? 'success'
      : item.kind === 'cancel'
        ? 'destructive'
        : primary
          ? 'primary'
          : 'neutral';

  return (
    <Button
      type="button"
      variant={variant as 'primary'}
      size="sm"
      disabled={!item.enabled || busy}
      title={item.disabledReason ?? undefined}
      onClick={onClick}
      className={className}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {item.label}
    </Button>
  );
}

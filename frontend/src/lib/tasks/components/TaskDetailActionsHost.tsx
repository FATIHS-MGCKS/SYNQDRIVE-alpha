import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ConfirmDialog } from '../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import {
  taskDetailCompletionSubmitFailed,
} from '../task-detail-actions-presentation-i18n';
import {
  formatTaskDetailDateTime,
  taskDetailStatusLabel,
} from '../task-detail-presentation-i18n';
import {
  buildTaskDetailActionPlan,
  buildTaskDetailCompletionSummary,
  type TaskDetailActionKind,
} from '../taskDetailActions.utils';
import { useTaskDetailActions } from '../hooks/useTaskDetailActions';
import type { ApiTaskDetail } from '../types';
import { TaskDetailActionBar, type TaskDetailActionBarVariant } from './TaskDetailActionBar';
import { TaskDetailCompleteDialog } from './TaskDetailCompleteDialog';
import { TaskDetailCompletionSummary } from './TaskDetailCompletionSummary';
import { taskDetailActionsMoreAriaLabel } from '../task-detail-actions-presentation-i18n';

export interface TaskDetailActionsHostProps {
  detail: ApiTaskDetail | null;
  orgId: string | null | undefined;
  variant: TaskDetailActionBarVariant;
  mobileBottomOffset?: 'tab' | 'sheet';
  onTaskUpdated?: (task: ApiTaskDetail) => void;
  onAfterMutation?: (task: ApiTaskDetail) => void;
  onComment?: () => void;
  onOpenSuccessorTask?: (taskId: string) => void;
  onCancelSuccess?: () => void;
}

export interface TaskDetailActionsHostResult {
  footer: ReactNode | null;
  dialogs: ReactNode;
  mobileCompletionOverlay: ReactNode | null;
  openCompleteDialog: () => void;
}

export function useTaskDetailActionsHost({
  detail,
  orgId,
  variant,
  mobileBottomOffset = 'tab',
  onTaskUpdated,
  onAfterMutation,
  onComment,
  onOpenSuccessorTask,
  onCancelSuccess,
}: TaskDetailActionsHostProps): TaskDetailActionsHostResult {
  const { locale, t } = useLanguage();
  const [completeOpen, setCompleteOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const openCompleteDialog = useCallback(() => setCompleteOpen(true), []);

  const actions = useTaskDetailActions({
    orgId,
    task: detail,
    onTaskUpdated,
    onAfterMutation,
  });

  const plan = useMemo(
    () => (detail ? buildTaskDetailActionPlan(detail, locale) : null),
    [detail, locale],
  );

  const completionSummary = useMemo(
    () =>
      detail && plan?.isTerminal
        ? buildTaskDetailCompletionSummary(detail, locale, {
            statusLabel: taskDetailStatusLabel(locale, detail.summary.status),
            formatDateTime: (iso) => formatTaskDetailDateTime(locale, iso),
          })
        : null,
    [detail, locale, plan?.isTerminal],
  );

  const handleAction = async (kind: TaskDetailActionKind) => {
    if (!detail || actions.isBusy) return;
    setSubmitError(null);

    try {
      switch (kind) {
        case 'start':
          await actions.start();
          break;
        case 'resume':
          await actions.resume();
          break;
        case 'moveToWaiting':
          await actions.moveToWaiting();
          break;
        case 'complete':
          setCompleteOpen(true);
          break;
        case 'comment':
          onComment?.();
          break;
        case 'cancel':
          setCancelOpen(true);
          break;
      }
    } catch {
      // Toast handled in hook; keep UI stable.
    }
  };

  const handleCompleteSubmit = async (
    payload: Parameters<typeof actions.complete>[0],
  ) => {
    if (!detail) return;
    setSubmitError(null);
    try {
      const updated = await actions.complete(payload);
      if (updated) setCompleteOpen(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : taskDetailCompletionSubmitFailed(locale),
      );
      throw error;
    }
  };

  const handleCancelConfirm = async () => {
    try {
      const updated = await actions.cancel();
      if (updated) {
        setCancelOpen(false);
        onCancelSuccess?.();
      }
    } catch {
      // Keep dialog open on error.
    }
  };

  if (!detail || !plan) {
    return {
      footer: null,
      dialogs: null,
      mobileCompletionOverlay: null,
      openCompleteDialog,
    };
  }

  const mobile = variant === 'mobile-sticky';
  const blockerSummary =
    !plan.completionControl.enabled && !plan.isTerminal
      ? plan.completionControl.blockerSummary
      : null;

  const completionSummaryNode =
    plan.isTerminal && completionSummary ? (
      <TaskDetailCompletionSummary
        summary={completionSummary}
        mobile={mobile}
        onOpenSuccessorTask={onOpenSuccessorTask}
      />
    ) : null;

  const footer =
    completionSummaryNode && !mobile ? (
      completionSummaryNode
    ) : !completionSummaryNode ? (
      <TaskDetailActionBar
        variant={variant}
        primary={plan.primary}
        secondaries={plan.secondaries}
        overflow={plan.overflow}
        pendingAction={actions.pendingAction}
        blockerSummary={blockerSummary}
        mobileBottomOffset={mobileBottomOffset}
        moreActionsAriaLabel={taskDetailActionsMoreAriaLabel(locale)}
        onAction={(kind) => void handleAction(kind)}
      />
    ) : null;

  const mobileCompletionOverlay =
    completionSummaryNode && mobile ? (
      <div
        className="fixed inset-x-0 z-[45] border-t border-border/50 surface-frosted px-4 py-3"
        style={{
          bottom:
            mobileBottomOffset === 'sheet'
              ? 'max(0px, env(safe-area-inset-bottom))'
              : 'calc(4.5rem + max(0px, env(safe-area-inset-bottom)))',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        }}
        data-testid="task-detail-completion-summary-mobile"
      >
        {completionSummaryNode}
      </div>
    ) : mobile && footer ? (
      footer
    ) : null;

  const dialogs = (
    <>
      <TaskDetailCompleteDialog
        open={completeOpen}
        onOpenChange={setCompleteOpen}
        detail={detail}
        loading={actions.pendingAction === 'complete'}
        submitError={submitError}
        onSubmit={handleCompleteSubmit}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t('tasks.detail.cancel.title')}
        description={t('tasks.detail.cancel.description')}
        confirmLabel={t('tasks.detail.cancel.confirm')}
        cancelLabel={t('tasks.detail.cancel.back')}
        tone="critical"
        loading={actions.pendingAction === 'cancel'}
        onConfirm={() => void handleCancelConfirm()}
      />
    </>
  );

  return {
    footer,
    dialogs,
    mobileCompletionOverlay,
    openCompleteDialog,
  };
}

export function TaskDetailActionsHost(props: TaskDetailActionsHostProps) {
  const { footer, dialogs, mobileCompletionOverlay } = useTaskDetailActionsHost(props);

  return (
    <>
      {mobileCompletionOverlay ?? footer}
      {dialogs}
    </>
  );
}

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '../../../components/ui/sheet';
import { useLanguage } from '../../../i18n/LanguageContext';
import { api, type ApiTaskPriority } from '../../../lib/api';
import {
  bulkActionFailureMessages,
  formatBulkActionSummary,
  type BulkTaskActionType,
} from '../../lib/taskBulkActions.utils';
import { taskFilterPriorityLabel } from '../tasks-settings/tasks-i18n';
import { Icon } from '../ui/Icon';

export interface TasksBulkActionBarProps {
  orgId: string;
  selectedTaskIds: string[];
  canWriteTasks: boolean;
  assigneeOptions: Array<{ value: string; label: string }>;
  onClearSelection: () => void;
  onCompleted: () => void;
}

type BulkDialogMode = 'assign' | 'priority' | 'dueDate' | 'waiting' | 'cancel' | null;

const TASK_PRIORITIES: ApiTaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

export function TasksBulkActionBar({
  orgId,
  selectedTaskIds,
  canWriteTasks,
  assigneeOptions,
  onClearSelection,
  onCompleted,
}: TasksBulkActionBarProps) {
  const { t, locale } = useLanguage();
  const [dialog, setDialog] = useState<BulkDialogMode>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState<ApiTaskPriority>('NORMAL');
  const [dueDate, setDueDate] = useState('');
  const [shiftDays, setShiftDays] = useState('1');
  const [dueMode, setDueMode] = useState<'absolute' | 'shift'>('shift');
  const [loading, setLoading] = useState(false);

  if (!canWriteTasks || selectedTaskIds.length === 0) return null;

  const count = selectedTaskIds.length;

  const runBulk = async (
    action: BulkTaskActionType,
    payload: Record<string, unknown> = {},
  ) => {
    setLoading(true);
    try {
      const result = await api.tasks.bulk(orgId, {
        taskIds: selectedTaskIds,
        action,
        ...payload,
      });
      const summary = formatBulkActionSummary(result, locale);
      if (result.failed === 0) {
        toast.success(summary);
      } else if (result.succeeded === 0) {
        toast.error(summary, {
          description: bulkActionFailureMessages(result).slice(0, 3).join('\n'),
        });
      } else {
        toast.warning(summary, {
          description: bulkActionFailureMessages(result).slice(0, 3).join('\n'),
        });
      }
      onClearSelection();
      onCompleted();
      setDialog(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('tasks.bulk.actionFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div
        className="sticky bottom-3 z-30 mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--brand)]/30 bg-background/95 px-4 py-3 shadow-[var(--shadow-2)] backdrop-blur-md"
        data-testid="tasks-bulk-action-bar"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="rounded-full bg-[color:var(--brand-soft)] px-2.5 py-1 text-xs tabular-nums">
            {count}
          </span>
          <span>{count === 1 ? t('tasks.bulk.selectedOne') : t('tasks.bulk.selectedMany')}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setDialog('assign')}>
            {t('tasks.bulk.assign')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setDialog('priority')}>
            {t('tasks.bulk.priority')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setDialog('dueDate')}>
            {t('tasks.bulk.dueDate')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            onClick={() => void runBulk('set_waiting')}
          >
            {t('tasks.bulk.waiting')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-[color:var(--status-critical)]"
            onClick={() => setDialog('cancel')}
          >
            {t('tasks.bulk.cancel')}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClearSelection}>
            {t('tasks.bulk.clearSelection')}
          </Button>
        </div>
      </div>

      <Sheet open={dialog === 'assign'} onOpenChange={(open) => !open && setDialog(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 pt-4">
          <SheetTitle className="mb-4 text-base font-semibold">{t('tasks.bulk.assignTitle')}</SheetTitle>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">{t('tasks.bulk.assigneeLabel')}</span>
            <select
              value={assigneeId}
              onChange={(event) => setAssigneeId(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
            >
              <option value="">{t('tasks.bulk.unassign')}</option>
              {assigneeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-5 flex gap-2">
            <Button type="button" variant="neutral" className="flex-1" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={loading}
              onClick={() =>
                void runBulk('assign', { assignedUserId: assigneeId || null })
              }
            >
              {t('tasks.bulk.assign')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={dialog === 'priority'} onOpenChange={(open) => !open && setDialog(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 pt-4">
          <SheetTitle className="mb-4 text-base font-semibold">{t('tasks.bulk.priorityTitle')}</SheetTitle>
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as ApiTaskPriority)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
          >
            {TASK_PRIORITIES.map((key) => (
              <option key={key} value={key}>
                {taskFilterPriorityLabel(locale, key)}
              </option>
            ))}
          </select>
          <div className="mt-5 flex gap-2">
            <Button type="button" variant="neutral" className="flex-1" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={loading}
              onClick={() => void runBulk('set_priority', { priority })}
            >
              {t('common.save')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={dialog === 'dueDate'} onOpenChange={(open) => !open && setDialog(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 pt-4">
          <SheetTitle className="mb-4 text-base font-semibold">{t('tasks.bulk.dueDateTitle')}</SheetTitle>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={dueMode === 'shift' ? 'primary' : 'outline'}
                onClick={() => setDueMode('shift')}
              >
                {t('tasks.bulk.shiftDays')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={dueMode === 'absolute' ? 'primary' : 'outline'}
                onClick={() => setDueMode('absolute')}
              >
                {t('tasks.bulk.setDate')}
              </Button>
            </div>
            {dueMode === 'shift' ? (
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">{t('tasks.bulk.shiftDaysLabel')}</span>
                <input
                  type="number"
                  value={shiftDays}
                  onChange={(event) => setShiftDays(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </label>
            ) : (
              <label className="block space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground">{t('tasks.bulk.newDueDate')}</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </label>
            )}
          </div>
          <div className="mt-5 flex gap-2">
            <Button type="button" variant="neutral" className="flex-1" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={loading}
              onClick={() =>
                void runBulk(
                  'shift_due_date',
                  dueMode === 'shift'
                    ? { dueDateShiftDays: Number(shiftDays) }
                    : { dueDate: dueDate ? new Date(dueDate).toISOString() : undefined },
                )
              }
            >
              {t('common.apply')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={dialog === 'cancel'} onOpenChange={(open) => !open && setDialog(null)}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-6 pt-4">
          <SheetTitle className="mb-4 flex items-center gap-2 text-base font-semibold text-[color:var(--status-critical)]">
            <Icon name="alert-triangle" className="h-4 w-4" />
            {count === 1
              ? t('tasks.bulk.cancelTitleOne')
              : t('tasks.bulk.cancelTitleMany', { count })}
          </SheetTitle>
          <p className="text-xs text-muted-foreground">{t('tasks.bulk.cancelDescription')}</p>
          <div className="mt-5 flex gap-2">
            <Button type="button" variant="neutral" className="flex-1" onClick={() => setDialog(null)}>
              {t('common.back')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              disabled={loading}
              onClick={() => void runBulk('cancel')}
            >
              {t('tasks.bulk.cancel')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

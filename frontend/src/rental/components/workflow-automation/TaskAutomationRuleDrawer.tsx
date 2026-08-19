import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { DetailDrawer } from '../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { RuleValueTile } from '../shared/rental-requirements-ui';
import { TaskAutomationSimulationPanel } from './TaskAutomationSimulationPanel';
import type {
  TaskAutomationOverrideFormState,
  TaskAutomationRuleDto,
  TaskAutomationSimulationResult,
} from './task-automation.types';
import {
  labelTaskAutomationAssignment,
  labelTaskAutomationPriority,
  labelTaskAutomationSource,
} from './automation-i18n';
import {
  buildFormStateFromRule,
  buildOverridePayload,
  formatAuditTimestamp,
  formatOffsetMinutesForLocale,
  isFieldOverridden,
  parseApiError,
  summarizeChecklistState,
} from './task-automation.utils';

interface TaskAutomationRuleDrawerProps {
  open: boolean;
  rule: TaskAutomationRuleDto | null;
  canWrite: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (ruleId: string, payload: ReturnType<typeof buildOverridePayload>) => Promise<unknown>;
  onReset: (ruleId: string, expectedVersion?: number) => Promise<unknown>;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

function ToggleField({
  label,
  checked,
  disabled,
  highlighted,
  source,
  sourcePrefix,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  highlighted?: boolean;
  source?: string;
  sourcePrefix?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      className={`rounded-lg border border-border/60 px-3 py-2.5 ${
        highlighted ? 'border-l-[3px] border-l-[color:var(--brand)]/45' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          {source && sourcePrefix && (
            <p className="mt-1 text-xs text-muted-foreground">
              {sourcePrefix}: <span className="font-medium text-foreground/80">{source}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative min-h-11 min-w-11 rounded-full transition-colors ${
            checked ? 'bg-brand' : 'bg-muted'
          } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
          aria-pressed={checked}
          aria-label={label}
        >
          <span
            className={`absolute top-1 h-9 w-9 rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  disabled,
  highlighted,
  source,
  sourcePrefix,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  highlighted?: boolean;
  source?: string;
  sourcePrefix?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={`rounded-lg border border-border/60 px-3 py-2.5 ${
        highlighted ? 'border-l-[3px] border-l-[color:var(--brand)]/45' : ''
      }`}
    >
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {source && sourcePrefix && (
        <p className="mt-1 text-xs text-muted-foreground">
          {sourcePrefix}: <span className="font-medium text-foreground/80">{source}</span>
        </p>
      )}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  locale,
  disabled,
  highlighted,
  source,
  sourcePrefix,
  helper,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  locale: string;
  disabled?: boolean;
  highlighted?: boolean;
  source?: string;
  sourcePrefix?: string;
  helper?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div
      className={`rounded-lg border border-border/60 px-3 py-2.5 ${
        highlighted ? 'border-l-[3px] border-l-[color:var(--brand)]/45' : ''
      }`}
    >
      <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm"
      />
      <p className="mt-1 text-xs text-muted-foreground">{helper ?? formatOffsetMinutesForLocale(locale, value)}</p>
      {source && sourcePrefix && (
        <p className="mt-1 text-xs text-muted-foreground">
          {sourcePrefix}: <span className="font-medium text-foreground/80">{source}</span>
        </p>
      )}
    </div>
  );
}

export function TaskAutomationRuleDrawer({
  open,
  rule,
  canWrite,
  saving,
  onOpenChange,
  onSave,
  onReset,
  returnFocusRef,
}: TaskAutomationRuleDrawerProps) {
  const { orgId } = useRentalOrg();
  const { locale, t } = useLanguage();
  const [form, setForm] = useState<TaskAutomationOverrideFormState | null>(null);
  const [disableWarningAck, setDisableWarningAck] = useState(false);
  const [changeReason, setChangeReason] = useState('');
  const [simulation, setSimulation] = useState<TaskAutomationSimulationResult | null>(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<
    import('./task-automation.types').TaskAutomationRuleRevisionDto[]
  >([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsError, setRevisionsError] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    if (open && rule) {
      setForm(buildFormStateFromRule(rule));
      setDisableWarningAck(false);
      setChangeReason('');
    }
  }, [open, rule]);

  useEffect(() => {
    if (!open || !orgId || !rule) {
      setRevisions([]);
      setRevisionsError(null);
      return;
    }

    let cancelled = false;
    setRevisionsLoading(true);
    setRevisionsError(null);
    void api.taskAutomation
      .listRuleRevisions(orgId, rule.ruleId)
      .then((rows) => {
        if (!cancelled) setRevisions(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRevisions([]);
          setRevisionsError(parseApiError(locale, error));
        }
      })
      .finally(() => {
        if (!cancelled) setRevisionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, orgId, rule?.ruleId]);

  const simulationPayload = useMemo(() => {
    if (!rule || !form) return null;
    return buildOverridePayload(rule, form);
  }, [rule, form]);

  useEffect(() => {
    if (!open || !orgId || !rule || !form) {
      setSimulation(null);
      return;
    }

    const timer = window.setTimeout(() => {
      setSimulationLoading(true);
      setSimulationError(null);
      void api.taskAutomation
        .simulateRule(orgId, rule.ruleId, {
          proposedConfig: simulationPayload ?? undefined,
          periodDays: 30,
        })
        .then((result) => setSimulation(result))
        .catch((error: unknown) => {
          setSimulation(null);
          setSimulationError(parseApiError(locale, error));
        })
        .finally(() => setSimulationLoading(false));
    }, 400);

    return () => window.clearTimeout(timer);
  }, [open, orgId, rule, form, simulationPayload]);

  const changedFields = useMemo(() => {
    if (!rule || !form) return new Set<string>();
    const payload = buildOverridePayload(rule, form);
    return new Set(Object.keys(payload).filter((key) => key !== 'expectedVersion'));
  }, [rule, form]);

  const showCriticalDisableWarning = Boolean(
    rule?.isCritical &&
      form &&
      !form.enabled &&
      rule.default.enabled &&
      changedFields.has('enabled'),
  );

  const requestClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && changedFields.size > 0) {
        setCloseConfirmOpen(true);
        return;
      }
      onOpenChange(nextOpen);
    },
    [changedFields.size, onOpenChange],
  );

  if (!rule || !form) return null;

  const allowed = new Set(rule.allowedOverrideFields);
  const ruleValueLocale = locale.startsWith('de') ? 'de' : 'en';
  const sourceFor = (field: string) =>
    labelTaskAutomationSource(
      locale,
      isFieldOverridden(rule.fieldProvenance[field])
        ? 'ORG_OVERRIDE'
        : rule.fieldProvenance[field]?.source ?? 'PLATFORM_DEFAULT',
    );

  const handleSave = async () => {
    if (!canWrite) return;
    if (showCriticalDisableWarning && !disableWarningAck) {
      toast.error(t('taskAutomation.toast.ackRequired'));
      return;
    }
    try {
      const payload = {
        ...buildOverridePayload(rule, form),
        ...(changeReason.trim() ? { reason: changeReason.trim() } : {}),
      };
      await onSave(rule.ruleId, payload);
      toast.success(t('taskAutomation.toast.saved'));
      onOpenChange(false);
    } catch {
      /* error surfaced by center hook */
    }
  };

  const handleReset = async () => {
    if (!canWrite || !rule.hasOrgOverride) return;
    try {
      await onReset(rule.ruleId, rule.audit.version ?? undefined);
      toast.success(t('taskAutomation.toast.reset'));
      onOpenChange(false);
    } catch {
      /* error surfaced by center hook */
    }
  };

  const toggleOptionalChecklistItem = (title: string) => {
    if (!allowed.has('checklistOverrides')) return;
    setForm((current) => {
      if (!current) return current;
      const checklist = current.checklistOverrides ?? { hiddenOptionalTitles: [], additionalItems: [] };
      const hidden = new Set(checklist.hiddenOptionalTitles);
      if (hidden.has(title)) hidden.delete(title);
      else hidden.add(title);
      return {
        ...current,
        checklistOverrides: {
          ...checklist,
          hiddenOptionalTitles: [...hidden],
        },
      };
    });
  };

  const addChecklistItem = () => {
    if (!allowed.has('checklistOverrides')) return;
    setForm((current) => {
      if (!current) return current;
      const checklist = current.checklistOverrides ?? { hiddenOptionalTitles: [], additionalItems: [] };
      return {
        ...current,
        checklistOverrides: {
          ...checklist,
          additionalItems: [
            ...checklist.additionalItems,
            { title: '', description: '', isRequired: false },
          ],
        },
      };
    });
  };

  return (
    <>
    <DetailDrawer
      open={open}
      onOpenChange={requestClose}
      returnFocusRef={returnFocusRef}
      widthClassName="sm:max-w-2xl"
      eyebrow={t('taskAutomation.drawer.eyebrow')}
      title={rule.nameDe}
      description={rule.descriptionDe}
      status={
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
            rule.effectivelyEnabled
              ? 'bg-status-success-soft text-status-success'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {rule.effectivelyEnabled
            ? t('taskAutomation.status.active')
            : t('taskAutomation.status.inactive')}
        </span>
      }
      footer={
        canWrite ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || !rule.hasOrgOverride}
              onClick={() => setResetConfirmOpen(true)}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {t('taskAutomation.drawer.reset')}
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => requestClose(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="button" size="sm" className="min-h-11" disabled={saving || changedFields.size === 0} onClick={() => void handleSave()}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {saving ? t('common.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-5 px-5 py-4">
        <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5 text-xs text-muted-foreground">
          {t('taskAutomation.drawer.changeNotice')}
        </div>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('taskAutomation.drawer.overview')}
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <RuleValueTile label={t('taskAutomation.drawer.trigger')} value={rule.triggerLabelDe} locale={ruleValueLocale} density="compact" />
            <RuleValueTile label={t('taskAutomation.drawer.activation')} value={rule.activationLabelDe} locale={ruleValueLocale} density="compact" />
            <RuleValueTile label={t('taskAutomation.drawer.due')} value={rule.dueLabelDe} locale={ruleValueLocale} density="compact" />
            <RuleValueTile label={t('taskAutomation.drawer.autoResolve')} value={rule.autoResolveLabelDe} locale={ruleValueLocale} density="compact" />
            <RuleValueTile label={t('taskAutomation.drawer.escalation')} value={rule.escalationLabelDe} locale={ruleValueLocale} density="compact" />
            <RuleValueTile
              label={t('taskAutomation.drawer.checklist')}
              value={summarizeChecklistState(locale, rule)}
              locale={ruleValueLocale}
              density="compact"
              highlighted={!rule.checklist.usesSynqDriveStandard}
            />
          </div>
        </section>

        {(rule.audit.updatedAt || rule.audit.updatedByName) && (
          <section className="rounded-lg border border-border/50 px-3 py-2.5 text-xs text-muted-foreground">
            {t('taskAutomation.drawer.lastEdited')}: {formatAuditTimestamp(locale, rule.audit.updatedAt)}
            {rule.audit.updatedByName ? ` · ${rule.audit.updatedByName}` : ''}
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('taskAutomation.drawer.history')}
          </h3>
          {revisionsLoading && (
            <p className="text-xs text-muted-foreground" aria-busy="true" aria-live="polite">
              {t('taskAutomation.drawer.history.loading')}
            </p>
          )}
          {revisionsError && (
            <p className="text-xs text-destructive">{revisionsError}</p>
          )}
          {!revisionsLoading && !revisionsError && revisions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t('taskAutomation.drawer.history.empty')}
            </p>
          )}
          {!revisionsLoading && revisions.length > 0 && (
            <div className="space-y-2">
              {revisions.map((revision) => (
                <div
                  key={revision.id}
                  className="rounded-lg border border-border/50 px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">
                      {t('taskAutomation.drawer.version', {
                        version: revision.version,
                        changeType: revision.changeType,
                      })}
                    </span>
                    <span className="text-muted-foreground">
                      {formatAuditTimestamp(locale, revision.changedAt)}
                    </span>
                  </div>
                  {(revision.changedByName || revision.reason) && (
                    <p className="mt-1 text-muted-foreground">
                      {revision.changedByName ? revision.changedByName : t('taskAutomation.drawer.system')}
                      {revision.reason ? ` · ${revision.reason}` : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('taskAutomation.drawer.config')}
          </h3>

          <TaskAutomationSimulationPanel
            simulation={simulation}
            loading={simulationLoading}
            error={simulationError}
          />

          {canWrite && (
            <div className="rounded-lg border border-border/60 px-3 py-2.5">
              <label
                htmlFor="task-automation-change-reason"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {t('taskAutomation.drawer.changeReason')}
              </label>
              <textarea
                id="task-automation-change-reason"
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder={t('taskAutomation.drawer.changeReason.placeholder')}
                className="mt-1.5 w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm"
              />
            </div>
          )}

          {allowed.has('enabled') && (
            <ToggleField
              label={t('taskAutomation.drawer.ruleActive')}
              checked={form.enabled}
              disabled={!canWrite}
              highlighted={changedFields.has('enabled')}
              source={sourceFor('enabled')}
              sourcePrefix={t('taskAutomation.drawer.source')}
              onChange={(enabled) => setForm((current) => (current ? { ...current, enabled } : current))}
            />
          )}

          {showCriticalDisableWarning && (
            <div className="rounded-lg border border-status-attention/40 bg-status-attention-soft/40 px-3 py-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-attention" />
                <div className="space-y-2">
                  <p className="font-medium text-foreground">
                    {t('taskAutomation.drawer.criticalDisableWarning')}
                  </p>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={disableWarningAck}
                      onChange={(e) => setDisableWarningAck(e.target.checked)}
                    />
                    {t('taskAutomation.drawer.criticalDisableAck')}
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {allowed.has('activationOffsetMinutes') && (
              <NumberField
                id="task-automation-activation-offset"
                label={t('taskAutomation.drawer.activationOffset')}
                value={form.activationOffsetMinutes ?? 0}
                locale={locale}
                disabled={!canWrite}
                highlighted={changedFields.has('activationOffsetMinutes')}
                source={sourceFor('activationOffsetMinutes')}
                sourcePrefix={t('taskAutomation.drawer.source')}
                onChange={(activationOffsetMinutes) =>
                  setForm((current) => (current ? { ...current, activationOffsetMinutes } : current))
                }
              />
            )}
            {allowed.has('dueOffsetMinutes') && (
              <NumberField
                id="task-automation-due-offset"
                label={t('taskAutomation.drawer.dueOffset')}
                value={form.dueOffsetMinutes ?? 0}
                locale={locale}
                disabled={!canWrite}
                highlighted={changedFields.has('dueOffsetMinutes')}
                source={sourceFor('dueOffsetMinutes')}
                sourcePrefix={t('taskAutomation.drawer.source')}
                onChange={(dueOffsetMinutes) =>
                  setForm((current) => (current ? { ...current, dueOffsetMinutes } : current))
                }
              />
            )}
            {allowed.has('priority') && (
              <SelectField
                id="task-automation-priority"
                label={t('taskAutomation.drawer.defaultPriority')}
                value={form.priority ?? rule.default.priority}
                disabled={!canWrite}
                highlighted={changedFields.has('priority')}
                source={sourceFor('priority')}
                sourcePrefix={t('taskAutomation.drawer.source')}
                options={[
                  { value: 'LOW', label: labelTaskAutomationPriority(locale, 'LOW') },
                  { value: 'NORMAL', label: labelTaskAutomationPriority(locale, 'NORMAL') },
                  { value: 'HIGH', label: labelTaskAutomationPriority(locale, 'HIGH') },
                  { value: 'CRITICAL', label: labelTaskAutomationPriority(locale, 'CRITICAL') },
                ]}
                onChange={(priority) =>
                  setForm((current) => (current ? { ...current, priority: priority as typeof form.priority } : current))
                }
              />
            )}
            {allowed.has('assignmentStrategy') && (
              <SelectField
                id="task-automation-assignment"
                label={t('taskAutomation.drawer.assignment')}
                value={form.assignmentStrategy ?? rule.default.assignmentStrategy}
                disabled={!canWrite}
                highlighted={changedFields.has('assignmentStrategy')}
                source={sourceFor('assignmentStrategy')}
                sourcePrefix={t('taskAutomation.drawer.source')}
                options={[
                  { value: 'UNASSIGNED', label: labelTaskAutomationAssignment(locale, 'UNASSIGNED') },
                  { value: 'STATION_FROM_BOOKING', label: labelTaskAutomationAssignment(locale, 'STATION_FROM_BOOKING') },
                  { value: 'INHERIT_FROM_CONTEXT', label: labelTaskAutomationAssignment(locale, 'INHERIT_FROM_CONTEXT') },
                ]}
                onChange={(assignmentStrategy) =>
                  setForm((current) => (current ? { ...current, assignmentStrategy } : current))
                }
              />
            )}
          </div>
        </section>

        {allowed.has('checklistOverrides') && rule.checklist.platformItems.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('taskAutomation.drawer.checklistTitle')}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              {t('taskAutomation.drawer.checklistHelp')}
            </p>
            <div className="space-y-2">
              {rule.checklist.platformItems.map((item) => {
                const hidden = (form.checklistOverrides?.hiddenOptionalTitles ?? []).includes(item.title);
                return (
                  <div
                    key={item.title}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      item.isRequired ? 'border-border/60' : 'border-border/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{item.title}</p>
                        {item.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.isRequired
                            ? t('taskAutomation.drawer.requiredItem')
                            : t('taskAutomation.drawer.optionalItem')}
                          {' · '}
                          {t('taskAutomation.drawer.platformStandard')}
                        </p>
                      </div>
                      {!item.isRequired && canWrite && (
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={!hidden}
                            onChange={() => toggleOptionalChecklistItem(item.title)}
                          />
                          {t('taskAutomation.drawer.showItem')}
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {canWrite && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-foreground">{t('taskAutomation.drawer.additionalItems')}</p>
                  <Button type="button" size="sm" variant="outline" onClick={addChecklistItem}>
                    {t('taskAutomation.drawer.addItem')}
                  </Button>
                </div>
                {(form.checklistOverrides?.additionalItems ?? []).map((item, index) => (
                  <div key={`extra-${index}`} className="rounded-lg border border-l-[3px] border-l-[color:var(--brand)]/40 px-3 py-2">
                    <input
                      value={item.title}
                      disabled={!canWrite}
                      placeholder={t('taskAutomation.drawer.additionalItemPlaceholder')}
                      onChange={(e) =>
                        setForm((current) => {
                          if (!current?.checklistOverrides) return current;
                          const additionalItems = [...current.checklistOverrides.additionalItems];
                          additionalItems[index] = { ...additionalItems[index], title: e.target.value };
                          return {
                            ...current,
                            checklistOverrides: { ...current.checklistOverrides, additionalItems },
                          };
                        })
                      }
                      className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </DetailDrawer>

    <AlertDialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('taskAutomation.drawer.unsavedTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('taskAutomation.drawer.unsavedDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('taskAutomation.drawer.continueEditing')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setCloseConfirmOpen(false);
              onOpenChange(false);
            }}
          >
            {t('taskAutomation.drawer.discard')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('taskAutomation.drawer.resetTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('taskAutomation.drawer.resetDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleReset()}>
            {t('taskAutomation.drawer.resetAction')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

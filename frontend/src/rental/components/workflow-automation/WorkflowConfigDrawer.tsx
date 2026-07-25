import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Play,
  RefreshCw,
  Save,
  Shield,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import type { WorkflowListItemDto, WorkflowRunDto } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../components/ui/accordion';
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
import { DetailDrawer, ErrorState, StatusChip } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import type { WorkflowCatalogDto, WorkflowConfigFormState } from './workflow-config.types';
import {
  buildFormFromWorkflow,
  buildImpactSummary,
  buildWorkflowPayload,
  createEmptyWorkflowConfigForm,
  isSystemFieldEditable,
  isWorkflowConfigDirty,
  maskRecipientValue,
  moveArrayItem,
  parseBoundedNumberInput,
  validateWorkflowConfigForm,
} from './workflow-config.utils';
import {
  parseApiError,
  workflowRiskLabel,
  workflowRiskTone,
  workflowStatusLabel,
  workflowStatusTone,
} from './workflow-runtime.utils';
import { WorkflowDryRunPanel } from './WorkflowDryRunPanel';
import { WorkflowRevisionDiffPanel } from './WorkflowRevisionDiffPanel';
import { WorkflowExecutionHistoryPanel } from './WorkflowExecutionHistoryPanel';
import { useWorkflowRevisionDiff, useWorkflowSimulation } from './useWorkflowSimulation';

interface WorkflowConfigDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: WorkflowListItemDto | null;
  createMode?: boolean;
  canWrite?: boolean;
  busy?: boolean;
  onSaved?: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
    >
      {children}
    </label>
  );
}

function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-status-critical">
      {message}
    </p>
  );
}

export function WorkflowConfigDrawer({
  open,
  onOpenChange,
  item,
  createMode = false,
  canWrite = false,
  busy = false,
  onSaved,
  returnFocusRef,
}: WorkflowConfigDrawerProps) {
  const { orgId } = useRentalOrg();
  const { t } = useLanguage();
  const [catalog, setCatalog] = useState<WorkflowCatalogDto | null>(null);
  const [form, setForm] = useState<WorkflowConfigFormState>(createEmptyWorkflowConfigForm());
  const baselineRef = useRef<WorkflowConfigFormState>(createEmptyWorkflowConfigForm());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [runs, setRuns] = useState<WorkflowRunDto[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof validateWorkflowConfigForm>>({});

  const sourceType = item?.sourceType ?? 'custom';
  const isSystem = sourceType === 'system';
  const workflowId = createMode ? null : item?.id ?? null;
  const simulation = useWorkflowSimulation(orgId, workflowId);
  const revisionDiff = useWorkflowRevisionDiff(orgId, workflowId);

  const editable = canWrite && (!isSystem || createMode);

  const dirty = useMemo(
    () => isWorkflowConfigDirty(baselineRef.current, form),
    [form],
  );

  const impact = useMemo(
    () => buildImpactSummary(form, catalog, t),
    [form, catalog, t],
  );

  const resetForm = useCallback((next: WorkflowConfigFormState) => {
    baselineRef.current = next;
    setForm(next);
    setFieldErrors({});
    simulation.reset();
  }, [simulation.reset]);

  const loadDrawer = useCallback(async () => {
    if (!orgId || !open) return;
    setLoading(true);
    setLoadError(null);
    try {
      const catalogRes = await api.workflows.catalog(orgId);
      setCatalog(catalogRes);
      if (createMode) {
        resetForm(createEmptyWorkflowConfigForm());
      } else if (item?.id) {
        const workflow = await api.workflows.get(orgId, item.id);
        resetForm(buildFormFromWorkflow({ ...item, ...workflow }));
      } else if (item) {
        resetForm(buildFormFromWorkflow(item));
      }
    } catch (error: unknown) {
      setLoadError(parseApiError(error));
    } finally {
      setLoading(false);
    }
  }, [orgId, open, createMode, item, resetForm]);

  useEffect(() => {
    void loadDrawer();
  }, [loadDrawer]);

  useEffect(() => {
    if (!orgId || !workflowId || !open) {
      setRuns([]);
      return;
    }
    setRunsLoading(true);
    api.workflows
      .listRuns(orgId, workflowId, 10)
      .then(setRuns)
      .catch(() => setRuns([]))
      .finally(() => setRunsLoading(false));
  }, [orgId, workflowId, open]);

  useEffect(() => {
    if (!open || !workflowId || !dirty) {
      return;
    }
    const timer = window.setTimeout(() => {
      void revisionDiff.loadDiff(form, dirty);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [open, workflowId, dirty, form, revisionDiff.loadDiff]);

  const runSimulation = () => {
    void simulation.simulate(form, dirty);
  };

  const requestClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && dirty) {
        setCloseConfirmOpen(true);
        return;
      }
      onOpenChange(nextOpen);
    },
    [dirty, onOpenChange],
  );

  const updateForm = (patch: Partial<WorkflowConfigFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
  };

  const saveWorkflow = async (intent: 'draft' | 'publish' | 'activate') => {
    if (!orgId || !editable) return;
    const requireReason = intent !== 'draft' && impact.requiresPublishApproval;
    const errors = validateWorkflowConfigForm(form, catalog, t, {
      requireChangeReason: requireReason,
      isPublish: intent !== 'draft',
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const payload = buildWorkflowPayload(form, intent);
      if (workflowId) {
        await api.workflows.update(orgId, workflowId, payload);
      } else {
        await api.workflows.create(orgId, payload);
      }
      toast.success(t('workflowAutomation.editor.saveSuccess'));
      await loadDrawer();
      onSaved?.();
      if (intent === 'draft') onOpenChange(false);
    } catch (error: unknown) {
      toast.error(parseApiError(error));
    } finally {
      setSaving(false);
    }
  };

  const runTest = runSimulation;

  const sectionDisabled = (field: string) =>
    !editable || !isSystemFieldEditable(field, sourceType, catalog);

  const title = createMode
    ? t('workflowAutomation.editor.createTitle')
    : form.name || t('workflowAutomation.editor.editTitle');

  return (
    <>
      <DetailDrawer
        open={open}
        onOpenChange={requestClose}
        returnFocusRef={returnFocusRef}
        title={title}
        eyebrow={t('workflowAutomation.editor.eyebrow')}
        description={t('workflowAutomation.editor.description')}
        closeLabel={t('workflowAutomation.actions.close')}
        widthClassName="sm:max-w-2xl"
        status={
          item ? (
            <StatusChip tone={workflowStatusTone(item.status)}>
              {workflowStatusLabel(item.status, t)}
            </StatusChip>
          ) : undefined
        }
        footer={
          <div
            className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end"
            data-testid="workflow-config-footer"
          >
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              onClick={() => requestClose(false)}
              disabled={saving || busy}
            >
              {t('workflowAutomation.editor.cancel')}
            </Button>
            {editable && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={!dirty || saving || busy}
                  onClick={() => void saveWorkflow('draft')}
                >
                  <Save className="mr-1.5 h-4 w-4" />
                  {t('workflowAutomation.editor.saveDraft')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={!dirty || saving || busy}
                  onClick={() => void saveWorkflow('publish')}
                >
                  {t('workflowAutomation.editor.publish')}
                </Button>
                <Button
                  type="button"
                  className="min-h-11 w-full sm:w-auto"
                  disabled={!dirty || saving || busy}
                  onClick={() => void saveWorkflow('activate')}
                >
                  {t('workflowAutomation.editor.activate')}
                </Button>
              </>
            )}
          </div>
        }
      >
        <div className="space-y-4" data-testid="workflow-config-drawer">
          {loadError && (
            <ErrorState
              title={t('workflowAutomation.error.title')}
              description={loadError}
              onRetry={() => void loadDrawer()}
              retryLabel={t('workflowAutomation.error.retry')}
            />
          )}

          {loading && !loadError && (
            <div
              className="py-10 text-center text-sm text-muted-foreground"
              data-testid="workflow-config-loading"
              aria-busy="true"
              aria-live="polite"
            >
              <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
              {t('workflowAutomation.loading')}
            </div>
          )}

          {!loading && !loadError && (
            <>
              <div className="rounded-xl border border-border/60 bg-muted/10 p-3 text-xs">
                <p className="font-semibold text-foreground">{t('workflowAutomation.editor.impactTitle')}</p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>{t('workflowAutomation.editor.impactTrigger', { trigger: impact.triggerLabel })}</li>
                  <li>{t('workflowAutomation.editor.impactActions', { count: impact.actionCount })}</li>
                  <li>{t('workflowAutomation.editor.impactConditions', { count: impact.conditionCount })}</li>
                  <li>
                    {t('workflowAutomation.editor.impactRisk')}:{' '}
                    <StatusChip tone={workflowRiskTone(impact.riskClass)}>
                      {workflowRiskLabel(impact.riskClass, t)}
                    </StatusChip>
                  </li>
                  {impact.requiresPublishApproval && (
                    <li>{t('workflowAutomation.editor.impactApprovalRequired')}</li>
                  )}
                </ul>
              </div>

              {!editable && (
                <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
                  {isSystem
                    ? t('workflowAutomation.editor.systemReadonly')
                    : t('workflowAutomation.readonly')}
                </div>
              )}

              <Accordion type="multiple" defaultValue={['general', 'trigger']} className="space-y-2">
                <AccordionItem value="general" className="rounded-xl border border-border/60 px-3">
                  <AccordionTrigger className="min-h-11 py-3 text-sm font-semibold">
                    {t('workflowAutomation.editor.sections.general')}
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div>
                      <FieldLabel htmlFor="workflow-config-name">
                        {t('workflowAutomation.editor.fields.name')}
                      </FieldLabel>
                      <input
                        id="workflow-config-name"
                        value={form.name}
                        disabled={sectionDisabled('name')}
                        onChange={(e) => updateForm({ name: e.target.value })}
                        className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                        aria-invalid={Boolean(fieldErrors.name)}
                        aria-describedby={fieldErrors.name ? 'workflow-config-name-error' : undefined}
                      />
                      <FieldError id="workflow-config-name-error" message={fieldErrors.name} />
                    </div>
                    <div>
                      <FieldLabel>{t('workflowAutomation.editor.fields.description')}</FieldLabel>
                      <textarea
                        value={form.description}
                        disabled={sectionDisabled('description')}
                        onChange={(e) => updateForm({ description: e.target.value })}
                        rows={3}
                        className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <FieldLabel>{t('workflowAutomation.editor.fields.category')}</FieldLabel>
                      <select
                        value={form.category}
                        disabled={sectionDisabled('category')}
                        onChange={(e) => updateForm({ category: e.target.value })}
                        className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                      >
                        {(catalog?.categories ?? []).map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="trigger" className="rounded-xl border border-border/60 px-3">
                  <AccordionTrigger className="min-h-11 py-3 text-sm font-semibold">
                    {t('workflowAutomation.editor.sections.trigger')}
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div>
                      <FieldLabel htmlFor="workflow-config-trigger">
                        {t('workflowAutomation.editor.fields.trigger')}
                      </FieldLabel>
                      <select
                        id="workflow-config-trigger"
                        value={form.triggerType}
                        disabled={sectionDisabled('trigger')}
                        onChange={(e) => updateForm({ triggerType: e.target.value })}
                        className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                        aria-invalid={Boolean(fieldErrors.triggerType)}
                        aria-describedby={
                          fieldErrors.triggerType ? 'workflow-config-trigger-error' : undefined
                        }
                      >
                        {(catalog?.triggers ?? []).map((trigger) => (
                          <option key={trigger.type} value={trigger.type}>
                            {t(`workflowAutomation.trigger.${trigger.type}` as never) !==
                            `workflowAutomation.trigger.${trigger.type}`
                              ? t(`workflowAutomation.trigger.${trigger.type}` as never)
                              : trigger.type}
                          </option>
                        ))}
                      </select>
                      <FieldError id="workflow-config-trigger-error" message={fieldErrors.triggerType} />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="scope" className="rounded-xl border border-border/60 px-3">
                  <AccordionTrigger className="min-h-11 py-3 text-sm font-semibold">
                    {t('workflowAutomation.editor.sections.scope')}
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div>
                      <FieldLabel>{t('workflowAutomation.editor.fields.scope')}</FieldLabel>
                      <select
                        value={form.scopeType}
                        disabled={sectionDisabled('scope')}
                        onChange={(e) => updateForm({ scopeType: e.target.value })}
                        className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                      >
                        {(catalog?.scopeTypes ?? []).map((scopeType) => (
                          <option key={scopeType} value={scopeType}>
                            {t(`workflowAutomation.editor.scope.${scopeType}` as never)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {form.scopeType === 'station' && (
                      <div>
                        <FieldLabel>{t('workflowAutomation.editor.fields.stationIds')}</FieldLabel>
                        <textarea
                          value={form.scopeStationIds}
                          disabled={sectionDisabled('scope')}
                          onChange={(e) => updateForm({ scopeStationIds: e.target.value })}
                          rows={2}
                          className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                    {form.scopeType === 'vehicle' && (
                      <div>
                        <FieldLabel>{t('workflowAutomation.editor.fields.vehicleIds')}</FieldLabel>
                        <textarea
                          value={form.scopeVehicleIds}
                          disabled={sectionDisabled('scope')}
                          onChange={(e) => updateForm({ scopeVehicleIds: e.target.value })}
                          rows={2}
                          className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="conditions" className="rounded-xl border border-border/60 px-3">
                  <AccordionTrigger className="min-h-11 py-3 text-sm font-semibold">
                    {t('workflowAutomation.editor.sections.conditions')}
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <FieldLabel>{t('workflowAutomation.editor.fields.conditionMatch')}</FieldLabel>
                        <select
                          value={form.conditionGroup.match}
                          disabled={sectionDisabled('conditions')}
                          onChange={(e) =>
                            updateForm({
                              conditionGroup: {
                                ...form.conditionGroup,
                                match: e.target.value as 'all' | 'any',
                              },
                            })
                          }
                          className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                        >
                          <option value="all">{t('workflowAutomation.editor.conditionAll')}</option>
                          <option value="any">{t('workflowAutomation.editor.conditionAny')}</option>
                        </select>
                      </div>
                      <label className="flex min-h-11 items-center gap-2 rounded-md border border-border/60 px-3 text-sm">
                        <input
                          type="checkbox"
                          checked={form.conditionGroup.negate}
                          disabled={sectionDisabled('conditions')}
                          onChange={(e) =>
                            updateForm({
                              conditionGroup: {
                                ...form.conditionGroup,
                                negate: e.target.checked,
                              },
                            })
                          }
                        />
                        {t('workflowAutomation.editor.conditionNot')}
                      </label>
                    </div>
                    <FieldError message={fieldErrors.conditions} />
                    <div className="space-y-2">
                      {form.conditionGroup.rules.map((rule, index) => (
                        <div key={rule.id} className="rounded-lg border border-border/60 p-3">
                          <div className="grid grid-cols-1 gap-2">
                            <select
                              value={rule.field}
                              disabled={sectionDisabled('conditions')}
                              onChange={(e) => {
                                const rules = [...form.conditionGroup.rules];
                                rules[index] = { ...rule, field: e.target.value, valueError: undefined };
                                updateForm({ conditionGroup: { ...form.conditionGroup, rules } });
                              }}
                              className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                            >
                              {(catalog?.conditionFields ?? []).map((field) => (
                                <option key={field.key} value={field.key}>
                                  {field.key}
                                </option>
                              ))}
                            </select>
                            <select
                              value={rule.operator}
                              disabled={sectionDisabled('conditions')}
                              onChange={(e) => {
                                const rules = [...form.conditionGroup.rules];
                                rules[index] = { ...rule, operator: e.target.value };
                                updateForm({ conditionGroup: { ...form.conditionGroup, rules } });
                              }}
                              className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                            >
                              {(
                                catalog?.conditionFields.find((field) => field.key === rule.field)
                                  ?.operators ?? catalog?.operators ?? []
                              ).map((operator) => (
                                <option key={operator} value={operator}>
                                  {operator}
                                </option>
                              ))}
                            </select>
                            {rule.operator !== 'exists' && (
                              <input
                                value={rule.value}
                                disabled={sectionDisabled('conditions')}
                                onChange={(e) => {
                                  const rules = [...form.conditionGroup.rules];
                                  rules[index] = { ...rule, value: e.target.value, valueError: undefined };
                                  updateForm({ conditionGroup: { ...form.conditionGroup, rules } });
                                }}
                                onBlur={() => {
                                  const fieldMeta = catalog?.conditionFields.find(
                                    (field) => field.key === rule.field,
                                  );
                                  if (fieldMeta?.dataType !== 'number') return;
                                  const parsed = parseBoundedNumberInput(rule.value, {
                                    min: fieldMeta.min,
                                    max: fieldMeta.max,
                                  });
                                  const rules = [...form.conditionGroup.rules];
                                  rules[index] = {
                                    ...rule,
                                    value: parsed.value,
                                    valueError: parsed.error
                                      ? t('workflowAutomation.editor.errors.numberInvalid')
                                      : undefined,
                                  };
                                  updateForm({ conditionGroup: { ...form.conditionGroup, rules } });
                                }}
                                className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                                placeholder={t('workflowAutomation.editor.fields.conditionValue')}
                              />
                            )}
                          </div>
                          <FieldError message={rule.valueError} />
                          {editable && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-2 min-h-11"
                              onClick={() => {
                                const rules = form.conditionGroup.rules.filter((_, i) => i !== index);
                                updateForm({ conditionGroup: { ...form.conditionGroup, rules } });
                              }}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              {t('workflowAutomation.editor.remove')}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    {editable && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={() =>
                          updateForm({
                            conditionGroup: {
                              ...form.conditionGroup,
                              rules: [
                                ...form.conditionGroup.rules,
                                {
                                  id: `cond-${Date.now()}`,
                                  field: catalog?.conditionFields[0]?.key ?? 'vehicle_status',
                                  operator: 'equals',
                                  value: '',
                                },
                              ],
                            },
                          })
                        }
                      >
                        {t('workflowAutomation.editor.addCondition')}
                      </Button>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="actions" className="rounded-xl border border-border/60 px-3">
                  <AccordionTrigger className="min-h-11 py-3 text-sm font-semibold">
                    {t('workflowAutomation.editor.sections.actions')}
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <FieldError message={fieldErrors.actions} />
                    {form.actions.map((action, index) => {
                      const unavailable = !catalog?.actions.some((item) => item.type === action.type);
                      return (
                        <div
                          key={action.id}
                          className={`rounded-lg border p-3 ${unavailable ? 'border-status-critical/40' : 'border-border/60'}`}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                            <select
                              value={action.type}
                              disabled={sectionDisabled('actions')}
                              onChange={(e) => {
                                const actions = [...form.actions];
                                actions[index] = {
                                  ...action,
                                  type: e.target.value,
                                  config: {},
                                };
                                updateForm({ actions });
                              }}
                              className="min-h-11 w-full flex-1 break-all rounded-md border border-border bg-background px-3 text-sm"
                            >
                              {(catalog?.actions ?? []).map((item) => (
                                <option key={item.type} value={item.type}>
                                  {item.type}
                                </option>
                              ))}
                            </select>
                            {editable && (
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="min-h-11 min-w-11"
                                  disabled={index === 0}
                                  onClick={() =>
                                    updateForm({ actions: moveArrayItem(form.actions, index, index - 1) })
                                  }
                                  aria-label={t('workflowAutomation.editor.moveUp')}
                                >
                                  <ArrowUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="min-h-11 min-w-11"
                                  disabled={index === form.actions.length - 1}
                                  onClick={() =>
                                    updateForm({ actions: moveArrayItem(form.actions, index, index + 1) })
                                  }
                                  aria-label={t('workflowAutomation.editor.moveDown')}
                                >
                                  <ArrowDown className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                          {unavailable && (
                            <p className="mt-2 text-xs text-status-critical">
                              {t('workflowAutomation.editor.errors.actionUnavailable')}
                            </p>
                          )}
                          {action.type === 'task.create' && (
                            <div className="mt-3 grid grid-cols-1 gap-2">
                              <input
                                value={action.config.title ?? ''}
                                disabled={sectionDisabled('actions')}
                                onChange={(e) => {
                                  const actions = [...form.actions];
                                  actions[index] = {
                                    ...action,
                                    config: { ...action.config, title: e.target.value },
                                  };
                                  updateForm({ actions });
                                }}
                                placeholder={t('workflowAutomation.editor.fields.taskTitle')}
                                className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                              />
                              <select
                                value={action.config.priority ?? 'NORMAL'}
                                disabled={sectionDisabled('actions')}
                                onChange={(e) => {
                                  const actions = [...form.actions];
                                  actions[index] = {
                                    ...action,
                                    config: { ...action.config, priority: e.target.value },
                                  };
                                  updateForm({ actions });
                                }}
                                className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                              >
                                {(catalog?.taskPriorities ?? []).map((priority) => (
                                  <option key={priority} value={priority}>
                                    {priority}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          {action.type === 'vehicle.status.update' && (
                            <select
                              value={action.config.status ?? 'OUT_OF_SERVICE'}
                              disabled={sectionDisabled('actions')}
                              onChange={(e) => {
                                const actions = [...form.actions];
                                actions[index] = {
                                  ...action,
                                  config: { ...action.config, status: e.target.value },
                                };
                                updateForm({ actions });
                              }}
                              className="mt-3 min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                            >
                              {(catalog?.vehicleStatuses ?? []).map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          )}
                          {action.type === 'notification.prepare' && (
                            <div className="mt-3 grid grid-cols-1 gap-2">
                              <select
                                value={action.config.target ?? 'admin'}
                                disabled={sectionDisabled('actions')}
                                onChange={(e) => {
                                  const actions = [...form.actions];
                                  actions[index] = {
                                    ...action,
                                    config: { ...action.config, target: e.target.value },
                                  };
                                  updateForm({ actions });
                                }}
                                className="min-h-11 w-full rounded-md border border-border bg-background px-3 text-sm"
                              >
                                {(catalog?.notificationTargets ?? []).map((target) => (
                                  <option key={target} value={target}>
                                    {target}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={maskRecipientValue(action.config.recipient ?? '')}
                                disabled
                                readOnly
                                className="min-h-11 w-full rounded-md border border-border bg-muted/20 px-3 text-sm text-muted-foreground"
                                placeholder={t('workflowAutomation.editor.fields.recipientMasked')}
                              />
                            </div>
                          )}
                          {editable && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-2 min-h-11"
                              disabled={form.actions.length <= 1}
                              onClick={() =>
                                updateForm({
                                  actions: form.actions.filter((_, actionIndex) => actionIndex !== index),
                                })
                              }
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              {t('workflowAutomation.editor.remove')}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                    {editable && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={() =>
                          updateForm({
                            actions: [
                              ...form.actions,
                              {
                                id: `action-${Date.now()}`,
                                type: catalog?.actions[0]?.type ?? 'task.create',
                                config: {},
                              },
                            ],
                          })
                        }
                      >
                        {t('workflowAutomation.editor.addAction')}
                      </Button>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="approvals" className="rounded-xl border border-border/60 px-3">
                  <AccordionTrigger className="min-h-11 py-3 text-sm font-semibold">
                    {t('workflowAutomation.editor.sections.approvals')}
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <StatusChip tone={workflowRiskTone(impact.riskClass)}>
                        {workflowRiskLabel(impact.riskClass, t)}
                      </StatusChip>
                      <span className="text-xs text-muted-foreground">
                        {t('workflowAutomation.editor.riskReadonly')}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {impact.requiresPublishApproval
                        ? t('workflowAutomation.editor.approvalRequiredHint')
                        : t('workflowAutomation.editor.approvalNotRequiredHint')}
                    </p>
                    <div>
                      <FieldLabel htmlFor="workflow-config-change-reason">
                        {t('workflowAutomation.editor.fields.changeReason')}
                      </FieldLabel>
                      <textarea
                        id="workflow-config-change-reason"
                        value={form.changeReason}
                        disabled={!editable}
                        onChange={(e) => updateForm({ changeReason: e.target.value })}
                        rows={3}
                        className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        aria-invalid={Boolean(fieldErrors.changeReason)}
                        aria-describedby={
                          fieldErrors.changeReason ? 'workflow-config-change-reason-error' : undefined
                        }
                      />
                      <FieldError
                        id="workflow-config-change-reason-error"
                        message={fieldErrors.changeReason}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="simulation" className="rounded-xl border border-border/60 px-3">
                  <AccordionTrigger className="min-h-11 py-3 text-sm font-semibold">
                    {t('workflowAutomation.editor.sections.simulation')}
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <p className="text-xs text-muted-foreground">
                      {t('workflowAutomation.editor.simulation.help')}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={!workflowId || simulation.loading}
                      onClick={runTest}
                    >
                      <Play className="mr-1.5 h-4 w-4" />
                      {simulation.loading
                        ? t('workflowAutomation.editor.simulation.running')
                        : t('workflowAutomation.editor.simulation.run')}
                    </Button>
                    <WorkflowDryRunPanel
                      plan={simulation.plan}
                      loading={simulation.loading}
                      error={simulation.error}
                      requestId={simulation.requestId}
                    />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="versions" className="rounded-xl border border-border/60 px-3">
                  <AccordionTrigger className="min-h-11 py-3 text-sm font-semibold">
                    {t('workflowAutomation.editor.sections.versions')}
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3 pb-4">
                    <p>
                      {t('workflowAutomation.editor.versions.current', {
                        version: item?.activeVersion ?? item?.version ?? 1,
                      })}
                    </p>
                    <WorkflowRevisionDiffPanel
                      diff={revisionDiff.diff}
                      loading={revisionDiff.loading}
                      error={revisionDiff.error}
                    />
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="history" className="rounded-xl border border-border/60 px-3">
                  <AccordionTrigger className="min-h-11 py-3 text-sm font-semibold">
                    {t('workflowAutomation.editor.sections.history')}
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 pb-4">
                    <WorkflowExecutionHistoryPanel
                      runs={runs}
                      loading={runsLoading}
                      canViewAudit={canWrite || !createMode}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </>
          )}
        </div>
      </DetailDrawer>

      <AlertDialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('workflowAutomation.editor.unsavedTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('workflowAutomation.editor.unsavedDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('workflowAutomation.editor.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCloseConfirmOpen(false);
                onOpenChange(false);
              }}
            >
              {t('workflowAutomation.editor.discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

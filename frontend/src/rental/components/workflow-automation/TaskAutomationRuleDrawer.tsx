import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardList, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import { Button } from '../../../components/ui/button';
import { DetailDrawer } from '../../../components/patterns';
import { useRentalOrg } from '../../RentalContext';
import { RuleValueTile } from '../shared/rental-requirements-ui';
import { TaskAutomationSimulationPanel } from './TaskAutomationSimulationPanel';
import type {
  TaskAutomationOverrideFormState,
  TaskAutomationRuleDto,
  TaskAutomationSimulationResult,
} from './task-automation.types';
import {
  buildFormStateFromRule,
  buildOverridePayload,
  formatAuditTimestamp,
  formatOffsetMinutesDe,
  isFieldOverridden,
  labelAssignmentDe,
  labelPriorityDe,
  labelTaskAutomationSourceDe,
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
}

function ToggleField({
  label,
  checked,
  disabled,
  highlighted,
  source,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  highlighted?: boolean;
  source?: string;
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
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          {source && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Quelle: <span className="font-medium text-foreground/80">{source}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            checked ? 'bg-brand' : 'bg-muted'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          aria-pressed={checked}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  disabled,
  highlighted,
  source,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  highlighted?: boolean;
  source?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      className={`rounded-lg border border-border/60 px-3 py-2.5 ${
        highlighted ? 'border-l-[3px] border-l-[color:var(--brand)]/45' : ''
      }`}
    >
      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {source && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Quelle: <span className="font-medium text-foreground/80">{source}</span>
        </p>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  disabled,
  highlighted,
  source,
  helper,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  highlighted?: boolean;
  source?: string;
  helper?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div
      className={`rounded-lg border border-border/60 px-3 py-2.5 ${
        highlighted ? 'border-l-[3px] border-l-[color:var(--brand)]/45' : ''
      }`}
    >
      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm"
      />
      <p className="mt-1 text-[10px] text-muted-foreground">{helper ?? formatOffsetMinutesDe(value)}</p>
      {source && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Quelle: <span className="font-medium text-foreground/80">{source}</span>
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
}: TaskAutomationRuleDrawerProps) {
  const { orgId } = useRentalOrg();
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
          setRevisionsError(parseApiError(error));
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
          setSimulationError(parseApiError(error));
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

  if (!rule || !form) return null;

  const allowed = new Set(rule.allowedOverrideFields);
  const sourceFor = (field: string) =>
    labelTaskAutomationSourceDe(
      isFieldOverridden(rule.fieldProvenance[field])
        ? 'ORG_OVERRIDE'
        : rule.fieldProvenance[field]?.source ?? 'PLATFORM_DEFAULT',
    );

  const handleSave = async () => {
    if (!canWrite) return;
    if (showCriticalDisableWarning && !disableWarningAck) {
      toast.error('Bitte bestätigen Sie die Warnung zur Deaktivierung.');
      return;
    }
    try {
      const payload = {
        ...buildOverridePayload(rule, form),
        ...(changeReason.trim() ? { reason: changeReason.trim() } : {}),
      };
      await onSave(rule.ruleId, payload);
      toast.success('Aufgaben-Automation gespeichert');
      onOpenChange(false);
    } catch {
      /* error surfaced by center hook */
    }
  };

  const handleReset = async () => {
    if (!canWrite || !rule.hasOrgOverride) return;
    if (!confirm('Alle eigenen Anpassungen für diese Regel auf den SynqDrive-Standard zurücksetzen?')) {
      return;
    }
    try {
      await onReset(rule.ruleId, rule.audit.version ?? undefined);
      toast.success('Auf SynqDrive-Standard zurückgesetzt');
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
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      widthClassName="sm:max-w-2xl"
      eyebrow="Aufgaben-Automation"
      title={rule.nameDe}
      description={rule.descriptionDe}
      status={
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            rule.effectivelyEnabled
              ? 'bg-status-success-soft text-status-success'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {rule.effectivelyEnabled ? 'Aktiv' : 'Inaktiv'}
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
              onClick={() => void handleReset()}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Auf SynqDrive-Standard zurücksetzen
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button type="button" size="sm" disabled={saving || changedFields.size === 0} onClick={() => void handleSave()}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {saving ? 'Speichern…' : 'Speichern'}
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-5 px-5 py-4">
        <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5 text-xs text-muted-foreground">
          Änderungen gelten nur für künftige automatisch erzeugte Aufgaben. Bereits aktive Tasks bleiben
          unverändert.
        </div>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Übersicht</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <RuleValueTile label="Trigger" value={rule.triggerLabelDe} locale="de" density="compact" />
            <RuleValueTile label="Aktivierung" value={rule.activationLabelDe} locale="de" density="compact" />
            <RuleValueTile label="Fälligkeit" value={rule.dueLabelDe} locale="de" density="compact" />
            <RuleValueTile label="Auto-Auflösung" value={rule.autoResolveLabelDe} locale="de" density="compact" />
            <RuleValueTile label="Eskalation" value={rule.escalationLabelDe} locale="de" density="compact" />
            <RuleValueTile
              label="Checkliste"
              value={summarizeChecklistState(rule)}
              locale="de"
              density="compact"
              highlighted={!rule.checklist.usesSynqDriveStandard}
            />
          </div>
        </section>

        {(rule.audit.updatedAt || rule.audit.updatedByName) && (
          <section className="rounded-lg border border-border/50 px-3 py-2.5 text-xs text-muted-foreground">
            Zuletzt bearbeitet: {formatAuditTimestamp(rule.audit.updatedAt)}
            {rule.audit.updatedByName ? ` · ${rule.audit.updatedByName}` : ''}
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Änderungshistorie
          </h3>
          {revisionsLoading && (
            <p className="text-xs text-muted-foreground">Revisionen werden geladen…</p>
          )}
          {revisionsError && (
            <p className="text-xs text-destructive">{revisionsError}</p>
          )}
          {!revisionsLoading && !revisionsError && revisions.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Noch keine org-spezifischen Anpassungen protokolliert.
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
                      Version {revision.version} · {revision.changeType}
                    </span>
                    <span className="text-muted-foreground">
                      {formatAuditTimestamp(revision.changedAt)}
                    </span>
                  </div>
                  {(revision.changedByName || revision.reason) && (
                    <p className="mt-1 text-muted-foreground">
                      {revision.changedByName ? revision.changedByName : 'System'}
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
            Konfiguration
          </h3>

          <TaskAutomationSimulationPanel
            simulation={simulation}
            loading={simulationLoading}
            error={simulationError}
          />

          {canWrite && (
            <div className="rounded-lg border border-border/60 px-3 py-2.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Änderungsgrund (optional)
              </label>
              <textarea
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="z. B. Pickup-Fenster für Station Nord verkürzen"
                className="mt-1.5 w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm"
              />
            </div>
          )}

          {allowed.has('enabled') && (
            <ToggleField
              label="Regel aktiv"
              checked={form.enabled}
              disabled={!canWrite}
              highlighted={changedFields.has('enabled')}
              source={sourceFor('enabled')}
              onChange={(enabled) => setForm((current) => (current ? { ...current, enabled } : current))}
            />
          )}

          {showCriticalDisableWarning && (
            <div className="rounded-lg border border-status-attention/40 bg-status-attention-soft/40 px-3 py-3 text-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-attention" />
                <div className="space-y-2">
                  <p className="font-medium text-foreground">
                    Kritische operative Regel — Deaktivierung kann Lücken im Tagesgeschäft verursachen.
                  </p>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={disableWarningAck}
                      onChange={(e) => setDisableWarningAck(e.target.checked)}
                    />
                    Ich verstehe die Auswirkungen und möchte die Regel dennoch deaktivieren.
                  </label>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {allowed.has('activationOffsetMinutes') && (
              <NumberField
                label="Aktivierungs-Offset (Minuten)"
                value={form.activationOffsetMinutes ?? 0}
                disabled={!canWrite}
                highlighted={changedFields.has('activationOffsetMinutes')}
                source={sourceFor('activationOffsetMinutes')}
                onChange={(activationOffsetMinutes) =>
                  setForm((current) => (current ? { ...current, activationOffsetMinutes } : current))
                }
              />
            )}
            {allowed.has('dueOffsetMinutes') && (
              <NumberField
                label="Fälligkeits-Offset (Minuten)"
                value={form.dueOffsetMinutes ?? 0}
                disabled={!canWrite}
                highlighted={changedFields.has('dueOffsetMinutes')}
                source={sourceFor('dueOffsetMinutes')}
                onChange={(dueOffsetMinutes) =>
                  setForm((current) => (current ? { ...current, dueOffsetMinutes } : current))
                }
              />
            )}
            {allowed.has('priority') && (
              <SelectField
                label="Standardpriorität"
                value={form.priority ?? rule.default.priority}
                disabled={!canWrite}
                highlighted={changedFields.has('priority')}
                source={sourceFor('priority')}
                options={[
                  { value: 'LOW', label: labelPriorityDe('LOW') },
                  { value: 'NORMAL', label: labelPriorityDe('NORMAL') },
                  { value: 'HIGH', label: labelPriorityDe('HIGH') },
                  { value: 'CRITICAL', label: labelPriorityDe('CRITICAL') },
                ]}
                onChange={(priority) =>
                  setForm((current) => (current ? { ...current, priority: priority as typeof form.priority } : current))
                }
              />
            )}
            {allowed.has('assignmentStrategy') && (
              <SelectField
                label="Zuweisung"
                value={form.assignmentStrategy ?? rule.default.assignmentStrategy}
                disabled={!canWrite}
                highlighted={changedFields.has('assignmentStrategy')}
                source={sourceFor('assignmentStrategy')}
                options={[
                  { value: 'UNASSIGNED', label: labelAssignmentDe('UNASSIGNED') },
                  { value: 'STATION_FROM_BOOKING', label: labelAssignmentDe('STATION_FROM_BOOKING') },
                  { value: 'INHERIT_FROM_CONTEXT', label: labelAssignmentDe('INHERIT_FROM_CONTEXT') },
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
                Checkliste
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Pflichtpunkte des SynqDrive-Standards bleiben erhalten. Optionale Punkte können ausgeblendet
              oder ergänzt werden.
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
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {item.isRequired ? 'Pflichtpunkt' : 'Optional'} · SynqDrive-Standard
                        </p>
                      </div>
                      {!item.isRequired && canWrite && (
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={!hidden}
                            onChange={() => toggleOptionalChecklistItem(item.title)}
                          />
                          Anzeigen
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
                  <p className="text-xs font-medium text-foreground">Zusätzliche Punkte</p>
                  <Button type="button" size="sm" variant="outline" onClick={addChecklistItem}>
                    Punkt hinzufügen
                  </Button>
                </div>
                {(form.checklistOverrides?.additionalItems ?? []).map((item, index) => (
                  <div key={`extra-${index}`} className="rounded-lg border border-l-[3px] border-l-[color:var(--brand)]/40 px-3 py-2">
                    <input
                      value={item.title}
                      disabled={!canWrite}
                      placeholder="Titel des zusätzlichen Punkts"
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
  );
}

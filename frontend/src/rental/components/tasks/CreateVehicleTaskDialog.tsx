import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '../../../components/patterns';
import { api, type ApiTask, type CreateTaskPayload } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import type { VehicleData } from '../../data/vehicles';
import { checklistPreviewForType } from '../../lib/task-templates';
import {
  CATEGORY_TO_TASK_TYPE,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  VIEW_PRIORITY_TO_API,
  type TaskCategory,
  type TaskPriorityView,
} from '../../lib/task-create.utils';
import { Icon } from '../ui/Icon';

export interface CreateVehicleTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: VehicleData | null | undefined;
  /** Optional VIN when available from fleet detail payloads. */
  vehicleVin?: string | null;
  onCreated?: (task: ApiTask) => void;
}

interface FormState {
  title: string;
  description: string;
  category: TaskCategory;
  priority: TaskPriorityView;
  assignedUserId: string;
  dueDate: string;
  blocksVehicleAvailability: boolean;
}

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  category: 'Maintenance',
  priority: 'Medium',
  assignedUserId: '',
  dueDate: '',
  blocksVehicleAvailability: false,
};

export function CreateVehicleTaskDialog({
  open,
  onOpenChange,
  vehicle,
  vehicleVin,
  onCreated,
}: CreateVehicleTaskDialogProps) {
  const { orgId } = useRentalOrg();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [orgMembers, setOrgMembers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setErrors({});
    setSubmitError(null);
  }, [open, vehicle?.id]);

  useEffect(() => {
    if (!orgId || !open) {
      setOrgMembers([]);
      return;
    }
    let cancelled = false;
    api.users
      .listByOrg(orgId)
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : [];
        setOrgMembers(
          list.map((u) => ({
            id: u.id,
            name: u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setOrgMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, open]);

  const close = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = 'Titel ist erforderlich';
    if (!vehicle?.id) next.vehicle = 'Fahrzeug fehlt — Aufgabe kann nicht erstellt werden';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!orgId || !vehicle?.id || submitting) return;
    if (!validate()) return;

    const taskType = CATEGORY_TO_TASK_TYPE[form.category] ?? 'CUSTOM';
    const checklistItems = checklistPreviewForType(taskType);
    const payload: CreateTaskPayload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      type: taskType,
      source: 'MANUAL',
      priority: VIEW_PRIORITY_TO_API[form.priority] ?? 'NORMAL',
      category: form.category,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : undefined,
      assignedUserId: form.assignedUserId || undefined,
      vehicleId: vehicle.id,
      stationId: vehicle.stationId ?? vehicle.homeStationId ?? undefined,
      blocksVehicleAvailability: form.blocksVehicleAvailability,
      checklist: checklistItems.length
        ? checklistItems.map((title, sortOrder) => ({ title, sortOrder }))
        : undefined,
    };

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await api.tasks.create(orgId, payload);
      toast.success('Fahrzeugaufgabe erstellt', { description: created.title });
      onCreated?.(created);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Aufgabe konnte nicht erstellt werden';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2.5 rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground outline-none transition-all text-xs focus:border-[color:var(--brand)] focus:ring-1 focus:ring-[color:var(--brand-soft)]';
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground';

  const makeModel = [vehicle?.make, vehicle?.model].filter(Boolean).join(' ');

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
      maxWidthClassName="sm:max-w-[520px]"
      title="Neue Fahrzeugaufgabe"
      description="Die Aufgabe wird automatisch mit dem aktuellen Fahrzeug verknüpft."
      hideClose={submitting}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !vehicle?.id || !orgId}
            className="sq-cta inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-60"
          >
            {submitting ? (
              <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Icon name="check-circle" className="w-3.5 h-3.5" />
            )}
            Aufgabe anlegen
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {submitError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            {submitError}
          </div>
        )}

        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className={labelClass}>Fahrzeug</p>
          {vehicle?.id ? (
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{vehicle.license}</p>
              {makeModel && <p className="text-xs text-muted-foreground">{makeModel}</p>}
              {vehicleVin && (
                <p className="text-[10px] font-mono text-muted-foreground truncate">VIN {vehicleVin}</p>
              )}
              {vehicle.station && (
                <p className="text-[10px] text-muted-foreground">Station: {vehicle.station}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Kein Fahrzeug im Kontext — Aufgabe kann nicht erstellt werden.
            </p>
          )}
          {errors.vehicle && (
            <p className="mt-1 text-[10px] font-medium text-red-600 dark:text-red-400">{errors.vehicle}</p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="vehicle-task-title">
            Titel *
          </label>
          <input
            id="vehicle-task-title"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            className={inputClass}
            placeholder="z. B. Bremsen prüfen"
            disabled={submitting}
          />
          {errors.title && (
            <p className="mt-1 text-[10px] font-medium text-red-600 dark:text-red-400">{errors.title}</p>
          )}
        </div>

        <div>
          <label className={labelClass} htmlFor="vehicle-task-description">
            Beschreibung
          </label>
          <textarea
            id="vehicle-task-description"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            className={`${inputClass} min-h-[72px] resize-y`}
            placeholder="Optionale Details zur Aufgabe"
            disabled={submitting}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="vehicle-task-category">
              Kategorie
            </label>
            <select
              id="vehicle-task-category"
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as TaskCategory }))}
              className={inputClass}
              disabled={submitting}
            >
              {TASK_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="vehicle-task-priority">
              Priorität
            </label>
            <select
              id="vehicle-task-priority"
              value={form.priority}
              onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value as TaskPriorityView }))}
              className={inputClass}
              disabled={submitting}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="vehicle-task-assignee">
              Zuständig (optional)
            </label>
            <select
              id="vehicle-task-assignee"
              value={form.assignedUserId}
              onChange={(e) => setForm((prev) => ({ ...prev, assignedUserId: e.target.value }))}
              className={inputClass}
              disabled={submitting}
            >
              <option value="">Nicht zugewiesen</option>
              {orgMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="vehicle-task-due">
              Fällig am (optional)
            </label>
            <input
              id="vehicle-task-due"
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
              className={inputClass}
              disabled={submitting}
            />
          </div>
        </div>

        <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.blocksVehicleAvailability}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, blocksVehicleAvailability: e.target.checked }))
            }
            disabled={submitting}
            className="mt-0.5 h-4 w-4 rounded accent-[color:var(--status-critical)]"
          />
          <span className="text-[11px] text-foreground">
            <span className="font-semibold block">Blockiert Fahrzeugverfügbarkeit</span>
            <span className="text-muted-foreground">
              Kennzeichnet die Aufgabe als vermietungsrelevant, bis sie erledigt ist.
            </span>
          </span>
        </label>
      </div>
    </FormDialog>
  );
}

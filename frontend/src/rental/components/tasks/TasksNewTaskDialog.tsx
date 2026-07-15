import { useEffect, useMemo, useState } from 'react';
import { Calendar, Car, CheckCircle, FileText } from 'lucide-react';
import { FormDialog } from '../../../components/patterns';
import { api, type CreateTaskPayload, type Station } from '../../../lib/api';
import { getStoredUser } from '../../../lib/auth';
import { checklistPreviewForType } from '../../lib/task-templates';
import {
  CATEGORY_TO_TASK_TYPE,
  TASK_CATEGORIES,
  VIEW_PRIORITY_TO_API,
  type TaskCategory,
} from '../../lib/task-create.utils';
import type { OrgMemberRef, TaskListPriority } from '../../lib/task-list.utils';
import type { VehicleData } from '../../data/vehicles';
import { Icon } from '../ui/Icon';
import { TaskCategoryChip, TaskPriorityBadge } from './task-display';

interface TasksNewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  mutating: boolean;
  onMutatingChange: (value: boolean) => void;
  fleetVehicles: VehicleData[];
  orgMembers: OrgMemberRef[];
  orgStations: Station[];
  onCreated: () => void;
}

type TaskPriority = TaskListPriority;

export function TasksNewTaskDialog({
  open,
  onOpenChange,
  orgId,
  mutating,
  onMutatingChange,
  fleetVehicles,
  orgMembers,
  orgStations,
  onCreated,
}: TasksNewTaskDialogProps) {
  const [taskStep, setTaskStep] = useState(0);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    category: 'Maintenance' as TaskCategory,
    priority: 'Medium' as TaskPriority,
    vehicleLicense: '',
    stationId: '',
    assignedUserId: '',
    dueDate: '',
    estimatedDuration: '',
    notes: '',
  });
  const [taskFormErrors, setTaskFormErrors] = useState<Record<string, string>>({});

  const currentUserLabel = useMemo(() => {
    const user = getStoredUser();
    if (!user) return 'Aktueller Benutzer';
    if (user.name?.trim()) return user.name.trim();
    if (user.email) return user.email.split('@')[0];
    return 'Aktueller Benutzer';
  }, []);

  const uniqueVehicles = useMemo(
    () => fleetVehicles.map((vehicle) => ({
      value: vehicle.license,
      label: `${vehicle.license} – ${vehicle.model}`,
    })),
    [fleetVehicles],
  );

  useEffect(() => {
    if (!open) {
      setNewTask({
        title: '',
        description: '',
        category: 'Maintenance',
        priority: 'Medium',
        vehicleLicense: '',
        stationId: '',
        assignedUserId: '',
        dueDate: '',
        estimatedDuration: '',
        notes: '',
      });
      setTaskFormErrors({});
      setTaskStep(0);
    }
  }, [open]);

  const validateTaskStep = (step: number): boolean => {
    const errors: Record<string, string> = {};
    if (step === 0) {
      if (!newTask.title.trim()) errors.title = 'Titel erforderlich';
      if (!newTask.description.trim()) errors.description = 'Beschreibung erforderlich';
    } else if (step === 1) {
      if (!newTask.vehicleLicense) errors.vehicleLicense = 'Fahrzeug auswählen';
      if (!newTask.assignedUserId) errors.assignedUserId = 'Zuweisung erforderlich';
      if (!newTask.stationId) errors.stationId = 'Station erforderlich';
    } else if (step === 2) {
      if (!newTask.dueDate) errors.dueDate = 'Fälligkeitsdatum erforderlich';
      if (!newTask.estimatedDuration.trim()) errors.estimatedDuration = 'Geschätzte Dauer erforderlich';
    }
    setTaskFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmitTask = () => {
    if (!orgId || mutating) {
      onOpenChange(false);
      return;
    }
    const vehicle = fleetVehicles.find((item) => item.license === newTask.vehicleLicense);
    const taskType = CATEGORY_TO_TASK_TYPE[newTask.category] ?? 'CUSTOM';
    const checklistItems = checklistPreviewForType(taskType);
    const payload: CreateTaskPayload = {
      title: newTask.title.trim(),
      description: newTask.description.trim() || undefined,
      type: taskType,
      source: 'MANUAL',
      priority: VIEW_PRIORITY_TO_API[newTask.priority] ?? 'NORMAL',
      category: newTask.category,
      dueDate: newTask.dueDate ? new Date(newTask.dueDate).toISOString() : undefined,
      assignedUserId: newTask.assignedUserId || undefined,
      vehicleId: vehicle?.id,
      stationId: newTask.stationId || undefined,
      checklist: checklistItems.length
        ? checklistItems.map((title, sortOrder) => ({ title, sortOrder }))
        : undefined,
    };
    onMutatingChange(true);
    api.tasks
      .create(orgId, payload)
      .then(() => onCreated())
      .catch((error) => console.error('Create task failed', error))
      .finally(() => {
        onMutatingChange(false);
        onOpenChange(false);
      });
  };

  const steps = [
    { label: 'Grunddaten', icon: FileText },
    { label: 'Fahrzeug & Zuweisung', icon: Car },
    { label: 'Zeitplan', icon: Calendar },
    { label: 'Zusammenfassung', icon: CheckCircle },
  ];
  const inputClass =
    'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-[color:var(--brand)] focus:ring-1 focus:ring-[color:var(--brand-soft)]';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground';
  const stationsList = orgStations.filter((station) => station.status === 'ACTIVE');

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      maxWidthClassName="sm:max-w-[680px]"
      title="Aufgabe erstellen"
      bodyClassName="flex flex-col p-0"
      footer={(
        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
          >
            Abbrechen
          </button>
          <div className="flex items-center gap-2.5">
            {taskStep > 0 ? (
              <button
                type="button"
                onClick={() => setTaskStep(taskStep - 1)}
                className="flex items-center gap-1.5 rounded-lg border border-border surface-premium px-3 py-2 text-xs font-medium text-foreground transition-all hover:bg-muted"
              >
                <Icon name="chevron-left" className="h-3.5 w-3.5" />
                Zurück
              </button>
            ) : null}
            {taskStep < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (validateTaskStep(taskStep)) setTaskStep(taskStep + 1);
                }}
                className="sq-cta flex items-center gap-1.5 px-3 py-2 text-xs font-semibold"
              >
                Weiter
                <Icon name="chevron-right" className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmitTask}
                className="sq-cta flex items-center gap-1.5 px-3 py-2 text-xs font-semibold"
              >
                <Icon name="check-circle" className="h-3.5 w-3.5" />
                Aufgabe anlegen
              </button>
            )}
          </div>
        </div>
      )}
    >
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-5 py-3">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          const isActive = index === taskStep;
          const isDone = index < taskStep;
          return (
            <div key={step.label} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => {
                  if (isDone) setTaskStep(index);
                }}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                    : isDone
                      ? 'cursor-pointer text-[color:var(--brand)] hover:bg-[color:var(--brand-soft)]'
                      : 'text-muted-foreground/50'
                }`}
              >
                {isDone ? (
                  <Icon name="check-circle" className="h-3.5 w-3.5" />
                ) : (
                  <StepIcon className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">{step.label}</span>
              </button>
              {index < steps.length - 1 ? (
                <div className={`mx-2 h-px flex-1 ${isDone ? 'bg-[color:var(--brand)]/40' : 'bg-border'}`} />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-7">
        {taskStep === 0 ? (
          <div className="space-y-4">
            <label className="block">
              <span className={labelClass}>Titel *</span>
              <input
                type="text"
                value={newTask.title}
                onChange={(event) => setNewTask({ ...newTask, title: event.target.value })}
                className={inputClass}
              />
              {taskFormErrors.title ? (
                <p className="mt-1 text-[11px] text-[color:var(--status-critical)]">{taskFormErrors.title}</p>
              ) : null}
            </label>
            <label className="block">
              <span className={labelClass}>Beschreibung *</span>
              <textarea
                rows={3}
                value={newTask.description}
                onChange={(event) => setNewTask({ ...newTask, description: event.target.value })}
                className={`${inputClass} resize-none`}
              />
              {taskFormErrors.description ? (
                <p className="mt-1 text-[11px] text-[color:var(--status-critical)]">{taskFormErrors.description}</p>
              ) : null}
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Kategorie</span>
                <select
                  value={newTask.category}
                  onChange={(event) =>
                    setNewTask({ ...newTask, category: event.target.value as TaskCategory })
                  }
                  className={inputClass}
                >
                  {TASK_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span className={labelClass}>Priorität</span>
                <div className="flex flex-wrap gap-1.5">
                  {(['Low', 'Medium', 'High', 'Critical'] as TaskPriority[]).map((priority) => (
                    <button
                      key={priority}
                      type="button"
                      onClick={() => setNewTask({ ...newTask, priority })}
                      className={`flex-1 rounded-lg border px-2 py-2 text-[11px] font-semibold ${
                        newTask.priority === priority
                          ? 'border-transparent bg-[color:var(--brand)] text-white'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      {priority}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {taskStep === 1 ? (
          <div className="space-y-4">
            <label className="block">
              <span className={labelClass}>Fahrzeug *</span>
              <select
                value={newTask.vehicleLicense}
                onChange={(event) => {
                  const license = event.target.value;
                  const vehicle = fleetVehicles.find((item) => item.license === license);
                  setNewTask({
                    ...newTask,
                    vehicleLicense: license,
                    stationId: vehicle?.homeStationId ?? vehicle?.stationId ?? newTask.stationId,
                  });
                }}
                className={inputClass}
              >
                <option value="">Fahrzeug auswählen …</option>
                {uniqueVehicles.map((vehicle) => (
                  <option key={vehicle.value} value={vehicle.value}>
                    {vehicle.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Zugewiesen an *</span>
                <select
                  value={newTask.assignedUserId}
                  onChange={(event) => setNewTask({ ...newTask, assignedUserId: event.target.value })}
                  className={inputClass}
                >
                  <option value="">Mitarbeiter wählen …</option>
                  {orgMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>Station *</span>
                <select
                  value={newTask.stationId}
                  onChange={(event) => setNewTask({ ...newTask, stationId: event.target.value })}
                  className={inputClass}
                >
                  <option value="">{stationsList.length === 0 ? 'Keine Stationen' : 'Station wählen …'}</option>
                  {stationsList.map((station) => (
                    <option key={station.id} value={station.id}>
                      {station.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : null}

        {taskStep === 2 ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-transparent sq-tone-info px-3.5 py-3 text-xs">
              Erstellt von: <span className="font-semibold">{currentUserLabel}</span>
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>Fälligkeitsdatum *</span>
                <input
                  type="date"
                  value={newTask.dueDate}
                  onChange={(event) => setNewTask({ ...newTask, dueDate: event.target.value })}
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Geschätzte Dauer *</span>
                <select
                  value={newTask.estimatedDuration}
                  onChange={(event) => setNewTask({ ...newTask, estimatedDuration: event.target.value })}
                  className={inputClass}
                >
                  <option value="">Dauer wählen …</option>
                  {['0.5h', '1h', '1.5h', '2h', '2.5h', '3h', '4h', '5h', '6h', '8h', '1 Tag', '2 Tage'].map(
                    (duration) => (
                      <option key={duration} value={duration}>
                        {duration}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
          </div>
        ) : null}

        {taskStep === 3 ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <SummaryRow label="Titel" value={newTask.title} />
              <SummaryRow label="Beschreibung" value={newTask.description} />
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-muted-foreground">Kategorie</span>
                <TaskCategoryChip category={newTask.category} />
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-muted-foreground">Priorität</span>
                <TaskPriorityBadge priority={newTask.priority} />
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/40 p-4">
              <SummaryRow
                label="Fahrzeug"
                value={
                  uniqueVehicles.find((vehicle) => vehicle.value === newTask.vehicleLicense)?.label ??
                  newTask.vehicleLicense
                }
              />
              <SummaryRow
                label="Zugewiesen an"
                value={orgMembers.find((member) => member.id === newTask.assignedUserId)?.name ?? '—'}
              />
              <SummaryRow
                label="Station"
                value={orgStations.find((station) => station.id === newTask.stationId)?.name ?? '—'}
              />
              <SummaryRow label="Fälligkeitsdatum" value={newTask.dueDate} />
            </div>
          </div>
        ) : null}
      </div>
    </FormDialog>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium text-foreground">{value || '—'}</span>
    </div>
  );
}

import type { ApiTaskType, CreateTaskPayload } from '../../lib/api';
import { checklistPreviewForType } from './task-templates';
import { TASK_TYPE_LABELS, VIEW_PRIORITY_TO_API, type TaskPriorityView } from './task-create.utils';

export interface ManualTaskChecklistDraft {
  id: string;
  title: string;
  isRequired: boolean;
}

export interface ManualTaskFormState {
  title: string;
  description: string;
  type: ApiTaskType;
  priority: TaskPriorityView;
  assignedUserId: string;
  activatesAt: string;
  dueDate: string;
  estimatedDurationMinutes: string;
  initialNote: string;
  vehicleId: string;
  bookingId: string;
  customerId: string;
  invoiceId: string;
  documentId: string;
  vendorId: string;
  serviceCaseId: string;
  stationId: string;
  blocksVehicleAvailability: boolean;
  useTypeChecklistTemplate: boolean;
}

export const EMPTY_MANUAL_TASK_FORM: ManualTaskFormState = {
  title: '',
  description: '',
  type: 'CUSTOM',
  priority: 'Medium',
  assignedUserId: '',
  activatesAt: '',
  dueDate: '',
  estimatedDurationMinutes: '',
  initialNote: '',
  vehicleId: '',
  bookingId: '',
  customerId: '',
  invoiceId: '',
  documentId: '',
  vendorId: '',
  serviceCaseId: '',
  stationId: '',
  blocksVehicleAvailability: false,
  useTypeChecklistTemplate: false,
};

export const ESTIMATED_DURATION_OPTIONS = [
  { value: '30', label: '30 Minuten' },
  { value: '60', label: '1 Stunde' },
  { value: '90', label: '1,5 Stunden' },
  { value: '120', label: '2 Stunden' },
  { value: '180', label: '3 Stunden' },
  { value: '240', label: '4 Stunden' },
  { value: '360', label: '6 Stunden' },
  { value: '480', label: '8 Stunden' },
  { value: '1440', label: '1 Tag' },
  { value: '2880', label: '2 Tage' },
] as const;

export const TASK_TYPE_OPTIONS = (Object.keys(TASK_TYPE_LABELS) as ApiTaskType[]).map((type) => ({
  value: type,
  label: TASK_TYPE_LABELS[type],
}));

export function createChecklistDraft(title = '', isRequired = false): ManualTaskChecklistDraft {
  return {
    id: `chk-${Math.random().toString(36).slice(2, 9)}`,
    title,
    isRequired,
  };
}

export function parseEstimatedDurationMinutes(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const minutes = Number(trimmed);
  if (!Number.isInteger(minutes) || minutes < 1) return undefined;
  return minutes;
}

export function toIsoDateTime(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function validateManualTaskForm(
  form: ManualTaskFormState,
  options?: {
    requireVehicle?: boolean;
    checklistItems?: ManualTaskChecklistDraft[];
  },
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.title.trim()) errors.title = 'Titel ist erforderlich';

  const activatesAt = toIsoDateTime(form.activatesAt);
  const dueDate = toIsoDateTime(form.dueDate);
  if (form.activatesAt.trim() && !activatesAt) {
    errors.activatesAt = 'Ungültiger Aktivierungszeitpunkt';
  }
  if (form.dueDate.trim() && !dueDate) {
    errors.dueDate = 'Ungültiges Fälligkeitsdatum';
  }
  if (activatesAt && dueDate && new Date(dueDate).getTime() < new Date(activatesAt).getTime()) {
    errors.dueDate = 'Fälligkeit darf nicht vor der Aktivierung liegen';
  }

  if (form.estimatedDurationMinutes.trim()) {
    const minutes = parseEstimatedDurationMinutes(form.estimatedDurationMinutes);
    if (!minutes) errors.estimatedDurationMinutes = 'Geschätzte Dauer muss eine positive Minutenanzahl sein';
  }

  if (options?.requireVehicle && !form.vehicleId) {
    errors.vehicleId = 'Fahrzeug ist erforderlich';
  }

  const checklistItems = options?.checklistItems ?? [];
  if (checklistItems.some((item) => !item.title.trim())) {
    errors.checklist = 'Jeder Checklistenpunkt braucht einen Titel';
  }

  return errors;
}

export function buildManualTaskCreatePayload(
  form: ManualTaskFormState,
  checklistItems: ManualTaskChecklistDraft[],
): CreateTaskPayload {
  const payload: CreateTaskPayload = {
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    type: form.type,
    source: 'MANUAL',
    priority: VIEW_PRIORITY_TO_API[form.priority] ?? 'NORMAL',
    assignedUserId: form.assignedUserId || undefined,
    activatesAt: toIsoDateTime(form.activatesAt),
    dueDate: toIsoDateTime(form.dueDate),
    estimatedDurationMinutes: parseEstimatedDurationMinutes(form.estimatedDurationMinutes),
    initialNote: form.initialNote.trim() || undefined,
    vehicleId: form.vehicleId || undefined,
    bookingId: form.bookingId || undefined,
    customerId: form.customerId || undefined,
    invoiceId: form.invoiceId || undefined,
    documentId: form.documentId || undefined,
    vendorId: form.vendorId || undefined,
    serviceCaseId: form.serviceCaseId || undefined,
    stationId: form.stationId || undefined,
    blocksVehicleAvailability: form.blocksVehicleAvailability || undefined,
  };

  const customChecklist = checklistItems
    .map((item) => ({ title: item.title.trim(), isRequired: item.isRequired }))
    .filter((item) => item.title.length > 0);

  if (customChecklist.length > 0) {
    payload.checklist = customChecklist.map((item, sortOrder) => ({
      title: item.title,
      sortOrder,
      isRequired: item.isRequired,
    }));
  } else if (form.useTypeChecklistTemplate) {
    const template = checklistPreviewForType(form.type);
    if (template.length > 0) {
      payload.checklist = template.map((title, sortOrder) => ({ title, sortOrder }));
    }
  }

  return payload;
}

export function canSetBlocksVehicleAvailability(input: {
  userRole: string | null;
  hasPermission: (module: string, level: 'read' | 'write' | 'manage') => boolean;
}): boolean {
  if (input.userRole === 'ORG_ADMIN' || input.userRole === 'MASTER_ADMIN') return true;
  return input.hasPermission('tasks', 'manage');
}

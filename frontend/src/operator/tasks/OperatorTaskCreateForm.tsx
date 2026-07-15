import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, type ApiTask } from '../../lib/api';
import { useOperatorData } from '../context/OperatorDataContext';
import {
  buildManualTaskCreatePayload,
  EMPTY_MANUAL_TASK_FORM,
  type ManualTaskChecklistDraft,
  type ManualTaskFormState,
  validateManualTaskForm,
} from '../../rental/lib/task-create-form.utils';
import { ManualTaskCreateForm } from '../../rental/components/tasks/ManualTaskCreateForm';
import { dispatchOperatorTaskUpdated } from './operatorTask.utils';

interface Props {
  orgId: string;
  vehicleId?: string;
  vehicleLabel?: string;
  bookingId?: string;
  onCreated?: (task: ApiTask) => void;
  onCancel?: () => void;
}

export function OperatorTaskCreateForm({
  orgId,
  vehicleId,
  vehicleLabel,
  bookingId,
  onCreated,
  onCancel,
}: Props) {
  const { reloadTasks } = useOperatorData();
  const [form, setForm] = useState<ManualTaskFormState>({
    ...EMPTY_MANUAL_TASK_FORM,
    vehicleId: vehicleId ?? '',
    bookingId: bookingId ?? '',
  });
  const [checklistItems, setChecklistItems] = useState<ManualTaskChecklistDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      ...EMPTY_MANUAL_TASK_FORM,
      vehicleId: vehicleId ?? '',
      bookingId: bookingId ?? '',
    });
    setChecklistItems([]);
    setErrors({});
    setError(null);
  }, [vehicleId, bookingId, orgId]);

  const handleSubmit = async () => {
    const nextErrors = validateManualTaskForm(form, { checklistItems });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const created = await api.tasks.create(orgId, buildManualTaskCreatePayload(form, checklistItems));
      toast.success('Aufgabe erstellt');
      dispatchOperatorTaskUpdated(created.vehicleId);
      await reloadTasks();
      onCreated?.(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erstellen fehlgeschlagen');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {vehicleLabel ? (
        <p className="text-xs text-muted-foreground">
          Fahrzeug: <span className="font-semibold text-foreground">{vehicleLabel}</span>
        </p>
      ) : null}
      {error ? <p className="text-sm text-[color:var(--status-critical)]">{error}</p> : null}
      <ManualTaskCreateForm
        form={form}
        errors={errors}
        checklistItems={checklistItems}
        onFormChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onChecklistChange={setChecklistItems}
        vehicleOptions={vehicleId && vehicleLabel ? [{ value: vehicleId, label: vehicleLabel }] : []}
        assigneeOptions={[]}
        stationOptions={[]}
        bookingOptions={[]}
        customerOptions={[]}
        invoiceOptions={[]}
        vendorOptions={[]}
        serviceCaseOptions={[]}
        lockedVehicleId={vehicleId}
        lockedBookingId={bookingId}
        showVehicleField={!vehicleId}
        showLinksSection={!bookingId}
        disabled={submitting}
      />
      <div className="flex gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="sq-press min-h-[52px] flex-1 rounded-2xl border border-border text-sm font-semibold"
          >
            Abbrechen
          </button>
        ) : null}
        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleSubmit()}
          className="sq-press min-h-[52px] flex-[2] rounded-2xl bg-[color:var(--brand)] text-sm font-bold text-white disabled:opacity-50"
        >
          {submitting ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Aufgabe anlegen'}
        </button>
      </div>
    </div>
  );
}

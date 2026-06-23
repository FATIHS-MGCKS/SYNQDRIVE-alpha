import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, type ApiTaskPriority } from '../../lib/api';
import { useOperatorData } from '../context/OperatorDataContext';
import { dispatchOperatorTaskUpdated } from './operatorTask.utils';

const PRIORITIES: ApiTaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

interface Props {
  orgId: string;
  vehicleId?: string;
  vehicleLabel?: string;
  bookingId?: string;
  onCreated?: () => void;
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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<ApiTaskPriority>('NORMAL');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('Titel ist erforderlich.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.tasks.create(orgId, {
        title: title.trim(),
        description: description.trim() || undefined,
        type: 'CUSTOM',
        priority,
        vehicleId,
        bookingId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        source: 'MANUAL',
      });
      toast.success('Aufgabe erstellt');
      dispatchOperatorTaskUpdated(created.vehicleId);
      await reloadTasks();
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erstellen fehlgeschlagen');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {vehicleLabel && (
        <p className="text-xs text-muted-foreground">
          Fahrzeug: <span className="font-semibold text-foreground">{vehicleLabel}</span>
        </p>
      )}
      <label className="block">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Titel *</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 h-12 w-full rounded-xl border border-border bg-card px-3 text-base"
          placeholder="Kurz beschreiben"
        />
      </label>
      <label className="block">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Beschreibung</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm resize-y"
        />
      </label>
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">Priorität</p>
        <div className="flex flex-wrap gap-2">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={`sq-press min-h-[44px] rounded-xl border px-3 py-2 text-xs font-semibold ${
                priority === p
                  ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)] text-[color:var(--brand-ink)]'
                  : 'border-border bg-card'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Fällig (optional)</span>
        <input
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="mt-1 h-12 w-full rounded-xl border border-border bg-card px-3 text-sm"
        />
      </label>
      {error && <p className="text-sm text-[color:var(--status-critical)]">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="sq-press min-h-[52px] flex-1 rounded-2xl border border-border text-sm font-semibold"
          >
            Abbrechen
          </button>
        )}
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

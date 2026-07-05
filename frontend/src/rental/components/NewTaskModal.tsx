
import { Icon } from './ui/Icon';
import { useEffect, useMemo, useState } from 'react';
import { FormDialog } from '../../components/patterns';
import { useFleetVehicles } from '../FleetContext';
import { useRentalOrg } from '../RentalContext';
import { api, type ApiTask, type ApiTaskPriority, type ApiTaskType, type CreateTaskPayload, type Vendor } from '../../lib/api';
import { checklistPreviewForType } from '../lib/task-templates';
import {
  SERVICE_MAINTENANCE_TYPES,
  TASK_PRIORITY_LABEL_DE,
  TASK_TYPE_LABEL_DE,
} from '../lib/service-task-semantics';
import { TaskVendorPicker } from './tasks/TaskVendorPicker';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

const PRIORITIES: ApiTaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

export function NewTaskModal({ isOpen, onClose, isDarkMode }: NewTaskModalProps) {
  const { fleetVehicles } = useFleetVehicles();
  const { orgId } = useRentalOrg();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<ApiTaskType>('VEHICLE_SERVICE');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<ApiTaskPriority>('NORMAL');
  const [assignedUserId, setAssignedUserId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [estimatedCost, setEstimatedCost] = useState('');
  const [orgMembers, setOrgMembers] = useState<{ id: string; name: string }[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const checklistPreview = useMemo(() => checklistPreviewForType(taskType), [taskType]);

  useEffect(() => {
    if (!orgId || !isOpen) return;
    let cancelled = false;
    Promise.all([
      api.users.listByOrg(orgId),
      api.vendors.list(orgId).catch(() => [] as Vendor[]),
    ])
      .then(([usersRes, vendorsRes]) => {
        if (cancelled) return;
        const list = Array.isArray(usersRes) ? usersRes : [];
        setOrgMembers(
          list.map((u) => ({
            id: u.id,
            name: u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id,
          })),
        );
        setVendors(Array.isArray(vendorsRes) ? vendorsRes : []);
      })
      .catch(() => {
        if (!cancelled) {
          setOrgMembers([]);
          setVendors([]);
        }
      });
    return () => { cancelled = true; };
  }, [orgId, isOpen]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setTaskType('VEHICLE_SERVICE');
    setDueDate('');
    setPriority('NORMAL');
    setAssignedUserId('');
    setVehicleId('');
    setVendorId(null);
    setEstimatedCost('');
    setErrors({});
  };

  const validate = () => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = 'Titel ist erforderlich';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!orgId || submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      const estCents = estimatedCost.trim()
        ? Math.round(parseFloat(estimatedCost.replace(',', '.')) * 100)
        : undefined;
      const vehicle = fleetVehicles.find((v) => v.id === vehicleId);
      const checklist = checklistPreview.map((t, sortOrder) => ({ title: t, sortOrder }));
      const payload: CreateTaskPayload = {
        title: title.trim(),
        description: description.trim() || undefined,
        type: taskType,
        source: 'MANUAL',
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        vehicleId: vehicleId || undefined,
        vendorId: vendorId || undefined,
        assignedUserId: assignedUserId || undefined,
        stationId: vehicle?.stationId ?? vehicle?.homeStationId ?? undefined,
        estimatedCostCents: Number.isFinite(estCents) ? estCents : undefined,
        checklist: checklist.length ? checklist : undefined,
      };
      await api.tasks.create(orgId, payload);
      resetForm();
      onClose();
    } catch (err) {
      console.error('Create task failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const inputClass = `w-full px-3 py-2.5 rounded-xl border transition-all text-xs outline-none focus:ring-2 focus:ring-[color:var(--brand)]/30 ${
    isDarkMode
      ? 'bg-card border-neutral-700 text-white placeholder-gray-500'
      : 'bg-[color:var(--input-background)] border-border text-foreground'
  }`;
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider mb-1.5 text-muted-foreground';

  return (
    <FormDialog
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      maxWidthClassName="sm:max-w-[540px]"
      title="Neue Service-Aufgabe"
      description="Wartung, Reparatur oder Instandhaltung anlegen."
      hideClose={submitting}
      footer={
        <div className="flex w-full justify-between gap-3">
          <button type="button" onClick={onClose} disabled={submitting} className="text-xs text-muted-foreground hover:text-foreground">
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !orgId}
            className="sq-cta px-3 py-2 text-xs font-semibold disabled:opacity-60"
          >
            {submitting ? 'Wird erstellt…' : 'Erstellen'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Titel *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Kurztitel" />
          {errors.title && <p className="text-[10px] text-red-500 mt-1">{errors.title}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Aufgabentyp</label>
            <select value={taskType} onChange={(e) => setTaskType(e.target.value as ApiTaskType)} className={inputClass}>
              {SERVICE_MAINTENANCE_TYPES.map((t) => (
                <option key={t} value={t}>{TASK_TYPE_LABEL_DE[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Priorität</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as ApiTaskPriority)} className={inputClass}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{TASK_PRIORITY_LABEL_DE[p]}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Beschreibung</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${inputClass} resize-none`} />
        </div>

        {checklistPreview.length > 0 && (
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
            <p className="text-[10px] font-semibold text-muted-foreground mb-2">Checkliste (Vorlage)</p>
            <ul className="text-[10px] space-y-0.5 text-muted-foreground">
              {checklistPreview.map((item) => <li key={item}>• {item}</li>)}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Fälligkeitsdatum</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Geschätzte Kosten (€)</label>
            <input type="text" inputMode="decimal" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div>
          <label className={labelClass}>Fahrzeug</label>
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={inputClass}>
            <option value="">Optional…</option>
            {fleetVehicles.map((v) => (
              <option key={v.id} value={v.id}>{[v.license, v.make, v.model].filter(Boolean).join(' · ')}</option>
            ))}
          </select>
        </div>

        <TaskVendorPicker vendors={vendors} value={vendorId} onChange={setVendorId} vehicleId={vehicleId || null} />

        <div>
          <label className={labelClass}>Zugewiesen an</label>
          <select value={assignedUserId} onChange={(e) => setAssignedUserId(e.target.value)} className={inputClass}>
            <option value="">Nicht zugewiesen</option>
            {orgMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>
    </FormDialog>
  );
}

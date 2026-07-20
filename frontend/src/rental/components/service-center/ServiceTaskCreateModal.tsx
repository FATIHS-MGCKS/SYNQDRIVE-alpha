import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '../../../components/patterns';
import { api, type ApiTask, type ApiTaskType, type CreateTaskPayload, type Vendor } from '../../../lib/api';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import { checklistPreviewForType } from '../../lib/task-templates';
import {
  SERVICE_MAINTENANCE_TYPES,
  TASK_PRIORITY_LABEL_DE,
  TASK_TYPE_LABEL_DE,
} from '../../lib/service-task-semantics';
import type { ApiTaskPriority } from '../../../lib/api';
import { TaskVendorPicker } from '../tasks/TaskVendorPicker';
import type { HealthTaskPrefill } from '../../lib/health-task-bridge.utils';

interface ServiceTaskCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendors: Vendor[];
  onCreated?: (task: ApiTask) => void;
  defaultVehicleId?: string | null;
  defaultVendorId?: string | null;
  healthPrefill?: HealthTaskPrefill | null;
  /** When set, task is created via service-case endpoint with audit trail. */
  serviceCaseId?: string | null;
  lockVehicle?: boolean;
}

const PRIORITIES: ApiTaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

export function ServiceTaskCreateModal({
  open,
  onOpenChange,
  vendors,
  onCreated,
  defaultVehicleId,
  defaultVendorId,
  healthPrefill,
  serviceCaseId,
  lockVehicle = false,
}: ServiceTaskCreateModalProps) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState<ApiTaskType>('VEHICLE_SERVICE');
  const [priority, setPriority] = useState<ApiTaskPriority>('NORMAL');
  const [dueDate, setDueDate] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [assignedUserId, setAssignedUserId] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [blocksRental, setBlocksRental] = useState(false);
  const [orgMembers, setOrgMembers] = useState<{ id: string; name: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const checklistPreview = useMemo(() => checklistPreviewForType(taskType), [taskType]);

  useEffect(() => {
    if (!open) return;
    if (healthPrefill) {
      setTitle(healthPrefill.title);
      setDescription(healthPrefill.description);
      setTaskType(healthPrefill.type);
      setPriority(healthPrefill.priority);
      setDueDate(healthPrefill.dueDate ? healthPrefill.dueDate.slice(0, 10) : '');
      setVehicleId(defaultVehicleId ?? String(healthPrefill.metadata.vehicleId ?? ''));
      setVendorId(healthPrefill.vendorId ?? defaultVendorId ?? null);
      setBlocksRental(healthPrefill.blocksVehicleAvailability ?? false);
    } else {
      setTitle('');
      setDescription('');
      setTaskType('VEHICLE_SERVICE');
      setPriority('NORMAL');
      setDueDate('');
      setVehicleId(defaultVehicleId ?? '');
      setVendorId(defaultVendorId ?? null);
      setBlocksRental(false);
    }
    setAssignedUserId('');
    setEstimatedCost('');
    setErrors({});
  }, [open, defaultVehicleId, defaultVendorId, healthPrefill]);

  useEffect(() => {
    if (!orgId || !open) return;
    let cancelled = false;
    api.users.listByOrg(orgId)
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

  const inputClass =
    'w-full rounded-xl border border-border bg-[color:var(--input-background)] px-3 py-2 text-[12px] outline-none focus:border-[color:var(--brand)]';
  const labelClass = 'block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1';

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
        source: healthPrefill?.sourceType ?? 'MANUAL',
        sourceKey: healthPrefill?.sourceKey,
        category: healthPrefill?.category,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        vehicleId: vehicleId || undefined,
        vendorId: vendorId || undefined,
        assignedUserId: assignedUserId || undefined,
        stationId: vehicle?.stationId ?? vehicle?.homeStationId ?? undefined,
        estimatedCostCents: Number.isFinite(estCents) ? estCents : undefined,
        blocksVehicleAvailability: blocksRental,
        metadata: healthPrefill?.metadata,
        checklist: checklist.length ? checklist : undefined,
        serviceCaseId: serviceCaseId ?? undefined,
      };
      const created = serviceCaseId
        ? await api.serviceCases.createTask(orgId, serviceCaseId, {
            title: payload.title,
            description: payload.description,
            type: payload.type,
            priority: payload.priority,
            category: payload.category,
            dueDate: payload.dueDate,
            assignedUserId: payload.assignedUserId,
            vendorId: payload.vendorId,
            estimatedCostCents: payload.estimatedCostCents,
            blocksVehicleAvailability: payload.blocksVehicleAvailability,
            initialNote: undefined,
          })
        : await api.tasks.create(orgId, payload);
      toast.success('Service-Aufgabe angelegt');
      onCreated?.(created);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Aufgabe konnte nicht erstellt werden');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Service-Aufgabe anlegen"
      description="Wartung, Reparatur, TÜV/HU oder Instandhaltung für die Flotte."
      maxWidthClassName="sm:max-w-[540px]"
      hideClose={submitting}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !orgId}
            className="sq-cta px-3 py-2 text-xs font-semibold disabled:opacity-60"
          >
            {submitting ? 'Wird angelegt…' : 'Anlegen'}
          </button>
        </div>
      }
    >
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        <div>
          <label className={labelClass}>Titel *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            placeholder="z. B. Bremsen vorne prüfen"
          />
          {errors.title && <p className="text-[10px] text-red-500 mt-1">{errors.title}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Aufgabentyp</label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value as ApiTaskType)}
              className={inputClass}
            >
              {SERVICE_MAINTENANCE_TYPES.map((t) => (
                <option key={t} value={t}>{TASK_TYPE_LABEL_DE[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Priorität</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as ApiTaskPriority)}
              className={inputClass}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{TASK_PRIORITY_LABEL_DE[p]}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Beschreibung</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div>
          <label className={labelClass}>Fahrzeug</label>
          {lockVehicle || serviceCaseId ? (
            <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-[12px] font-medium text-foreground">
              {[fleetVehicles.find((v) => v.id === vehicleId)?.license, fleetVehicles.find((v) => v.id === vehicleId)?.make, fleetVehicles.find((v) => v.id === vehicleId)?.model]
                .filter(Boolean)
                .join(' · ') || 'Fahrzeug'}
            </div>
          ) : (
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className={inputClass}>
              <option value="">Kein Fahrzeug</option>
              {fleetVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {[v.license, v.make, v.model].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          )}
        </div>

        <TaskVendorPicker
          vendors={vendors}
          value={vendorId}
          onChange={setVendorId}
          vehicleId={vehicleId || null}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Fälligkeitsdatum</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Geschätzte Kosten (€)</label>
            <input
              type="text"
              inputMode="decimal"
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
              className={inputClass}
              placeholder="0,00"
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Zugewiesen an</label>
          <select
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            className={inputClass}
          >
            <option value="">Nicht zugewiesen</option>
            {orgMembers.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={blocksRental}
            onChange={(e) => setBlocksRental(e.target.checked)}
            className="rounded border-border"
          />
          Blockiert Fahrzeugverfügbarkeit (Miete)
        </label>

        {checklistPreview.length > 0 && (
          <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
            <p className="text-[10px] font-semibold text-muted-foreground mb-2">Checkliste (Vorlage)</p>
            <ul className="text-[10px] space-y-0.5 text-muted-foreground">
              {checklistPreview.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </FormDialog>
  );
}

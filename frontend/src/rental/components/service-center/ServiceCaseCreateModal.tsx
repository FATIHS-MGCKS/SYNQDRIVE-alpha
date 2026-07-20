import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '../../../components/patterns';
import {
  api,
  type ApiServiceCase,
  type ApiServiceCaseCategory,
  type ApiTaskPriority,
  type Vendor,
} from '../../../lib/api';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';
import { buildMMY } from '../../lib/vehicleMmy';
import { TASK_PRIORITY_LABEL_DE } from '../../lib/service-task-semantics';
import { SERVICE_CASE_CATEGORY_LABEL_DE } from '../fleet-health-service/fleet-health-service-case-list';
import type { HealthServiceCasePrefill } from '../../lib/health-service-case-bridge.utils';
import { TaskVendorPicker } from '../tasks/TaskVendorPicker';

interface ServiceCaseCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendors: Vendor[];
  onCreated?: (serviceCase: ApiServiceCase) => void;
  /** When set, vehicle is fixed — user cannot change selection. */
  lockedVehicleId: string;
  healthPrefill?: HealthServiceCasePrefill | null;
}

const PRIORITIES: ApiTaskPriority[] = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

const CATEGORIES: ApiServiceCaseCategory[] = [
  'SERVICE',
  'REPAIR',
  'INSPECTION',
  'TUV_HU',
  'TIRES',
  'BRAKES',
  'BATTERY',
  'DAMAGE',
  'DIAGNOSTIC',
];

export function ServiceCaseCreateModal({
  open,
  onOpenChange,
  vendors,
  onCreated,
  lockedVehicleId,
  healthPrefill,
}: ServiceCaseCreateModalProps) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ApiServiceCaseCategory>('REPAIR');
  const [priority, setPriority] = useState<ApiTaskPriority>('NORMAL');
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [estimatedCost, setEstimatedCost] = useState('');
  const [blocksRental, setBlocksRental] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const vehicleLabel = useMemo(() => {
    const vehicle = fleetVehicles.find((v) => v.id === lockedVehicleId);
    if (!vehicle) return 'Fahrzeug';
    return [vehicle.license, buildMMY(vehicle)].filter(Boolean).join(' · ');
  }, [fleetVehicles, lockedVehicleId]);

  useEffect(() => {
    if (!open) return;
    if (healthPrefill) {
      setTitle(healthPrefill.title);
      setDescription(healthPrefill.description);
      setCategory(healthPrefill.category);
      setPriority(healthPrefill.priority);
      setVendorId(healthPrefill.vendorId ?? null);
      setBlocksRental(healthPrefill.blocksRental ?? false);
    } else {
      setTitle('');
      setDescription('');
      setCategory('REPAIR');
      setPriority('NORMAL');
      setVendorId(null);
      setBlocksRental(false);
    }
    setEstimatedCost('');
    setErrors({});
  }, [open, healthPrefill]);

  const inputClass =
    'w-full rounded-xl border border-border bg-[color:var(--input-background)] px-3 py-2 text-[12px] outline-none focus:border-[color:var(--brand)]';
  const labelClass = 'block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1';

  const validate = () => {
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = 'Titel ist erforderlich';
    if (!lockedVehicleId) next.vehicle = 'Fahrzeug fehlt';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (!orgId || submitting || !lockedVehicleId) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      const estCents = estimatedCost.trim()
        ? Math.round(parseFloat(estimatedCost.replace(',', '.')) * 100)
        : undefined;
      const created = await api.serviceCases.create(orgId, {
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        priority,
        source: healthPrefill?.source ?? 'MANUAL',
        vehicleId: lockedVehicleId,
        vendorId: vendorId || undefined,
        estimatedCostCents: Number.isFinite(estCents) ? estCents : undefined,
        blocksRental,
        metadata: healthPrefill?.metadata,
      });
      toast.success('Servicefall angelegt');
      onCreated?.(created);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Servicefall konnte nicht angelegt werden');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Servicefall erstellen"
      description="Mehrstufigen Werkstattprozess anlegen — Termine, Partner, Tasks und Kosten können später ergänzt werden."
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
            {submitting ? 'Wird angelegt…' : 'Servicefall anlegen'}
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
            placeholder="z. B. Bremsen-Werkstattfall"
          />
          {errors.title && <p className="text-[10px] text-red-500 mt-1">{errors.title}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Kategorie</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ApiServiceCaseCategory)}
              className={inputClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {SERVICE_CASE_CATEGORY_LABEL_DE[c]}
                </option>
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
                <option key={p} value={p}>
                  {TASK_PRIORITY_LABEL_DE[p]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Beschreibung</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={`${inputClass} resize-none`}
          />
        </div>

        <div>
          <label className={labelClass}>Fahrzeug</label>
          <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-[12px] font-medium text-foreground">
            {vehicleLabel}
          </div>
          {errors.vehicle && <p className="text-[10px] text-red-500 mt-1">{errors.vehicle}</p>}
        </div>

        <TaskVendorPicker
          vendors={vendors}
          value={vendorId}
          onChange={setVendorId}
          vehicleId={lockedVehicleId}
        />

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

        <label className="flex items-center gap-2 text-[11px] text-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={blocksRental}
            onChange={(e) => setBlocksRental(e.target.checked)}
            className="rounded border-border"
          />
          Mietblockade (Fahrzeug operativ blockiert)
        </label>
      </div>
    </FormDialog>
  );
}

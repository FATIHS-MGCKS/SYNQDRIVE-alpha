import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '../../../components/patterns';
import { api, type ApiTask } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import type { VehicleData } from '../../data/vehicles';
import {
  buildManualTaskCreatePayload,
  canSetBlocksVehicleAvailability,
  EMPTY_MANUAL_TASK_FORM,
  type ManualTaskChecklistDraft,
  type ManualTaskFormState,
  validateManualTaskForm,
} from '../../lib/task-create-form.utils';
import { Icon } from '../ui/Icon';
import { ManualTaskCreateForm } from './ManualTaskCreateForm';

export interface CreateVehicleTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: VehicleData | null | undefined;
  vehicleVin?: string | null;
  onCreated?: (task: ApiTask) => void;
}

export function CreateVehicleTaskDialog({
  open,
  onOpenChange,
  vehicle,
  vehicleVin,
  onCreated,
}: CreateVehicleTaskDialogProps) {
  const { orgId, userRole, hasPermission } = useRentalOrg();
  const [form, setForm] = useState<ManualTaskFormState>(EMPTY_MANUAL_TASK_FORM);
  const [checklistItems, setChecklistItems] = useState<ManualTaskChecklistDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [orgMembers, setOrgMembers] = useState<{ id: string; name: string }[]>([]);
  const [orgStations, setOrgStations] = useState<Array<{ id: string; name: string }>>([]);

  const canBlock = canSetBlocksVehicleAvailability({ userRole, hasPermission });

  useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY_MANUAL_TASK_FORM,
      vehicleId: vehicle?.id ?? '',
      stationId: vehicle?.stationId ?? vehicle?.homeStationId ?? '',
      type: 'VEHICLE_SERVICE',
    });
    setChecklistItems([]);
    setErrors({});
    setSubmitError(null);
  }, [open, vehicle?.id, vehicle?.homeStationId, vehicle?.stationId]);

  useEffect(() => {
    if (!orgId || !open) {
      setOrgMembers([]);
      setOrgStations([]);
      return;
    }
    let cancelled = false;
    Promise.all([
      api.users.listByOrg(orgId),
      api.stations.list(orgId),
    ])
      .then(([usersRes, stationsRes]) => {
        if (cancelled) return;
        const list = Array.isArray(usersRes) ? usersRes : [];
        setOrgMembers(
          list.map((u) => ({
            id: u.id,
            name: u.name || `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id,
          })),
        );
        const stations = Array.isArray(stationsRes) ? stationsRes : [];
        setOrgStations(
          stations
            .filter((station) => station.status === 'ACTIVE')
            .map((station) => ({ id: station.id, name: station.name })),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setOrgMembers([]);
          setOrgStations([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, open]);

  const vehicleOptions = useMemo(
    () =>
      vehicle?.id
        ? [{ value: vehicle.id, label: `${vehicle.license} – ${vehicle.model}` }]
        : [],
    [vehicle],
  );

  const close = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!orgId || !vehicle?.id || submitting) return;
    const nextErrors = validateManualTaskForm(
      { ...form, vehicleId: vehicle.id },
      { requireVehicle: true, checklistItems },
    );
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload = buildManualTaskCreatePayload({ ...form, vehicleId: vehicle.id }, checklistItems);
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

  const makeModel = [vehicle?.make, vehicle?.model].filter(Boolean).join(' ');

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
      maxWidthClassName="sm:max-w-[760px]"
      title="Neue Fahrzeugaufgabe"
      description="Die Aufgabe wird automatisch mit dem aktuellen Fahrzeug verknüpft."
      hideClose={submitting}
      bodyClassName="max-h-[70dvh] overflow-y-auto px-5 py-4 sm:px-7"
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
              <Icon name="loader-2" className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Icon name="check-circle" className="h-3.5 w-3.5" />
            )}
            Aufgabe anlegen
          </button>
        </div>
      }
    >
      {submitError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {submitError}
        </div>
      ) : null}

      <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fahrzeug</p>
        {vehicle?.id ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{vehicle.license}</p>
            {makeModel ? <p className="text-xs text-muted-foreground">{makeModel}</p> : null}
            {vehicleVin ? (
              <p className="truncate font-mono text-[10px] text-muted-foreground">VIN {vehicleVin}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Kein Fahrzeug im Kontext — Aufgabe kann nicht erstellt werden.
          </p>
        )}
      </div>

      <ManualTaskCreateForm
        form={form}
        errors={errors}
        checklistItems={checklistItems}
        onFormChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onChecklistChange={setChecklistItems}
        vehicleOptions={vehicleOptions}
        assigneeOptions={orgMembers.map((member) => ({ value: member.id, label: member.name }))}
        stationOptions={orgStations.map((station) => ({ value: station.id, label: station.name }))}
        bookingOptions={[]}
        customerOptions={[]}
        invoiceOptions={[]}
        vendorOptions={[]}
        serviceCaseOptions={[]}
        lockedVehicleId={vehicle?.id}
        showVehicleField={false}
        showLinksSection={false}
        canBlockVehicleAvailability={canBlock}
        disabled={submitting}
      />
    </FormDialog>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FormDialog } from '../../../components/patterns';
import { api, type ApiServiceCase, type ApiTask, type Station, type Vendor } from '../../../lib/api';
import {
  buildManualTaskCreatePayload,
  canSetBlocksVehicleAvailability,
  EMPTY_MANUAL_TASK_FORM,
  type ManualTaskChecklistDraft,
  type ManualTaskFormState,
  validateManualTaskForm,
} from '../../lib/task-create-form.utils';
import type { OrgMemberRef } from '../../lib/task-list.utils';
import type { VehicleData } from '../../data/vehicles';
import { useRentalOrg } from '../../RentalContext';
import { Icon } from '../ui/Icon';
import type { Invoice } from '../invoices/invoiceTypes';
import { ManualTaskCreateForm } from './ManualTaskCreateForm';
import { taskEntityOptionLabel } from '../../../lib/tasks/entity-label.utils';

interface TasksNewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  fleetVehicles: VehicleData[];
  orgMembers: OrgMemberRef[];
  orgStations: Station[];
  onCreated: (task: ApiTask) => void;
}

interface EntityLookupState {
  bookings: Array<{ value: string; label: string }>;
  customers: Array<{ value: string; label: string }>;
  invoices: Array<{ value: string; label: string }>;
  vendors: Array<{ value: string; label: string }>;
  serviceCases: Array<{ value: string; label: string }>;
}

const EMPTY_LOOKUP: EntityLookupState = {
  bookings: [],
  customers: [],
  invoices: [],
  vendors: [],
  serviceCases: [],
};

export function TasksNewTaskDialog({
  open,
  onOpenChange,
  orgId,
  fleetVehicles,
  orgMembers,
  orgStations,
  onCreated,
}: TasksNewTaskDialogProps) {
  const { userRole, hasPermission } = useRentalOrg();
  const [form, setForm] = useState<ManualTaskFormState>(EMPTY_MANUAL_TASK_FORM);
  const [checklistItems, setChecklistItems] = useState<ManualTaskChecklistDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lookup, setLookup] = useState<EntityLookupState>(EMPTY_LOOKUP);

  const canBlock = canSetBlocksVehicleAvailability({ userRole, hasPermission });

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_MANUAL_TASK_FORM);
      setChecklistItems([]);
      setErrors({});
      setSubmitError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!orgId || !open) return;
    let cancelled = false;
    Promise.all([
      api.bookings.list(orgId, { limit: 100 }).catch(() => ({ data: [] })),
      api.customers.list(orgId, { limit: 100 }).catch(() => ({ data: [] })),
      api.invoices.list(orgId).catch(() => []),
      api.vendors.list(orgId).catch(() => []),
      api.serviceCases.list(orgId).catch(() => []),
    ])
      .then(([bookingsRes, customersRes, invoicesRes, vendorsRes, serviceCasesRes]) => {
        if (cancelled) return;
        const bookings = Array.isArray(bookingsRes)
          ? bookingsRes
          : (bookingsRes as { data?: Array<Record<string, unknown>> })?.data ?? [];
        const customers = Array.isArray(customersRes)
          ? customersRes
          : (customersRes as { data?: Array<Record<string, unknown>> })?.data ?? [];
        const invoices = Array.isArray(invoicesRes) ? invoicesRes : [];
        const vendors = Array.isArray(vendorsRes) ? vendorsRes : [];
        const serviceCases = Array.isArray(serviceCasesRes) ? serviceCasesRes : [];
        setLookup({
          bookings: (bookings as Array<Record<string, unknown>>).map((row) => ({
            value: String(row.id ?? ''),
            label: taskEntityOptionLabel(
              row.bookingNumber != null ? String(row.bookingNumber) : null,
              'Buchung',
            ),
          })),
          customers: (customers as Array<Record<string, unknown>>).map((row) => ({
            value: String(row.id ?? ''),
            label: taskEntityOptionLabel(
              row.name != null
                ? String(row.name)
                : row.companyName != null
                  ? String(row.companyName)
                  : row.email != null
                    ? String(row.email)
                    : null,
              'Kunde',
            ),
          })),
          invoices: (invoices as Invoice[]).map((row) => ({
            value: String(row.id ?? ''),
            label: taskEntityOptionLabel(
              row.invoiceNumber != null ? String(row.invoiceNumber) : null,
              'Rechnung',
            ),
          })),
          vendors: (vendors as Vendor[]).map((row) => ({
            value: String(row.id ?? ''),
            label: taskEntityOptionLabel(row.name, 'Lieferant'),
          })),
          serviceCases: (serviceCases as ApiServiceCase[]).map((row) => ({
            value: String(row.id ?? ''),
            label: taskEntityOptionLabel(row.title, 'Servicefall'),
          })),
        });
      })
      .catch(() => {
        if (!cancelled) setLookup(EMPTY_LOOKUP);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orgId]);

  const vehicleOptions = useMemo(
    () =>
      fleetVehicles.map((vehicle) => ({
        value: vehicle.id,
        label: `${vehicle.license} – ${vehicle.model}`,
      })),
    [fleetVehicles],
  );

  const assigneeOptions = useMemo(
    () => orgMembers.map((member) => ({ value: member.id, label: member.name })),
    [orgMembers],
  );

  const stationOptions = useMemo(
    () =>
      orgStations
        .filter((station) => station.status === 'ACTIVE')
        .map((station) => ({ value: station.id, label: station.name })),
    [orgStations],
  );

  const handleSubmit = async () => {
    if (!orgId || submitting) return;
    const nextErrors = validateManualTaskForm(form, { checklistItems });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const payload = buildManualTaskCreatePayload(form, checklistItems);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await api.tasks.create(orgId, payload);
      toast.success('Aufgabe erstellt', { description: created.title });
      onCreated(created);
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Aufgabe konnte nicht erstellt werden';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!submitting) onOpenChange(next);
      }}
      maxWidthClassName="sm:max-w-[760px]"
      title="Aufgabe erstellen"
      description="Alle sichtbaren Angaben werden beim Speichern übernommen."
      hideClose={submitting}
      bodyClassName="max-h-[70dvh] overflow-y-auto px-5 py-4 sm:px-7"
      footer={(
        <div className="flex w-full items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !orgId}
            className="sq-cta inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold disabled:opacity-60"
          >
            {submitting ? <Icon name="loader-2" className="h-3.5 w-3.5 animate-spin" /> : <Icon name="check-circle" className="h-3.5 w-3.5" />}
            Aufgabe anlegen
          </button>
        </div>
      )}
    >
      {submitError ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {submitError}
        </div>
      ) : null}
      <ManualTaskCreateForm
        form={form}
        errors={errors}
        checklistItems={checklistItems}
        onFormChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
        onChecklistChange={setChecklistItems}
        vehicleOptions={vehicleOptions}
        assigneeOptions={assigneeOptions}
        stationOptions={stationOptions}
        bookingOptions={lookup.bookings}
        customerOptions={lookup.customers}
        invoiceOptions={lookup.invoices}
        vendorOptions={lookup.vendors}
        serviceCaseOptions={lookup.serviceCases}
        canBlockVehicleAvailability={canBlock}
        disabled={submitting}
      />
    </FormDialog>
  );
}

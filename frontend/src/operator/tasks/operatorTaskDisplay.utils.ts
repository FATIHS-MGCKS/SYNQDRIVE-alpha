import type { ApiTask, TaskLinkedObject } from '../../lib/api';
import { bookingRef } from '../../rental/components/bookings/bookingUtils';

const MAX_SUBPOINTS = 3;

export interface FleetVehicleLookup {
  license?: string | null;
  make?: string | null;
  model?: string | null;
}

export function formatFleetVehicleLabel(lookup?: FleetVehicleLookup | null): string | null {
  if (!lookup) return null;
  const plate = lookup.license?.trim();
  if (plate) return plate;
  const modelName = [lookup.make, lookup.model].filter(Boolean).join(' ').trim();
  return modelName || null;
}

export function buildFleetVehicleById(
  vehicles: Array<{
    id: string;
    license?: string | null;
    make?: string | null;
    model?: string | null;
  }>,
): Map<string, FleetVehicleLookup> {
  const map = new Map<string, FleetVehicleLookup>();
  for (const vehicle of vehicles) {
    map.set(vehicle.id, {
      license: vehicle.license,
      make: vehicle.make,
      model: vehicle.model,
    });
  }
  return map;
}

export interface OperatorTaskDisplayModel {
  vehicleLine: string | null;
  bookingLine: string | null;
  subpoints: string[];
  overflowCount: number;
}

interface MissingDocumentSlot {
  documentType?: string;
  humanReadableLabel?: string;
}

function linkedObject(task: ApiTask, type: TaskLinkedObject['type']): TaskLinkedObject | undefined {
  return task.linkedObjects?.find((row) => row.type === type);
}

export function dedupeDisplayLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function splitDisplaySubpoints(
  labels: string[],
  max = MAX_SUBPOINTS,
): { subpoints: string[]; overflowCount: number } {
  const deduped = dedupeDisplayLabels(labels);
  return {
    subpoints: deduped.slice(0, max),
    overflowCount: Math.max(0, deduped.length - max),
  };
}

export function resolveOperatorBookingLine(task: ApiTask): string | null {
  const booking = linkedObject(task, 'BOOKING');
  if (booking?.primaryLabel?.trim()) {
    return booking.primaryLabel.trim();
  }
  if (task.bookingId) {
    return bookingRef(task.bookingId);
  }
  return null;
}

export function resolveOperatorVehicleLine(
  task: ApiTask,
  vehicleById?: Map<string, FleetVehicleLookup>,
): string | null {
  const vehicle = linkedObject(task, 'VEHICLE');
  if (vehicle?.primaryLabel?.trim()) {
    return vehicle.primaryLabel.trim();
  }

  if (!task.vehicleId || !vehicleById) return null;
  const row = vehicleById.get(task.vehicleId);
  if (!row) return null;

  const plate = row.license?.trim();
  if (plate) return plate;

  const modelName = [row.make, row.model].filter(Boolean).join(' ').trim();
  return modelName || null;
}

function readMissingDocumentLabels(task: ApiTask): string[] {
  const metadata = task.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];

  const documentPackage = (metadata as Record<string, unknown>).documentPackage;
  if (!documentPackage || typeof documentPackage !== 'object' || Array.isArray(documentPackage)) {
    return [];
  }

  const missingDocuments = (documentPackage as Record<string, unknown>).missingDocuments;
  if (!Array.isArray(missingDocuments)) return [];

  return missingDocuments
    .map((slot) => {
      if (!slot || typeof slot !== 'object' || Array.isArray(slot)) return null;
      const label = (slot as MissingDocumentSlot).humanReadableLabel?.trim();
      return label || null;
    })
    .filter((label): label is string => Boolean(label));
}

function readOpenChecklistLabels(task: ApiTask): string[] {
  if (!task.checklist?.length) return [];
  return task.checklist
    .filter((item) => item.isRequired && !item.isDone)
    .map((item) => item.title.trim())
    .filter(Boolean);
}

export function extractOperatorTaskSubpointLabels(task: ApiTask): string[] {
  if (task.type === 'DOCUMENT_REVIEW') {
    const fromMetadata = readMissingDocumentLabels(task);
    if (fromMetadata.length > 0) return fromMetadata;
  }

  const openChecklist = readOpenChecklistLabels(task);
  if (openChecklist.length > 0) return openChecklist;

  return [];
}

export function buildOperatorTaskDisplayModel(
  task: ApiTask,
  options?: { vehicleById?: Map<string, FleetVehicleLookup> },
): OperatorTaskDisplayModel {
  const { subpoints, overflowCount } = splitDisplaySubpoints(extractOperatorTaskSubpointLabels(task));

  return {
    vehicleLine: resolveOperatorVehicleLine(task, options?.vehicleById),
    bookingLine: resolveOperatorBookingLine(task),
    subpoints,
    overflowCount,
  };
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type ApiTask, type TireHealthSummaryResponse } from '../../lib/api';
import type { DamageResponse } from '../../rental/lib/damage.types';
import { isActiveDamage } from '../../rental/lib/damage.types';
import { useRentalOrg } from '../../rental/RentalContext';
import { useFleetVehicles } from '../../rental/FleetContext';
import { useOperatorData } from '../context/OperatorDataContext';
import {
  deriveOperatorVehicleStatusSnapshot,
  findVehiclePickupRow,
  findVehicleReturnRow,
  isHealthKnownForVehicle,
} from '../lib/operatorVehicleQuickView.utils';
import { toHandoverBookingSeed } from '../lib/operatorData';
import type { OperatorTodayBookingItem } from '../lib/operatorData';
import { normalizeBookingStatus } from '../../rental/components/bookings/bookingStatus';

interface DocumentExtractionRow {
  id: string;
  documentType: string;
  status: string;
  sourceFileName: string | null;
  createdAt: string;
}

export function useOperatorVehicleQuickViewData(vehicleId: string) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles, healthMap, healthLoading, healthError } = useFleetVehicles();
  const { pickups, returns, tasks } = useOperatorData();

  const vehicle = useMemo(
    () => fleetVehicles.find((v) => v.id === vehicleId) ?? null,
    [fleetVehicles, vehicleId],
  );

  const health = healthMap.get(vehicleId) ?? null;
  const healthKnown = isHealthKnownForVehicle(vehicleId, healthMap, healthLoading, healthError);
  const statusSnapshot = useMemo(
    () => (vehicle ? deriveOperatorVehicleStatusSnapshot(vehicle, health, healthKnown) : null),
    [vehicle, health, healthKnown],
  );

  const vehicleTasks = useMemo(
    () => tasks.filter((t) => t.vehicleId === vehicleId),
    [tasks, vehicleId],
  );

  const [damages, setDamages] = useState<DamageResponse[]>([]);
  const [damagesLoading, setDamagesLoading] = useState(true);
  const [tireSummary, setTireSummary] = useState<TireHealthSummaryResponse | null>(null);
  const [tireLoading, setTireLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentExtractionRow[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [extraTasks, setExtraTasks] = useState<ApiTask[]>([]);
  const [extraTasksLoading, setExtraTasksLoading] = useState(false);

  const reloadDetails = useCallback(async () => {
    if (!vehicleId) return;
    setDamagesLoading(true);
    setTireLoading(true);
    setDocumentsLoading(true);
    try {
      const [damageRows, tire, docs] = await Promise.all([
        api.vehicleIntelligence.getVehicleDamagesActive(vehicleId).catch(() => []),
        api.vehicleIntelligence.tireHealthSummary(vehicleId).catch(() => null),
        api.vehicleIntelligence.documentExtractions(vehicleId).catch(() => []),
      ]);
      setDamages(Array.isArray(damageRows) ? damageRows.filter(isActiveDamage) : []);
      setTireSummary(tire);
      const docRows = (Array.isArray(docs) ? docs : [])
        .map((d) => {
          const row = d as Record<string, unknown>;
          return {
            id: String(row.id ?? ''),
            documentType: String(row.documentType ?? row.document_type ?? 'UNKNOWN'),
            status: String(row.status ?? 'unknown'),
            sourceFileName:
              typeof row.sourceFileName === 'string'
                ? row.sourceFileName
                : typeof row.source_file_name === 'string'
                  ? row.source_file_name
                  : null,
            createdAt: String(row.createdAt ?? row.created_at ?? ''),
          } satisfies DocumentExtractionRow;
        })
        .filter((d) => d.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);
      setDocuments(docRows);
    } finally {
      setDamagesLoading(false);
      setTireLoading(false);
      setDocumentsLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    void reloadDetails();
  }, [reloadDetails]);

  useEffect(() => {
    if (!orgId || !vehicleId) return;
    let cancelled = false;
    setExtraTasksLoading(true);
    api.tasks
      .forVehicle(orgId, vehicleId)
      .then((rows) => {
        if (!cancelled) {
          const open = rows.filter((t) => ['OPEN', 'IN_PROGRESS', 'WAITING'].includes(t.status));
          setExtraTasks(open);
        }
      })
      .catch(() => {
        if (!cancelled) setExtraTasks([]);
      })
      .finally(() => {
        if (!cancelled) setExtraTasksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, vehicleId]);

  useEffect(() => {
    const onTaskUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ vehicleId: string | null }>).detail;
      if (!detail?.vehicleId || detail.vehicleId === vehicleId) {
        void reloadDetails();
      }
    };
    window.addEventListener('operator:task-updated', onTaskUpdated);
    return () => window.removeEventListener('operator:task-updated', onTaskUpdated);
  }, [vehicleId, reloadDetails]);

  const allOpenTasks = useMemo(() => {
    const byId = new Map<string, ApiTask>();
    for (const t of [...vehicleTasks, ...extraTasks]) byId.set(t.id, t);
    return [...byId.values()].sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      const ad = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ad - bd;
    });
  }, [vehicleTasks, extraTasks]);

  const pickupAction = useMemo(
    () => findVehiclePickupRow(vehicleId, pickups, healthMap),
    [vehicleId, pickups, healthMap],
  );

  const returnAction = useMemo(
    () => findVehicleReturnRow(vehicleId, returns),
    [vehicleId, returns],
  );

  const bookingContext = useMemo(() => {
    if (!vehicle) return null;

    if (pickupAction) {
      const status = normalizeBookingStatus(pickupAction.row.statusEnum, pickupAction.row.status);
      return {
        kind: 'pickup' as const,
        label: 'Abholung heute',
        customerName: pickupAction.row.customerName ?? '—',
        when: pickupAction.row.startDate ?? '',
        station: pickupAction.row.pickupStationName ?? pickupAction.row.station ?? '',
        bookingId: String(pickupAction.row.id),
        status,
      };
    }

    if (returnAction) {
      return {
        kind: 'return' as const,
        label: 'Rückgabe heute',
        customerName: returnAction.row.customerName ?? '—',
        when: returnAction.row.endDate ?? '',
        station: returnAction.row.returnStationName ?? returnAction.row.station ?? '',
        bookingId: String(returnAction.row.id),
        status: normalizeBookingStatus(returnAction.row.statusEnum, returnAction.row.status),
      };
    }

    if (vehicle.activeBookingId || vehicle.status === 'Active Rented') {
      return {
        kind: 'active' as const,
        label: 'Aktive Buchung',
        customerName: vehicle.activeCustomerName ?? '—',
        when: vehicle.activeReturnAt ?? vehicle.activeStartAt ?? '',
        station: vehicle.activeReturnStationName ?? vehicle.station ?? '',
        bookingId: vehicle.activeBookingId ?? null,
        status: 'active' as const,
      };
    }

    if (vehicle.reservedBookingId || vehicle.status === 'Reserved') {
      return {
        kind: 'reserved' as const,
        label: 'Nächste Reservierung',
        customerName: vehicle.reservedCustomerName ?? '—',
        when: vehicle.reservedPickupAt ?? vehicle.reservedReturnAt ?? '',
        station: vehicle.reservedPickupStationName ?? vehicle.station ?? '',
        bookingId: vehicle.reservedBookingId ?? null,
        status: 'confirmed' as const,
      };
    }

    return null;
  }, [vehicle, pickupAction, returnAction]);

  const toPickupHandoverItem = useCallback((): OperatorTodayBookingItem | null => {
    if (!pickupAction) return null;
    const row = pickupAction.row;
    return {
      bookingId: String(row.id),
      kind: 'PICKUP',
      vehicleId: String(row.vehicleId ?? vehicleId),
      customerId: row.customerId ?? null,
      vehicleName: row.vehicleName ?? vehicle?.model ?? '—',
      plate: row.vehicleLicense ?? vehicle?.license ?? '',
      customerName: row.customerName ?? '',
      station: row.pickupStationName ?? row.station ?? '',
      scheduledAt: String(row.startDate ?? ''),
      timeLabel: '',
      status: normalizeBookingStatus(row.statusEnum, row.status),
      statusLabel: '',
      isOverdue: Boolean(row.isOverdue),
      isDueNow: true,
      isDone: Boolean(row.pickupProtocol),
      pickupGate: pickupAction.gate,
      returnGate: { allowed: false },
      raw: row,
    };
  }, [pickupAction, vehicle, vehicleId]);

  const toReturnHandoverItem = useCallback((): OperatorTodayBookingItem | null => {
    if (!returnAction) return null;
    const row = returnAction.row;
    return {
      bookingId: String(row.id),
      kind: 'RETURN',
      vehicleId: String(row.vehicleId ?? vehicleId),
      customerId: row.customerId ?? null,
      vehicleName: row.vehicleName ?? vehicle?.model ?? '—',
      plate: row.vehicleLicense ?? vehicle?.license ?? '',
      customerName: row.customerName ?? '',
      station: row.returnStationName ?? row.station ?? '',
      scheduledAt: String(row.endDate ?? ''),
      timeLabel: '',
      status: normalizeBookingStatus(row.statusEnum, row.status),
      statusLabel: '',
      isOverdue: Boolean(row.isOverdue),
      isDueNow: true,
      isDone: Boolean(row.returnProtocol),
      pickupGate: { allowed: false },
      returnGate: returnAction.gate,
      raw: row,
    };
  }, [returnAction, vehicle, vehicleId]);

  return {
    vehicle,
    health,
    healthLoading,
    healthError,
    healthKnown,
    statusSnapshot,
    damages,
    damagesLoading,
    tireSummary,
    tireLoading,
    documents,
    documentsLoading,
    allOpenTasks,
    extraTasksLoading,
    bookingContext,
    pickupAction,
    returnAction,
    toPickupHandoverItem,
    toReturnHandoverItem,
    toHandoverBookingSeed,
    reloadDetails,
  };
}

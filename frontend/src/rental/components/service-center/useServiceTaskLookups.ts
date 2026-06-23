import { useEffect, useMemo, useState } from 'react';
import { api, type ApiTask, type Vendor } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import { useFleetVehicles } from '../../FleetContext';
import { useRentalOrg } from '../../RentalContext';

export function useServiceTaskLookups(vendors: Vendor[]) {
  const { orgId } = useRentalOrg();
  const { fleetVehicles } = useFleetVehicles();
  const [orgMembers, setOrgMembers] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!orgId) return;
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
  }, [orgId]);

  const vehicleMap = useMemo(() => new Map(fleetVehicles.map((v) => [v.id, v])), [fleetVehicles]);
  const vendorMap = useMemo(() => new Map(vendors.map((v) => [v.id, v.name])), [vendors]);
  const assigneeMap = useMemo(() => new Map(orgMembers.map((m) => [m.id, m.name])), [orgMembers]);

  const resolveVehicle = (task: ApiTask): VehicleData | null =>
    task.vehicleId ? vehicleMap.get(task.vehicleId) ?? null : null;

  const resolveVendorName = (task: ApiTask): string | null =>
    task.vendorId ? vendorMap.get(task.vendorId) ?? null : null;

  const resolveAssigneeName = (task: ApiTask): string | null =>
    task.assignedUserId ? assigneeMap.get(task.assignedUserId) ?? null : null;

  return {
    orgId,
    fleetVehicles,
    orgMembers,
    vehicleMap,
    vendorMap,
    resolveVehicle,
    resolveVendorName,
    resolveAssigneeName,
  };
}

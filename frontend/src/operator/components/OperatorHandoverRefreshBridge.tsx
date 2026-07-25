import { useEffect } from 'react';
import { useRentalOrg } from '../../rental/RentalContext';
import {
  registerVehicleOperationalInvalidationHandler,
  vehicleOperationalQueryKeys,
} from '../../rental/lib/vehicle-operational-query';
import { invalidateTaskQueries } from '../../lib/tasks/invalidate';
import { useOperatorData } from '../context/OperatorDataContext';

/** Registers operator-scoped invalidation handlers for vehicle operational state. */
export function OperatorHandoverRefreshBridge() {
  const { orgId } = useRentalOrg();
  const { reloadToday, reloadTasks } = useOperatorData();

  useEffect(() => {
    if (!orgId) return;

    const unregisterToday = registerVehicleOperationalInvalidationHandler(
      vehicleOperationalQueryKeys.operatorToday(orgId),
      () => {
        void reloadToday();
      },
    );

    const unregisterTasks = registerVehicleOperationalInvalidationHandler(
      vehicleOperationalQueryKeys.operatorTasks(orgId),
      () => {
        void reloadTasks();
      },
    );

    return () => {
      unregisterToday();
      unregisterTasks();
    };
  }, [orgId, reloadToday, reloadTasks]);

  useEffect(() => {
    const onDamageCreated = () => {
      void reloadToday();
      void reloadTasks();
      if (orgId) {
        invalidateTaskQueries({ orgId, lists: true, summary: true, buckets: ['NOW', 'TODAY', 'UPCOMING', 'PLANNED', 'UNASSIGNED'] });
      }
    };
    const onTireMeasurementSaved = () => {
      void reloadToday();
    };
    const onTaskUpdated = () => {
      void reloadToday();
      void reloadTasks();
    };
    window.addEventListener('operator:damage-created', onDamageCreated);
    window.addEventListener('operator:tire-measurement-saved', onTireMeasurementSaved);
    window.addEventListener('operator:task-updated', onTaskUpdated);
    return () => {
      window.removeEventListener('operator:damage-created', onDamageCreated);
      window.removeEventListener('operator:tire-measurement-saved', onTireMeasurementSaved);
      window.removeEventListener('operator:task-updated', onTaskUpdated);
    };
  }, [orgId, reloadToday, reloadTasks]);

  return null;
}

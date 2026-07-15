import { useEffect } from 'react';
import { useRentalOrg } from '../../rental/RentalContext';
import {
  registerVehicleOperationalInvalidationHandler,
  vehicleOperationalQueryKeys,
} from '../../rental/lib/vehicle-operational-query';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useOperatorData } from '../context/OperatorDataContext';

/** Registers operator-scoped invalidation handlers for vehicle operational state. */
export function OperatorHandoverRefreshBridge() {
  const { orgId } = useRentalOrg();
  const { triggerRefresh } = useOperatorShell();
  const { reloadToday, reloadTasks } = useOperatorData();

  useEffect(() => {
    if (!orgId) return;

    const unregisterToday = registerVehicleOperationalInvalidationHandler(
      vehicleOperationalQueryKeys.operatorToday(orgId),
      () => {
        triggerRefresh();
        void reloadToday();
      },
    );

    const unregisterTasks = registerVehicleOperationalInvalidationHandler(
      vehicleOperationalQueryKeys.operatorTasks(orgId),
      () => {
        triggerRefresh();
        void reloadTasks();
      },
    );

    return () => {
      unregisterToday();
      unregisterTasks();
    };
  }, [orgId, triggerRefresh, reloadToday, reloadTasks]);

  useEffect(() => {
    const onDamageCreated = () => {
      triggerRefresh();
      void reloadToday();
      void reloadTasks();
    };
    const onTireMeasurementSaved = () => {
      triggerRefresh();
      void reloadToday();
    };
    const onTaskUpdated = () => {
      triggerRefresh();
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
  }, [triggerRefresh, reloadToday, reloadTasks]);

  return null;
}

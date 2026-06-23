import { useEffect } from 'react';
import { useFleetVehicles } from '../../rental/FleetContext';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useOperatorData } from '../context/OperatorDataContext';

/** Refreshes operator today data + fleet after canonical handover / damage / tire measurement. */
export function OperatorHandoverRefreshBridge() {
  const { triggerRefresh } = useOperatorShell();
  const { reloadToday, reloadTasks } = useOperatorData();
  const { refresh: refreshFleet, reloadHealth } = useFleetVehicles();

  useEffect(() => {
    const onCompleted = () => {
      triggerRefresh();
      void reloadToday();
      void reloadTasks();
      void refreshFleet();
      reloadHealth();
    };
    const onDamageCreated = () => {
      triggerRefresh();
      void reloadToday();
      void reloadTasks();
      void refreshFleet();
    };
    const onTireMeasurementSaved = () => {
      triggerRefresh();
      void reloadToday();
      void refreshFleet();
      reloadHealth();
    };
    const onTaskUpdated = () => {
      triggerRefresh();
      void reloadToday();
      void reloadTasks();
    };
    window.addEventListener('handover:completed', onCompleted);
    window.addEventListener('operator:damage-created', onDamageCreated);
    window.addEventListener('operator:tire-measurement-saved', onTireMeasurementSaved);
    window.addEventListener('operator:task-updated', onTaskUpdated);
    return () => {
      window.removeEventListener('handover:completed', onCompleted);
      window.removeEventListener('operator:damage-created', onDamageCreated);
      window.removeEventListener('operator:tire-measurement-saved', onTireMeasurementSaved);
      window.removeEventListener('operator:task-updated', onTaskUpdated);
    };
  }, [triggerRefresh, reloadToday, reloadTasks, refreshFleet, reloadHealth]);

  return null;
}

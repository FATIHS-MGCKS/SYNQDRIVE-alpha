import { useEffect } from 'react';
import { useOperatorData } from '../context/OperatorDataContext';
import { useOperatorShell } from '../context/OperatorShellContext';
import { operatorConnectivityStore } from './operatorConnectivityStore';

/**
 * Bridges operator data/sync state into the connectivity store without polling.
 */
export function OperatorConnectivityBridge() {
  const { todayError, tasksError } = useOperatorData();
  const { syncState } = useOperatorShell();

  const todayFailed = Boolean(todayError);
  const tasksFailed = Boolean(tasksError);
  const todaySucceeded = !todayError;
  const tasksSucceeded = !tasksError;

  useEffect(() => {
    const partial =
      (todayFailed && tasksSucceeded) ||
      (tasksFailed && todaySucceeded) ||
      (syncState.error && (todaySucceeded || tasksSucceeded));
    operatorConnectivityStore.setApiPartialFailure(partial);
  }, [todayFailed, tasksFailed, todaySucceeded, tasksSucceeded, syncState.error]);

  return null;
}

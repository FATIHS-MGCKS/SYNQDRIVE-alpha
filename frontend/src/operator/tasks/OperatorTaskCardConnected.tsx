import type { ApiTask } from '../../lib/api';
import { OperatorTaskCard } from './OperatorTaskCard';
import type { FleetVehicleLookup } from './operatorTaskDisplay.utils';
import { useOperatorTaskCardController } from './useOperatorTaskCardController';

interface Props {
  task: ApiTask;
  vehicleById?: Map<string, FleetVehicleLookup>;
  onOpenTask: (task: ApiTask, options?: { focusComment?: boolean }) => void;
  onTaskChanged?: () => void | Promise<void>;
}

export function OperatorTaskCardConnected({
  task,
  vehicleById,
  onOpenTask,
  onTaskChanged,
}: Props) {
  const { mutating, canOverrideChecklist, handleAction } = useOperatorTaskCardController({
    onOpenTask,
    onTaskChanged,
  });

  return (
    <OperatorTaskCard
      task={task}
      vehicleById={vehicleById}
      canOverrideChecklist={canOverrideChecklist}
      disabled={mutating}
      onOpen={() => onOpenTask(task)}
      onAction={(kind) => handleAction(task, kind)}
    />
  );
}

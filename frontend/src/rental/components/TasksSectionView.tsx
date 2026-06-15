
import { TasksView } from './TasksView';
import { VendorManagementView } from './VendorManagementView';
import type { Vendor } from '../../lib/api';

export type TasksSectionTab = 'tasks' | 'vendor-management';

interface TasksSectionViewProps {
  activeTab: TasksSectionTab;
  onTabChange: (tab: TasksSectionTab) => void;
  autoOpenNewTask?: boolean;
  onAutoOpenConsumed?: () => void;
  highlightedTaskId?: string | null;
  onHighlightConsumed?: () => void;
  onOpenVendorDetail?: (vendor: Vendor) => void;
}

export function TasksSectionView({ activeTab, autoOpenNewTask, onAutoOpenConsumed, highlightedTaskId, onHighlightConsumed, onOpenVendorDetail }: TasksSectionViewProps) {
  return (
    <div className="space-y-5">
      {activeTab === 'tasks' && <TasksView autoOpenNewTask={autoOpenNewTask} onAutoOpenConsumed={onAutoOpenConsumed} highlightedTaskId={highlightedTaskId} onHighlightConsumed={onHighlightConsumed} />}
      {activeTab === 'vendor-management' && (
        <VendorManagementView onOpenDetail={onOpenVendorDetail} />
      )}
    </div>
  );
}

import { ListTodo, Briefcase } from 'lucide-react';
import { TasksView } from './TasksView';
import { VendorManagementView } from './VendorManagementView';
import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations/en';
import type { Vendor } from '../../lib/api';

export type TasksSectionTab = 'tasks' | 'vendor-management';

interface TasksSectionViewProps {
  isDarkMode: boolean;
  activeTab: TasksSectionTab;
  onTabChange: (tab: TasksSectionTab) => void;
  autoOpenNewTask?: boolean;
  onAutoOpenConsumed?: () => void;
  highlightedTaskId?: string | null;
  onHighlightConsumed?: () => void;
  onOpenVendorDetail?: (vendor: Vendor) => void;
}

const tabConfig: { id: TasksSectionTab; labelKey: TranslationKey; icon: typeof ListTodo }[] = [
  { id: 'tasks', labelKey: 'tasksTab.taskManagement', icon: ListTodo },
  { id: 'vendor-management', labelKey: 'tasksTab.vendorManagement', icon: Briefcase },
];

export function TasksSectionView({ isDarkMode, activeTab, onTabChange, autoOpenNewTask, onAutoOpenConsumed, highlightedTaskId, onHighlightConsumed, onOpenVendorDetail }: TasksSectionViewProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-5">
      {/* Tasks Tab Navigation */}
      <div className={`rounded-lg p-1.5 shadow-sm border flex gap-1 ${
        isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
      }`}>
        {tabConfig.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? isDarkMode
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'bg-white text-gray-900 shadow-sm'
                : isDarkMode
                  ? 'text-gray-400 hover:text-gray-200 hover:bg-neutral-800/50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'
            }`}
          >
            <tab.icon className="w-5 h-5" />
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'tasks' && <TasksView isDarkMode={isDarkMode} autoOpenNewTask={autoOpenNewTask} onAutoOpenConsumed={onAutoOpenConsumed} highlightedTaskId={highlightedTaskId} onHighlightConsumed={onHighlightConsumed} />}
      {activeTab === 'vendor-management' && (
        <VendorManagementView isDarkMode={isDarkMode} onOpenDetail={onOpenVendorDetail} />
      )}
    </div>
  );
}

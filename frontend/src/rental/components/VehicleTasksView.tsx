import { CheckCircle, Clock, AlertTriangle, Wrench, ChevronRight, ClipboardList } from 'lucide-react';
import { useState } from 'react';

interface VehicleTasksViewProps {
  isDarkMode: boolean;
}

type TaskStatus = 'open' | 'in-progress' | 'completed' | 'overdue';
type TaskPriority = 'high' | 'medium' | 'low';

interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: string;
  assignee: string;
  dueDate: string;
  createdDate: string;
  icon: typeof Wrench;
  iconColor: string;
}

const tasks: Task[] = [];

const statusConfig: Record<TaskStatus, { label: string; textColor: string; bgColor: string; borderColor: string }> = {
  'open': { label: 'Open', textColor: 'text-blue-700', bgColor: 'bg-blue-100/80', borderColor: 'border-blue-200/50' },
  'in-progress': { label: 'In Progress', textColor: 'text-amber-700', bgColor: 'bg-amber-100/80', borderColor: 'border-amber-200/50' },
  'completed': { label: 'Completed', textColor: 'text-green-700', bgColor: 'bg-green-100/80', borderColor: 'border-green-200/50' },
  'overdue': { label: 'Overdue', textColor: 'text-red-700', bgColor: 'bg-red-100/80', borderColor: 'border-red-200/50' },
};

const priorityConfig: Record<TaskPriority, { label: string; color: string }> = {
  'high': { label: 'High', color: 'text-red-600' },
  'medium': { label: 'Medium', color: 'text-amber-600' },
  'low': { label: 'Low', color: 'text-gray-500' },
};

export function VehicleTasksView({ isDarkMode }: VehicleTasksViewProps) {
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');

  const filteredTasks = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  const openCount = tasks.filter(t => t.status === 'open').length;
  const inProgressCount = tasks.filter(t => t.status === 'in-progress').length;
  const overdueCount = tasks.filter(t => t.status === 'overdue').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Open Tasks', value: openCount.toString(), icon: ClipboardList, iconBg: 'bg-blue-100/80', iconColor: 'text-blue-600' },
          { label: 'In Progress', value: inProgressCount.toString(), icon: Clock, iconBg: 'bg-amber-100/80', iconColor: 'text-amber-600' },
          { label: 'Overdue', value: overdueCount.toString(), icon: AlertTriangle, iconBg: 'bg-red-100/80', iconColor: 'text-red-600' },
          { label: 'Completed', value: completedCount.toString(), icon: CheckCircle, iconBg: 'bg-green-100/80', iconColor: 'text-green-600' },
        ].map((stat) => {
          const StatIcon = stat.icon;
          return (
            <div
              key={stat.label}
              className={`rounded-3xl p-4 shadow-sm hover:shadow-md transition-all duration-300 ${
                isDarkMode
                  ? 'bg-neutral-900'
                  : 'bg-white'
              }`}
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${stat.iconBg}`}>
                  <StatIcon className={`w-5 h-5 ${stat.iconColor}`} />
                </div>
                <span className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{stat.label}</span>
              </div>
              <p className={`text-xs font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Filter Tabs */}
      <div className={`rounded-lg p-1.5 inline-flex gap-1 ${
        isDarkMode ? 'bg-neutral-900' : 'bg-gray-100'
      }`}>
        {(['all', 'open', 'in-progress', 'overdue', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 rounded-lg text-xs transition-all duration-200 ${
              filter === f
                ? isDarkMode
                  ? 'bg-neutral-700/80 text-white shadow-sm'
                  : 'bg-white text-gray-900 shadow-sm'
                : isDarkMode
                  ? 'text-gray-400 hover:text-gray-300'
                  : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f === 'all' ? `All (${tasks.length})` : f === 'in-progress' ? `In Progress (${inProgressCount})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${tasks.filter(t => t.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className={`rounded-3xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden ${
        isDarkMode ? 'bg-neutral-900' : 'bg-white'
      }`}>
        <div className={`divide-y ${isDarkMode ? 'divide-neutral-800/50' : 'divide-gray-100/80'}`}>
          {filteredTasks.length === 0 ? (
            <div className="px-3 py-12 text-center">
              <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>No tasks for this vehicle</p>
            </div>
          ) : (
            filteredTasks.map((task) => {
              const sConfig = statusConfig[task.status];
              const pConfig = priorityConfig[task.priority];
              const TaskIcon = task.icon;
              return (
                <div
                  key={task.id}
                  className={`px-3 py-3 flex items-center gap-3 transition-colors cursor-pointer group ${
                    isDarkMode ? 'hover:bg-neutral-800/50' : 'hover:bg-gray-50/50'
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
                    isDarkMode ? 'bg-neutral-800 border-neutral-700' : 'bg-gray-50 border-gray-200'
                  }`}>
                    <TaskIcon className={`w-5 h-5 ${task.iconColor}`} />
                  </div>

                  {/* Task Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className={`text-xs ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{task.title}</span>
                      <span className={`px-2 py-0.5 rounded-lg text-xs border ${sConfig.bgColor} ${sConfig.textColor} ${sConfig.borderColor}`}>{sConfig.label}</span>
                      <span className={`text-xs ${pConfig.color}`}>— {pConfig.label}</span>
                    </div>
                    <p className={`text-xs mt-1 truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{task.description}</p>
                  </div>

                  {/* Category */}
                  <div className="text-right">
                    <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{task.category}</span>
                    <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>{task.assignee}</p>
                  </div>

                  {/* Due Date */}
                  <div className="text-right w-24">
                    <span className={`text-xs ${
                      task.status === 'overdue' ? 'text-red-600' : isDarkMode ? 'text-gray-300' : 'text-gray-600'
                    }`}>
                      Due {task.dueDate}
                    </span>
                  </div>

                  <ChevronRight className={`w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
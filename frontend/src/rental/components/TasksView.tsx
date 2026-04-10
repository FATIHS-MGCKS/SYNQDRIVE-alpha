import { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Plus, X, ListTodo, Clock, CheckCircle, AlertTriangle, Wrench, Sparkles, Car, Calendar, User, MapPin, Flag, Eye, MoreHorizontal, ChevronRight, ChevronLeft, Filter, ArrowUpDown, CircleDot, Timer, FileText, Shield, Camera } from 'lucide-react';
import { useFleetVehicles } from '../FleetContext';

interface TasksViewProps {
  isDarkMode: boolean;
  autoOpenNewTask?: boolean;
  onAutoOpenConsumed?: () => void;
  highlightedTaskId?: string | null;
  onHighlightConsumed?: () => void;
}

type TaskStatus = 'Open' | 'In Progress' | 'Completed' | 'Overdue';
type TaskPriority = 'Low' | 'Medium' | 'High' | 'Critical';
type TaskCategory = 'Cleaning' | 'Maintenance' | 'Repair' | 'Inspection' | 'Damage' | 'TÜV' | 'Insurance' | 'Documents' | 'Tire Change' | 'Oil Change';

interface Task {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  vehicleId: string;
  vehicleLicense: string;
  vehicleModel: string;
  station: string;
  assignedTo: string;
  createdDate: string;
  dueDate: string;
  completedDate?: string;
  estimatedDuration: string;
  notes?: string;
}

// Simulated task data removed - load from API when available
const taskData: Task[] = [];

const categoryIcons: Record<TaskCategory, typeof Wrench> = {
  'Cleaning': Sparkles,
  'Maintenance': Wrench,
  'Repair': Wrench,
  'Inspection': Eye,
  'Damage': Camera,
  'TÜV': Shield,
  'Insurance': FileText,
  'Documents': FileText,
  'Tire Change': CircleDot,
  'Oil Change': Timer,
};

const categoryColors: Record<TaskCategory, { bg: string; text: string }> = {
  'Cleaning': { bg: 'bg-blue-100', text: 'text-blue-600' },
  'Maintenance': { bg: 'bg-orange-100', text: 'text-orange-600' },
  'Repair': { bg: 'bg-red-100', text: 'text-red-600' },
  'Inspection': { bg: 'bg-purple-100', text: 'text-purple-600' },
  'Damage': { bg: 'bg-rose-100', text: 'text-rose-600' },
  'TÜV': { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  'Insurance': { bg: 'bg-teal-100', text: 'text-teal-600' },
  'Documents': { bg: 'bg-gray-100', text: 'text-gray-600' },
  'Tire Change': { bg: 'bg-amber-100', text: 'text-amber-600' },
  'Oil Change': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
};

export function TasksView({ isDarkMode, autoOpenNewTask, onAutoOpenConsumed, highlightedTaskId, onHighlightConsumed }: TasksViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [vehicleFilter, setVehicleFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'status' | 'created'>('dueDate');
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [isVehicleOpen, setIsVehicleOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [isAssigneeOpen, setIsAssigneeOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isNewTaskAnimating, setIsNewTaskAnimating] = useState(false);
  const [isDetailAnimating, setIsDetailAnimating] = useState(false);
  const [isDetailClosing, setIsDetailClosing] = useState(false);
  const [taskStep, setTaskStep] = useState(0);
  const [newTask, setNewTask] = useState({
    title: '', description: '', category: 'Maintenance' as TaskCategory, priority: 'Medium' as TaskPriority,
    vehicleLicense: '', station: '', assignedTo: '', createdBy: '',
    dueDate: '', estimatedDuration: '', notes: '',
  });
  const [taskFormErrors, setTaskFormErrors] = useState<Record<string, string>>({});
  const [flashingTaskId, setFlashingTaskId] = useState<string | null>(null);
  const taskRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});

  const openNewTask = () => {
    setIsNewTaskOpen(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsNewTaskAnimating(true);
      });
    });
  };

  const closeNewTask = () => {
    setIsNewTaskAnimating(false);
    setTimeout(() => {
      setIsNewTaskOpen(false);
      resetNewTaskForm();
    }, 400);
  };

  const openTaskDetail = (task: Task) => {
    setSelectedTask(task);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsDetailAnimating(true);
      });
    });
  };

  const closeTaskDetail = () => {
    setIsDetailAnimating(false);
    setIsDetailClosing(true);
    setTimeout(() => {
      setSelectedTask(null);
      setIsDetailClosing(false);
    }, 400);
  };

  useEffect(() => {
    if (autoOpenNewTask) {
      openNewTask();
      onAutoOpenConsumed?.();
    }
  }, [autoOpenNewTask]);

  // Handle highlighted task from RightSidebar click
  useEffect(() => {
    if (highlightedTaskId) {
      // Reset filters so the task is visible
      setStatusFilter('all');
      setPriorityFilter('all');
      setCategoryFilter('all');
      setVehicleFilter('all');
      setAssigneeFilter('all');
      setSearchQuery('');

      // Flash the task row
      setFlashingTaskId(highlightedTaskId);

      // Scroll to it after a short delay (for filters to apply)
      setTimeout(() => {
        const row = taskRowRefs.current[highlightedTaskId];
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        // Open detail panel
        const task = taskData.find(t => t.id === highlightedTaskId);
        if (task) {
          openTaskDetail(task);
        }
      }, 100);

      // Remove flash after 3 seconds
      setTimeout(() => {
        setFlashingTaskId(null);
      }, 3000);

      onHighlightConsumed?.();
    }
  }, [highlightedTaskId]);

  const resetNewTaskForm = () => {
    setNewTask({
      title: '', description: '', category: 'Maintenance', priority: 'Medium',
      vehicleLicense: '', station: '', assignedTo: '', createdBy: '',
      dueDate: '', estimatedDuration: '', notes: '',
    });
    setTaskFormErrors({});
    setTaskStep(0);
  };

  const validateTaskStep = (step: number): boolean => {
    const errors: Record<string, string> = {};
    if (step === 0) {
      if (!newTask.title.trim()) errors.title = 'Titel erforderlich';
      if (!newTask.description.trim()) errors.description = 'Beschreibung erforderlich';
    } else if (step === 1) {
      if (!newTask.vehicleLicense) errors.vehicleLicense = 'Fahrzeug auswählen';
      if (!newTask.assignedTo) errors.assignedTo = 'Zuweisung erforderlich';
      if (!newTask.station.trim()) errors.station = 'Station erforderlich';
    } else if (step === 2) {
      if (!newTask.dueDate) errors.dueDate = 'Fälligkeitsdatum erforderlich';
      if (!newTask.estimatedDuration.trim()) errors.estimatedDuration = 'Geschätzte Dauer erforderlich';
      if (!newTask.createdBy.trim()) errors.createdBy = 'Ersteller erforderlich';
    }
    setTaskFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleTaskNextStep = () => {
    if (validateTaskStep(taskStep)) {
      if (taskStep < 3) setTaskStep(taskStep + 1);
    }
  };

  const handleSubmitTask = () => {
    closeNewTask();
  };

  const closeAllDropdowns = (except?: string) => {
    if (except !== 'status') setIsStatusOpen(false);
    if (except !== 'priority') setIsPriorityOpen(false);
    if (except !== 'category') setIsCategoryOpen(false);
    if (except !== 'vehicle') setIsVehicleOpen(false);
    if (except !== 'sort') setIsSortOpen(false);
    if (except !== 'assignee') setIsAssigneeOpen(false);
  };

  const filtered = taskData.filter(t => {
    const matchesSearch = searchQuery === '' ||
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.vehicleLicense.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.vehicleModel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.assignedTo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
    const matchesVehicle = vehicleFilter === 'all' || t.vehicleLicense === vehicleFilter;
    const matchesAssignee = assigneeFilter === 'all' || t.assignedTo === assigneeFilter;
    return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesVehicle && matchesAssignee;
  });

  const priorityOrder: Record<TaskPriority, number> = { 'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
  const statusOrder: Record<TaskStatus, number> = { 'Overdue': 0, 'Open': 1, 'In Progress': 2, 'Completed': 3 };

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'priority') return priorityOrder[a.priority] - priorityOrder[b.priority];
    if (sortBy === 'status') return statusOrder[a.status] - statusOrder[b.status];
    if (sortBy === 'created') return b.id.localeCompare(a.id);
    // dueDate default
    return a.dueDate.split('.').reverse().join('').localeCompare(b.dueDate.split('.').reverse().join(''));
  });

  const openCount = taskData.filter(t => t.status === 'Open').length;
  const inProgressCount = taskData.filter(t => t.status === 'In Progress').length;
  const completedCount = taskData.filter(t => t.status === 'Completed').length;
  const overdueCount = taskData.filter(t => t.status === 'Overdue').length;

  const hasFilters = statusFilter !== 'all' || priorityFilter !== 'all' || categoryFilter !== 'all' || vehicleFilter !== 'all' || assigneeFilter !== 'all' || searchQuery !== '';

  const cardClass = `rounded-lg border shadow-sm ${
    isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
  }`;
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const textTertiary = isDarkMode ? 'text-gray-500' : 'text-gray-400';

  const StatusPill = ({ status }: { status: TaskStatus }) => {
    const s: Record<TaskStatus, string> = {
      'Open': 'bg-blue-100 text-blue-700 border-blue-200',
      'In Progress': 'bg-amber-100 text-amber-700 border-amber-200',
      'Completed': 'bg-emerald-100 text-emerald-700 border-emerald-200',
      'Overdue': 'bg-red-100 text-red-700 border-red-200',
    };
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${s[status]}`}>{status}</span>;
  };

  const PriorityPill = ({ priority }: { priority: TaskPriority }) => {
    const s: Record<TaskPriority, string> = {
      'Low': 'bg-gray-100 text-gray-600 border-gray-200',
      'Medium': 'bg-amber-50 text-amber-700 border-amber-200',
      'High': 'bg-orange-100 text-orange-700 border-orange-200',
      'Critical': 'bg-red-100 text-red-700 border-red-200',
    };
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${s[priority]}`}>{priority}</span>;
  };

  const CategoryBadge = ({ category }: { category: TaskCategory }) => {
    const Icon = categoryIcons[category];
    const colors = categoryColors[category];
    return (
      <div className="flex items-center gap-1.5">
        <div className={`w-5 h-5 rounded-lg ${colors.bg} flex items-center justify-center`}>
          <Icon className={`w-3 h-3 ${colors.text}`} />
        </div>
        <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{category}</span>
      </div>
    );
  };

  const DropdownFilter = ({ label, value, options, isOpen, onToggle, onSelect }: {
    label: string; value: string; options: { value: string; label: string }[];
    isOpen: boolean; onToggle: () => void; onSelect: (v: string) => void;
  }) => (
    <div className="relative">
      <button onClick={onToggle} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
        value !== 'all'
          ? isDarkMode ? 'bg-blue-900/30 border-blue-700/50 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-700'
          : isDarkMode ? 'bg-neutral-800/60 border-neutral-700/50 text-gray-300 hover:bg-neutral-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
      }`}>
        <span>{value === 'all' ? label : options.find(o => o.value === value)?.label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className={`absolute top-full mt-2 left-0 z-50 min-w-[180px] rounded-lg border shadow-xl overflow-hidden ${
          isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
        }`}>
          {options.map(o => (
            <button key={o.value} onClick={() => { onSelect(o.value); onToggle(); }}
              className={`w-full px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                o.value === value
                  ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                  : isDarkMode ? 'text-gray-300 hover:bg-neutral-800' : 'text-gray-700 hover:bg-gray-50'
              }`}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const { fleetVehicles } = useFleetVehicles();
  const uniqueVehicles = fleetVehicles.length > 0
    ? fleetVehicles.map(v => ({ value: v.license, label: `${v.license} – ${v.model}` }))
    : [...new Set(taskData.map(t => t.vehicleLicense))].map(license => {
        const task = taskData.find(t => t.vehicleLicense === license)!;
        return { value: license, label: `${license} – ${task.vehicleModel.split(' ').slice(0, 2).join(' ')}` };
      });

  const uniqueAssignees = [...new Set(taskData.map(t => t.assignedTo))].map(assignee => {
    return { value: assignee, label: assignee };
  });

  return (
    <div className="relative">
      {/* Main Content with zoom-out effect */}
      <div
        className="space-y-5 transition-all duration-500 ease-out origin-center"
        style={{
          transform: (isNewTaskAnimating || isDetailAnimating) ? 'scale(0.92)' : 'scale(1)',
          filter: (isNewTaskAnimating || isDetailAnimating) ? 'blur(12px)' : 'blur(0px)',
          opacity: (isNewTaskAnimating || isDetailAnimating) ? 0.4 : 1,
          pointerEvents: (isNewTaskOpen || selectedTask || isDetailClosing) ? 'none' : 'auto',
        }}
      >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-lg font-bold tracking-tight ${textPrimary}`}>Task Management</h1>
          <p className={`text-xs mt-1 ${textSecondary}`}>Manage all fleet tasks, maintenance, inspections and repairs</p>
        </div>
        <button className="flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-lg shadow-md hover:shadow-lg transition-all text-xs font-semibold"
          onClick={openNewTask}>
          <Plus className="w-5 h-5" />
          New Task
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Open Tasks', value: openCount, icon: ListTodo, color: 'blue', bg: 'bg-blue-100', text: 'text-blue-600', filterVal: 'Open' },
          { label: 'In Progress', value: inProgressCount, icon: Clock, color: 'amber', bg: 'bg-amber-100', text: 'text-amber-600', filterVal: 'In Progress' },
          { label: 'Completed', value: completedCount, icon: CheckCircle, color: 'emerald', bg: 'bg-emerald-100', text: 'text-emerald-600', filterVal: 'Completed' },
          { label: 'Overdue', value: overdueCount, icon: AlertTriangle, color: 'red', bg: 'bg-red-100', text: 'text-red-600', filterVal: 'Overdue' },
        ].map(card => {
          const isActive = statusFilter === card.filterVal;
          return (
            <button
              key={card.label}
              onClick={() => setStatusFilter(isActive ? 'all' : card.filterVal)}
              className={`rounded-lg border shadow-sm p-4 text-left cursor-pointer transition-all duration-200 ${
                isActive
                  ? card.color === 'blue'
                    ? isDarkMode
                      ? 'bg-neutral-900 border-blue-500/60 ring-2 ring-blue-500/30'
                      : 'bg-white border-blue-400/60 ring-2 ring-blue-400/30'
                    : card.color === 'amber'
                    ? isDarkMode
                      ? 'bg-neutral-900 border-amber-500/60 ring-2 ring-amber-500/30'
                      : 'bg-white border-amber-400/60 ring-2 ring-amber-400/30'
                    : card.color === 'emerald'
                    ? isDarkMode
                      ? 'bg-neutral-900 border-emerald-500/60 ring-2 ring-emerald-500/30'
                      : 'bg-white border-emerald-400/60 ring-2 ring-emerald-400/30'
                    : isDarkMode
                      ? 'bg-neutral-900 border-red-500/60 ring-2 ring-red-500/30'
                      : 'bg-white border-red-400/60 ring-2 ring-red-400/30'
                  : isDarkMode
                    ? 'bg-neutral-900 border-neutral-700/50 hover:border-neutral-600/70 hover:shadow-md'
                    : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>{card.label}</span>
                <div className={`w-5 h-5 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <card.icon className={`w-5 h-5 ${card.text}`} />
                </div>
              </div>
              <p className={`text-3xl font-bold ${textPrimary}`}>{card.value}</p>
            </button>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className={`${cardClass} p-4`}>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[240px] relative">
            <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 ${textTertiary}`} />
            <input
              type="text"
              placeholder="Search tasks, vehicles, assignees..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 rounded-lg border text-xs outline-none transition-all ${
                isDarkMode
                  ? 'bg-neutral-800/60 border-neutral-700/50 text-gray-200 placeholder-gray-500 focus:border-blue-500/50'
                  : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-300'
              }`}
            />
          </div>
          <DropdownFilter
            label="Status" value={statusFilter} isOpen={isStatusOpen}
            onToggle={() => { closeAllDropdowns('status'); setIsStatusOpen(!isStatusOpen); }}
            onSelect={setStatusFilter}
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'Open', label: 'Open' },
              { value: 'In Progress', label: 'In Progress' },
              { value: 'Completed', label: 'Completed' },
              { value: 'Overdue', label: 'Overdue' },
            ]}
          />
          <DropdownFilter
            label="Priority" value={priorityFilter} isOpen={isPriorityOpen}
            onToggle={() => { closeAllDropdowns('priority'); setIsPriorityOpen(!isPriorityOpen); }}
            onSelect={setPriorityFilter}
            options={[
              { value: 'all', label: 'All Priorities' },
              { value: 'Critical', label: 'Critical' },
              { value: 'High', label: 'High' },
              { value: 'Medium', label: 'Medium' },
              { value: 'Low', label: 'Low' },
            ]}
          />
          <DropdownFilter
            label="Category" value={categoryFilter} isOpen={isCategoryOpen}
            onToggle={() => { closeAllDropdowns('category'); setIsCategoryOpen(!isCategoryOpen); }}
            onSelect={setCategoryFilter}
            options={[
              { value: 'all', label: 'All Categories' },
              ...(['Cleaning', 'Maintenance', 'Repair', 'Inspection', 'Damage', 'TÜV', 'Insurance', 'Documents', 'Tire Change', 'Oil Change'] as TaskCategory[]).map(c => ({ value: c, label: c })),
            ]}
          />
          <DropdownFilter
            label="Vehicle" value={vehicleFilter} isOpen={isVehicleOpen}
            onToggle={() => { closeAllDropdowns('vehicle'); setIsVehicleOpen(!isVehicleOpen); }}
            onSelect={setVehicleFilter}
            options={[{ value: 'all', label: 'All Vehicles' }, ...uniqueVehicles]}
          />
          <DropdownFilter
            label="Assignee" value={assigneeFilter} isOpen={isAssigneeOpen}
            onToggle={() => { closeAllDropdowns('assignee'); setIsAssigneeOpen(!isAssigneeOpen); }}
            onSelect={setAssigneeFilter}
            options={[{ value: 'all', label: 'All Assignees' }, ...uniqueAssignees]}
          />
          {/* Sort */}
          <div className="relative">
            <button onClick={() => { closeAllDropdowns('sort'); setIsSortOpen(!isSortOpen); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                isDarkMode ? 'bg-neutral-800/60 border-neutral-700/50 text-gray-300 hover:bg-neutral-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}>
              <ArrowUpDown className="w-3 h-3" />
              <span>Sort</span>
            </button>
            {isSortOpen && (
              <div className={`absolute top-full mt-2 right-0 z-50 min-w-[160px] rounded-lg border shadow-xl overflow-hidden ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
              }`}>
                {[
                  { value: 'dueDate', label: 'Due Date' },
                  { value: 'priority', label: 'Priority' },
                  { value: 'status', label: 'Status' },
                  { value: 'created', label: 'Newest First' },
                ].map(o => (
                  <button key={o.value} onClick={() => { setSortBy(o.value as any); setIsSortOpen(false); }}
                    className={`w-full px-3 py-2.5 text-left text-xs font-medium transition-colors ${
                      sortBy === o.value
                        ? isDarkMode ? 'bg-blue-600/20 text-blue-400' : 'bg-blue-50 text-blue-600'
                        : isDarkMode ? 'text-gray-300 hover:bg-neutral-800' : 'text-gray-700 hover:bg-gray-50'
                    }`}>
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {hasFilters && (
            <button onClick={() => { setStatusFilter('all'); setPriorityFilter('all'); setCategoryFilter('all'); setVehicleFilter('all'); setAssigneeFilter('all'); setSearchQuery(''); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                isDarkMode ? 'bg-red-900/30 border-red-700/50 text-red-400 hover:bg-red-900/50' : 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
              }`}>
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Tasks Table */}
      <div className={`${cardClass} overflow-hidden`}>
        <table className="w-full">
          <thead>
            <tr className={`border-b ${isDarkMode ? 'border-neutral-700/50' : 'border-gray-200/60'}`}>
              {['Task', 'Category', 'Vehicle', 'Station', 'Assigned To', 'Due Date', 'Priority', 'Status', ''].map(h => (
                <th key={h} className={`text-left text-xs uppercase tracking-wider font-semibold px-3 py-3 ${textTertiary}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className={`divide-y ${isDarkMode ? 'divide-neutral-800' : 'divide-gray-100'}`}>
            {sorted.map(task => {
              const colors = categoryColors[task.category];
              const Icon = categoryIcons[task.category];
              const isOverdue = task.status === 'Overdue';
              const isCritical = task.priority === 'Critical';
              return (
                <tr key={task.id}
                  ref={(el) => { taskRowRefs.current[task.id] = el; }}
                  onClick={() => openTaskDetail(task)}
                  className={`cursor-pointer transition-all duration-500 ${
                    flashingTaskId === task.id
                      ? isDarkMode ? 'bg-blue-500/20 ring-1 ring-blue-500/40' : 'bg-blue-100/80 ring-1 ring-blue-300'
                      : isDarkMode ? 'hover:bg-neutral-800/60' : 'hover:bg-blue-50/40'
                  } ${
                    isOverdue && flashingTaskId !== task.id ? (isDarkMode ? 'bg-red-950/10' : 'bg-red-50/30') : ''
                  }`}>
                  <td className="px-3 py-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-mono ${textTertiary}`}>{task.id}</span>
                        {isCritical && <AlertTriangle className="w-3 h-3 text-red-500" />}
                      </div>
                      <p className={`text-xs font-semibold mt-0.5 ${textPrimary}`}>{task.title}</p>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <CategoryBadge category={task.category} />
                  </td>
                  <td className="px-3 py-2.5">
                    <p className={`text-xs font-medium ${textPrimary}`}>{task.vehicleLicense}</p>
                    <p className={`text-[11px] ${textTertiary}`}>{task.vehicleModel.split(' ').slice(0, 2).join(' ')}</p>
                  </td>
                  <td className={`px-3 py-2.5 text-xs ${textSecondary}`}>
                    {task.station}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br from-blue-500 to-blue-600`}>
                        {task.assignedTo.split(' ').map(n => n[0]).join('')}
                      </div>
                      <span className={`text-xs ${textSecondary}`}>{task.assignedTo}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-xs font-medium ${isOverdue ? 'text-red-500' : textPrimary}`}>{task.dueDate}</span>
                    <p className={`text-[11px] ${textTertiary}`}>{task.estimatedDuration}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <PriorityPill priority={task.priority} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={task.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <ChevronRight className={`w-5 h-5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="py-12 text-center">
            <ListTodo className={`w-5 h-5 mx-auto mb-3 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
            <p className={`text-xs font-medium ${textSecondary}`}>No tasks match your filters</p>
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className={`text-xs ${textTertiary}`}>Showing {sorted.length} of {taskData.length} tasks</p>
      </div>

      </div>{/* End of main content wrapper */}

      {/* Task Detail Modal */}
      {selectedTask && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={closeTaskDetail}>
          <div
            className="absolute inset-0 transition-all duration-500 ease-out"
            style={{
              backgroundColor: isDetailAnimating ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0)',
            }}
          />
          <div onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-3xl border shadow-2xl transition-all duration-500 ease-out ${
            isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
          }`}
            style={{
              transform: isDetailAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)',
              opacity: isDetailAnimating ? 1 : 0,
              boxShadow: isDetailAnimating
                ? '0 25px 60px -12px rgba(0, 0, 0, 0.35), 0 0 40px -8px rgba(59, 130, 246, 0.15)'
                : '0 10px 30px -12px rgba(0, 0, 0, 0)',
            }}>
            {/* Header */}
            <div className={`sticky top-0 z-10 px-8 pt-7 pb-5 border-b ${
              isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-100'
            }`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-mono ${textTertiary}`}>{selectedTask.id}</span>
                    <StatusPill status={selectedTask.status} />
                    <PriorityPill priority={selectedTask.priority} />
                  </div>
                  <h2 className={`text-base font-bold ${textPrimary}`}>{selectedTask.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  {selectedTask.status === 'Open' && (
                    <button className="px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition-all shadow-sm">
                      Start Task
                    </button>
                  )}
                  {selectedTask.status === 'In Progress' && (
                    <button className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold transition-all shadow-sm">
                      Complete
                    </button>
                  )}
                  {selectedTask.status === 'Overdue' && (
                    <button className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-all shadow-sm">
                      Reschedule
                    </button>
                  )}
                  <button onClick={closeTaskDetail}
                    className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-8 space-y-5">
              {/* Description */}
              <div>
                <h4 className={`text-xs uppercase tracking-wider font-semibold mb-2 ${textTertiary}`}>Description</h4>
                <p className={`text-xs ${textSecondary}`}>{selectedTask.description}</p>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`rounded-lg border p-4 ${isDarkMode ? 'bg-neutral-800/50 border-neutral-700/50' : 'bg-gray-50/80 border-gray-200/50'}`}>
                  <h4 className={`text-xs uppercase tracking-wider font-semibold mb-3 ${textTertiary}`}>Task Details</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${textSecondary}`}>Category</span>
                      <CategoryBadge category={selectedTask.category} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${textSecondary}`}>Created</span>
                      <span className={`text-xs font-medium ${textPrimary}`}>{selectedTask.createdDate}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${textSecondary}`}>Due Date</span>
                      <span className={`text-xs font-medium ${selectedTask.status === 'Overdue' ? 'text-red-500' : textPrimary}`}>{selectedTask.dueDate}</span>
                    </div>
                    {selectedTask.completedDate && (
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${textSecondary}`}>Completed</span>
                        <span className="text-[10px] font-medium text-emerald-600">{selectedTask.completedDate}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${textSecondary}`}>Est. Duration</span>
                      <span className={`text-xs font-medium ${textPrimary}`}>{selectedTask.estimatedDuration}</span>
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg border p-4 ${isDarkMode ? 'bg-neutral-800/50 border-neutral-700/50' : 'bg-gray-50/80 border-gray-200/50'}`}>
                  <h4 className={`text-xs uppercase tracking-wider font-semibold mb-3 ${textTertiary}`}>Assignment</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${textSecondary}`}>Assigned To</span>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white bg-gradient-to-br from-blue-500 to-blue-600">
                          {selectedTask.assignedTo.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className={`text-xs font-medium ${textPrimary}`}>{selectedTask.assignedTo}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${textSecondary}`}>Station</span>
                      <span className={`text-xs font-medium ${textPrimary}`}>{selectedTask.station}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Vehicle Info */}
              <div className={`rounded-lg border p-4 border-l-4 ${
                isDarkMode ? 'bg-neutral-800/50 border-neutral-700/50 border-l-blue-500' : 'bg-blue-50/50 border-blue-200/50 border-l-blue-400'
              }`}>
                <div className="flex items-center gap-3">
                  <Car className="w-5 h-5 text-blue-500" />
                  <div>
                    <p className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Linked Vehicle</p>
                    <p className={`text-xs font-semibold mt-0.5 ${textPrimary}`}>{selectedTask.vehicleModel}</p>
                    <p className={`text-xs ${textSecondary}`}>{selectedTask.vehicleLicense} · {selectedTask.station}</p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedTask.notes && (
                <div className={`rounded-lg border p-4 border-l-4 ${
                  isDarkMode ? 'bg-amber-900/20 border-neutral-700/50 border-l-amber-500' : 'bg-amber-50/60 border-amber-200/50 border-l-amber-400'
                }`}>
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 mt-0.5 text-amber-500" />
                    <div>
                      <p className={`text-xs uppercase tracking-wider font-semibold ${textTertiary}`}>Notes</p>
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{selectedTask.notes}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border text-xs font-semibold transition-all ${
                  isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}>
                  <User className="w-5 h-5" />
                  Reassign
                </button>
                <button className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border text-xs font-semibold transition-all ${
                  isDarkMode ? 'bg-neutral-800 border-neutral-700 text-gray-300 hover:bg-neutral-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}>
                  <Calendar className="w-5 h-5" />
                  Reschedule
                </button>
                <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-all shadow-sm">
                  <X className="w-5 h-5" />
                  Cancel Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Task Modal */}
      {isNewTaskOpen && (() => {
        const steps = [
          { label: 'Grunddaten', icon: FileText },
          { label: 'Fahrzeug & Zuweisung', icon: Car },
          { label: 'Zeitplan', icon: Calendar },
          { label: 'Zusammenfassung', icon: CheckCircle },
        ];
        const inputClass = `w-full px-3 py-2.5 rounded-lg border text-xs outline-none transition-all ${
          isDarkMode
            ? 'bg-neutral-800/60 border-neutral-700/50 text-gray-200 placeholder-gray-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20'
            : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20'
        }`;
        const labelClass = `block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`;
        const sectionTitle = (icon: any, title: string) => {
          const Icon = icon;
          return (
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`w-5 h-5 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-emerald-500/15' : 'bg-emerald-50'}`}>
                <Icon className="w-5 h-5 text-emerald-500" />
              </div>
              <h3 className={`text-base font-bold ${textPrimary}`}>{title}</h3>
            </div>
          );
        };
        const SummaryRow = ({ label, value }: { label: string; value: string }) => (
          <div className="flex items-center justify-between py-2">
            <span className={`text-xs ${textTertiary}`}>{label}</span>
            <span className={`text-xs font-medium ${textPrimary}`}>{value || '–'}</span>
          </div>
        );
        const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const allCategories: TaskCategory[] = ['Cleaning', 'Maintenance', 'Repair', 'Inspection', 'Damage', 'TÜV', 'Insurance', 'Documents', 'Tire Change', 'Oil Change'];
        const allPriorities: TaskPriority[] = ['Low', 'Medium', 'High', 'Critical'];
        const assigneesList = ['Tim Schröder', 'Marco Becker', 'Sarah Mayer', 'Lisa Weber'];
        const stationsList: string[] = [];

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={closeNewTask}>
            <div
              className="absolute inset-0 transition-all duration-500 ease-out"
              style={{
                backgroundColor: isNewTaskAnimating ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0)',
              }}
            />
            <div onClick={(e) => e.stopPropagation()}
              className={`relative w-full max-w-[680px] max-h-[85vh] flex flex-col rounded-lg border shadow-2xl transition-all duration-500 ease-out ${
                isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'
              }`}
              style={{
                transform: isNewTaskAnimating ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(30px)',
                opacity: isNewTaskAnimating ? 1 : 0,
                boxShadow: isNewTaskAnimating
                  ? '0 25px 60px -12px rgba(0, 0, 0, 0.35), 0 0 40px -8px rgba(16, 185, 129, 0.15)'
                  : '0 10px 30px -12px rgba(0, 0, 0, 0)',
              }}>
              {/* Header */}
              <div className={`flex items-center justify-between px-7 py-3 border-b shrink-0 ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                <div>
                  <h2 className={`text-lg font-bold ${textPrimary}`}>Neuen Task anlegen</h2>
                  <p className={`text-xs mt-0.5 ${textTertiary}`}>Erstellt am {today} · Alle Pflichtfelder ausfüllen</p>
                </div>
                <button onClick={closeNewTask}
                  className={`w-5 h-5 rounded-lg flex items-center justify-center transition-colors ${
                    isDarkMode ? 'hover:bg-neutral-800 text-gray-500' : 'hover:bg-gray-100 text-gray-400'
                  }`}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Step Indicator */}
              <div className={`flex items-center gap-1 px-7 py-3 border-b shrink-0 ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                {steps.map((s, i) => {
                  const StepIcon = s.icon;
                  const isActive = i === taskStep;
                  const isDone = i < taskStep;
                  return (
                    <div key={i} className="flex items-center flex-1">
                      <button onClick={() => { if (isDone) setTaskStep(i); }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          isActive
                            ? isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                            : isDone
                              ? isDarkMode ? 'text-emerald-400 cursor-pointer hover:bg-emerald-500/10' : 'text-emerald-600 cursor-pointer hover:bg-emerald-50'
                              : isDarkMode ? 'text-gray-600' : 'text-gray-300'
                        }`}>
                        {isDone ? <CheckCircle className="w-3.5 h-3.5" /> : <StepIcon className="w-3.5 h-3.5" />}
                        <span className="hidden sm:inline">{s.label}</span>
                      </button>
                      {i < steps.length - 1 && (
                        <div className={`flex-1 h-px mx-2 ${isDone ? 'bg-emerald-400/40' : isDarkMode ? 'bg-neutral-800' : 'bg-gray-200'}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto px-7 py-3">
                {taskStep === 0 && (
                  <div className="space-y-4">
                    {sectionTitle(FileText, 'Grunddaten')}
                    <div>
                      <label className={labelClass}>Titel *</label>
                      <input type="text" placeholder="z.B. Ölwechsel Mercedes AMG GT" value={newTask.title}
                        onChange={e => setNewTask({ ...newTask, title: e.target.value })} className={inputClass} />
                      {taskFormErrors.title && <p className="text-[11px] text-red-500 mt-1">{taskFormErrors.title}</p>}
                    </div>
                    <div>
                      <label className={labelClass}>Beschreibung *</label>
                      <textarea rows={3} placeholder="Detaillierte Beschreibung der Aufgabe..." value={newTask.description}
                        onChange={e => setNewTask({ ...newTask, description: e.target.value })} className={`${inputClass} resize-none`} />
                      {taskFormErrors.description && <p className="text-[11px] text-red-500 mt-1">{taskFormErrors.description}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Kategorie</label>
                        <select value={newTask.category} onChange={e => setNewTask({ ...newTask, category: e.target.value as TaskCategory })} className={inputClass}>
                          {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Priorität</label>
                        <div className="flex gap-1.5">
                          {allPriorities.map(p => {
                            const colors: Record<TaskPriority, string> = {
                              'Low': newTask.priority === p ? 'bg-gray-500 text-white border-gray-500' : isDarkMode ? 'bg-neutral-800/60 border-neutral-700/50 text-gray-400' : 'bg-white border-gray-200 text-gray-500',
                              'Medium': newTask.priority === p ? 'bg-amber-500 text-white border-amber-500' : isDarkMode ? 'bg-neutral-800/60 border-neutral-700/50 text-gray-400' : 'bg-white border-gray-200 text-gray-500',
                              'High': newTask.priority === p ? 'bg-orange-500 text-white border-orange-500' : isDarkMode ? 'bg-neutral-800/60 border-neutral-700/50 text-gray-400' : 'bg-white border-gray-200 text-gray-500',
                              'Critical': newTask.priority === p ? 'bg-red-500 text-white border-red-500' : isDarkMode ? 'bg-neutral-800/60 border-neutral-700/50 text-gray-400' : 'bg-white border-gray-200 text-gray-500',
                            };
                            return (
                              <button key={p} onClick={() => setNewTask({ ...newTask, priority: p })}
                                className={`flex-1 py-2 rounded-lg border text-[11px] font-semibold transition-all ${colors[p]}`}>
                                {p}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {taskStep === 1 && (
                  <div className="space-y-4">
                    {sectionTitle(Car, 'Fahrzeug & Zuweisung')}
                    <div>
                      <label className={labelClass}>Fahrzeug *</label>
                      <select value={newTask.vehicleLicense} onChange={e => setNewTask({ ...newTask, vehicleLicense: e.target.value })} className={inputClass}>
                        <option value="">Fahrzeug auswählen...</option>
                        {uniqueVehicles.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                      </select>
                      {taskFormErrors.vehicleLicense && <p className="text-[11px] text-red-500 mt-1">{taskFormErrors.vehicleLicense}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Zugewiesen an *</label>
                        <select value={newTask.assignedTo} onChange={e => setNewTask({ ...newTask, assignedTo: e.target.value })} className={inputClass}>
                          <option value="">Mitarbeiter wählen...</option>
                          {assigneesList.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        {taskFormErrors.assignedTo && <p className="text-[11px] text-red-500 mt-1">{taskFormErrors.assignedTo}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Station *</label>
                        <select value={newTask.station} onChange={e => setNewTask({ ...newTask, station: e.target.value })} className={inputClass}>
                          <option value="">{stationsList.length === 0 ? 'No stations' : 'Station wählen...'}</option>
                          {stationsList.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {taskFormErrors.station && <p className="text-[11px] text-red-500 mt-1">{taskFormErrors.station}</p>}
                      </div>
                    </div>
                  </div>
                )}

                {taskStep === 2 && (
                  <div className="space-y-4">
                    {sectionTitle(Calendar, 'Zeitplan & Ersteller')}
                    <div className={`rounded-lg p-3.5 mb-1 ${isDarkMode ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200/60'}`}>
                      <div className="flex items-start gap-2.5">
                        <Clock className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                        <p className={`text-xs ${isDarkMode ? 'text-blue-300/80' : 'text-blue-700'}`}>
                          Erstellungsdatum: <span className="font-semibold">{today}</span> – wird automatisch gesetzt.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Fälligkeitsdatum *</label>
                        <input type="date" value={newTask.dueDate}
                          onChange={e => setNewTask({ ...newTask, dueDate: e.target.value })} className={inputClass} />
                        {taskFormErrors.dueDate && <p className="text-[11px] text-red-500 mt-1">{taskFormErrors.dueDate}</p>}
                      </div>
                      <div>
                        <label className={labelClass}>Geschätzte Dauer *</label>
                        <select value={newTask.estimatedDuration} onChange={e => setNewTask({ ...newTask, estimatedDuration: e.target.value })} className={inputClass}>
                          <option value="">Dauer wählen...</option>
                          {['0.5h', '1h', '1.5h', '2h', '2.5h', '3h', '4h', '5h', '6h', '8h', '1 Tag', '2 Tage'].map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        {taskFormErrors.estimatedDuration && <p className="text-[11px] text-red-500 mt-1">{taskFormErrors.estimatedDuration}</p>}
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>Erstellt von *</label>
                      <div className="relative">
                        <User className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
                        <select value={newTask.createdBy} onChange={e => setNewTask({ ...newTask, createdBy: e.target.value })} className={`${inputClass} pl-9`}>
                          <option value="">Ersteller wählen...</option>
                          {assigneesList.map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </div>
                      {taskFormErrors.createdBy && <p className="text-[11px] text-red-500 mt-1">{taskFormErrors.createdBy}</p>}
                    </div>
                  </div>
                )}

                {taskStep === 3 && (
                  <div className="space-y-5">
                    {sectionTitle(CheckCircle, 'Zusammenfassung & Prüfung')}
                    <div className={`rounded-lg border p-4 space-y-0 divide-y ${
                      isDarkMode ? 'bg-neutral-800/40 border-neutral-700/50 divide-neutral-800' : 'bg-gray-50/50 border-gray-200/60 divide-gray-100'
                    }`}>
                      <SummaryRow label="Titel" value={newTask.title} />
                      <SummaryRow label="Beschreibung" value={newTask.description} />
                      <div className="flex items-center justify-between py-2">
                        <span className={`text-xs ${textTertiary}`}>Kategorie</span>
                        <CategoryBadge category={newTask.category} />
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className={`text-xs ${textTertiary}`}>Priorität</span>
                        <PriorityPill priority={newTask.priority} />
                      </div>
                    </div>
                    <div className={`rounded-lg border p-4 space-y-0 divide-y ${
                      isDarkMode ? 'bg-neutral-800/40 border-neutral-700/50 divide-neutral-800' : 'bg-gray-50/50 border-gray-200/60 divide-gray-100'
                    }`}>
                      <SummaryRow label="Fahrzeug" value={newTask.vehicleLicense ? (uniqueVehicles.find(v => v.value === newTask.vehicleLicense)?.label || newTask.vehicleLicense) : ''} />
                      <SummaryRow label="Zugewiesen an" value={newTask.assignedTo} />
                      <SummaryRow label="Station" value={newTask.station} />
                    </div>
                    <div className={`rounded-lg border p-4 space-y-0 divide-y ${
                      isDarkMode ? 'bg-neutral-800/40 border-neutral-700/50 divide-neutral-800' : 'bg-gray-50/50 border-gray-200/60 divide-gray-100'
                    }`}>
                      <SummaryRow label="Erstellt am" value={today} />
                      <SummaryRow label="Erstellt von" value={newTask.createdBy} />
                      <SummaryRow label="Fälligkeitsdatum" value={newTask.dueDate} />
                      <SummaryRow label="Geschätzte Dauer" value={newTask.estimatedDuration} />
                    </div>
                    <div>
                      <label className={labelClass}>Notizen (optional)</label>
                      <textarea rows={2} placeholder="Zusätzliche Informationen zum Task..."
                        value={newTask.notes}
                        onChange={e => setNewTask({ ...newTask, notes: e.target.value })}
                        className={`${inputClass} resize-none`} />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className={`flex items-center justify-between px-7 py-3 border-t shrink-0 ${isDarkMode ? 'border-neutral-800' : 'border-gray-100'}`}>
                <button onClick={closeNewTask}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isDarkMode ? 'text-gray-500 hover:text-gray-300 hover:bg-neutral-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }`}>
                  Abbrechen
                </button>
                <div className="flex items-center gap-2.5">
                  {taskStep > 0 && (
                    <button onClick={() => setTaskStep(taskStep - 1)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                        isDarkMode ? 'bg-neutral-800/60 border-neutral-700/50 text-gray-300 hover:bg-neutral-800' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}>
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Zurück
                    </button>
                  )}
                  {taskStep < 3 ? (
                    <button onClick={handleTaskNextStep}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white text-xs font-semibold shadow-md hover:shadow-lg transition-all">
                      Weiter
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button onClick={handleSubmitTask}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white text-xs font-semibold shadow-md hover:shadow-lg transition-all">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Task anlegen
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
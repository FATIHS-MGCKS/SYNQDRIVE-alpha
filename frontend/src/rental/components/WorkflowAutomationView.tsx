import { Bell, Bot, Calendar, Car, ClipboardList, CreditCard, Edit3, Headphones, Layers, MapPin, Pause, Play, Shield, Sparkles, Truck, Wrench, Zap } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useMemo, useCallback } from 'react';

import { api } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { EmptyState } from '../../components/patterns';

// ─── Types ───────────────────────────────────────

interface Workflow {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  category: string;
  trigger: TriggerDef;
  conditions: ConditionDef[];
  actions: ActionDef[];
  scope: ScopeDef;
  status: string;
  statusLabel: string;
  createdById: string | null;
  createdByName: string | null;
  updatedById: string | null;
  updatedByName: string | null;
  lastTriggeredAt: string | null;
  triggerCount: number;
  isTemplate: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TriggerDef { type: string; config?: Record<string, any>; }
interface ConditionDef { field?: string; path?: string; operator: string; value: any; }
interface ActionDef { type: string; config?: Record<string, any>; }
interface ScopeDef { type: string; stationIds?: string[]; vehicleIds?: string[]; }

interface Stats {
  total: number;
  active: number;
  draft: number;
  disabled: number;
  invalid?: number;
  totalRuns?: number;
  successfulRuns?: number;
  failedRuns?: number;
  waitingApprovalRuns?: number;
  runsLast24h?: number;
  lastRunAt?: string | null;
}

interface WorkflowRun {
  id: string;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  status: string;
  errorMessage?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  createdAt: string;
  actionRuns?: Array<{
    id: string;
    actionType: string;
    actionIndex: number;
    status: string;
    errorMessage?: string | null;
    requiresApproval: boolean;
  }>;
}

interface Props { isDarkMode: boolean; canWrite?: boolean; }

// ─── Constants ───────────────────────────────────

const CATEGORIES = [
  { key: 'vehicle_return', label: 'Return & Readiness', icon: Car, color: 'blue' },
  { key: 'geofencing', label: 'Territory & Geofencing', icon: MapPin, color: 'green' },
  { key: 'cleaning', label: 'Cleaning & Preparation', icon: Sparkles, color: 'cyan' },
  { key: 'maintenance', label: 'Maintenance & Compliance', icon: Wrench, color: 'orange' },
  { key: 'finance', label: 'Fines & Invoices', icon: CreditCard, color: 'red' },
  { key: 'ai_permissions', label: 'AI Actions & Permissions', icon: Bot, color: 'purple' },
  { key: 'support', label: 'Support & Escalation', icon: Headphones, color: 'yellow' },
] as const;

const TRIGGER_TYPES = [
  { key: 'booking.returned', label: 'Booking returned', category: 'vehicle_return' },
  { key: 'booking.completed', label: 'Booking completed', category: 'vehicle_return' },
  { key: 'vehicle_returned', label: 'Vehicle returned (legacy)', category: 'vehicle_return' },
  { key: 'vehicle.health.warning', label: 'Vehicle health warning', category: 'maintenance' },
  { key: 'vehicle.health.critical', label: 'Vehicle health critical', category: 'maintenance' },
  { key: 'health_threshold', label: 'Health threshold reached', category: 'maintenance' },
  { key: 'vehicle.dtc.critical', label: 'Critical DTC detected', category: 'maintenance' },
  { key: 'invoice_overdue', label: 'Invoice overdue', category: 'finance' },
  { key: 'invoice.overdue', label: 'Invoice overdue (canonical)', category: 'finance' },
  { key: 'fine_created', label: 'Customer complaint / fine', category: 'finance' },
  { key: 'customer.complaint.created', label: 'Customer complaint created', category: 'support' },
  { key: 'manual', label: 'Manual / test trigger', category: 'vehicle_return' },
  { key: 'manual.test', label: 'Manual test', category: 'vehicle_return' },
] as const;

const ACTION_TYPES = [
  { key: 'create_alert', label: 'Create alert', icon: Bell, mvp: true },
  { key: 'create_task', label: 'Create task', icon: ClipboardList, mvp: true },
  { key: 'change_vehicle_status', label: 'Change vehicle status', icon: Car, mvp: true },
  { key: 'send_notification', label: 'Prepare notification (draft only)', icon: Bell, mvp: true },
  { key: 'ai_suggest', label: 'AI: Suggest action (approval required)', icon: Bot, mvp: true },
  { key: 'request_approval', label: 'Request approval', icon: Shield, mvp: true },
  { key: 'change_cleaning_status', label: 'Set cleaning status', icon: Sparkles, mvp: false, comingSoon: true },
  { key: 'ai_execute', label: 'AI: Execute action', icon: Zap, mvp: false, comingSoon: true },
  { key: 'ai_send_message', label: 'AI: Send customer message', icon: Bot, mvp: false, comingSoon: true },
  { key: 'ai_book_appointment', label: 'AI: Book appointment', icon: Calendar, mvp: false, comingSoon: true },
  { key: 'assign_vendor', label: 'Assign vendor / service', icon: Truck, mvp: false, comingSoon: true },
] as const;

const CONDITION_FIELDS = [
  { key: 'vehicle_status', label: 'Vehicle status' },
  { key: 'cleaning_status', label: 'Cleaning status' },
  { key: 'health_score', label: 'Health score' },
  { key: 'mileage', label: 'Mileage (km)' },
  { key: 'booking_type', label: 'Booking type' },
  { key: 'vehicle_group', label: 'Vehicle group' },
  { key: 'station', label: 'Station' },
  { key: 'days_since_last_service', label: 'Days since last service' },
  { key: 'invoice_amount', label: 'Invoice amount (€)' },
  { key: 'overdue_days', label: 'Overdue days' },
  { key: 'damage_severity', label: 'Damage severity' },
] as const;

const CONDITION_OPERATORS = [
  { key: 'equals', label: 'equals' },
  { key: 'not_equals', label: 'not equals' },
  { key: 'greater_than', label: 'greater than' },
  { key: 'less_than', label: 'less than' },
  { key: 'contains', label: 'contains' },
  { key: 'is_true', label: 'is true' },
  { key: 'is_false', label: 'is false' },
] as const;

const SCOPE_TYPES = [
  { key: 'organization', label: 'Entire organization' },
  { key: 'station', label: 'Selected stations' },
  { key: 'vehicle', label: 'Selected vehicles' },
  { key: 'territory', label: 'Selected territory / geofence' },
] as const;

interface StarterTemplate {
  name: string;
  description: string;
  category: string;
  trigger: TriggerDef;
  conditions: ConditionDef[];
  actions: ActionDef[];
  scope: ScopeDef;
}

const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    name: 'Return Damage Check',
    description: 'Create a damage inspection task for every vehicle return.',
    category: 'vehicle_return',
    trigger: { type: 'vehicle_returned' },
    conditions: [],
    actions: [{ type: 'create_task', config: { title: 'Damage inspection required', priority: 'HIGH', category: 'inspection' } }],
    scope: { type: 'organization' },
  },
  {
    name: 'Return Admin Notification',
    description: 'Prepare an internal notification draft when a booking is returned.',
    category: 'vehicle_return',
    trigger: { type: 'vehicle_returned' },
    conditions: [],
    actions: [{ type: 'send_notification', config: { target: 'admin', message: 'Vehicle returned — review readiness' } }],
    scope: { type: 'organization' },
  },
  {
    name: 'Critical Health → Out of Service',
    description: 'Block vehicle and create repair task when critical health is detected.',
    category: 'maintenance',
    trigger: { type: 'vehicle.health.critical' },
    conditions: [],
    actions: [
      { type: 'change_vehicle_status', config: { status: 'OUT_OF_SERVICE' } },
      { type: 'create_task', config: { title: 'Critical vehicle issue – repair required', priority: 'CRITICAL' } },
      { type: 'create_alert', config: { severity: 'critical', message: 'Vehicle blocked due to critical health' } },
    ],
    scope: { type: 'organization' },
  },
  {
    name: 'Health Warning Alert',
    description: 'Alert when vehicle health drops below threshold.',
    category: 'maintenance',
    trigger: { type: 'health_threshold', config: { metric: 'overall', threshold: 60 } },
    conditions: [],
    actions: [
      { type: 'create_alert', config: { severity: 'warning', message: 'Vehicle health below threshold' } },
      { type: 'create_task', config: { title: 'Service required', priority: 'HIGH' } },
    ],
    scope: { type: 'organization' },
  },
  {
    name: 'Fine Processing Task',
    description: 'Create a handling task when a fine or complaint is recorded.',
    category: 'finance',
    trigger: { type: 'fine_created' },
    conditions: [],
    actions: [{ type: 'create_task', config: { title: 'Process new fine', priority: 'NORMAL', category: 'fine' } }],
    scope: { type: 'organization' },
  },
  {
    name: 'Invoice Overdue Escalation',
    description: 'Escalate when invoice is overdue for 14+ days.',
    category: 'finance',
    trigger: { type: 'invoice_overdue', config: { overdueDays: 14 } },
    conditions: [{ field: 'overdue_days', operator: 'greater_than', value: 14 }],
    actions: [
      { type: 'create_task', config: { title: 'Invoice overdue – escalate', priority: 'HIGH', category: 'billing' } },
      { type: 'send_notification', config: { target: 'admin', message: 'Invoice overdue requires attention' } },
    ],
    scope: { type: 'organization' },
  },
  {
    name: 'AI: Suggest Action (Approval)',
    description: 'AI suggests an operational action — never auto-executes without approval.',
    category: 'ai_permissions',
    trigger: { type: 'manual' },
    conditions: [],
    actions: [{ type: 'ai_suggest', config: { summary: 'Review suggested fleet action' } }],
    scope: { type: 'organization' },
  },
];

// ─── Helpers ─────────────────────────────────────

function getCategoryMeta(key: string) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[0];
}
function getTriggerLabel(key: string) {
  return TRIGGER_TYPES.find((t) => t.key === key)?.label || key;
}
function getActionLabel(key: string) {
  return ACTION_TYPES.find((a) => a.key === key)?.label || key;
}
function getActionIcon(key: string) {
  const a = ACTION_TYPES.find((t) => t.key === key);
  return a?.icon || Zap;
}
function getFieldLabel(key: string) {
  return CONDITION_FIELDS.find((f) => f.key === key)?.label || key;
}
function getOperatorLabel(key: string) {
  return CONDITION_OPERATORS.find((o) => o.key === key)?.label || key;
}
function relativeTime(dateStr: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('de-DE');
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgClass: string; textClass: string }> = {
  ACTIVE: { label: 'Active', color: 'green', bgClass: 'bg-green-100 dark:bg-status-positive-soft', textClass: 'text-green-700 dark:text-status-positive' },
  DRAFT: { label: 'Draft', color: 'amber', bgClass: 'bg-amber-100 dark:bg-status-attention-soft', textClass: 'text-amber-700 dark:text-status-attention' },
  DISABLED: { label: 'Disabled', color: 'gray', bgClass: 'bg-gray-100 dark:bg-muted', textClass: 'text-gray-500 dark:text-muted-foreground' },
  INVALID: { label: 'Invalid', color: 'red', bgClass: 'bg-red-100 dark:bg-status-critical-soft', textClass: 'text-red-700 dark:text-status-critical' },
};

const RUN_STATUS_CONFIG: Record<string, { label: string; bgClass: string; textClass: string }> = {
  SUCCESS: { label: 'Success', bgClass: 'bg-green-100 dark:bg-status-positive-soft', textClass: 'text-green-700 dark:text-status-positive' },
  FAILED: { label: 'Failed', bgClass: 'bg-red-100 dark:bg-status-critical-soft', textClass: 'text-red-700 dark:text-status-critical' },
  SKIPPED: { label: 'Skipped', bgClass: 'bg-gray-100 dark:bg-muted', textClass: 'text-gray-500 dark:text-muted-foreground' },
  WAITING_APPROVAL: { label: 'Waiting approval', bgClass: 'bg-purple-100 dark:bg-status-ai-soft', textClass: 'text-purple-700 dark:text-status-ai' },
  RUNNING: { label: 'Running', bgClass: 'bg-blue-100 dark:bg-status-info-soft', textClass: 'text-blue-700 dark:text-status-info' },
  PENDING: { label: 'Pending', bgClass: 'bg-amber-100 dark:bg-status-attention-soft', textClass: 'text-amber-700 dark:text-status-attention' },
};

// ─── Main Component ──────────────────────────────

export function WorkflowAutomationView({ isDarkMode, canWrite = true }: Props) {
  const { orgId } = useRentalOrg();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0, active: 0, draft: 0, disabled: 0, invalid: 0,
    totalRuns: 0, successfulRuns: 0, failedRuns: 0, waitingApprovalRuns: 0, runsLast24h: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [view, setView] = useState<'list' | 'detail' | 'builder'>('list');
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [builderData, setBuilderData] = useState<Partial<Workflow> | null>(null);
  const [saving, setSaving] = useState(false);

  const cardBg = isDarkMode ? 'bg-[#1e1e2e]' : 'bg-white';
  const cardBorder = isDarkMode ? 'border-gray-700/50' : 'border-gray-200';
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDarkMode ? 'bg-[#2a2a3e] border-gray-600 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400';
  const hoverBg = isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50';

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [wfRes, stRes] = await Promise.all([
        api.workflows.list(orgId),
        api.workflows.stats(orgId),
      ]);
      setWorkflows(wfRes as Workflow[]);
      setStats(stRes);
    } catch (e) {
      console.error('Failed to load workflows', e);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let list = workflows;
    if (statusFilter !== 'all') list = list.filter((w) => w.status === statusFilter);
    if (categoryFilter !== 'all') list = list.filter((w) => w.category === categoryFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((w) =>
        w.name.toLowerCase().includes(s) ||
        (w.description || '').toLowerCase().includes(s) ||
        getCategoryMeta(w.category).label.toLowerCase().includes(s) ||
        getTriggerLabel(w.trigger?.type).toLowerCase().includes(s),
      );
    }
    return list;
  }, [workflows, statusFilter, categoryFilter, search]);

  // ─── Actions ─────────────────────────────────

  const handleToggle = async (wf: Workflow) => {
    if (!orgId) return;
    try {
      await api.workflows.toggle(orgId, wf.id);
      loadData();
    } catch (e) { console.error(e); }
  };

  const handleDuplicate = async (wf: Workflow) => {
    if (!orgId) return;
    try {
      await api.workflows.duplicate(orgId, wf.id);
      loadData();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (wf: Workflow) => {
    if (!orgId || !confirm(`Delete workflow "${wf.name}"? This cannot be undone.`)) return;
    try {
      await api.workflows.remove(orgId, wf.id);
      if (view === 'detail') setView('list');
      loadData();
    } catch (e) { console.error(e); }
  };

  const openDetail = (wf: Workflow) => { setSelectedWorkflow(wf); setView('detail'); };

  const openBuilder = (wf?: Workflow | null, template?: StarterTemplate) => {
    if (template) {
      setBuilderData({
        name: template.name,
        description: template.description,
        category: template.category,
        trigger: template.trigger,
        conditions: template.conditions,
        actions: template.actions,
        scope: template.scope,
        status: 'DRAFT',
      });
    } else if (wf) {
      setBuilderData({ ...wf });
    } else {
      setBuilderData({
        name: '',
        description: '',
        category: 'vehicle_return',
        trigger: { type: 'vehicle_returned' },
        conditions: [],
        actions: [{ type: 'create_task', config: {} }],
        scope: { type: 'organization' },
        status: 'DRAFT',
      });
    }
    setView('builder');
  };

  const handleSave = async () => {
    if (!orgId || !builderData?.name || !builderData.category || !builderData.trigger || !builderData.actions?.length) return;
    setSaving(true);
    try {
      const payload = {
        name: builderData.name,
        description: builderData.description || '',
        category: builderData.category,
        trigger: builderData.trigger,
        conditions: builderData.conditions || [],
        actions: builderData.actions,
        scope: builderData.scope || { type: 'organization' },
        status: builderData.status || 'DRAFT',
      };
      if (builderData.id) {
        await api.workflows.update(orgId, builderData.id, payload);
      } else {
        await api.workflows.create(orgId, payload);
      }
      setView('list');
      loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ──────────────────────────────────

  if (view === 'detail' && selectedWorkflow) return (
    <DetailView
      wf={selectedWorkflow}
      orgId={orgId}
      isDarkMode={isDarkMode}
      canWrite={canWrite}
      onBack={() => { setView('list'); setSelectedWorkflow(null); }}
      onEdit={() => openBuilder(selectedWorkflow)}
      onToggle={() => handleToggle(selectedWorkflow)}
      onDuplicate={() => handleDuplicate(selectedWorkflow)}
      onDelete={() => handleDelete(selectedWorkflow)}
      onRefresh={loadData}
    />
  );

  if (view === 'builder' && builderData) return (
    <BuilderView
      data={builderData}
      setData={setBuilderData}
      isDarkMode={isDarkMode}
      saving={saving}
      onSave={handleSave}
      onCancel={() => setView('list')}
    />
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="min-w-0 truncate font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">Workflow Automation</h1>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide ${isDarkMode ? 'bg-status-info-soft text-status-info' : 'bg-blue-50 text-blue-700'}`}>
              Beta Runtime
            </span>
          </div>
          <p className={`text-xs mt-0.5 ${textSecondary}`}>
            Tenant-scoped automation with real execution logs — manual test and booking return hooks active
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${cardBorder} ${cardBg} ${textPrimary} ${hoverBg} transition-colors`}
            >
              <Icon name="layers" className="w-3.5 h-3.5" />
              Templates
              {showTemplates ? <Icon name="chevron-up" className="w-3 h-3" /> : <Icon name="chevron-down" className="w-3 h-3" />}
            </button>
            <button
              onClick={() => openBuilder()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <Icon name="plus" className="w-3.5 h-3.5" />
              New Workflow
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Workflows', value: stats.total, icon: Layers, color: 'blue' },
          { label: 'Active', value: stats.active, icon: Play, color: 'green' },
          { label: 'Runs (24h)', value: stats.runsLast24h ?? 0, icon: Zap, color: 'cyan' },
          { label: 'Failed runs', value: stats.failedRuns ?? 0, icon: Pause, color: 'red' },
        ].map((s) => {
          const colors: Record<string, string> = {
            blue: isDarkMode ? 'text-brand' : 'text-blue-600',
            green: isDarkMode ? 'text-green-400' : 'text-green-600',
            amber: isDarkMode ? 'text-amber-400' : 'text-amber-600',
            gray: isDarkMode ? 'text-gray-400' : 'text-gray-500',
            cyan: isDarkMode ? 'text-cyan-400' : 'text-cyan-600',
            red: isDarkMode ? 'text-red-400' : 'text-red-600',
          };
          return (
            <div key={s.label} className={`${cardBg} border ${cardBorder} rounded-xl p-3`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[10px] uppercase tracking-wider font-semibold ${textSecondary}`}>{s.label}</span>
                <s.icon className={`w-3.5 h-3.5 ${colors[s.color]}`} />
              </div>
              <p className={`text-xl font-bold ${textPrimary}`}>{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* Templates Section */}
      {showTemplates && (
        <div className={`${cardBg} border ${cardBorder} rounded-xl p-4`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon name="sparkles" className={`w-4 h-4 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
              <span className={`text-sm font-semibold ${textPrimary}`}>Starter Templates</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isDarkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
                {STARTER_TEMPLATES.length} ready
              </span>
            </div>
            <button onClick={() => setShowTemplates(false)} className={`p-1 rounded ${hoverBg}`}>
              <Icon name="x" className={`w-3.5 h-3.5 ${textSecondary}`} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {STARTER_TEMPLATES.map((t, i) => {
              const cat = getCategoryMeta(t.category);
              const CatIcon = cat.icon;
              const catColors: Record<string, string> = {
                blue: 'text-blue-500', green: 'text-green-500', cyan: 'text-cyan-500',
                orange: 'text-orange-500', red: 'text-red-500', purple: 'text-purple-500', yellow: 'text-yellow-500',
              };
              return (
                <button
                  key={i}
                  onClick={() => openBuilder(null, t)}
                  className={`text-left p-3 rounded-lg border ${cardBorder} ${hoverBg} transition-colors group`}
                >
                  <div className="flex items-start gap-2">
                    <CatIcon className={`w-4 h-4 mt-0.5 shrink-0 ${catColors[cat.color] || 'text-gray-500'}`} />
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${textPrimary} truncate group-hover:text-blue-500 transition-colors`}>{t.name}</p>
                      <p className={`text-[10px] mt-0.5 ${textSecondary} line-clamp-2`}>{t.description}</p>
                      <div className="flex items-center gap-1 mt-1.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                          {cat.label}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                          {t.actions.length} action{t.actions.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Icon name="search" className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ${textSecondary}`} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search workflows..."
            className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border ${inputBg} focus:outline-none focus:ring-1 focus:ring-blue-500`}
          />
        </div>
        <div className="flex items-center gap-1">
          <Icon name="filter" className={`w-3 h-3 ${textSecondary}`} />
          {[
            { key: 'all', label: 'All' },
            { key: 'ACTIVE', label: 'Active' },
            { key: 'DRAFT', label: 'Draft' },
            { key: 'DISABLED', label: 'Disabled' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                statusFilter === f.key
                  ? 'bg-blue-600 text-white'
                  : `${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {[{ key: 'all', label: 'All Types' }, ...CATEGORIES.map((c) => ({ key: c.key, label: c.label }))].map((c) => (
            <button
              key={c.key}
              onClick={() => setCategoryFilter(c.key)}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                categoryFilter === c.key
                  ? 'bg-blue-600 text-white'
                  : `${isDarkMode ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Workflow List */}
      {loading ? (
        <div className={`${cardBg} border ${cardBorder} rounded-xl p-12 text-center`}>
          <Icon name="refresh-cw" className={`w-6 h-6 mx-auto mb-2 animate-spin ${textSecondary}`} />
          <p className={`text-xs ${textSecondary}`}>Loading workflows...</p>
        </div>
      ) : filtered.length === 0 ? (
        workflows.length > 0 ? (
          <EmptyState
            icon={<Icon name="search" className="w-8 h-8" />}
            title="No workflows match your filters"
            description="Try adjusting your search or filter criteria"
            compact
          />
        ) : (
          <EmptyState
            icon={<Icon name="zap" className="w-6 h-6" />}
            title="No workflows yet"
            description="Create your first automation to streamline fleet operations — from return protocols and cleaning workflows to geofence alerts and AI-powered actions."
            action={
              canWrite ? (
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTemplates(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border text-foreground hover:bg-muted"
                  >
                    <Icon name="layers" className="w-3.5 h-3.5" /> Browse Templates
                  </button>
                  <button
                    type="button"
                    onClick={() => openBuilder()}
                    className="sq-cta flex items-center gap-1.5 px-3 py-1.5 text-xs"
                  >
                    <Icon name="plus" className="w-3.5 h-3.5" /> New Workflow
                  </button>
                </div>
              ) : undefined
            }
          />
        )
      ) : (
        <div className="space-y-1.5">
          {filtered.map((wf) => (
            <WorkflowRow
              key={wf.id}
              wf={wf}
              isDarkMode={isDarkMode}
              canWrite={canWrite}
              onOpen={() => openDetail(wf)}
              onEdit={() => openBuilder(wf)}
              onToggle={() => handleToggle(wf)}
              onDuplicate={() => handleDuplicate(wf)}
              onDelete={() => handleDelete(wf)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── WorkflowRow ─────────────────────────────────

function WorkflowRow({ wf, isDarkMode, canWrite, onOpen, onEdit, onToggle, onDuplicate, onDelete }: {
  wf: Workflow; isDarkMode: boolean; canWrite: boolean;
  onOpen: () => void; onEdit: () => void; onToggle: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const cat = getCategoryMeta(wf.category);
  const CatIcon = cat.icon;
  const st = STATUS_CONFIG[wf.status] || STATUS_CONFIG.DRAFT;
  const cardBg = isDarkMode ? 'bg-[#1e1e2e]' : 'bg-white';
  const cardBorder = isDarkMode ? 'border-gray-700/50' : 'border-gray-200';
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const hoverBg = isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50';

  const catColors: Record<string, string> = {
    blue: isDarkMode ? 'text-brand' : 'text-blue-600',
    green: isDarkMode ? 'text-green-400' : 'text-green-600',
    cyan: isDarkMode ? 'text-cyan-400' : 'text-cyan-600',
    orange: isDarkMode ? 'text-orange-400' : 'text-orange-600',
    red: isDarkMode ? 'text-red-400' : 'text-red-600',
    purple: isDarkMode ? 'text-purple-400' : 'text-purple-600',
    yellow: isDarkMode ? 'text-yellow-400' : 'text-yellow-600',
  };

  const isAi = wf.category === 'ai_permissions' || wf.actions?.some((a: ActionDef) => a.type.startsWith('ai_'));

  return (
    <div className={`${cardBg} border ${cardBorder} rounded-xl p-3 ${hoverBg} transition-colors cursor-pointer group`} onClick={onOpen}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
          <CatIcon className={`w-4 h-4 ${catColors[cat.color] || 'text-gray-500'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-semibold ${textPrimary} truncate`}>{wf.name}</p>
            {isAi && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${isDarkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
                AI
              </span>
            )}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.bgClass} ${st.textClass}`}>
              {st.label}
            </span>
          </div>
          <div className={`flex items-center gap-3 mt-0.5 text-[10px] ${textSecondary}`}>
            <span className="flex items-center gap-1">
              <Icon name="target" className="w-3 h-3" /> {getTriggerLabel(wf.trigger?.type)}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="zap" className="w-3 h-3" /> {wf.actions?.length || 0} action{(wf.actions?.length || 0) !== 1 ? 's' : ''}
            </span>
            <span>{cat.label}</span>
            {wf.lastTriggeredAt && (
              <span className="flex items-center gap-1">
                <Icon name="clock" className="w-3 h-3" /> Last: {relativeTime(wf.lastTriggeredAt)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          {canWrite && (
            <>
              <button onClick={onToggle} className={`p-1.5 rounded-md ${hoverBg}`} title={wf.status === 'ACTIVE' ? 'Disable' : 'Enable'}>
                {wf.status === 'ACTIVE' ? <Icon name="pause" className="w-3.5 h-3.5 text-amber-500" /> : <Icon name="play" className="w-3.5 h-3.5 text-green-500" />}
              </button>
              <button onClick={onEdit} className={`p-1.5 rounded-md ${hoverBg}`} title="Edit">
                <Icon name="edit-3" className={`w-3.5 h-3.5 ${textSecondary}`} />
              </button>
              <button onClick={onDuplicate} className={`p-1.5 rounded-md ${hoverBg}`} title="Duplicate">
                <Icon name="copy" className={`w-3.5 h-3.5 ${textSecondary}`} />
              </button>
              <button onClick={onDelete} className={`p-1.5 rounded-md ${hoverBg}`} title="Delete">
                <Icon name="trash-2" className="w-3.5 h-3.5 text-red-400" />
              </button>
            </>
          )}
          <button onClick={onOpen} className={`p-1.5 rounded-md ${hoverBg}`} title="Details">
            <Icon name="eye" className={`w-3.5 h-3.5 ${textSecondary}`} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DetailView ──────────────────────────────────

function DetailView({ wf, orgId, isDarkMode, canWrite, onBack, onEdit, onToggle, onDuplicate, onDelete, onRefresh }: {
  wf: Workflow; orgId: string | null; isDarkMode: boolean; canWrite: boolean;
  onBack: () => void; onEdit: () => void; onToggle: () => void; onDuplicate: () => void; onDelete: () => void;
  onRefresh: () => void;
}) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    setRunsLoading(true);
    api.workflows.listRuns(orgId, wf.id, 15)
      .then((rows) => setRuns(rows as WorkflowRun[]))
      .catch(() => setRuns([]))
      .finally(() => setRunsLoading(false));
  }, [orgId, wf.id]);

  const handleTest = async () => {
    if (!orgId) return;
    setTesting(true);
    setTestError(null);
    try {
      const result = await api.workflows.test(orgId, wf.id, {
        payload: { manualTest: true, workflowName: wf.name },
      });
      if (result.runs?.length) {
        setRuns((prev) => [...(result.runs as WorkflowRun[]), ...prev]);
      } else {
        setTestError(result.message || 'Workflow was skipped (conditions/scope)');
      }
      onRefresh();
    } catch (e) {
      setTestError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };
  const cat = getCategoryMeta(wf.category);
  const CatIcon = cat.icon;
  const st = STATUS_CONFIG[wf.status] || STATUS_CONFIG.DRAFT;
  const cardBg = isDarkMode ? 'bg-[#1e1e2e]' : 'bg-white';
  const cardBorder = isDarkMode ? 'border-gray-700/50' : 'border-gray-200';
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const labelClass = `text-[10px] uppercase tracking-wider font-semibold ${textSecondary}`;
  const valueClass = `text-xs font-medium ${textPrimary}`;
  const isAi = wf.category === 'ai_permissions' || wf.actions?.some((a: ActionDef) => a.type.startsWith('ai_'));

  const catColors: Record<string, string> = {
    blue: isDarkMode ? 'text-brand' : 'text-blue-600',
    green: isDarkMode ? 'text-green-400' : 'text-green-600',
    cyan: isDarkMode ? 'text-cyan-400' : 'text-cyan-600',
    orange: isDarkMode ? 'text-orange-400' : 'text-orange-600',
    red: isDarkMode ? 'text-red-400' : 'text-red-600',
    purple: isDarkMode ? 'text-purple-400' : 'text-purple-600',
    yellow: isDarkMode ? 'text-yellow-400' : 'text-yellow-600',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={`p-1.5 rounded-lg ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-100'}`}>
            <Icon name="arrow-left" className={`w-4 h-4 ${textSecondary}`} />
          </button>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
            <CatIcon className={`w-5 h-5 ${catColors[cat.color]}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className={`text-lg font-bold ${textPrimary}`}>{wf.name}</h2>
              {isAi && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${isDarkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>AI</span>
              )}
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.bgClass} ${st.textClass}`}>{st.label}</span>
            </div>
            <p className={`text-xs ${textSecondary}`}>{wf.description || 'No description'}</p>
          </div>
        </div>
        {canWrite && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleTest}
              disabled={testing}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${cardBorder} ${cardBg} ${textPrimary} ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'} disabled:opacity-50`}
            >
              <Icon name="play" className="w-3.5 h-3.5 text-blue-500" />
              {testing ? 'Testing…' : 'Test workflow'}
            </button>
            <button onClick={onToggle} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${cardBorder} ${cardBg} ${textPrimary} ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}>
              {wf.status === 'ACTIVE' ? <><Icon name="pause" className="w-3.5 h-3.5 text-amber-500" /> Disable</> : <><Icon name="play" className="w-3.5 h-3.5 text-green-500" /> Enable</>}
            </button>
            <button onClick={onEdit} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700">
              <Icon name="edit-3" className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={onDuplicate} className={`p-1.5 rounded-lg border ${cardBorder} ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}>
              <Icon name="copy" className={`w-3.5 h-3.5 ${textSecondary}`} />
            </button>
            <button onClick={onDelete} className={`p-1.5 rounded-lg border ${cardBorder} ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}>
              <Icon name="trash-2" className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        )}
      </div>

      {/* AI Warning */}
      {isAi && (
        <div className={`flex items-start gap-2 p-3 rounded-xl border ${isDarkMode ? 'bg-purple-900/10 border-purple-800/30' : 'bg-purple-50 border-purple-200'}`}>
          <Icon name="shield" className={`w-4 h-4 mt-0.5 shrink-0 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
          <div>
            <p className={`text-xs font-semibold ${isDarkMode ? 'text-purple-300' : 'text-purple-800'}`}>AI Permission Workflow</p>
            <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>
              This workflow grants AI special execution rights. Actions involving customer communication or booking require approval gating.
              {wf.actions?.some((a: ActionDef) => a.type === 'request_approval') &&
                ' Approval step is configured.'}
            </p>
          </div>
        </div>
      )}

      {testError && (
        <div className={`text-xs px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-amber-900/20 border-amber-800/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          {testError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Metadata */}
        <div className={`${cardBg} border ${cardBorder} rounded-xl p-4`}>
          <p className={`text-xs font-semibold ${textPrimary} mb-3`}>Details</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <div><p className={labelClass}>Category</p><p className={valueClass}>{cat.label}</p></div>
            <div><p className={labelClass}>Status</p><p className={valueClass}>{st.label}</p></div>
            <div><p className={labelClass}>Scope</p><p className={valueClass}>{SCOPE_TYPES.find((s) => s.key === wf.scope?.type)?.label || wf.scope?.type}</p></div>
            <div><p className={labelClass}>Triggered</p><p className={valueClass}>{wf.triggerCount}×</p></div>
            <div><p className={labelClass}>Created by</p><p className={valueClass}>{wf.createdByName || '—'}</p></div>
            <div><p className={labelClass}>Created</p><p className={valueClass}>{new Date(wf.createdAt).toLocaleDateString('de-DE')}</p></div>
            <div><p className={labelClass}>Last updated</p><p className={valueClass}>{relativeTime(wf.updatedAt)}</p></div>
            <div><p className={labelClass}>Last triggered</p><p className={valueClass}>{relativeTime(wf.lastTriggeredAt)}</p></div>
          </div>
        </div>

        {/* Logic Summary */}
        <div className={`${cardBg} border ${cardBorder} rounded-xl p-4`}>
          <p className={`text-xs font-semibold ${textPrimary} mb-3`}>Workflow Logic</p>
          {/* Trigger */}
          <div className={`flex items-start gap-2 mb-3 p-2 rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
            <Icon name="target" className={`w-4 h-4 mt-0.5 shrink-0 ${isDarkMode ? 'text-brand' : 'text-blue-600'}`} />
            <div>
              <p className={labelClass}>Trigger</p>
              <p className={`text-xs font-medium ${textPrimary}`}>{getTriggerLabel(wf.trigger?.type)}</p>
              {wf.trigger?.config && Object.keys(wf.trigger.config).length > 0 && (
                <p className={`text-[10px] mt-0.5 ${textSecondary}`}>
                  {Object.entries(wf.trigger.config).map(([k, v]) => `${k}: ${v}`).join(', ')}
                </p>
              )}
            </div>
          </div>
          {/* Conditions */}
          {wf.conditions && wf.conditions.length > 0 && (
            <div className="mb-3">
              <p className={`${labelClass} mb-1`}>Conditions</p>
              {wf.conditions.map((c: ConditionDef, i: number) => (
                <div key={i} className={`flex items-center gap-1.5 text-[11px] ${textSecondary} mb-0.5`}>
                  <Icon name="filter" className="w-3 h-3" />
                  <span>{getFieldLabel(c.field ?? c.path ?? '')} {getOperatorLabel(c.operator)} <strong className={textPrimary}>{String(c.value)}</strong></span>
                </div>
              ))}
            </div>
          )}
          {/* Actions */}
          <p className={`${labelClass} mb-1`}>Actions ({wf.actions?.length || 0})</p>
          {wf.actions?.map((a: ActionDef, i: number) => {
            const Icon = getActionIcon(a.type);
            return (
              <div key={i} className={`flex items-start gap-2 mb-1.5 p-2 rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${a.type.startsWith('ai_') ? (isDarkMode ? 'text-purple-400' : 'text-purple-600') : (isDarkMode ? 'text-green-400' : 'text-green-600')}`} />
                <div>
                  <p className={`text-xs font-medium ${textPrimary}`}>{getActionLabel(a.type)}</p>
                  {a.config && Object.keys(a.config).length > 0 && (
                    <p className={`text-[10px] ${textSecondary}`}>
                      {Object.entries(a.config).map(([k, v]) => `${k}: ${String(v)}`).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Execution history */}
      <div className={`${cardBg} border ${cardBorder} rounded-xl p-4`}>
        <div className="flex items-center justify-between mb-3">
          <p className={`text-xs font-semibold ${textPrimary}`}>Execution history</p>
          <span className={`text-[10px] ${textSecondary}`}>{wf.triggerCount} total triggers</span>
        </div>
        {runsLoading ? (
          <p className={`text-xs ${textSecondary}`}>Loading runs…</p>
        ) : runs.length === 0 ? (
          <p className={`text-xs ${textSecondary}`}>Noch keine Ausführungen vorhanden.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => {
              const rs = RUN_STATUS_CONFIG[run.status] || RUN_STATUS_CONFIG.PENDING;
              return (
                <div key={run.id} className={`p-2.5 rounded-lg border ${cardBorder} ${isDarkMode ? 'bg-white/[0.02]' : 'bg-gray-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${rs.bgClass} ${rs.textClass}`}>{rs.label}</span>
                      <span className={`text-xs font-medium truncate ${textPrimary}`}>{run.eventType}</span>
                      {run.entityId && (
                        <span className={`text-[10px] truncate ${textSecondary}`}>{run.entityType}:{run.entityId.slice(0, 8)}…</span>
                      )}
                    </div>
                    <span className={`text-[10px] shrink-0 ${textSecondary}`}>{relativeTime(run.createdAt)}</span>
                  </div>
                  {run.errorMessage && (
                    <p className={`text-[10px] mt-1 text-red-500`}>{run.errorMessage}</p>
                  )}
                  {run.actionRuns && run.actionRuns.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {run.actionRuns.map((ar) => {
                        const ars = RUN_STATUS_CONFIG[ar.status] || RUN_STATUS_CONFIG.PENDING;
                        return (
                          <span key={ar.id} className={`text-[9px] px-1.5 py-0.5 rounded ${ars.bgClass} ${ars.textClass}`}>
                            {ar.actionType} — {ars.label}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BuilderView ─────────────────────────────────

function BuilderView({ data, setData, isDarkMode, saving, onSave, onCancel }: {
  data: Partial<Workflow>; setData: (d: Partial<Workflow> | null) => void;
  isDarkMode: boolean; saving: boolean; onSave: () => void; onCancel: () => void;
}) {
  const cardBg = isDarkMode ? 'bg-[#1e1e2e]' : 'bg-white';
  const cardBorder = isDarkMode ? 'border-gray-700/50' : 'border-gray-200';
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const inputBg = isDarkMode ? 'bg-[#2a2a3e] border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900';
  const labelClass = `text-[10px] uppercase tracking-wider font-semibold ${textSecondary} mb-1 block`;
  const sectionClass = `${cardBg} border ${cardBorder} rounded-xl p-4`;
  const hoverBg = isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50';

  const update = (patch: Partial<Workflow>) => setData({ ...data, ...patch });

  const addCondition = () => {
    const current = (data.conditions || []) as ConditionDef[];
    update({ conditions: [...current, { field: 'vehicle_status', operator: 'equals', value: '' }] });
  };
  const updateCondition = (idx: number, patch: Partial<ConditionDef>) => {
    const current = [...(data.conditions || [])] as ConditionDef[];
    current[idx] = { ...current[idx], ...patch };
    update({ conditions: current });
  };
  const removeCondition = (idx: number) => {
    const current = [...(data.conditions || [])] as ConditionDef[];
    current.splice(idx, 1);
    update({ conditions: current });
  };

  const addAction = () => {
    const current = (data.actions || []) as ActionDef[];
    update({ actions: [...current, { type: 'create_task', config: {} }] });
  };
  const updateAction = (idx: number, patch: Partial<ActionDef>) => {
    const current = [...(data.actions || [])] as ActionDef[];
    current[idx] = { ...current[idx], ...patch };
    update({ actions: current });
  };
  const removeAction = (idx: number) => {
    const current = [...(data.actions || [])] as ActionDef[];
    current.splice(idx, 1);
    update({ actions: current });
  };

  const isAiAction = (data.actions || []).some((a: ActionDef) => a.type.startsWith('ai_'));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className={`p-1.5 rounded-lg ${hoverBg}`}>
            <Icon name="arrow-left" className={`w-4 h-4 ${textSecondary}`} />
          </button>
          <h2 className={`text-lg font-bold ${textPrimary}`}>{data.id ? 'Edit Workflow' : 'Create Workflow'}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${cardBorder} ${textSecondary} ${hoverBg}`}>
            Cancel
          </button>
          <select
            value={data.status || 'DRAFT'}
            onChange={(e) => update({ status: e.target.value })}
            className={`px-2 py-1.5 rounded-lg text-xs border ${inputBg} focus:outline-none`}
          >
            <option value="DRAFT">Save as Draft</option>
            <option value="ACTIVE">Save & Activate</option>
            <option value="DISABLED">Save as Disabled</option>
          </select>
          <button
            onClick={onSave}
            disabled={saving || !data.name}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Workflow'}
          </button>
        </div>
      </div>

      {/* AI Warning */}
      {isAiAction && (
        <div className={`flex items-start gap-2 p-3 rounded-xl border ${isDarkMode ? 'bg-purple-900/10 border-purple-800/30' : 'bg-purple-50 border-purple-200'}`}>
          <Icon name="shield" className={`w-4 h-4 mt-0.5 shrink-0 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
          <div>
            <p className={`text-xs font-semibold ${isDarkMode ? 'text-purple-300' : 'text-purple-800'}`}>AI Actions Detected</p>
            <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>
              This workflow includes AI-powered actions. For customer-facing actions (messaging, bookings), consider adding an "Request approval" action first.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Left: Basic info */}
        <div className="space-y-4">
          <div className={sectionClass}>
            <p className={`text-xs font-semibold ${textPrimary} mb-3`}>Basic Information</p>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Workflow Name</label>
                <input
                  value={data.name || ''}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="e.g. Auto-Clean on Return"
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border ${inputBg} focus:outline-none focus:ring-1 focus:ring-blue-500`}
                />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  value={data.description || ''}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="Describe what this workflow does..."
                  rows={2}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border ${inputBg} focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none`}
                />
              </div>
              <div>
                <label className={labelClass}>Category</label>
                <select
                  value={data.category || 'vehicle_return'}
                  onChange={(e) => update({ category: e.target.value })}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border ${inputBg} focus:outline-none`}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Scope</label>
                <select
                  value={(data.scope as ScopeDef)?.type || 'organization'}
                  onChange={(e) => update({ scope: { type: e.target.value } as ScopeDef })}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border ${inputBg} focus:outline-none`}
                >
                  {SCOPE_TYPES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Trigger */}
          <div className={sectionClass}>
            <div className="flex items-center gap-2 mb-3">
              <Icon name="target" className={`w-4 h-4 ${isDarkMode ? 'text-brand' : 'text-blue-600'}`} />
              <p className={`text-xs font-semibold ${textPrimary}`}>Trigger</p>
            </div>
            <select
              value={(data.trigger as TriggerDef)?.type || 'vehicle_returned'}
              onChange={(e) => update({ trigger: { type: e.target.value, config: (data.trigger as TriggerDef)?.config || {} } })}
              className={`w-full px-3 py-1.5 text-xs rounded-lg border ${inputBg} focus:outline-none`}
            >
              {TRIGGER_TYPES.map((t) => (
                <option key={t.key} value={t.key}>{t.label} ({getCategoryMeta(t.category).label})</option>
              ))}
            </select>
            <TriggerConfigEditor
              trigger={(data.trigger as TriggerDef) || { type: 'vehicle_returned' }}
              onChange={(t) => update({ trigger: t })}
              isDarkMode={isDarkMode}
            />
          </div>
        </div>

        {/* Right: Conditions & Actions */}
        <div className="space-y-4">
          {/* Conditions */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="filter" className={`w-4 h-4 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                <p className={`text-xs font-semibold ${textPrimary}`}>Conditions</p>
                <span className={`text-[9px] ${textSecondary}`}>optional</span>
              </div>
              <button onClick={addCondition} className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${isDarkMode ? 'text-brand hover:bg-brand-soft' : 'text-blue-600 hover:bg-blue-50'}`}>
                <Icon name="plus" className="w-3 h-3" /> Add
              </button>
            </div>
            {((data.conditions || []) as ConditionDef[]).length === 0 ? (
              <p className={`text-[11px] ${textSecondary} text-center py-3`}>No conditions — workflow triggers for all matching events</p>
            ) : (
              <div className="space-y-2">
                {((data.conditions || []) as ConditionDef[]).map((c: ConditionDef, i: number) => (
                  <div key={i} className={`flex items-center gap-1.5 p-2 rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                    <select value={c.field} onChange={(e) => updateCondition(i, { field: e.target.value })} className={`flex-1 px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
                      {CONDITION_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <select value={c.operator} onChange={(e) => updateCondition(i, { operator: e.target.value })} className={`px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
                      {CONDITION_OPERATORS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                    <input value={String(c.value)} onChange={(e) => updateCondition(i, { value: e.target.value })} placeholder="Value" className={`w-24 px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
                    <button onClick={() => removeCondition(i)} className="p-0.5"><Icon name="x" className="w-3 h-3 text-red-400" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="zap" className={`w-4 h-4 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                <p className={`text-xs font-semibold ${textPrimary}`}>Actions</p>
              </div>
              <button onClick={addAction} className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${isDarkMode ? 'text-brand hover:bg-brand-soft' : 'text-blue-600 hover:bg-blue-50'}`}>
                <Icon name="plus" className="w-3 h-3" /> Add
              </button>
            </div>
            {((data.actions || []) as ActionDef[]).length === 0 ? (
              <p className={`text-[11px] ${textSecondary} text-center py-3`}>Add at least one action</p>
            ) : (
              <div className="space-y-2">
                {((data.actions || []) as ActionDef[]).map((a: ActionDef, i: number) => {
                  const Icon = getActionIcon(a.type);
                  return (
                    <div key={i} className={`p-2 rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Icon className={`w-3.5 h-3.5 ${a.type.startsWith('ai_') ? 'text-purple-500' : isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                        <select value={a.type} onChange={(e) => updateAction(i, { type: e.target.value, config: {} })} className={`flex-1 px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
                          {ACTION_TYPES.map((at) => (
                            <option key={at.key} value={at.key} disabled={'comingSoon' in at && at.comingSoon}>
                              {at.label}{'comingSoon' in at && at.comingSoon ? ' (Coming soon)' : ''}
                            </option>
                          ))}
                        </select>
                        <button onClick={() => removeAction(i)} className="p-0.5"><Icon name="x" className="w-3 h-3 text-red-400" /></button>
                      </div>
                      <ActionConfigEditor action={a} onChange={(updated) => updateAction(i, updated)} isDarkMode={isDarkMode} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TriggerConfigEditor ─────────────────────────

function TriggerConfigEditor({ trigger, onChange, isDarkMode }: {
  trigger: TriggerDef; onChange: (t: TriggerDef) => void; isDarkMode: boolean;
}) {
  const inputBg = isDarkMode ? 'bg-[#2a2a3e] border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const labelClass = `text-[10px] ${textSecondary} mb-0.5 block mt-2`;

  const updateConfig = (key: string, value: any) => {
    onChange({ ...trigger, config: { ...(trigger.config || {}), [key]: value } });
  };

  switch (trigger.type) {
    case 'geofence_exit':
      return (
        <div>
          <label className={labelClass}>Territory name</label>
          <input value={trigger.config?.territoryName || ''} onChange={(e) => updateConfig('territoryName', e.target.value)} placeholder="e.g. City Center" className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
        </div>
      );
    case 'geofence_dwell':
      return (
        <div>
          <label className={labelClass}>Duration outside territory (minutes)</label>
          <input type="number" value={trigger.config?.durationMinutes || 120} onChange={(e) => updateConfig('durationMinutes', parseInt(e.target.value, 10))} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
        </div>
      );
    case 'health_threshold':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Metric</label>
            <select value={trigger.config?.metric || 'overall'} onChange={(e) => updateConfig('metric', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="overall">Overall health</option>
              <option value="tires">Tires</option>
              <option value="brakes">Brakes</option>
              <option value="engine">Engine</option>
              <option value="battery">Battery</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Threshold (%)</label>
            <input type="number" value={trigger.config?.threshold || 60} onChange={(e) => updateConfig('threshold', parseInt(e.target.value, 10))} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
          </div>
        </div>
      );
    case 'compliance_expiring':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Compliance type</label>
            <select value={trigger.config?.type || 'tuev'} onChange={(e) => updateConfig('type', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="tuev">TÜV</option>
              <option value="bokraft">BOKraft</option>
              <option value="insurance">Insurance</option>
              <option value="permit">Permit</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Days before expiry</label>
            <input type="number" value={trigger.config?.daysBefore || 30} onChange={(e) => updateConfig('daysBefore', parseInt(e.target.value, 10))} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
          </div>
        </div>
      );
    case 'invoice_overdue':
      return (
        <div>
          <label className={labelClass}>Overdue threshold (days)</label>
          <input type="number" value={trigger.config?.overdueDays || 14} onChange={(e) => updateConfig('overdueDays', parseInt(e.target.value, 10))} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
        </div>
      );
    case 'support_escalation':
      return (
        <div>
          <label className={labelClass}>Hours unanswered</label>
          <input type="number" value={trigger.config?.hoursUnanswered || 4} onChange={(e) => updateConfig('hoursUnanswered', parseInt(e.target.value, 10))} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
        </div>
      );
    case 'task_escalation':
      return (
        <div>
          <label className={labelClass}>Hours until escalation</label>
          <input type="number" value={trigger.config?.hoursUntilEscalation || 24} onChange={(e) => updateConfig('hoursUntilEscalation', parseInt(e.target.value, 10))} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
        </div>
      );
    case 'ai_action_request':
      return (
        <div>
          <label className={labelClass}>AI action type</label>
          <select value={trigger.config?.actionType || 'create_task'} onChange={(e) => updateConfig('actionType', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
            <option value="create_task">Create task</option>
            <option value="send_message">Send customer message</option>
            <option value="book_appointment">Book appointment</option>
            <option value="update_status">Update vehicle status</option>
            <option value="contact_vendor">Contact vendor</option>
          </select>
        </div>
      );
    case 'schedule':
      return (
        <div>
          <label className={labelClass}>Schedule interval</label>
          <select value={trigger.config?.interval || 'daily'} onChange={(e) => updateConfig('interval', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      );
    default:
      return null;
  }
}

// ─── ActionConfigEditor ──────────────────────────

function ActionConfigEditor({ action, onChange, isDarkMode }: {
  action: ActionDef; onChange: (a: Partial<ActionDef>) => void; isDarkMode: boolean;
}) {
  const inputBg = isDarkMode ? 'bg-[#2a2a3e] border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const labelClass = `text-[10px] ${textSecondary} mb-0.5 block`;

  const updateConfig = (key: string, value: any) => {
    onChange({ config: { ...(action.config || {}), [key]: value } });
  };

  switch (action.type) {
    case 'create_task':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Task title</label>
            <input value={action.config?.title || ''} onChange={(e) => updateConfig('title', e.target.value)} placeholder="Task title" className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
          </div>
          <div>
            <label className={labelClass}>Priority</label>
            <select value={action.config?.priority || 'NORMAL'} onChange={(e) => updateConfig('priority', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
        </div>
      );
    case 'create_alert':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Severity</label>
            <select value={action.config?.severity || 'warning'} onChange={(e) => updateConfig('severity', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Message</label>
            <input value={action.config?.message || ''} onChange={(e) => updateConfig('message', e.target.value)} placeholder="Alert message" className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
          </div>
        </div>
      );
    case 'change_cleaning_status':
      return (
        <div>
          <label className={labelClass}>Set status to</label>
          <select value={action.config?.status || 'NEEDS_CLEANING'} onChange={(e) => updateConfig('status', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
            <option value="NEEDS_CLEANING">Needs Cleaning</option>
            <option value="CLEAN">Clean</option>
          </select>
        </div>
      );
    case 'change_vehicle_status':
      return (
        <div>
          <label className={labelClass}>Set status to</label>
          <select value={action.config?.status || 'OUT_OF_SERVICE'} onChange={(e) => updateConfig('status', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
            <option value="AVAILABLE">Available</option>
            <option value="RENTED">Rented</option>
            <option value="IN_SERVICE">In Service</option>
            <option value="OUT_OF_SERVICE">Out of Service</option>
            <option value="RESERVED">Reserved</option>
          </select>
        </div>
      );
    case 'send_notification':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Target</label>
            <select value={action.config?.target || 'admin'} onChange={(e) => updateConfig('target', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="admin">Organization Admin</option>
              <option value="assignee">Assigned User</option>
              <option value="all">All Users</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Message</label>
            <input value={action.config?.message || ''} onChange={(e) => updateConfig('message', e.target.value)} placeholder="Notification text" className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
          </div>
        </div>
      );
    case 'ai_execute':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Permission</label>
            <select value={action.config?.permission || 'create_task'} onChange={(e) => updateConfig('permission', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="create_task">Create task</option>
              <option value="update_status">Update vehicle status</option>
              <option value="send_message">Send message</option>
              <option value="book_appointment">Book appointment</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Require approval</label>
            <select value={action.config?.requireApproval ? 'true' : 'false'} onChange={(e) => updateConfig('requireApproval', e.target.value === 'true')} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="false">No — execute immediately</option>
              <option value="true">Yes — require approval first</option>
            </select>
          </div>
        </div>
      );
    case 'ai_send_message':
      return (
        <div>
          <label className={labelClass}>Channel</label>
          <select value={action.config?.channel || 'whatsapp'} onChange={(e) => updateConfig('channel', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
          </select>
        </div>
      );
    case 'request_approval':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>Approver role</label>
            <select value={action.config?.approverRole || 'ORG_ADMIN'} onChange={(e) => updateConfig('approverRole', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="ORG_ADMIN">Organization Admin</option>
              <option value="SUB_ADMIN">Sub Admin</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Approval message</label>
            <input value={action.config?.message || ''} onChange={(e) => updateConfig('message', e.target.value)} placeholder="What needs approval?" className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
          </div>
        </div>
      );
    default:
      return null;
  }
}

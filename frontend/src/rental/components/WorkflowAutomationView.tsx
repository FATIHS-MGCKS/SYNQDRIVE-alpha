import { Bell, Bot, Calendar, Car, ClipboardList, CreditCard, Edit3, Headphones, Layers, MapPin, Pause, Play, Shield, Sparkles, Truck, Wrench, Zap } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useMemo, useCallback } from 'react';

import { api } from '../../lib/api';
import type { WorkflowListItemDto } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { EmptyState } from '../../components/patterns';
import { TaskAutomationRulesSection } from './workflow-automation/TaskAutomationRulesSection';
import { WorkflowOverviewSection } from './workflow-automation/WorkflowOverviewSection';
import {
  at,
  automationFormattingLocaleOrDefault,
  formatLegacyRelativeTime,
  legacyActionTypeLabel,
  legacyCategoryLabel,
  legacyConditionFieldLabel,
  legacyConditionOperatorLabel,
  legacyRunStatusLabel,
  legacyScopeLabel,
  legacyTriggerLabel,
  legacyWorkflowStatusLabel,
  labelTaskAutomationPriority,
} from './workflow-automation/automation-i18n';

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
  statusLabel?: string;
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
interface ConditionDef { field?: string; path?: string; operator: string; value?: any; }
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

interface WorkflowChangeRequest {
  id: string;
  status: string;
  operation: string;
  makerUserId: string;
  checkerUserId?: string | null;
  makerReason: string;
  checkerReason?: string | null;
  expiresAt: string;
  decisionVersion: number;
  emergencyOverride?: boolean;
  diff?: Array<{ field: string; before: unknown; after: unknown }> | null;
  expired?: boolean;
}

const SENSITIVE_ACTION_PREFIXES = ['ai_', 'ai.'];
const SENSITIVE_ACTION_TYPES = new Set([
  'request_approval',
  'ai_suggest',
  'ai_execute',
  'ai_send_message',
  'ai_book_appointment',
]);

function workflowRequiresActivationApproval(wf: {
  category?: string;
  actions?: ActionDef[];
  status?: string;
}): boolean {
  if (wf.category === 'ai_permissions') return true;
  return (wf.actions || []).some((action) =>
    SENSITIVE_ACTION_TYPES.has(action.type)
    || SENSITIVE_ACTION_PREFIXES.some((prefix) => action.type.startsWith(prefix)),
  );
}

function promptActivationReason(locale: string, actionLabel: string): string | null {
  const reason = window.prompt(
    at(locale, 'workflowAutomation.legacy.prompt.activationReason', { action: actionLabel }),
  );
  if (!reason?.trim()) return null;
  return reason.trim();
}

interface Props {
  isDarkMode: boolean;
  canWrite?: boolean;
  canRead?: boolean;
}

// ─── Constants ───────────────────────────────────

const CATEGORIES = [
  { key: 'vehicle_return', icon: Car, color: 'blue' },
  { key: 'geofencing', icon: MapPin, color: 'green' },
  { key: 'cleaning', icon: Sparkles, color: 'cyan' },
  { key: 'maintenance', icon: Wrench, color: 'orange' },
  { key: 'finance', icon: CreditCard, color: 'red' },
  { key: 'ai_permissions', icon: Bot, color: 'purple' },
  { key: 'support', icon: Headphones, color: 'yellow' },
] as const;

const TRIGGER_TYPES = [
  { key: 'booking.returned', category: 'vehicle_return' },
  { key: 'booking.completed', category: 'vehicle_return' },
  { key: 'vehicle_returned', category: 'vehicle_return' },
  { key: 'vehicle.health.warning', category: 'maintenance' },
  { key: 'vehicle.health.critical', category: 'maintenance' },
  { key: 'health_threshold', category: 'maintenance' },
  { key: 'vehicle.dtc.critical', category: 'maintenance' },
  { key: 'invoice_overdue', category: 'finance' },
  { key: 'invoice.overdue', category: 'finance' },
  { key: 'fine_created', category: 'finance' },
  { key: 'customer.complaint.created', category: 'support' },
  { key: 'manual', category: 'vehicle_return' },
  { key: 'manual.test', category: 'vehicle_return' },
] as const;

const ACTION_TYPES = [
  { key: 'create_alert', icon: Bell, mvp: true },
  { key: 'create_task', icon: ClipboardList, mvp: true },
  { key: 'change_vehicle_status', icon: Car, mvp: true },
  { key: 'send_notification', icon: Bell, mvp: true },
  { key: 'ai_suggest', icon: Bot, mvp: true },
  { key: 'request_approval', icon: Shield, mvp: true },
  { key: 'change_cleaning_status', icon: Sparkles, mvp: false, comingSoon: true },
  { key: 'ai_execute', icon: Zap, mvp: false, comingSoon: true },
  { key: 'ai_send_message', icon: Bot, mvp: false, comingSoon: true },
  { key: 'ai_book_appointment', icon: Calendar, mvp: false, comingSoon: true },
  { key: 'assign_vendor', icon: Truck, mvp: false, comingSoon: true },
] as const;

const CONDITION_FIELDS = [
  { key: 'vehicle_status' },
  { key: 'cleaning_status' },
  { key: 'health_score' },
  { key: 'mileage' },
  { key: 'booking_type' },
  { key: 'vehicle_group' },
  { key: 'station' },
  { key: 'days_since_last_service' },
  { key: 'invoice_amount' },
  { key: 'overdue_days' },
  { key: 'damage_severity' },
] as const;

const CONDITION_OPERATORS = [
  { key: 'equals' },
  { key: 'not_equals' },
  { key: 'greater_than' },
  { key: 'less_than' },
  { key: 'contains' },
  { key: 'is_true' },
  { key: 'is_false' },
] as const;

const SCOPE_TYPES = [
  { key: 'organization' },
  { key: 'station' },
  { key: 'vehicle' },
  { key: 'territory' },
] as const;

interface StarterTemplate {
  templateKey: string;
  category: string;
  trigger: TriggerDef;
  conditions: ConditionDef[];
  actions: ActionDef[];
  scope: ScopeDef;
}

const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    templateKey: 'returnDamageCheck',
    category: 'vehicle_return',
    trigger: { type: 'booking.returned' },
    conditions: [],
    actions: [{ type: 'create_task', config: { title: 'Damage inspection required', priority: 'HIGH', category: 'inspection' } }],
    scope: { type: 'organization' },
  },
  {
    templateKey: 'returnAdminNotification',
    category: 'vehicle_return',
    trigger: { type: 'booking.returned' },
    conditions: [],
    actions: [{ type: 'send_notification', config: { target: 'admin', message: 'Vehicle returned — review readiness' } }],
    scope: { type: 'organization' },
  },
  {
    templateKey: 'criticalHealth',
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
    templateKey: 'healthWarning',
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
    templateKey: 'fineProcessing',
    category: 'finance',
    trigger: { type: 'fine_created' },
    conditions: [],
    actions: [{ type: 'create_task', config: { title: 'Process new fine', priority: 'NORMAL', category: 'fine' } }],
    scope: { type: 'organization' },
  },
  {
    templateKey: 'invoiceOverdue',
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
    templateKey: 'aiSuggest',
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
function getTriggerLabel(locale: string, key: string) {
  return legacyTriggerLabel(locale, key);
}
function getActionLabel(locale: string, key: string) {
  return legacyActionTypeLabel(locale, key);
}
function getActionIcon(key: string) {
  const a = ACTION_TYPES.find((t) => t.key === key);
  return a?.icon || Zap;
}
function getFieldLabel(locale: string, key: string) {
  return legacyConditionFieldLabel(locale, key);
}
function getOperatorLabel(locale: string, key: string) {
  return legacyConditionOperatorLabel(locale, key);
}

const STATUS_TONES: Record<string, { color: string; bgClass: string; textClass: string }> = {
  ACTIVE: { color: 'green', bgClass: 'bg-green-100 dark:bg-status-positive-soft', textClass: 'text-green-700 dark:text-status-positive' },
  DRAFT: { color: 'amber', bgClass: 'bg-amber-100 dark:bg-status-attention-soft', textClass: 'text-amber-700 dark:text-status-attention' },
  DISABLED: { color: 'gray', bgClass: 'bg-gray-100 dark:bg-muted', textClass: 'text-gray-500 dark:text-muted-foreground' },
  INVALID: { color: 'red', bgClass: 'bg-red-100 dark:bg-status-critical-soft', textClass: 'text-red-700 dark:text-status-critical' },
  PENDING_ACTIVATION: { color: 'purple', bgClass: 'bg-purple-100 dark:bg-status-ai-soft', textClass: 'text-purple-700 dark:text-status-ai' },
};

const RUN_STATUS_TONES: Record<string, { bgClass: string; textClass: string }> = {
  SUCCESS: { bgClass: 'bg-green-100 dark:bg-status-positive-soft', textClass: 'text-green-700 dark:text-status-positive' },
  FAILED: { bgClass: 'bg-red-100 dark:bg-status-critical-soft', textClass: 'text-red-700 dark:text-status-critical' },
  SKIPPED: { bgClass: 'bg-gray-100 dark:bg-muted', textClass: 'text-gray-500 dark:text-muted-foreground' },
  WAITING_APPROVAL: { bgClass: 'bg-purple-100 dark:bg-status-ai-soft', textClass: 'text-purple-700 dark:text-status-ai' },
  RUNNING: { bgClass: 'bg-status-info-soft', textClass: 'text-status-info' },
  PENDING: { bgClass: 'bg-amber-100 dark:bg-status-attention-soft', textClass: 'text-amber-700 dark:text-status-attention' },
};

// ─── Main Component ──────────────────────────────

export function WorkflowAutomationView({ isDarkMode, canWrite = true, canRead = true }: Props) {
  const { orgId } = useRentalOrg();
  const { t, locale } = useLanguage();
  const [view, setView] = useState<'list' | 'detail' | 'builder'>('list');
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowListItemDto | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [builderData, setBuilderData] = useState<Partial<Workflow> | null>(null);
  const [mainTab, setMainTab] = useState<'workflows' | 'task-automations'>('workflows');
  const [saving, setSaving] = useState(false);

  const cardBg = isDarkMode ? 'bg-[#1e1e2e]' : 'bg-white';
  const cardBorder = isDarkMode ? 'border-gray-700/50' : 'border-gray-200';
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-muted-foreground' : 'text-gray-500';
  const inputBg = isDarkMode ? 'bg-[#2a2a3e] border-gray-600 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400';
  const hoverBg = isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50';

  const refreshSelectedWorkflow = useCallback(async () => {
    if (!orgId || !selectedWorkflow) return;
    try {
      const wf = await api.workflows.get(orgId, selectedWorkflow.id);
      setSelectedWorkflow(wf as WorkflowListItemDto);
    } catch (e) {
      console.error('Failed to refresh workflow', e);
    }
  }, [orgId, selectedWorkflow]);

  // ─── Actions ─────────────────────────────────

  const handleToggle = async (wf: WorkflowListItemDto) => {
    if (!orgId) return;
    const enabling = wf.status !== 'ACTIVE';
    let activationReason: string | undefined;
    if (enabling && workflowRequiresActivationApproval(wf)) {
      const reason = promptActivationReason(locale, at(locale, 'workflowAutomation.legacy.prompt.activatingWorkflow'));
      if (!reason) return;
      activationReason = reason;
    }
    try {
      await api.workflows.toggle(orgId, wf.id, activationReason ? { activationReason } : undefined);
      await refreshSelectedWorkflow();
    } catch (e) { console.error(e); }
  };

  const handleDuplicate = async (wf: WorkflowListItemDto) => {
    if (!orgId) return;
    try {
      await api.workflows.duplicate(orgId, wf.id);
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (wf: WorkflowListItemDto) => {
    if (!orgId || !confirm(t('workflowAutomation.legacy.prompt.deleteConfirm', { name: wf.name }))) return;
    try {
      await api.workflows.remove(orgId, wf.id);
      if (view === 'detail') setView('list');
    } catch (e) { console.error(e); }
  };

  const openDetail = (wf: WorkflowListItemDto) => { setSelectedWorkflow(wf); setView('detail'); };

  const openBuilder = (wf?: WorkflowListItemDto | Workflow | null, template?: StarterTemplate) => {
    if (template) {
      setBuilderData({
        name: t(`workflowAutomation.legacy.template.${template.templateKey}.name` as import('../../i18n/translations/en').TranslationKey),
        description: t(`workflowAutomation.legacy.template.${template.templateKey}.description` as import('../../i18n/translations/en').TranslationKey),
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
        trigger: { type: 'booking.returned' },
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
    const activating = (builderData.status || 'DRAFT') === 'ACTIVE';
    let activationReason: string | undefined;
    if (activating && workflowRequiresActivationApproval(builderData)) {
      const reason = promptActivationReason(locale, at(locale, 'workflowAutomation.legacy.prompt.publishingWorkflow'));
      if (!reason) return;
      activationReason = reason;
    }
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
        ...(activationReason ? { activationReason } : {}),
      };
      if (builderData.id) {
        await api.workflows.update(orgId, builderData.id, payload);
      } else {
        await api.workflows.create(orgId, payload);
      }
      setView('list');
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ──────────────────────────────────

  if (!canRead) {
    return (
      <div className="rounded-xl border border-border/60 px-6 py-10 text-center" data-testid="workflow-automation-no-access">
        <p className="text-sm font-medium text-foreground">{t('workflowAutomation.noAccess.title')}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('workflowAutomation.noAccess.description')}
        </p>
      </div>
    );
  }

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
      onRefresh={refreshSelectedWorkflow}
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
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 break-words font-display text-[length:var(--text-display-lg)] font-bold leading-[1.15] tracking-[var(--tracking-display)] text-foreground">
              {t('workflowAutomation.legacy.page.title')}
            </h1>
            <span className="shrink-0 rounded-full bg-status-info-soft px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-status-info">
              {t('workflowAutomation.legacy.page.beta')}
            </span>
          </div>
          <p className={`mt-0.5 text-xs ${textSecondary}`}>
            {t('workflowAutomation.legacy.page.subtitle')}
          </p>
        </div>
        {canWrite && mainTab === 'workflows' && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className={`flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium ${cardBorder} ${cardBg} ${textPrimary} ${hoverBg} transition-colors`}
              aria-expanded={showTemplates}
            >
              <Icon name="layers" className="h-4 w-4 shrink-0" />
              {t('workflowAutomation.legacy.page.templates')}
              {showTemplates ? <Icon name="chevron-up" className="h-3 w-3" /> : <Icon name="chevron-down" className="h-3 w-3" />}
            </button>
            <button
              onClick={() => openBuilder()}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-medium text-brand-foreground transition-colors hover:bg-brand-hover"
            >
              <Icon name="plus" className="h-4 w-4 shrink-0" />
              {t('workflowAutomation.legacy.page.newWorkflow')}
            </button>
          </div>
        )}
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label={t('workflowAutomation.tabs.workflows')}
      >
        {[
          { key: 'workflows', label: t('workflowAutomation.tabs.workflows') },
          { key: 'task-automations', label: t('workflowAutomation.tabs.taskAutomations') },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={mainTab === tab.key}
            onClick={() => setMainTab(tab.key as 'workflows' | 'task-automations')}
            className={`min-h-11 rounded-md px-3 py-2 text-xs font-semibold transition-colors ${
              mainTab === tab.key
                ? 'bg-brand text-brand-foreground'
                : `${isDarkMode ? 'text-gray-400 hover:bg-white/5 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mainTab === 'task-automations' ? (
        <TaskAutomationRulesSection canWrite={canWrite} />
      ) : (
        <>
      <WorkflowOverviewSection canWrite={canWrite} />

      {/* Templates Section */}
      {showTemplates && (
        <div className={`${cardBg} border ${cardBorder} rounded-xl p-4`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Icon name="sparkles" className={`w-4 h-4 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
              <span className={`text-sm font-semibold ${textPrimary}`}>{t('workflowAutomation.legacy.page.starterTemplates')}</span>
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium ${isDarkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
                {t('workflowAutomation.legacy.page.templatesReady', { count: STARTER_TEMPLATES.length })}
              </span>
            </div>
            <button onClick={() => setShowTemplates(false)} className={`p-1 rounded ${hoverBg}`}>
              <Icon name="x" className={`w-3.5 h-3.5 ${textSecondary}`} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {STARTER_TEMPLATES.map((template, i) => {
              const cat = getCategoryMeta(template.category);
              const CatIcon = cat.icon;
              const catColors: Record<string, string> = {
                blue: 'text-status-info', green: 'text-green-500', cyan: 'text-cyan-500',
                orange: 'text-orange-500', red: 'text-red-500', purple: 'text-purple-500', yellow: 'text-yellow-500',
              };
              const templateName = t(`workflowAutomation.legacy.template.${template.templateKey}.name` as import('../../i18n/translations/en').TranslationKey);
              const templateDescription = t(`workflowAutomation.legacy.template.${template.templateKey}.description` as import('../../i18n/translations/en').TranslationKey);
              return (
                <button
                  key={i}
                  onClick={() => openBuilder(null, template)}
                  className={`text-left p-3 rounded-lg border ${cardBorder} ${hoverBg} transition-colors group`}
                >
                  <div className="flex items-start gap-2">
                    <CatIcon className={`w-4 h-4 mt-0.5 shrink-0 ${catColors[cat.color] || 'text-gray-500'}`} />
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${textPrimary} truncate group-hover:text-status-info transition-colors`}>{templateName}</p>
                      <p className={`mt-0.5 text-xs ${textSecondary} line-clamp-2`}>{templateDescription}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <span className={`rounded-full px-1.5 py-0.5 text-xs ${isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-muted text-muted-foreground'}`}>
                          {legacyCategoryLabel(locale, cat.key)}
                        </span>
                        <span className={`rounded-full px-1.5 py-0.5 text-xs ${isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-muted text-muted-foreground'}`}>
                          {t('workflowAutomation.legacy.page.actionCount', { count: template.actions.length })}
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

        </>
      )}
    </div>
  );
}

// ─── DetailView ──────────────────────────────────

function DetailView({ wf, orgId, isDarkMode, canWrite, onBack, onEdit, onToggle, onDuplicate, onDelete, onRefresh }: {
  wf: WorkflowListItemDto; orgId: string | null; isDarkMode: boolean; canWrite: boolean;
  onBack: () => void; onEdit: () => void; onToggle: () => void; onDuplicate: () => void; onDelete: () => void;
  onRefresh: () => void;
}) {
  const { t, locale } = useLanguage();
  const formattingLocale = automationFormattingLocaleOrDefault(locale);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [changeRequests, setChangeRequests] = useState<WorkflowChangeRequest[]>([]);
  const [changeRequestsLoading, setChangeRequestsLoading] = useState(true);
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    setRunsLoading(true);
    api.workflows.listRuns(orgId, wf.id, 15)
      .then((rows) => setRuns(rows as WorkflowRun[]))
      .catch(() => setRuns([]))
      .finally(() => setRunsLoading(false));
  }, [orgId, wf.id]);

  useEffect(() => {
    if (!orgId) return;
    setChangeRequestsLoading(true);
    api.workflows.listChangeRequests(orgId, wf.id)
      .then((rows) => setChangeRequests(rows as WorkflowChangeRequest[]))
      .catch(() => setChangeRequests([]))
      .finally(() => setChangeRequestsLoading(false));
  }, [orgId, wf.id, wf.status]);

  const handleApproveRequest = async (request: WorkflowChangeRequest) => {
    if (!orgId) return;
    const reason = window.prompt(t('workflowAutomation.legacy.prompt.approvalReason'));
    if (!reason?.trim()) return;
    setDecisionBusy(request.id);
    try {
      await api.workflows.approveChangeRequest(orgId, request.id, {
        reason: reason.trim(),
        decisionVersion: request.decisionVersion,
      });
      onRefresh();
      const rows = await api.workflows.listChangeRequests(orgId, wf.id);
      setChangeRequests(rows as WorkflowChangeRequest[]);
    } catch (e) {
      console.error(e);
    } finally {
      setDecisionBusy(null);
    }
  };

  const handleRejectRequest = async (request: WorkflowChangeRequest) => {
    if (!orgId) return;
    const reason = window.prompt(t('workflowAutomation.legacy.prompt.rejectionReason'));
    if (!reason?.trim()) return;
    setDecisionBusy(request.id);
    try {
      await api.workflows.rejectChangeRequest(orgId, request.id, {
        reason: reason.trim(),
        decisionVersion: request.decisionVersion,
      });
      onRefresh();
      const rows = await api.workflows.listChangeRequests(orgId, wf.id);
      setChangeRequests(rows as WorkflowChangeRequest[]);
    } catch (e) {
      console.error(e);
    } finally {
      setDecisionBusy(null);
    }
  };

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
        setTestError(result.message || t('workflowAutomation.legacy.error.testSkipped'));
      }
      onRefresh();
    } catch (e) {
      setTestError(e instanceof Error ? e.message : t('workflowAutomation.legacy.error.testFailed'));
    } finally {
      setTesting(false);
    }
  };
  const cat = getCategoryMeta(wf.category);
  const CatIcon = cat.icon;
  const st = STATUS_TONES[wf.status] || STATUS_TONES.DRAFT;
  const statusLabel = legacyWorkflowStatusLabel(locale, wf.status);
  const cardBg = isDarkMode ? 'bg-[#1e1e2e]' : 'bg-white';
  const cardBorder = isDarkMode ? 'border-gray-700/50' : 'border-gray-200';
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-muted-foreground' : 'text-gray-500';
  const labelClass = `text-[10px] uppercase tracking-wider font-semibold ${textSecondary}`;
  const valueClass = `text-xs font-medium ${textPrimary}`;
  const isAi = wf.category === 'ai_permissions' || wf.actions?.some((a: ActionDef) => a.type.startsWith('ai_'));

  const catColors: Record<string, string> = {
    blue: isDarkMode ? 'text-brand' : 'text-brand',
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
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${isDarkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>{t('workflowAutomation.legacy.detail.aiBadge')}</span>
              )}
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${st.bgClass} ${st.textClass}`}>{statusLabel}</span>
            </div>
            <p className={`text-xs ${textSecondary}`}>{wf.description || t('workflowAutomation.legacy.detail.noDescription')}</p>
          </div>
        </div>
        {canWrite && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleTest}
              disabled={testing}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${cardBorder} ${cardBg} ${textPrimary} ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'} disabled:opacity-50`}
            >
              <Icon name="play" className="w-3.5 h-3.5 text-status-info" />
              {testing ? t('workflowAutomation.legacy.detail.testing') : t('workflowAutomation.legacy.detail.testWorkflow')}
            </button>
            <button onClick={onToggle} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${cardBorder} ${cardBg} ${textPrimary} ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-gray-50'}`}>
              {wf.status === 'ACTIVE' ? <><Icon name="pause" className="w-3.5 h-3.5 text-amber-500" /> {t('workflowAutomation.legacy.detail.disable')}</> : <><Icon name="play" className="w-3.5 h-3.5 text-green-500" /> {t('workflowAutomation.legacy.detail.enable')}</>}
            </button>
            <button onClick={onEdit} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-brand text-brand-foreground hover:bg-brand-hover">
              <Icon name="edit-3" className="w-3.5 h-3.5" /> {t('workflowAutomation.legacy.detail.edit')}
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
            <p className={`text-xs font-semibold ${isDarkMode ? 'text-purple-300' : 'text-purple-800'}`}>{t('workflowAutomation.legacy.detail.aiWarningTitle')}</p>
            <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>
              {t('workflowAutomation.legacy.detail.aiWarningBody')}
              {wf.actions?.some((a: ActionDef) => a.type === 'request_approval') &&
                t('workflowAutomation.legacy.detail.aiWarningApproval')}
            </p>
          </div>
        </div>
      )}

      {testError && (
        <div className={`text-xs px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-amber-900/20 border-amber-800/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          {testError}
        </div>
      )}

      {(wf.status === 'PENDING_ACTIVATION' || changeRequests.some((cr) => cr.status === 'PENDING')) && (
        <div className={`${cardBg} border ${cardBorder} rounded-xl p-4`}>
          <div className="flex items-center gap-2 mb-3">
            <Shield className={`w-4 h-4 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
            <p className={`text-xs font-semibold ${textPrimary}`}>{t('workflowAutomation.legacy.detail.fourEyesTitle')}</p>
          </div>
          {changeRequestsLoading ? (
            <p className={`text-xs ${textSecondary}`}>{t('workflowAutomation.legacy.detail.loadingApprovals')}</p>
          ) : changeRequests.length === 0 ? (
            <p className={`text-xs ${textSecondary}`}>{t('workflowAutomation.legacy.detail.noChangeRequests')}</p>
          ) : (
            <div className="space-y-3">
              {changeRequests.map((request) => (
                <div key={request.id} className={`rounded-lg border ${cardBorder} p-3 ${isDarkMode ? 'bg-white/[0.02]' : 'bg-gray-50'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        request.status === 'PENDING'
                          ? 'bg-purple-100 text-purple-700 dark:bg-status-ai-soft dark:text-status-ai'
                          : request.status === 'APPROVED'
                            ? 'bg-green-100 text-green-700 dark:bg-status-positive-soft dark:text-status-positive'
                            : 'bg-gray-100 text-gray-600 dark:bg-muted dark:text-muted-foreground'
                      }`}>
                        {request.status}
                      </span>
                      <span className={`text-[10px] ${textSecondary}`}>{request.operation}</span>
                    </div>
                    <span className={`text-[10px] ${textSecondary}`}>
                      {t('workflowAutomation.legacy.detail.expires', {
                        date: new Date(request.expiresAt).toLocaleString(formattingLocale),
                      })}
                      {request.expired ? t('workflowAutomation.legacy.detail.expired') : ''}
                    </span>
                  </div>
                  <div className={`mt-2 grid grid-cols-2 gap-2 text-[11px] ${textSecondary}`}>
                    <div><span className={labelClass}>{t('workflowAutomation.legacy.detail.maker')}</span><p className={valueClass}>{request.makerUserId.slice(0, 8)}…</p></div>
                    <div><span className={labelClass}>{t('workflowAutomation.legacy.detail.checker')}</span><p className={valueClass}>{request.checkerUserId ? `${request.checkerUserId.slice(0, 8)}…` : '—'}</p></div>
                    <div className="col-span-2"><span className={labelClass}>{t('workflowAutomation.legacy.detail.makerReason')}</span><p className={valueClass}>{request.makerReason}</p></div>
                    {request.checkerReason && (
                      <div className="col-span-2"><span className={labelClass}>{t('workflowAutomation.legacy.detail.checkerReason')}</span><p className={valueClass}>{request.checkerReason}</p></div>
                    )}
                  </div>
                  {request.diff && request.diff.length > 0 && (
                    <div className="mt-2">
                      <p className={`${labelClass} mb-1`}>{t('workflowAutomation.legacy.detail.diff')}</p>
                      <div className="space-y-1">
                        {request.diff.map((entry) => (
                          <p key={entry.field} className={`text-[10px] ${textSecondary}`}>
                            <strong className={textPrimary}>{entry.field}</strong>: {String(entry.before ?? '—')} → {String(entry.after ?? '—')}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  {canWrite && request.status === 'PENDING' && !request.expired && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={decisionBusy === request.id}
                        onClick={() => handleApproveRequest(request)}
                        className="px-2.5 py-1 rounded-md text-[10px] font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {t('workflowAutomation.legacy.detail.approve')}
                      </button>
                      <button
                        type="button"
                        disabled={decisionBusy === request.id}
                        onClick={() => handleRejectRequest(request)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-medium border ${cardBorder} ${textPrimary}`}
                      >
                        {t('workflowAutomation.legacy.detail.reject')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Metadata */}
        <div className={`${cardBg} border ${cardBorder} rounded-xl p-4`}>
          <p className={`text-xs font-semibold ${textPrimary} mb-3`}>{t('workflowAutomation.legacy.detail.details')}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <div><p className={labelClass}>{t('workflowAutomation.legacy.detail.category')}</p><p className={valueClass}>{legacyCategoryLabel(locale, cat.key)}</p></div>
            <div><p className={labelClass}>{t('workflowAutomation.legacy.detail.status')}</p><p className={valueClass}>{statusLabel}</p></div>
            <div><p className={labelClass}>{t('workflowAutomation.legacy.detail.scope')}</p><p className={valueClass}>{legacyScopeLabel(locale, wf.scope?.type ?? '')}</p></div>
            <div><p className={labelClass}>{t('workflowAutomation.legacy.detail.triggered')}</p><p className={valueClass}>{t('workflowAutomation.legacy.detail.triggeredCount', { count: wf.triggerCount })}</p></div>
            <div><p className={labelClass}>{t('workflowAutomation.legacy.detail.createdBy')}</p><p className={valueClass}>{wf.createdByName || '—'}</p></div>
            <div><p className={labelClass}>{t('workflowAutomation.legacy.detail.created')}</p><p className={valueClass}>{new Date(wf.createdAt).toLocaleDateString(formattingLocale)}</p></div>
            <div><p className={labelClass}>{t('workflowAutomation.legacy.detail.lastUpdated')}</p><p className={valueClass}>{formatLegacyRelativeTime(locale, wf.updatedAt)}</p></div>
            <div><p className={labelClass}>{t('workflowAutomation.legacy.detail.lastTriggered')}</p><p className={valueClass}>{formatLegacyRelativeTime(locale, wf.lastTriggeredAt)}</p></div>
          </div>
        </div>

        {/* Logic Summary */}
        <div className={`${cardBg} border ${cardBorder} rounded-xl p-4`}>
          <p className={`text-xs font-semibold ${textPrimary} mb-3`}>{t('workflowAutomation.legacy.detail.workflowLogic')}</p>
          {/* Trigger */}
          <div className={`flex items-start gap-2 mb-3 p-2 rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
            <Icon name="target" className={`w-4 h-4 mt-0.5 shrink-0 ${isDarkMode ? 'text-brand' : 'text-brand'}`} />
            <div>
              <p className={labelClass}>{t('workflowAutomation.legacy.detail.trigger')}</p>
              <p className={`text-xs font-medium ${textPrimary}`}>{getTriggerLabel(locale, wf.trigger?.type)}</p>
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
              <p className={`${labelClass} mb-1`}>{t('workflowAutomation.legacy.detail.conditions')}</p>
              {wf.conditions.map((c: ConditionDef, i: number) => (
                <div key={i} className={`flex items-center gap-1.5 text-[11px] ${textSecondary} mb-0.5`}>
                  <Icon name="filter" className="w-3 h-3" />
                  <span>{getFieldLabel(locale, c.field ?? c.path ?? '')} {getOperatorLabel(locale, c.operator)} <strong className={textPrimary}>{String(c.value)}</strong></span>
                </div>
              ))}
            </div>
          )}
          {/* Actions */}
          <p className={`${labelClass} mb-1`}>{t('workflowAutomation.legacy.detail.actions', { count: wf.actions?.length || 0 })}</p>
          {wf.actions?.map((a: ActionDef, i: number) => {
            const Icon = getActionIcon(a.type);
            return (
              <div key={i} className={`flex items-start gap-2 mb-1.5 p-2 rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${a.type.startsWith('ai_') ? (isDarkMode ? 'text-purple-400' : 'text-purple-600') : (isDarkMode ? 'text-green-400' : 'text-green-600')}`} />
                <div>
                  <p className={`text-xs font-medium ${textPrimary}`}>{getActionLabel(locale, a.type)}</p>
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
          <p className={`text-xs font-semibold ${textPrimary}`}>{t('workflowAutomation.legacy.detail.executionHistory')}</p>
          <span className={`text-[10px] ${textSecondary}`}>{t('workflowAutomation.legacy.detail.totalTriggers', { count: wf.triggerCount })}</span>
        </div>
        {runsLoading ? (
          <p className={`text-xs ${textSecondary}`}>{t('workflowAutomation.legacy.detail.loadingRuns')}</p>
        ) : runs.length === 0 ? (
          <p className={`text-xs ${textSecondary}`}>{t('workflowAutomation.legacy.detail.noRuns')}</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => {
              const rs = RUN_STATUS_TONES[run.status] || RUN_STATUS_TONES.PENDING;
              const runStatusLabel = legacyRunStatusLabel(locale, run.status);
              return (
                <div key={run.id} className={`p-2.5 rounded-lg border ${cardBorder} ${isDarkMode ? 'bg-white/[0.02]' : 'bg-gray-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${rs.bgClass} ${rs.textClass}`}>{runStatusLabel}</span>
                      <span className={`text-xs font-medium truncate ${textPrimary}`}>{run.eventType}</span>
                      {run.entityId && (
                        <span className={`text-[10px] truncate ${textSecondary}`}>{run.entityType}:{run.entityId.slice(0, 8)}…</span>
                      )}
                    </div>
                    <span className={`text-[10px] shrink-0 ${textSecondary}`}>{formatLegacyRelativeTime(locale, run.createdAt)}</span>
                  </div>
                  {run.errorMessage && (
                    <p className={`text-[10px] mt-1 text-red-500`}>{run.errorMessage}</p>
                  )}
                  {run.actionRuns && run.actionRuns.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {run.actionRuns.map((ar) => {
                        const ars = RUN_STATUS_TONES[ar.status] || RUN_STATUS_TONES.PENDING;
                        const arLabel = legacyRunStatusLabel(locale, ar.status);
                        return (
                          <span key={ar.id} className={`text-[9px] px-1.5 py-0.5 rounded ${ars.bgClass} ${ars.textClass}`}>
                            {ar.actionType} — {arLabel}
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
  const { t, locale } = useLanguage();
  const cardBg = isDarkMode ? 'bg-[#1e1e2e]' : 'bg-white';
  const cardBorder = isDarkMode ? 'border-gray-700/50' : 'border-gray-200';
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-muted-foreground' : 'text-gray-500';
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
          <h2 className={`text-lg font-bold ${textPrimary}`}>{data.id ? t('workflowAutomation.legacy.builder.editTitle') : t('workflowAutomation.legacy.builder.createTitle')}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${cardBorder} ${textSecondary} ${hoverBg}`}>
            {t('common.cancel')}
          </button>
          <select
            value={data.status || 'DRAFT'}
            onChange={(e) => update({ status: e.target.value })}
            className={`px-2 py-1.5 rounded-lg text-xs border ${inputBg} focus:outline-none`}
          >
            <option value="DRAFT">{t('workflowAutomation.legacy.builder.saveDraft')}</option>
            <option value="ACTIVE">{t('workflowAutomation.legacy.builder.saveActivate')}</option>
            <option value="DISABLED">{t('workflowAutomation.legacy.builder.saveDisabled')}</option>
          </select>
          <button
            onClick={onSave}
            disabled={saving || !data.name}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-brand text-brand-foreground hover:bg-brand-hover disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('workflowAutomation.legacy.builder.saveWorkflow')}
          </button>
        </div>
      </div>

      {/* AI Warning */}
      {isAiAction && (
        <div className={`flex items-start gap-2 p-3 rounded-xl border ${isDarkMode ? 'bg-purple-900/10 border-purple-800/30' : 'bg-purple-50 border-purple-200'}`}>
          <Icon name="shield" className={`w-4 h-4 mt-0.5 shrink-0 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`} />
          <div>
            <p className={`text-xs font-semibold ${isDarkMode ? 'text-purple-300' : 'text-purple-800'}`}>{t('workflowAutomation.legacy.builder.aiDetectedTitle')}</p>
            <p className={`text-[11px] mt-0.5 ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>
              {t('workflowAutomation.legacy.builder.aiDetectedBody')}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Left: Basic info */}
        <div className="space-y-4">
          <div className={sectionClass}>
            <p className={`text-xs font-semibold ${textPrimary} mb-3`}>{t('workflowAutomation.legacy.builder.basicInfo')}</p>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>{t('workflowAutomation.legacy.builder.workflowName')}</label>
                <input
                  value={data.name || ''}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder={t('workflowAutomation.legacy.builder.workflowNamePlaceholder')}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border ${inputBg} focus:outline-none focus:ring-1 focus:ring-blue-500`}
                />
              </div>
              <div>
                <label className={labelClass}>{t('workflowAutomation.legacy.builder.description')}</label>
                <textarea
                  value={data.description || ''}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder={t('workflowAutomation.legacy.builder.descriptionPlaceholder')}
                  rows={2}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border ${inputBg} focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none`}
                />
              </div>
              <div>
                <label className={labelClass}>{t('workflowAutomation.legacy.builder.category')}</label>
                <select
                  value={data.category || 'vehicle_return'}
                  onChange={(e) => update({ category: e.target.value })}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border ${inputBg} focus:outline-none`}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{legacyCategoryLabel(locale, c.key)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>{t('workflowAutomation.legacy.builder.scope')}</label>
                <select
                  value={(data.scope as ScopeDef)?.type || 'organization'}
                  onChange={(e) => update({ scope: { type: e.target.value } as ScopeDef })}
                  className={`w-full px-3 py-1.5 text-xs rounded-lg border ${inputBg} focus:outline-none`}
                >
                  {SCOPE_TYPES.map((s) => (
                    <option key={s.key} value={s.key}>{legacyScopeLabel(locale, s.key)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Trigger */}
          <div className={sectionClass}>
            <div className="flex items-center gap-2 mb-3">
              <Icon name="target" className={`w-4 h-4 ${isDarkMode ? 'text-brand' : 'text-brand'}`} />
              <p className={`text-xs font-semibold ${textPrimary}`}>{t('workflowAutomation.legacy.builder.trigger')}</p>
            </div>
            <select
              value={(data.trigger as TriggerDef)?.type || 'booking.returned'}
              onChange={(e) => update({ trigger: { type: e.target.value, config: (data.trigger as TriggerDef)?.config || {} } })}
              className={`w-full px-3 py-1.5 text-xs rounded-lg border ${inputBg} focus:outline-none`}
            >
              {TRIGGER_TYPES.map((trigger) => (
                <option key={trigger.key} value={trigger.key}>
                  {getTriggerLabel(locale, trigger.key)} ({legacyCategoryLabel(locale, trigger.category)})
                </option>
              ))}
            </select>
            <TriggerConfigEditor
              trigger={(data.trigger as TriggerDef) || { type: 'booking.returned' }}
              onChange={(triggerPatch) => update({ trigger: triggerPatch })}
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
                <p className={`text-xs font-semibold ${textPrimary}`}>{t('workflowAutomation.legacy.builder.conditions')}</p>
                <span className={`text-[9px] ${textSecondary}`}>{t('workflowAutomation.legacy.builder.conditionsOptional')}</span>
              </div>
              <button onClick={addCondition} className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${isDarkMode ? 'text-brand hover:bg-brand-soft' : 'text-brand hover:bg-brand-soft'}`}>
                <Icon name="plus" className="w-3 h-3" /> {t('workflowAutomation.legacy.builder.add')}
              </button>
            </div>
            {((data.conditions || []) as ConditionDef[]).length === 0 ? (
              <p className={`text-[11px] ${textSecondary} text-center py-3`}>{t('workflowAutomation.legacy.builder.noConditions')}</p>
            ) : (
              <div className="space-y-2">
                {((data.conditions || []) as ConditionDef[]).map((c: ConditionDef, i: number) => (
                  <div key={i} className={`flex items-center gap-1.5 p-2 rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                    <select value={c.field} onChange={(e) => updateCondition(i, { field: e.target.value })} className={`flex-1 px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
                      {CONDITION_FIELDS.map((f) => <option key={f.key} value={f.key}>{getFieldLabel(locale, f.key)}</option>)}
                    </select>
                    <select value={c.operator} onChange={(e) => updateCondition(i, { operator: e.target.value })} className={`px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
                      {CONDITION_OPERATORS.map((o) => <option key={o.key} value={o.key}>{getOperatorLabel(locale, o.key)}</option>)}
                    </select>
                    <input value={String(c.value)} onChange={(e) => updateCondition(i, { value: e.target.value })} placeholder={t('workflowAutomation.legacy.builder.conditionValue')} className={`w-24 px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
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
                <p className={`text-xs font-semibold ${textPrimary}`}>{t('workflowAutomation.legacy.builder.actions')}</p>
              </div>
              <button onClick={addAction} className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium ${isDarkMode ? 'text-brand hover:bg-brand-soft' : 'text-brand hover:bg-brand-soft'}`}>
                <Icon name="plus" className="w-3 h-3" /> {t('workflowAutomation.legacy.builder.add')}
              </button>
            </div>
            {((data.actions || []) as ActionDef[]).length === 0 ? (
              <p className={`text-[11px] ${textSecondary} text-center py-3`}>{t('workflowAutomation.legacy.builder.addActionHint')}</p>
            ) : (
              <div className="space-y-2">
                {((data.actions || []) as ActionDef[]).map((a: ActionDef, i: number) => {
                  const Icon = getActionIcon(a.type);
                  return (
                    <div key={i} className={`p-2 rounded-lg ${isDarkMode ? 'bg-white/5' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Icon className={`w-3.5 h-3.5 ${a.type.startsWith('ai_') ? 'text-purple-500' : isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
                        <select value={a.type} onChange={(e) => updateAction(i, { type: e.target.value, config: {} })} className={`flex-1 px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
                          {ACTION_TYPES.map((actionType) => (
                            <option key={actionType.key} value={actionType.key} disabled={'comingSoon' in actionType && actionType.comingSoon}>
                              {getActionLabel(locale, actionType.key)}{'comingSoon' in actionType && actionType.comingSoon ? t('workflowAutomation.legacy.actionType.comingSoon') : ''}
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
  const { t } = useLanguage();
  const inputBg = isDarkMode ? 'bg-[#2a2a3e] border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900';
  const textSecondary = isDarkMode ? 'text-muted-foreground' : 'text-gray-500';
  const labelClass = `text-[10px] ${textSecondary} mb-0.5 block mt-2`;

  const updateConfig = (key: string, value: any) => {
    onChange({ ...trigger, config: { ...(trigger.config || {}), [key]: value } });
  };

  switch (trigger.type) {
    case 'geofence_exit':
      return (
        <div>
          <label className={labelClass}>{t('workflowAutomation.legacy.triggerConfig.territoryName')}</label>
          <input value={trigger.config?.territoryName || ''} onChange={(e) => updateConfig('territoryName', e.target.value)} placeholder={t('workflowAutomation.legacy.triggerConfig.territoryPlaceholder')} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
        </div>
      );
    case 'geofence_dwell':
      return (
        <div>
          <label className={labelClass}>{t('workflowAutomation.legacy.triggerConfig.dwellDuration')}</label>
          <input type="number" value={trigger.config?.durationMinutes || 120} onChange={(e) => updateConfig('durationMinutes', parseInt(e.target.value, 10))} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
        </div>
      );
    case 'health_threshold':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>{t('workflowAutomation.legacy.triggerConfig.metric')}</label>
            <select value={trigger.config?.metric || 'overall'} onChange={(e) => updateConfig('metric', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="overall">{t('workflowAutomation.legacy.triggerConfig.metric.overall')}</option>
              <option value="tires">{t('workflowAutomation.legacy.triggerConfig.metric.tires')}</option>
              <option value="brakes">{t('workflowAutomation.legacy.triggerConfig.metric.brakes')}</option>
              <option value="engine">{t('workflowAutomation.legacy.triggerConfig.metric.engine')}</option>
              <option value="battery">{t('workflowAutomation.legacy.triggerConfig.metric.battery')}</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('workflowAutomation.legacy.triggerConfig.threshold')}</label>
            <input type="number" value={trigger.config?.threshold || 60} onChange={(e) => updateConfig('threshold', parseInt(e.target.value, 10))} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
          </div>
        </div>
      );
    case 'compliance_expiring':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>{t('workflowAutomation.legacy.triggerConfig.complianceType')}</label>
            <select value={trigger.config?.type || 'tuev'} onChange={(e) => updateConfig('type', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="tuev">{t('workflowAutomation.legacy.triggerConfig.compliance.tuev')}</option>
              <option value="bokraft">{t('workflowAutomation.legacy.triggerConfig.compliance.bokraft')}</option>
              <option value="insurance">{t('workflowAutomation.legacy.triggerConfig.compliance.insurance')}</option>
              <option value="permit">{t('workflowAutomation.legacy.triggerConfig.compliance.permit')}</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('workflowAutomation.legacy.triggerConfig.daysBeforeExpiry')}</label>
            <input type="number" value={trigger.config?.daysBefore || 30} onChange={(e) => updateConfig('daysBefore', parseInt(e.target.value, 10))} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
          </div>
        </div>
      );
    case 'invoice_overdue':
      return (
        <div>
          <label className={labelClass}>{t('workflowAutomation.legacy.triggerConfig.overdueThreshold')}</label>
          <input type="number" value={trigger.config?.overdueDays || 14} onChange={(e) => updateConfig('overdueDays', parseInt(e.target.value, 10))} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
        </div>
      );
    case 'support_escalation':
      return (
        <div>
          <label className={labelClass}>{t('workflowAutomation.legacy.triggerConfig.hoursUnanswered')}</label>
          <input type="number" value={trigger.config?.hoursUnanswered || 4} onChange={(e) => updateConfig('hoursUnanswered', parseInt(e.target.value, 10))} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
        </div>
      );
    case 'task_escalation':
      return (
        <div>
          <label className={labelClass}>{t('workflowAutomation.legacy.triggerConfig.hoursUntilEscalation')}</label>
          <input type="number" value={trigger.config?.hoursUntilEscalation || 24} onChange={(e) => updateConfig('hoursUntilEscalation', parseInt(e.target.value, 10))} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
        </div>
      );
    case 'ai_action_request':
      return (
        <div>
          <label className={labelClass}>{t('workflowAutomation.legacy.triggerConfig.aiActionType')}</label>
          <select value={trigger.config?.actionType || 'create_task'} onChange={(e) => updateConfig('actionType', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
            <option value="create_task">{t('workflowAutomation.legacy.triggerConfig.ai.create_task')}</option>
            <option value="send_message">{t('workflowAutomation.legacy.triggerConfig.ai.send_message')}</option>
            <option value="book_appointment">{t('workflowAutomation.legacy.triggerConfig.ai.book_appointment')}</option>
            <option value="update_status">{t('workflowAutomation.legacy.triggerConfig.ai.update_status')}</option>
            <option value="contact_vendor">{t('workflowAutomation.legacy.triggerConfig.ai.contact_vendor')}</option>
          </select>
        </div>
      );
    case 'schedule':
      return (
        <div>
          <label className={labelClass}>{t('workflowAutomation.legacy.triggerConfig.scheduleInterval')}</label>
          <select value={trigger.config?.interval || 'daily'} onChange={(e) => updateConfig('interval', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
            <option value="hourly">{t('workflowAutomation.legacy.triggerConfig.schedule.hourly')}</option>
            <option value="daily">{t('workflowAutomation.legacy.triggerConfig.schedule.daily')}</option>
            <option value="weekly">{t('workflowAutomation.legacy.triggerConfig.schedule.weekly')}</option>
            <option value="monthly">{t('workflowAutomation.legacy.triggerConfig.schedule.monthly')}</option>
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
  const { t, locale } = useLanguage();
  const inputBg = isDarkMode ? 'bg-[#2a2a3e] border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900';
  const textSecondary = isDarkMode ? 'text-muted-foreground' : 'text-gray-500';
  const labelClass = `text-[10px] ${textSecondary} mb-0.5 block`;

  const updateConfig = (key: string, value: any) => {
    onChange({ config: { ...(action.config || {}), [key]: value } });
  };

  switch (action.type) {
    case 'create_task':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>{t('workflowAutomation.legacy.actionConfig.taskTitle')}</label>
            <input value={action.config?.title || ''} onChange={(e) => updateConfig('title', e.target.value)} placeholder={t('workflowAutomation.legacy.actionConfig.taskTitlePlaceholder')} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
          </div>
          <div>
            <label className={labelClass}>{t('workflowAutomation.legacy.actionConfig.priority')}</label>
            <select value={action.config?.priority || 'NORMAL'} onChange={(e) => updateConfig('priority', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="LOW">{labelTaskAutomationPriority(locale, 'LOW')}</option>
              <option value="NORMAL">{labelTaskAutomationPriority(locale, 'NORMAL')}</option>
              <option value="HIGH">{labelTaskAutomationPriority(locale, 'HIGH')}</option>
              <option value="CRITICAL">{labelTaskAutomationPriority(locale, 'CRITICAL')}</option>
            </select>
          </div>
        </div>
      );
    case 'create_alert':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>{t('workflowAutomation.legacy.actionConfig.severity')}</label>
            <select value={action.config?.severity || 'warning'} onChange={(e) => updateConfig('severity', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="info">{t('workflowAutomation.legacy.actionConfig.severity.info')}</option>
              <option value="warning">{t('workflowAutomation.legacy.actionConfig.severity.warning')}</option>
              <option value="high">{t('workflowAutomation.legacy.actionConfig.severity.high')}</option>
              <option value="critical">{t('workflowAutomation.legacy.actionConfig.severity.critical')}</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('workflowAutomation.legacy.actionConfig.message')}</label>
            <input value={action.config?.message || ''} onChange={(e) => updateConfig('message', e.target.value)} placeholder={t('workflowAutomation.legacy.actionConfig.alertPlaceholder')} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
          </div>
        </div>
      );
    case 'change_cleaning_status':
      return (
        <div>
          <label className={labelClass}>{t('workflowAutomation.legacy.actionConfig.setStatusTo')}</label>
          <select value={action.config?.status || 'NEEDS_CLEANING'} onChange={(e) => updateConfig('status', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
            <option value="NEEDS_CLEANING">{t('workflowAutomation.legacy.actionConfig.cleaning.needs')}</option>
            <option value="CLEAN">{t('workflowAutomation.legacy.actionConfig.cleaning.clean')}</option>
          </select>
        </div>
      );
    case 'change_vehicle_status':
      return (
        <div>
          <label className={labelClass}>{t('workflowAutomation.legacy.actionConfig.setStatusTo')}</label>
          <select value={action.config?.status || 'OUT_OF_SERVICE'} onChange={(e) => updateConfig('status', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
            <option value="AVAILABLE">{t('workflowAutomation.legacy.actionConfig.vehicle.AVAILABLE')}</option>
            <option value="RENTED">{t('workflowAutomation.legacy.actionConfig.vehicle.RENTED')}</option>
            <option value="IN_SERVICE">{t('workflowAutomation.legacy.actionConfig.vehicle.IN_SERVICE')}</option>
            <option value="OUT_OF_SERVICE">{t('workflowAutomation.legacy.actionConfig.vehicle.OUT_OF_SERVICE')}</option>
            <option value="RESERVED">{t('workflowAutomation.legacy.actionConfig.vehicle.RESERVED')}</option>
          </select>
        </div>
      );
    case 'send_notification':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>{t('workflowAutomation.legacy.actionConfig.target')}</label>
            <select value={action.config?.target || 'admin'} onChange={(e) => updateConfig('target', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="admin">{t('workflowAutomation.legacy.actionConfig.target.admin')}</option>
              <option value="assignee">{t('workflowAutomation.legacy.actionConfig.target.assignee')}</option>
              <option value="all">{t('workflowAutomation.legacy.actionConfig.target.all')}</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('workflowAutomation.legacy.actionConfig.message')}</label>
            <input value={action.config?.message || ''} onChange={(e) => updateConfig('message', e.target.value)} placeholder={t('workflowAutomation.legacy.actionConfig.notificationPlaceholder')} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
          </div>
        </div>
      );
    case 'ai_execute':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>{t('workflowAutomation.legacy.actionConfig.permission')}</label>
            <select value={action.config?.permission || 'create_task'} onChange={(e) => updateConfig('permission', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="create_task">{t('workflowAutomation.legacy.triggerConfig.ai.create_task')}</option>
              <option value="update_status">{t('workflowAutomation.legacy.triggerConfig.ai.update_status')}</option>
              <option value="send_message">{t('workflowAutomation.legacy.triggerConfig.ai.send_message')}</option>
              <option value="book_appointment">{t('workflowAutomation.legacy.triggerConfig.ai.book_appointment')}</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('workflowAutomation.legacy.actionConfig.requireApproval')}</label>
            <select value={action.config?.requireApproval ? 'true' : 'false'} onChange={(e) => updateConfig('requireApproval', e.target.value === 'true')} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="false">{t('workflowAutomation.legacy.actionConfig.executeImmediately')}</option>
              <option value="true">{t('workflowAutomation.legacy.actionConfig.requireApprovalFirst')}</option>
            </select>
          </div>
        </div>
      );
    case 'ai_send_message':
      return (
        <div>
          <label className={labelClass}>{t('workflowAutomation.legacy.actionConfig.channel')}</label>
          <select value={action.config?.channel || 'whatsapp'} onChange={(e) => updateConfig('channel', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
            <option value="whatsapp">{t('workflowAutomation.legacy.actionConfig.channel.whatsapp')}</option>
            <option value="email">{t('workflowAutomation.legacy.actionConfig.channel.email')}</option>
            <option value="sms">{t('workflowAutomation.legacy.actionConfig.channel.sms')}</option>
          </select>
        </div>
      );
    case 'request_approval':
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>{t('workflowAutomation.legacy.actionConfig.approverRole')}</label>
            <select value={action.config?.approverRole || 'ORG_ADMIN'} onChange={(e) => updateConfig('approverRole', e.target.value)} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`}>
              <option value="ORG_ADMIN">{t('workflowAutomation.legacy.actionConfig.role.orgAdmin')}</option>
              <option value="SUB_ADMIN">{t('workflowAutomation.legacy.actionConfig.role.subAdmin')}</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{t('workflowAutomation.legacy.actionConfig.approvalMessage')}</label>
            <input value={action.config?.message || ''} onChange={(e) => updateConfig('message', e.target.value)} placeholder={t('workflowAutomation.legacy.actionConfig.approvalPlaceholder')} className={`w-full px-2 py-1 text-[10px] rounded border ${inputBg} focus:outline-none`} />
          </div>
        </div>
      );
    default:
      return null;
  }
}

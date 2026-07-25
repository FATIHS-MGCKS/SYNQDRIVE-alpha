import { useMemo, useRef, useState } from 'react';
import { Layers, Pencil, Play, Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { EmptyState, ErrorState, PageHeader, StatusChip } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import type { WorkflowListItemDto } from '../../../lib/api';
import { WorkflowConfigDrawer } from './WorkflowConfigDrawer';
import type { WorkflowRuntimeFilter } from './workflow-runtime.types';
import {
  filterWorkflowItems,
  formatWorkflowRelativeTime,
  workflowActionSummary,
  workflowApprovalLabel,
  workflowConditionSummary,
  workflowLastRunOutcomeLabel,
  workflowLastRunTone,
  workflowRiskLabel,
  workflowSourceLabel,
  workflowStatusLabel,
  workflowStatusTone,
  workflowTriggerSummary,
  WORKFLOW_RUNTIME_FILTERS,
} from './workflow-runtime.utils';
import { useWorkflowRuntimeCenter } from './useWorkflowRuntimeCenter';
import { useRentalOrg } from '../../RentalContext';

interface WorkflowOverviewSectionProps {
  canWrite?: boolean;
}

function SummaryTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="booking-kpi-tile booking-kpi-tile--dense min-w-0" data-testid="workflow-runtime-kpi">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function WorkflowRuntimeRow({
  item,
  canWrite,
  locale,
  busy,
  onOpen,
  onEdit,
  onToggle,
}: {
  item: WorkflowListItemDto;
  canWrite: boolean;
  locale: string;
  busy: boolean;
  onOpen: (trigger: HTMLElement) => void;
  onEdit: (trigger: HTMLElement) => void;
  onToggle: () => void;
}) {
  const { t } = useLanguage();
  const inspectLabel = `${t('workflowAutomation.actions.inspect')}: ${item.name}`;
  return (
    <div
      className="w-full min-w-0 rounded-xl border border-border/60 bg-card px-3 py-3 sm:px-4"
      data-testid={`workflow-runtime-row-${item.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={(event) => onOpen(event.currentTarget)}
          disabled={busy}
          className="min-w-0 flex-1 rounded-lg text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={inspectLabel}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-sm font-semibold text-foreground">{item.name}</h3>
            <StatusChip tone={workflowStatusTone(item.status)}>
              {workflowStatusLabel(item.status, t)}
            </StatusChip>
            {item.sourceType === 'system' && (
              <StatusChip tone="info">{workflowSourceLabel('system', t)}</StatusChip>
            )}
            {item.sourceType === 'migrated' && (
              <StatusChip tone="warning">{workflowSourceLabel('migrated', t)}</StatusChip>
            )}
            {item.hasLegacyMapping && item.sourceType !== 'migrated' && (
              <StatusChip tone="warning">{t('workflowAutomation.badges.legacyMapping')}</StatusChip>
            )}
            {item.unavailableActionCount > 0 && (
              <StatusChip tone="critical">
                {t('workflowAutomation.badges.unavailableActions', { count: item.unavailableActionCount })}
              </StatusChip>
            )}
          </div>
          {item.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
          )}
          <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
            <span>{t('workflowAutomation.columns.trigger')}: {workflowTriggerSummary(item, t)}</span>
            <span>{t('workflowAutomation.columns.conditions')}: {workflowConditionSummary(item, t)}</span>
            <span>{t('workflowAutomation.columns.actions')}: {workflowActionSummary(item, t)}</span>
            <span>
              {t('workflowAutomation.columns.risk')}:{' '}
              <span className="text-foreground">{workflowRiskLabel(item.riskClass, t)}</span>
            </span>
            <span>
              {t('workflowAutomation.columns.approval')}:{' '}
              {workflowApprovalLabel(item.approvalStatus, t)}
            </span>
            <span>
              {t('workflowAutomation.columns.version')}: v{item.activeVersion}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusChip tone={workflowLastRunTone(item.lastRunOutcome)}>
              {workflowLastRunOutcomeLabel(item.lastRunOutcome, t)}
            </StatusChip>
            {item.lastRunAt && (
              <span>
                {t('workflowAutomation.columns.lastRun')}: {formatWorkflowRelativeTime(item.lastRunAt, locale)}
              </span>
            )}
          </div>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {canWrite && item.sourceType !== 'system' && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                title={item.status === 'ACTIVE' ? t('workflowAutomation.actions.disable') : t('workflowAutomation.actions.enable')}
                aria-label={item.status === 'ACTIVE' ? t('workflowAutomation.actions.disable') : t('workflowAutomation.actions.enable')}
                onClick={onToggle}
                disabled={busy}
              >
                <Play className={`h-4 w-4 ${item.status === 'ACTIVE' ? 'rotate-90' : ''}`} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11"
                aria-label={t('workflowAutomation.actions.edit')}
                onClick={(event) => onEdit(event.currentTarget)}
                disabled={busy}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          )}
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground"
            onClick={(event) => onOpen(event.currentTarget)}
            disabled={busy}
          >
            <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {t('workflowAutomation.actions.inspect')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WorkflowOverviewSection({ canWrite = false }: WorkflowOverviewSectionProps) {
  const { orgId } = useRentalOrg();
  const { locale, t } = useLanguage();
  const {
    items,
    stats,
    loading,
    error,
    actionWorkflowId,
    reload,
    toggleWorkflow,
  } = useWorkflowRuntimeCenter(orgId);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<WorkflowRuntimeFilter>('all');
  const [selected, setSelected] = useState<WorkflowListItemDto | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const drawerReturnFocusRef = useRef<HTMLElement | null>(null);

  const filteredItems = useMemo(
    () => filterWorkflowItems(items, statusFilter, search, t),
    [items, statusFilter, search, t],
  );

  const openItem = (item: WorkflowListItemDto, trigger: HTMLElement) => {
    drawerReturnFocusRef.current = trigger;
    setSelected(item);
    setCreateMode(false);
    setConfigOpen(true);
  };

  const openCreate = (trigger?: HTMLElement) => {
    if (trigger) drawerReturnFocusRef.current = trigger;
    setSelected(null);
    setCreateMode(true);
    setConfigOpen(true);
  };

  const handleToggle = async (item: WorkflowListItemDto) => {
    if (!canWrite || item.sourceType === 'system') return;
    try {
      await toggleWorkflow(item.id);
    } catch {
      // error surfaced via hook
    }
  };

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden" data-testid="workflow-runtime-overview">
      <PageHeader
        title={t('workflowAutomation.overview.title')}
        description={t('workflowAutomation.overview.description')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              {t('workflowAutomation.actions.refresh')}
            </Button>
            {canWrite && (
              <Button type="button" size="sm" className="min-h-11" onClick={(e) => openCreate(e.currentTarget)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t('workflowAutomation.actions.new')}
              </Button>
            )}
          </div>
        }
      />

      {!canWrite && (
        <div
          className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground"
          data-testid="workflow-runtime-readonly-banner"
        >
          {t('workflowAutomation.readonly')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <SummaryTile label={t('workflowAutomation.stats.total')} value={stats.total} />
        <SummaryTile label={t('workflowAutomation.stats.active')} value={stats.active} />
        <SummaryTile label={t('workflowAutomation.stats.draft')} value={stats.draft} />
        <SummaryTile label={t('workflowAutomation.stats.disabled')} value={stats.inactive} />
        <SummaryTile label={t('workflowAutomation.stats.archived')} value={stats.archived} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('workflowAutomation.search.placeholder')}
            className="min-h-11 w-full rounded-lg border border-border bg-background py-2 pl-10 pr-3 text-sm"
            data-testid="workflow-runtime-search"
            aria-label={t('workflowAutomation.search.placeholder')}
          />
        </div>
        <div
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible"
          data-testid="workflow-runtime-filters"
          role="group"
          aria-label={t('workflowAutomation.filters.all')}
        >
          {WORKFLOW_RUNTIME_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`shrink-0 rounded-md px-3 py-2 text-xs font-semibold transition-colors min-h-11 ${
                statusFilter === filter
                  ? 'bg-brand text-brand-foreground'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
              aria-pressed={statusFilter === filter}
              data-testid={`workflow-runtime-filter-${filter}`}
            >
              {t(`workflowAutomation.filters.${filter}`)}
            </button>
          ))}
        </div>
      </div>

      {error && !loading && (
        <ErrorState
          title={t('workflowAutomation.error.title')}
          description={error}
          onRetry={() => void reload()}
          retryLabel={t('workflowAutomation.error.retry')}
        />
      )}

      {loading && !error && (
        <div
          className="rounded-xl border border-border/60 bg-card px-6 py-12 text-center"
          data-testid="workflow-runtime-loading"
        >
          <RefreshCw className="mx-auto mb-2 h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">{t('workflowAutomation.loading')}</p>
        </div>
      )}

      {!loading && !error && filteredItems.length === 0 && (
        <EmptyState
          icon={<Layers className="h-8 w-8" />}
          title={
            items.length > 0
              ? t('workflowAutomation.empty.filteredTitle')
              : t('workflowAutomation.empty.title')
          }
          description={
            items.length > 0
              ? t('workflowAutomation.empty.filteredDescription')
              : t('workflowAutomation.empty.description')
          }
          compact={items.length > 0}
          action={
            canWrite && items.length === 0 ? (
              <Button type="button" size="sm" className="min-h-11" onClick={(e) => openCreate(e.currentTarget)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t('workflowAutomation.actions.new')}
              </Button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && filteredItems.length > 0 && (
        <div className="space-y-2" data-testid="workflow-runtime-list">
          {filteredItems.map((item) => (
            <WorkflowRuntimeRow
              key={item.id}
              item={item}
              canWrite={canWrite}
              locale={locale}
              busy={actionWorkflowId === item.id}
              onOpen={(trigger) => openItem(item, trigger)}
              onEdit={(trigger) => {
                drawerReturnFocusRef.current = trigger;
                setSelected(item);
                setCreateMode(false);
                setConfigOpen(true);
              }}
              onToggle={() => void handleToggle(item)}
            />
          ))}
        </div>
      )}

      <WorkflowConfigDrawer
        open={configOpen}
        onOpenChange={setConfigOpen}
        item={selected}
        createMode={createMode}
        canWrite={canWrite}
        busy={Boolean(selected && actionWorkflowId === selected.id)}
        onSaved={() => void reload()}
        returnFocusRef={drawerReturnFocusRef}
      />
    </div>
  );
}

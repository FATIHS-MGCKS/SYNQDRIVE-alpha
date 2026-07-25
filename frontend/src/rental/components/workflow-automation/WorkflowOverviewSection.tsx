import { useMemo, useState } from 'react';
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
    <div className="booking-kpi-tile booking-kpi-tile--dense" data-testid="workflow-runtime-kpi">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
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
  onOpen: () => void;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const { t } = useLanguage();
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={busy}
      className="w-full rounded-xl border border-border/60 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/20"
      data-testid={`workflow-runtime-row-${item.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{item.name}</h3>
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
          <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
            <StatusChip tone={workflowLastRunTone(item.lastRunOutcome)} className="text-[10px]">
              {workflowLastRunOutcomeLabel(item.lastRunOutcome, t)}
            </StatusChip>
            {item.lastRunAt && (
              <span>
                {t('workflowAutomation.columns.lastRun')}: {formatWorkflowRelativeTime(item.lastRunAt, locale)}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {canWrite && item.sourceType !== 'system' && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={item.status === 'ACTIVE' ? t('workflowAutomation.actions.disable') : t('workflowAutomation.actions.enable')}
                onClick={onToggle}
                disabled={busy}
              >
                <Play className={`h-3.5 w-3.5 ${item.status === 'ACTIVE' ? 'rotate-90' : ''}`} />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} disabled={busy}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground">
            <Layers className="h-3 w-3" />
            {t('workflowAutomation.actions.inspect')}
          </span>
        </div>
      </div>
    </button>
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

  const filteredItems = useMemo(
    () => filterWorkflowItems(items, statusFilter, search, t),
    [items, statusFilter, search, t],
  );

  const openItem = (item: WorkflowListItemDto) => {
    setSelected(item);
    setCreateMode(false);
    setConfigOpen(true);
  };

  const openCreate = () => {
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
    <div className="space-y-4" data-testid="workflow-runtime-overview">
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
              <Button type="button" size="sm" onClick={openCreate}>
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('workflowAutomation.search.placeholder')}
            className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-3 text-xs"
            data-testid="workflow-runtime-search"
          />
        </div>
        <div className="flex flex-wrap gap-1" data-testid="workflow-runtime-filters">
          {WORKFLOW_RUNTIME_FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                statusFilter === filter
                  ? 'bg-brand text-brand-foreground'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
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
              <Button type="button" size="sm" onClick={openCreate}>
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
              onOpen={() => openItem(item)}
              onEdit={() => {
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
      />
    </div>
  );
}

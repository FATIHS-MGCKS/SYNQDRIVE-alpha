import { useMemo, useRef, useState } from 'react';
import { ClipboardList, Pencil, RefreshCw, Search, Settings2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { EmptyState, ErrorState, PageHeader } from '../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { TaskAutomationRuleDrawer } from './TaskAutomationRuleDrawer';
import type { TaskAutomationRuleDto } from './task-automation.types';
import { countOverriddenFields, summarizeChecklistState } from './task-automation.utils';
import { useTaskAutomationCenter } from './useTaskAutomationCenter';

interface TaskAutomationRulesSectionProps {
  canWrite?: boolean;
}

function SummaryTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="booking-kpi-tile booking-kpi-tile--dense min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RuleRow({
  rule,
  canWrite,
  locale,
  onOpen,
  t,
}: {
  rule: TaskAutomationRuleDto;
  canWrite: boolean;
  locale: string;
  onOpen: (rule: TaskAutomationRuleDto, trigger?: HTMLElement) => void;
  t: (key: import('../../../i18n/translations/en').TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  const overrideCount = countOverriddenFields(rule);

  return (
    <div
      className="w-full min-w-0 rounded-xl border border-border/60 bg-card px-3 py-3 sm:px-4"
      data-testid={`task-automation-rule-${rule.catalogKey}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={(event) => onOpen(rule, event.currentTarget)}
          className="min-w-0 flex-1 rounded-lg text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            canWrite
              ? t('taskAutomation.action.editAria', { name: rule.nameDe })
              : t('taskAutomation.action.viewAria', { name: rule.nameDe })
          }
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-sm font-semibold text-foreground">{rule.nameDe}</h3>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                  rule.effectivelyEnabled
                    ? 'bg-status-success-soft text-status-success'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {rule.effectivelyEnabled
                  ? t('taskAutomation.status.active')
                  : t('taskAutomation.status.inactive')}
              </span>
              {rule.hasOrgOverride && (
                <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                  {t('taskAutomation.badge.customized')}
                </span>
              )}
              {rule.isCritical && (
                <span className="shrink-0 rounded-full bg-status-attention-soft px-2 py-0.5 text-xs font-semibold text-status-attention">
                  {t('taskAutomation.badge.critical')}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{rule.descriptionDe}</p>
            <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
              <span>
                {t('taskAutomation.row.trigger')}: {rule.triggerLabelDe}
              </span>
              <span>
                {t('taskAutomation.row.activation')}: {rule.activationLabelDe}
              </span>
              <span>
                {t('taskAutomation.row.due')}: {rule.dueLabelDe}
              </span>
              <span>
                {t('taskAutomation.row.priority')}: {rule.priorityLabelDe}
              </span>
              <span>
                {t('taskAutomation.row.assignment')}: {rule.assignmentLabelDe}
              </span>
              <span>
                {t('taskAutomation.row.escalation')}: {rule.escalationLabelDe}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <ClipboardList className="h-3 w-3" />
                {summarizeChecklistState(locale, rule)}
              </span>
              {overrideCount > 0 && (
                <span>{t('taskAutomation.row.overriddenFields', { count: overrideCount })}</span>
              )}
            </div>
          </div>
        </button>
        <div className="shrink-0">
          <button
            type="button"
            onClick={(event) => onOpen(rule, event.currentTarget)}
            className="inline-flex min-h-11 items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground"
          >
            {canWrite ? (
              <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <Settings2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            {canWrite ? t('taskAutomation.action.edit') : t('taskAutomation.action.view')}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TaskAutomationRulesSection({ canWrite = false }: TaskAutomationRulesSectionProps) {
  const { orgId } = useRentalOrg();
  const { locale, t } = useLanguage();
  const { overview, loading, error, actionRuleId, reload, saveOverride, resetOverride } =
    useTaskAutomationCenter(orgId, locale);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'customized'>('all');
  const [selectedRule, setSelectedRule] = useState<TaskAutomationRuleDto | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerReturnFocusRef = useRef<HTMLElement | null>(null);

  const filteredRules = useMemo(() => {
    let rules = overview?.rules ?? [];
    if (statusFilter === 'active') rules = rules.filter((rule) => rule.effectivelyEnabled);
    if (statusFilter === 'disabled') rules = rules.filter((rule) => !rule.effectivelyEnabled);
    if (statusFilter === 'customized') rules = rules.filter((rule) => rule.hasOrgOverride);
    if (search.trim()) {
      const query = search.trim().toLowerCase();
      rules = rules.filter(
        (rule) =>
          rule.nameDe.toLowerCase().includes(query) ||
          rule.descriptionDe.toLowerCase().includes(query) ||
          rule.categoryDe.toLowerCase().includes(query) ||
          rule.triggerLabelDe.toLowerCase().includes(query),
      );
    }
    return rules;
  }, [overview?.rules, search, statusFilter]);

  const openRule = (rule: TaskAutomationRuleDto, trigger?: HTMLElement) => {
    if (trigger) drawerReturnFocusRef.current = trigger;
    setSelectedRule(rule);
    setDrawerOpen(true);
  };

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden" data-testid="task-automation-rules-section">
      <PageHeader
        title={t('taskAutomation.title')}
        description={t('taskAutomation.description')}
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('taskAutomation.refresh')}
          </Button>
        }
      />

      {!canWrite && (
        <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-xs text-muted-foreground">
          {t('taskAutomation.readonly')}
        </div>
      )}

      {overview && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <SummaryTile label={t('taskAutomation.summary.total')} value={overview.summary.total} />
          <SummaryTile label={t('taskAutomation.summary.active')} value={overview.summary.active} />
          <SummaryTile label={t('taskAutomation.summary.customized')} value={overview.summary.customized} />
          <SummaryTile label={t('taskAutomation.summary.disabled')} value={overview.summary.disabled} />
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('taskAutomation.search.placeholder')}
            aria-label={t('taskAutomation.search.label')}
            className="min-h-11 w-full rounded-lg border border-border bg-background py-2 pl-10 pr-3 text-sm"
          />
        </div>
        <div
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible"
          role="group"
          aria-label={t('taskAutomation.filter.groupLabel')}
        >
          {[
            { key: 'all', label: t('taskAutomation.filter.all') },
            { key: 'active', label: t('taskAutomation.filter.active') },
            { key: 'customized', label: t('taskAutomation.filter.customized') },
            { key: 'disabled', label: t('taskAutomation.filter.disabled') },
          ].map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setStatusFilter(filter.key as typeof statusFilter)}
              className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium min-h-11 ${
                statusFilter === filter.key
                  ? 'bg-brand text-brand-foreground'
                  : 'bg-muted/40 text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={statusFilter === filter.key}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !overview ? (
        <div
          className="rounded-xl border border-border/60 px-6 py-10 text-center text-sm text-muted-foreground"
          aria-busy="true"
          aria-live="polite"
        >
          <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
          {t('taskAutomation.loading')}
        </div>
      ) : error ? (
        <ErrorState
          title={t('taskAutomation.error.title')}
          description={error}
          onRetry={() => void reload()}
        />
      ) : filteredRules.length === 0 ? (
        <EmptyState
          title={t('taskAutomation.empty.title')}
          description={t('taskAutomation.empty.description')}
        />
      ) : (
        <div className="space-y-2">
          {filteredRules.map((rule) => (
            <RuleRow
              key={rule.ruleId}
              rule={rule}
              canWrite={canWrite}
              locale={locale}
              onOpen={openRule}
              t={t}
            />
          ))}
        </div>
      )}

      <TaskAutomationRuleDrawer
        open={drawerOpen}
        rule={selectedRule}
        canWrite={canWrite}
        saving={Boolean(selectedRule && actionRuleId === selectedRule.ruleId)}
        returnFocusRef={drawerReturnFocusRef}
        onOpenChange={(open) => {
          setDrawerOpen(open);
          if (!open) setSelectedRule(null);
        }}
        onSave={saveOverride}
        onReset={resetOverride}
      />
    </div>
  );
}

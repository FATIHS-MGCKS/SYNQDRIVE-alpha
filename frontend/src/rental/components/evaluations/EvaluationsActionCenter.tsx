import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ChevronRight, Filter, History, Loader2, UserRound } from 'lucide-react';
import type {
  EvaluationsRecommendationCategory,
  EvaluationsRecommendationRecord,
  EvaluationsRecommendationStatus,
} from '@synq/evaluations-insights/evaluations-recommendations';
import {
  canManageEvaluationsRecommendations,
  filterRecommendations,
  getRecommendationStatusTransitions,
} from '@synq/evaluations-insights/evaluations-recommendations';
import { useRentalOrg } from '../../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { useEvaluationsRecommendations } from '../../hooks/useEvaluationsRecommendations';
import { EmptyState } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { EVALUATIONS_TOUCH_TARGET_CLASS } from './evaluations-responsive.constants';
import {
  formatRecommendationDueDate,
  formatRecommendationMoney,
} from '../../lib/evaluations-recommendations-format';
import { EvaluationsRecommendationDetailDrawer } from './EvaluationsRecommendationDetailDrawer';
import { api } from '../../../lib/api';

const STATUS_KEYS: Record<EvaluationsRecommendationStatus, TranslationKey> = {
  NEW: 'evaluations.actionCenter.status.NEW',
  REVIEWED: 'evaluations.actionCenter.status.REVIEWED',
  ACCEPTED: 'evaluations.actionCenter.status.ACCEPTED',
  REJECTED: 'evaluations.actionCenter.status.REJECTED',
  PLANNED: 'evaluations.actionCenter.status.PLANNED',
  IN_PROGRESS: 'evaluations.actionCenter.status.IN_PROGRESS',
  IMPLEMENTED: 'evaluations.actionCenter.status.IMPLEMENTED',
  MEASURING_IMPACT: 'evaluations.actionCenter.status.MEASURING_IMPACT',
  COMPLETED: 'evaluations.actionCenter.status.COMPLETED',
  CANCELLED: 'evaluations.actionCenter.status.CANCELLED',
};

const CATEGORY_KEYS: Record<EvaluationsRecommendationCategory, TranslationKey> = {
  MAINTENANCE: 'evaluations.actionCenter.category.MAINTENANCE',
  SAFETY: 'evaluations.actionCenter.category.SAFETY',
  COMPLIANCE: 'evaluations.actionCenter.category.COMPLIANCE',
  COST_OPTIMIZATION: 'evaluations.actionCenter.category.COST_OPTIMIZATION',
  FLEET_UTILIZATION: 'evaluations.actionCenter.category.FLEET_UTILIZATION',
  CUSTOMER_EXPERIENCE: 'evaluations.actionCenter.category.CUSTOMER_EXPERIENCE',
  OPERATIONAL: 'evaluations.actionCenter.category.OPERATIONAL',
  OTHER: 'evaluations.actionCenter.category.OTHER',
};

const STATUS_TONE: Record<EvaluationsRecommendationStatus, string> = {
  NEW: 'sq-tone-brand',
  REVIEWED: 'sq-tone-info',
  ACCEPTED: 'sq-tone-success',
  REJECTED: 'text-muted-foreground',
  PLANNED: 'sq-tone-brand',
  IN_PROGRESS: 'sq-tone-watch',
  IMPLEMENTED: 'sq-tone-success',
  MEASURING_IMPACT: 'sq-tone-info',
  COMPLETED: 'sq-tone-success',
  CANCELLED: 'text-muted-foreground',
};

interface EvaluationsActionCenterProps {
  isDarkMode: boolean;
}

export function EvaluationsActionCenter({ isDarkMode }: EvaluationsActionCenterProps) {
  const { t, locale } = useLanguage();
  const { orgId, userRole, hasPermission } = useRentalOrg();
  const analyticsLocale = locale === 'en' ? 'en' : 'de';
  const canManage = canManageEvaluationsRecommendations({ userRole, hasPermission });

  const {
    items,
    loading,
    error,
    filters,
    setFilters,
    reload,
    selected,
    setSelectedId,
    events,
    eventsLoading,
    pendingId,
    transitionStatus,
    updateRecommendation,
  } = useEvaluationsRecommendations(orgId);

  const [statusFilter, setStatusFilter] = useState<EvaluationsRecommendationStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<EvaluationsRecommendationCategory | ''>('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [orgMembers, setOrgMembers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    setFilters({
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
      ownerId: ownerFilter || undefined,
      minPriority: priorityFilter ? Number(priorityFilter) : undefined,
    });
  }, [statusFilter, categoryFilter, ownerFilter, priorityFilter, setFilters]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    api.users
      .listByOrg(orgId)
      .then((rows) => {
        if (cancelled) return;
        setOrgMembers(
          rows.map((u) => ({
            id: u.id,
            name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setOrgMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const filtered = useMemo(
    () => filterRecommendations(items, filters),
    [items, filters],
  );

  const ownerOptions = useMemo(() => {
    const ids = new Set(filtered.map((row) => row.ownerId).filter(Boolean) as string[]);
    return orgMembers.filter((m) => ids.has(m.id));
  }, [filtered, orgMembers]);

  const handleTransition = async (
    id: string,
    status: EvaluationsRecommendationStatus,
    reason?: string,
  ) => {
    setActionError(null);
    try {
      await transitionStatus(id, status, reason);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('evaluations.actionCenter.error.action'));
    }
  };

  const handleUpdate = async (
    id: string,
    patch: Partial<Pick<EvaluationsRecommendationRecord, 'ownerId' | 'dueAt' | 'priority'>>,
  ) => {
    setActionError(null);
    try {
      await updateRecommendation(id, patch);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t('evaluations.actionCenter.error.action'));
    }
  };

  return (
    <div
      className="space-y-4"
      data-testid="evaluations-action-center"
      aria-busy={loading || pendingId != null}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">
            {t('evaluations.actionCenter.title')}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('evaluations.actionCenter.subtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-[11px] font-medium',
            EVALUATIONS_TOUCH_TARGET_CLASS,
          )}
          aria-label={t('evaluations.actionCenter.refresh')}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {t('evaluations.actionCenter.refresh')}
        </button>
      </div>

      <fieldset className="rounded-xl border border-border/50 p-3">
        <legend className="sr-only">{t('evaluations.actionCenter.filtersLegend')}</legend>
        <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Filter className="h-3.5 w-3.5" aria-hidden />
          {t('evaluations.actionCenter.filters')}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
            {t('evaluations.actionCenter.filter.status')}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as EvaluationsRecommendationStatus | '')}
              className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px] text-foreground"
              aria-label={t('evaluations.actionCenter.filter.status')}
            >
              <option value="">{t('evaluations.actionCenter.filter.all')}</option>
              {Object.keys(STATUS_KEYS).map((status) => (
                <option key={status} value={status}>
                  {t(STATUS_KEYS[status as EvaluationsRecommendationStatus])}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
            {t('evaluations.actionCenter.filter.category')}
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as EvaluationsRecommendationCategory | '')
              }
              className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px] text-foreground"
              aria-label={t('evaluations.actionCenter.filter.category')}
            >
              <option value="">{t('evaluations.actionCenter.filter.all')}</option>
              {Object.keys(CATEGORY_KEYS).map((category) => (
                <option key={category} value={category}>
                  {t(CATEGORY_KEYS[category as EvaluationsRecommendationCategory])}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
            {t('evaluations.actionCenter.filter.owner')}
            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px] text-foreground"
              aria-label={t('evaluations.actionCenter.filter.owner')}
            >
              <option value="">{t('evaluations.actionCenter.filter.all')}</option>
              {ownerOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
            {t('evaluations.actionCenter.filter.priority')}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="rounded-lg border border-border/60 bg-background px-2 py-2 text-[12px] text-foreground"
              aria-label={t('evaluations.actionCenter.filter.priority')}
            >
              <option value="">{t('evaluations.actionCenter.filter.all')}</option>
              <option value="50">{t('evaluations.actionCenter.filter.priorityHigh')}</option>
              <option value="20">{t('evaluations.actionCenter.filter.priorityMedium')}</option>
            </select>
          </label>
        </div>
      </fieldset>

      {!canManage ? (
        <p className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground" role="status">
          {t('evaluations.actionCenter.readOnlyHint')}
        </p>
      ) : null}

      {error ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-600 dark:text-red-300"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{t('evaluations.actionCenter.error.loadTitle')}</p>
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-600 dark:text-red-300" role="alert">
          {actionError}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-[12px] text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('evaluations.actionCenter.loading')}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          title={t('evaluations.actionCenter.emptyTitle')}
          description={t('evaluations.actionCenter.emptyDescription')}
        />
      ) : (
        <ul className="space-y-2" aria-label={t('evaluations.actionCenter.listLabel')}>
          {filtered.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={cn(
                  'w-full rounded-xl border p-3 text-left transition-colors hover:bg-muted/30',
                  isDarkMode ? 'border-border' : 'border-gray-200',
                  EVALUATIONS_TOUCH_TARGET_CLASS,
                )}
                aria-label={`${row.title}, ${t(STATUS_KEYS[row.status])}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          STATUS_TONE[row.status],
                          'bg-muted/50',
                        )}
                      >
                        {t(STATUS_KEYS[row.status])}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground">
                        {t(CATEGORY_KEYS[row.category])}
                      </span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        P{row.priority}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] font-semibold text-foreground">{row.title}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      {row.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                      <span>
                        {t('evaluations.actionCenter.netBenefit')}:{' '}
                        <span className="font-medium text-foreground tabular-nums">
                          {formatRecommendationMoney(row.expectedNetBenefit, analyticsLocale)}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <UserRound className="h-3 w-3" aria-hidden />
                        {row.ownerId
                          ? orgMembers.find((m) => m.id === row.ownerId)?.name ??
                            t('evaluations.actionCenter.ownerAssigned')
                          : t('evaluations.actionCenter.ownerUnassigned')}
                      </span>
                      <span>
                        {t('evaluations.actionCenter.due')}:{' '}
                        {formatRecommendationDueDate(row.dueAt, analyticsLocale)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <EvaluationsRecommendationDetailDrawer
        open={selected != null}
        recommendation={selected}
        canManage={canManage}
        pending={pendingId === selected?.id}
        orgMembers={orgMembers}
        events={events}
        eventsLoading={eventsLoading}
        availableTransitions={
          selected ? getRecommendationStatusTransitions(selected.status) : []
        }
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onTransition={handleTransition}
        onUpdate={handleUpdate}
        analyticsLocale={analyticsLocale}
      />
    </div>
  );
}

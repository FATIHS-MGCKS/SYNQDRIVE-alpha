import { useEffect, useMemo, useState } from 'react';
import { Activity, ChevronDown, ChevronRight, ClipboardList, Plus } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../../../components/ui/collapsible';
import { EmptyState, ErrorState, SkeletonCard, StatusChip } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { fhsActionLabelDe } from './fleet-health-service-labels';
import { fhs } from './fleet-health-service-shell';
import type {
  FleetHealthServiceOverviewRow,
  FleetHealthServicePrioritySection,
  FleetHealthServicePrioritySectionKey,
} from './fleet-health-service.view-model';

const SECTION_TITLE_KEYS: Record<FleetHealthServicePrioritySectionKey, TranslationKey> = {
  technically_blocked: 'fleetHealthService.overview.section.technicallyBlocked',
  handle_today: 'fleetHealthService.overview.section.handleToday',
  technical_review: 'fleetHealthService.overview.section.technicalReview',
  incomplete_data: 'fleetHealthService.overview.section.incompleteData',
  due_soon: 'fleetHealthService.overview.section.dueSoon',
};

const SECTION_EMPTY_KEYS: Record<FleetHealthServicePrioritySectionKey, TranslationKey> = {
  technically_blocked: 'fleetHealthService.overview.empty.technicallyBlocked',
  handle_today: 'fleetHealthService.overview.empty.handleToday',
  technical_review: 'fleetHealthService.overview.empty.technicalReview',
  incomplete_data: 'fleetHealthService.overview.empty.incompleteData',
  due_soon: 'fleetHealthService.overview.empty.dueSoon',
};

interface FleetHealthServicePriorityOverviewProps {
  sections: FleetHealthServicePrioritySection[];
  loading?: boolean;
  healthError?: string | null;
  serviceError?: string | null;
  onReload?: () => void;
  onOpenVehicle?: (vehicleId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onCreateTask?: (vehicleId: string) => void;
  onReviewVehicle?: (vehicleId: string) => void;
}

function PriorityOverviewRow({
  row,
  onOpenVehicle,
  onOpenTask,
  onCreateTask,
  onReviewVehicle,
}: {
  row: FleetHealthServiceOverviewRow;
  onOpenVehicle?: (vehicleId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onCreateTask?: (vehicleId: string) => void;
  onReviewVehicle?: (vehicleId: string) => void;
}) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const actionLabel = fhsActionLabelDe(row.recommendedAction);
  const hasDetails = row.detailLines.length > 0;
  const KindIcon = row.kind === 'health' ? Activity : ClipboardList;
  const kindLabel =
    row.kind === 'health'
      ? t('fleetHealthService.overview.kind.health')
      : t('fleetHealthService.overview.kind.task');
  const sourcePrefix =
    row.kind === 'health'
      ? t('fleetHealthService.overview.sourceHealth')
      : t('fleetHealthService.overview.sourceWork');

  const handlePrimary = () => {
    if (row.recommendedAction === 'open_task' && row.existingTaskId) {
      onOpenTask?.(row.existingTaskId);
      return;
    }
    if (row.recommendedAction === 'create_task') {
      onCreateTask?.(row.vehicleId);
      return;
    }
    if (row.recommendedAction === 'review_vehicle') {
      onReviewVehicle?.(row.vehicleId);
      return;
    }
    if (row.vehicleId) onOpenVehicle?.(row.vehicleId);
  };

  return (
    <div className={fhs.interactiveRow}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[13px] font-bold tracking-tight text-foreground tabular-nums">
            {row.plate}
          </span>
          {row.makeModelYear ? (
            <span className={cn(fhs.meta, 'truncate')}>{row.makeModelYear}</span>
          ) : null}
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
              row.kind === 'health'
                ? 'border-[color:var(--status-watch)]/25 bg-[color:var(--status-watch)]/[0.06] text-[color:var(--status-watch)]'
                : 'border-[color:var(--brand)]/25 bg-[color:var(--brand-soft)]/50 text-[color:var(--brand)]',
            )}
          >
            <KindIcon className="h-3 w-3 shrink-0" aria-hidden />
            {kindLabel}
          </span>
          <StatusChip tone={row.statusTone} className="shrink-0 text-[10px]">
            {row.statusLabel}
          </StatusChip>
        </div>
        <p className={cn(fhs.rowBody, 'line-clamp-2')}>{row.primaryReason}</p>
        <p className={fhs.sourceTag}>
          {sourcePrefix}: {row.sourceLabel}
        </p>

        {hasDetails ? (
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform duration-200', expanded && 'rotate-180')}
              />
              {expanded
                ? t('fleetHealthService.overview.hideDetails')
                : t('fleetHealthService.overview.showDetails')}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1.5 space-y-1 border-l-2 border-border/50 pl-2.5">
              {row.detailLines.map((line) => (
                <p key={line} className="text-[11px] leading-snug text-muted-foreground">
                  {line}
                </p>
              ))}
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1 self-center">
        {row.recommendedAction === 'create_task' ? (
          <Button variant="neutral" size="sm" onClick={handlePrimary}>
            <Plus className="h-3.5 w-3.5" />
            {actionLabel}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={handlePrimary}>
            {actionLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function FleetHealthServicePriorityOverview({
  sections,
  loading,
  healthError,
  serviceError,
  onReload,
  onOpenVehicle,
  onOpenTask,
  onCreateTask,
  onReviewVehicle,
}: FleetHealthServicePriorityOverviewProps) {
  const { t } = useLanguage();

  const defaultOpenSections = useMemo(() => {
    const keys = sections.filter((s) => s.rows.length > 0).map((s) => s.key);
    return new Set(keys.length > 0 ? keys : ['technically_blocked', 'handle_today']);
  }, [sections]);

  const [openSections, setOpenSections] = useState<Set<FleetHealthServicePrioritySectionKey>>(
    () => defaultOpenSections,
  );

  useEffect(() => {
    if (loading) return;
    const withRows = sections.filter((s) => s.rows.length > 0).map((s) => s.key);
    if (withRows.length === 0) return;
    setOpenSections((prev) => {
      const next = new Set(prev);
      for (const key of withRows) next.add(key);
      return next;
    });
  }, [sections, loading]);

  const hasAnyRows = sections.some((section) => section.rows.length > 0);
  const fetchError = healthError ?? serviceError;

  if (fetchError && !loading) {
    return (
      <ErrorState
        compact
        title={t('fleetHealthService.overview.errorTitle')}
        description={fetchError}
        onRetry={onReload}
        retryLabel={t('fleetHealthService.overview.errorRetry')}
      />
    );
  }

  if (loading && !hasAnyRows) {
    return (
      <div className="space-y-2">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const isOpen = openSections.has(section.key);
        const count = section.rows.length;

        return (
          <Collapsible
            key={section.key}
            open={isOpen}
            onOpenChange={(open) => {
              setOpenSections((prev) => {
                const next = new Set(prev);
                if (open) next.add(section.key);
                else next.delete(section.key);
                return next;
              });
            }}
            className="rounded-xl border border-border/45 surface-elevated"
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/15">
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground">
                  {t(SECTION_TITLE_KEYS[section.key])}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  {count === 1
                    ? t('fleetHealthService.overview.entryCountOne')
                    : t('fleetHealthService.overview.entryCount').replace(
                        '{count}',
                        String(count),
                      )}
                </p>
              </div>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
                  isOpen && 'rotate-180',
                )}
              />
            </CollapsibleTrigger>

            <CollapsibleContent className="border-t border-border/40 px-3 py-2.5">
              {count === 0 ? (
                <EmptyState
                  compact
                  title={t('fleetHealthService.overview.emptyTitle')}
                  description={t(SECTION_EMPTY_KEYS[section.key])}
                />
              ) : (
                <div className="space-y-2">
                  {section.rows.map((row) => (
                    <PriorityOverviewRow
                      key={row.id}
                      row={row}
                      onOpenVehicle={onOpenVehicle}
                      onOpenTask={onOpenTask}
                      onCreateTask={onCreateTask}
                      onReviewVehicle={onReviewVehicle}
                    />
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

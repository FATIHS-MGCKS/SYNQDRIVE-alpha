import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import {
  Activity,
  Briefcase,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  Plus,
} from 'lucide-react';
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
  FleetHealthServicePrioritySection,
  FleetHealthServicePrioritySectionKey,
  FleetHealthServiceVehicleFinding,
  FleetHealthServiceVehicleOverviewRow,
  FleetHealthServiceVehicleTaskItem,
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

function FindingChip({ finding }: { finding: FleetHealthServiceVehicleFinding }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
        finding.tone === 'critical'
          ? 'border-[color:var(--status-critical)]/25 bg-[color:var(--status-critical)]/[0.06] text-[color:var(--status-critical)]'
          : finding.tone === 'warning'
            ? 'border-[color:var(--status-watch)]/25 bg-[color:var(--status-watch)]/[0.06] text-[color:var(--status-watch)]'
            : 'border-border/50 bg-muted/30 text-muted-foreground',
      )}
      title={finding.reason}
    >
      <Activity className="h-3 w-3 shrink-0" aria-hidden />
      <span className="font-semibold">{finding.label}</span>
      <span className="opacity-60">·</span>
      <span className="truncate">{finding.detail}</span>
    </span>
  );
}

function WorkItemRow({
  item,
  onOpenTask,
}: {
  item: FleetHealthServiceVehicleTaskItem;
  onOpenTask?: (taskId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenTask?.(item.id)}
      className="flex w-full items-start justify-between gap-2 rounded-lg border border-border/40 px-2.5 py-2 text-left transition-colors hover:bg-muted/20"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <ClipboardList className="h-3.5 w-3.5 shrink-0 text-[color:var(--brand)]" aria-hidden />
          <span className="text-[11px] font-semibold text-foreground">{item.title}</span>
          <StatusChip tone={item.tone} className="text-[9px]">
            {item.statusLabel}
          </StatusChip>
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          {item.sourceLabel}
          {item.dueLabel ? ` · ${item.dueLabel}` : ''}
        </p>
      </div>
      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function VehiclePriorityRow({
  row,
  onOpenVehicle,
  onOpenTask,
  onCreateTask,
  onReviewVehicle,
}: {
  row: FleetHealthServiceVehicleOverviewRow;
  onOpenVehicle?: (vehicleId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onCreateTask?: (vehicleId: string) => void;
  onReviewVehicle?: (vehicleId: string) => void;
}) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const actionLabel = fhsActionLabelDe(row.recommendedAction);

  const handlePrimary = () => {
    if (row.recommendedAction === 'open_task' && row.primaryLinkedTaskId) {
      onOpenTask?.(row.primaryLinkedTaskId);
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
    onOpenVehicle?.(row.vehicleId);
  };

  const toggleExpanded = () => setExpanded((prev) => !prev);

  const onHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleExpanded();
    }
  };

  const tasksForCase = (serviceCase: FleetHealthServiceVehicleOverviewRow['cases'][number]) =>
    row.matchedTasks.filter(
      (task) =>
        task.serviceCaseId === serviceCase.id || serviceCase.linkedTaskIds.includes(task.id),
    );

  const hasExpandableContent =
    row.findings.length > 0 ||
    row.cases.length > 0 ||
    row.unmatchedTasks.length > 0 ||
    Boolean(row.dataQualityNote);

  return (
    <div className={fhs.interactiveRow}>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onClick={toggleExpanded}
          onKeyDown={onHeaderKeyDown}
          className="cursor-pointer space-y-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-[13px] font-bold tracking-tight text-foreground tabular-nums">
              {row.plate}
            </span>
            {row.makeModelYear ? (
              <span className={cn(fhs.meta, 'truncate')}>{row.makeModelYear}</span>
            ) : null}
            <StatusChip tone={row.primaryStatusTone} className="shrink-0 text-[10px]">
              {row.primaryStatusLabel}
            </StatusChip>
            {row.moreCount > 0 ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                +{row.moreCount} {t('fleetHealthService.overview.moreBadge')}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground tabular-nums">
            {row.findings.length > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Activity className="h-3 w-3" aria-hidden />
                {row.findings.length} {t('fleetHealthService.overview.findingsCount')}
              </span>
            ) : null}
            {row.openTaskCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <ClipboardList className="h-3 w-3" aria-hidden />
                {row.openTaskCount} {t('fleetHealthService.overview.tasksCount')}
              </span>
            ) : null}
            {row.openCaseCount > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Briefcase className="h-3 w-3" aria-hidden />
                {row.openCaseCount} {t('fleetHealthService.overview.casesCount')}
              </span>
            ) : null}
          </div>

          <p className={cn(fhs.rowBody, 'line-clamp-2 font-medium')}>{row.primaryBlockage}</p>
        </div>

        {hasExpandableContent ? (
          <Collapsible open={expanded} onOpenChange={setExpanded}>
            <CollapsibleTrigger className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform duration-200', expanded && 'rotate-180')}
              />
              {expanded
                ? t('fleetHealthService.overview.hideDetails')
                : t('fleetHealthService.overview.showDetails')}
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-3 border-l-2 border-border/50 pl-2.5">
              {row.findings.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('fleetHealthService.overview.findingsHeading')}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {row.findings.map((finding) => (
                      <div key={finding.id} className="space-y-1">
                        <FindingChip finding={finding} />
                        <p className="text-[10px] text-muted-foreground">
                          {t('fleetHealthService.overview.sourceHealth')}: {finding.sourceLabel}
                          {finding.linkedTaskId
                            ? ` · ${t('fleetHealthService.overview.linkedTask')}`
                            : ''}
                        </p>
                        {finding.linkedTaskId ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => onOpenTask?.(finding.linkedTaskId!)}
                          >
                            {t('fleetHealthService.overview.openLinkedTask')}
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {row.cases.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('fleetHealthService.overview.casesHeading')}
                  </p>
                  {row.cases.map((serviceCase) => (
                    <div
                      key={serviceCase.id}
                      className="space-y-1 rounded-lg border border-border/40 px-2.5 py-2"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        <span className="text-[11px] font-semibold">{serviceCase.title}</span>
                        <StatusChip tone="info" className="text-[9px]">
                          {serviceCase.statusLabel}
                        </StatusChip>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {t('fleetHealthService.overview.caseSource')}: {serviceCase.sourceLabel}
                      </p>
                      {tasksForCase(serviceCase).map((task) => (
                        <WorkItemRow key={task.id} item={task} onOpenTask={onOpenTask} />
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}

              {row.unmatchedTasks.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('fleetHealthService.overview.unmatchedWorkHeading')}
                  </p>
                  {row.unmatchedTasks.map((task) => (
                    <WorkItemRow key={task.id} item={task} onOpenTask={onOpenTask} />
                  ))}
                </div>
              ) : null}

              {row.dataQualityNote ? (
                <p className="text-[10px] text-muted-foreground">{row.dataQualityNote}</p>
              ) : null}
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
                    <VehiclePriorityRow
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

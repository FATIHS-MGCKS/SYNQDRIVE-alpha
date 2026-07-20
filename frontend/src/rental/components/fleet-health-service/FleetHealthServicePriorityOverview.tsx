import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  fhsVehicleRowDetailsId,
  fhsVehicleRowTriggerId,
} from './fleet-health-service-a11y';
import { FleetHealthServiceCaseDrawer } from './FleetHealthServiceCaseDrawer';
import { fhsActionLabelDe } from './fleet-health-service-labels';
import { fhs } from './fleet-health-service-shell';
import type {
  FleetHealthServicePrioritySection,
  FleetHealthServicePrioritySectionKey,
  FleetHealthServiceVehicleCaseItem,
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
  const { t } = useLanguage();

  return (
    <button
      type="button"
      onClick={() => onOpenTask?.(item.id)}
      className={cn(
        fhs.touchTarget,
        'h-auto w-full items-start justify-between gap-2 rounded-lg border border-border/40 px-2.5 py-2.5 text-left transition-colors hover:bg-muted/20',
      )}
      aria-label={t('fleetHealthService.a11y.openTask', { title: item.title })}
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
      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
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
  const [caseDrawerOpen, setCaseDrawerOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<FleetHealthServiceVehicleCaseItem | null>(null);
  const expandTriggerRef = useRef<HTMLButtonElement>(null);
  const caseTriggerRef = useRef<HTMLButtonElement>(null);
  const actionLabel = fhsActionLabelDe(row.recommendedAction);
  const detailsId = fhsVehicleRowDetailsId(row.id);
  const triggerId = fhsVehicleRowTriggerId(row.id);

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

  const openCaseDrawer = (serviceCase: FleetHealthServiceVehicleCaseItem) => {
    setSelectedCase(serviceCase);
    setCaseDrawerOpen(true);
  };

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setExpanded(false);
        expandTriggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [expanded]);

  const expandLabel = expanded
    ? t('fleetHealthService.a11y.collapseVehicle', { plate: row.plate })
    : t('fleetHealthService.a11y.expandVehicle', { plate: row.plate });

  return (
    <div className={fhs.interactiveRow}>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="space-y-1">
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
            <CollapsibleTrigger
              ref={expandTriggerRef}
              id={triggerId}
              aria-controls={detailsId}
              aria-expanded={expanded}
              aria-label={expandLabel}
              className={cn(
                fhs.touchTarget,
                'h-auto min-h-11 w-full justify-start gap-1 px-0 text-[11px] font-medium text-muted-foreground hover:text-foreground',
              )}
            >
              <ChevronDown
                className={cn(fhs.chevron, 'h-3.5 w-3.5', expanded && 'rotate-180')}
                aria-hidden
              />
              {expanded
                ? t('fleetHealthService.overview.hideDetails')
                : t('fleetHealthService.overview.showDetails')}
            </CollapsibleTrigger>
            <CollapsibleContent
              id={detailsId}
              role="region"
              aria-labelledby={triggerId}
              className="mt-2 space-y-3 border-l-2 border-border/50 pl-2.5"
            >
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
                            className="h-11 min-h-11 px-2 text-[11px]"
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
                    <button
                      key={serviceCase.id}
                      type="button"
                      onClick={(event) => {
                        caseTriggerRef.current = event.currentTarget;
                        openCaseDrawer(serviceCase);
                      }}
                      className={cn(
                        fhs.touchTarget,
                        'h-auto w-full flex-col items-stretch gap-1 rounded-lg border border-border/40 px-2.5 py-2.5 text-left hover:bg-muted/15',
                      )}
                      aria-label={t('fleetHealthService.a11y.openServiceCase', {
                        title: serviceCase.title,
                      })}
                    >
                      <div className="flex w-full flex-wrap items-center gap-1.5">
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        <span className="text-[11px] font-semibold">{serviceCase.title}</span>
                        <StatusChip tone="info" className="text-[9px]">
                          {serviceCase.statusLabel}
                        </StatusChip>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {t('fleetHealthService.overview.caseSource')}: {serviceCase.sourceLabel}
                        {tasksForCase(serviceCase).length > 0
                          ? ` · ${tasksForCase(serviceCase).length} ${t('fleetHealthService.overview.tasksCount')}`
                          : ''}
                      </p>
                    </button>
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

      <div className="flex w-full shrink-0 flex-row items-center justify-end gap-1 self-stretch sm:w-auto sm:flex-col sm:items-end sm:self-center">
        {row.recommendedAction === 'create_task' ? (
          <Button variant="neutral" size="sm" className="min-h-11" onClick={handlePrimary}>
            <Plus className="h-3.5 w-3.5" />
            {actionLabel}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="min-h-11" onClick={handlePrimary}>
            {actionLabel}
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <FleetHealthServiceCaseDrawer
        open={caseDrawerOpen}
        onOpenChange={setCaseDrawerOpen}
        serviceCase={selectedCase}
        tasks={selectedCase ? tasksForCase(selectedCase) : []}
        onOpenTask={onOpenTask}
        returnFocusRef={caseTriggerRef}
      />
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
      <div className="space-y-2" aria-busy="true" aria-live="polite">
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
        const sectionTitle = t(SECTION_TITLE_KEYS[section.key]);

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
            <CollapsibleTrigger
              aria-expanded={isOpen}
              aria-label={
                isOpen
                  ? t('fleetHealthService.a11y.sectionCollapse', { title: sectionTitle })
                  : t('fleetHealthService.a11y.sectionExpand', { title: sectionTitle })
              }
              className={cn(
                fhs.touchTarget,
                'h-auto min-h-11 w-full justify-between gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/15',
              )}
            >
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground">{sectionTitle}</p>
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
                className={cn(fhs.chevron, 'h-4 w-4 shrink-0 text-muted-foreground', isOpen && 'rotate-180')}
                aria-hidden
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

import { useMemo, useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { VehicleData } from '../data/vehicles';
import { api, type ApiTask } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  DataCard,
  EmptyState,
  ErrorState,
  SectionHeader,
  SkeletonRows,
  StatusChip,
  Timeline,
} from '../../components/patterns';
import type { TimelineItem } from '../../components/patterns';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  formatEuroAmount,
  uiStatusTone,
  type VehicleDocumentCategoryId,
  type VehicleDocumentCategorySummary,
  type VehicleFileSummary,
} from '../lib/vehicle-file-summary.types';
import { useVehicleFileSummary } from '../hooks/useVehicleFileSummary';
import {
  CATEGORY_UI_META,
  MANDATORY_CATEGORY_IDS,
  sortDocumentCategories,
  type CategoryUiMeta,
} from './documents/vehicle-file.constants';
import {
  VehicleDocumentUploadDrawer,
  type DocumentDrawerMode,
} from './documents/VehicleDocumentUploadDrawer';
import { DocumentComplianceSummaryCard } from './documents/DocumentComplianceSummaryCard';
import {
  formatVehicleDocumentDate,
  formatVehicleDocumentSpecValue,
  resolveFixedCostStatusLabel,
  resolveRentalHealthLabel,
  resolveStatusSourceLabel,
  resolveTimelineKindLabel,
  resolveVehicleDocumentCategoryDescription,
  resolveVehicleDocumentCategoryEmptyHint,
  resolveVehicleDocumentCategoryShortTitle,
  resolveVehicleDocumentUiStatusLabel,
  resolveVehicleDocumentsDisplayName,
} from '../lib/rental-vehicle-documents-i18n';
import { vehicleFormattingLocaleOrDefault } from './vehicle/vehicle-i18n';

interface DocumentsViewProps {
  vehicle?: VehicleData | null;
  onOpenLinkedTask?: (taskId: string) => void;
}

interface DrawerState {
  categoryId: VehicleDocumentCategoryId;
  mode: DocumentDrawerMode;
  extractionId?: string | null;
  fileName?: string | null;
}

type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

function fixedCostStatusTone(status: string): 'success' | 'watch' | 'neutral' {
  if (status === 'verified') return 'success';
  if (status === 'missing_evidence') return 'watch';
  return 'neutral';
}

function timelineTone(
  status: string,
): 'success' | 'watch' | 'critical' | 'info' | 'neutral' {
  if (status === 'applied' || status === 'verified') return 'success';
  if (status === 'needs_review' || status === 'processing' || status === 'expiring_soon') return 'watch';
  if (status === 'expired' || status === 'error') return 'critical';
  if (status === 'info') return 'info';
  return 'neutral';
}

export function DocumentsView({ vehicle, onOpenLinkedTask }: DocumentsViewProps) {
  const { t, locale } = useLanguage();
  const { orgId } = useRentalOrg();
  const { summary, loading, error, reload } = useVehicleFileSummary(vehicle?.id);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [vehicleTasks, setVehicleTasks] = useState<ApiTask[]>([]);

  useEffect(() => {
    if (!orgId || !vehicle?.id) {
      setVehicleTasks([]);
      return;
    }
    let cancelled = false;
    api.tasks
      .forVehicle(orgId, vehicle.id)
      .then((rows) => {
        if (!cancelled) setVehicleTasks(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setVehicleTasks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, vehicle?.id]);

  const taskByDocumentId = useMemo(() => {
    const map = new Map<string, ApiTask>();
    for (const task of vehicleTasks) {
      if (task.documentId) map.set(task.documentId, task);
    }
    return map;
  }, [vehicleTasks]);

  const vehicleName = vehicle
    ? resolveVehicleDocumentsDisplayName(vehicle.make, vehicle.model, t)
    : t('vehicleDocuments.noVehicle.title');
  const licensePlate = summary?.vehicle.licensePlate ?? vehicle?.license ?? null;
  const vin = summary?.vehicle.vin ?? null;
  const odometer =
    summary?.vehicle.odometerKm != null
      ? `${Math.round(summary.vehicle.odometerKm).toLocaleString(vehicleFormattingLocaleOrDefault(locale))} km`
      : null;

  const sortedCategories = useMemo(
    () => (summary ? sortDocumentCategories(summary.documentCategories) : []),
    [summary],
  );

  const missingMandatory = summary
    ? summary.mandatoryDocumentCoverage.total - summary.mandatoryDocumentCoverage.configured
    : null;

  const hasVariableCosts =
    summary &&
    (summary.variableCostAverages.serviceAverageMonthly != null ||
      summary.variableCostAverages.repairAverageMonthly != null);

  const timelineItems: TimelineItem[] = useMemo(() => {
    if (!summary) return [];
    return summary.timeline.map((item) => {
      const kindLabel = resolveTimelineKindLabel(item.kind, t);
      const linkedTask =
        item.relatedExtractionId != null
          ? vehicleTasks.find((task) => task.documentId === item.relatedExtractionId) ?? null
          : null;
      return {
        id: item.id,
        title: item.title,
        time: formatVehicleDocumentDate(locale, item.occurredAt, true),
        description: [
          item.subtitle,
          item.relatedServiceEventId ? t('vehicleDocuments.timeline.linkedServiceEvent') : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
        tone: timelineTone(item.uiStatus),
        meta: (
          <div className="flex flex-wrap items-center gap-1">
            {kindLabel ? (
              <StatusChip tone="neutral" className="!text-[9px]">
                {kindLabel}
              </StatusChip>
            ) : null}
            <StatusChip tone="neutral" className="!text-[9px]">
              {t('vehicleDocuments.source.prefix')} {resolveStatusSourceLabel(item.source, t)}
            </StatusChip>
            {linkedTask && onOpenLinkedTask ? (
              <button
                type="button"
                onClick={() => onOpenLinkedTask(linkedTask.id)}
                className="text-[9px] font-semibold text-[color:var(--brand-ink)] underline sq-press"
              >
                {t('vehicleDocuments.timeline.taskPrefix')} {linkedTask.title}
              </button>
            ) : null}
          </div>
        ),
      };
    });
  }, [summary, vehicleTasks, onOpenLinkedTask, t, locale]);

  const openUpload = (categoryId: VehicleDocumentCategoryId) => {
    setDrawer({ categoryId, mode: 'upload' });
  };

  const openReview = (category: VehicleDocumentCategorySummary) => {
    if (!category.latestExtractionId) return;
    setDrawer({
      categoryId: category.id,
      mode: category.uiStatus === 'needs_review' ? 'review' : 'view',
      extractionId: category.latestExtractionId,
      fileName: category.latestFileName,
    });
  };

  if (!vehicle?.id) {
    return (
      <EmptyState
        icon={<Icon name="file-text" className="w-5 h-5" />}
        title={t('vehicleDocuments.noVehicle.title')}
        description={t('vehicleDocuments.noVehicle.description')}
      />
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {error ? (
        <ErrorState
          compact
          title={t('vehicleDocuments.error.title')}
          description={error}
          onRetry={() => void reload()}
          retryLabel={t('common.retry')}
        />
      ) : null}

      {loading && !summary ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <div className="surface-premium h-32 animate-pulse rounded-xl border border-border/60 bg-muted/20" />
          <div className="surface-premium h-32 animate-pulse rounded-xl border border-border/60 bg-muted/20" />
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-stretch">
          <header className="surface-premium surface-elevated flex flex-col rounded-xl border border-border/70 p-3 sm:p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1.5">
                <p className="sq-section-label">{t('vehicleDocuments.header.title')}</p>
                <h1 className="min-w-0 truncate text-[18px] font-bold leading-tight tracking-[-0.02em] text-foreground sm:text-[20px]">
                  {vehicleName}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {licensePlate ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                      <Icon name="hash" className="w-3 h-3" />
                      {licensePlate}
                    </span>
                  ) : null}
                  {vin ? <span className="font-mono text-[10px]">VIN {vin}</span> : null}
                  {odometer ? <span>{odometer}</span> : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:max-w-[280px] sm:justify-end">
                <StatusChip
                  tone={
                    summary.canonicalStatus.rentalHealthStatus === 'blocked' ||
                    summary.canonicalStatus.rentalHealthStatus === 'critical'
                      ? 'critical'
                      : summary.canonicalStatus.rentalHealthStatus === 'warning'
                        ? 'watch'
                        : 'success'
                  }
                  className="!text-[10px]"
                >
                  {t('bookings.detail.rentalHealth')}:{' '}
                  {resolveRentalHealthLabel(summary.canonicalStatus.rentalHealthStatus, t)}
                </StatusChip>
                {missingMandatory != null && missingMandatory > 0 ? (
                  <StatusChip tone="watch" className="!text-[10px]">
                    {t('vehicleDocuments.header.mandatoryMissing', { count: missingMandatory })}
                  </StatusChip>
                ) : null}
                {summary.pendingReviews.count > 0 ? (
                  <StatusChip tone="watch" className="!text-[10px]">
                    {t('vehicleDocuments.header.pendingReview', {
                      count: summary.pendingReviews.count,
                    })}
                  </StatusChip>
                ) : null}
                {summary.canonicalStatus.serviceCompliance.tuv?.uiStatus === 'expiring_soon' ||
                summary.canonicalStatus.serviceCompliance.tuv?.uiStatus === 'expired' ? (
                  <StatusChip tone="watch" className="!text-[10px]">
                    {t('vehicleDocuments.header.tuvPrefix')}{' '}
                    {resolveVehicleDocumentUiStatusLabel(
                      summary.canonicalStatus.serviceCompliance.tuv.uiStatus,
                      t,
                    )}
                  </StatusChip>
                ) : null}
                {summary.canonicalStatus.serviceCompliance.bokraft?.uiStatus === 'expiring_soon' ||
                summary.canonicalStatus.serviceCompliance.bokraft?.uiStatus === 'expired' ? (
                  <StatusChip tone="watch" className="!text-[10px]">
                    {t('vehicleDocuments.header.bokraftPrefix')}{' '}
                    {resolveVehicleDocumentUiStatusLabel(
                      summary.canonicalStatus.serviceCompliance.bokraft.uiStatus,
                      t,
                    )}
                  </StatusChip>
                ) : null}
              </div>
            </div>

            <p
              className="mt-2 text-[10px] leading-snug text-muted-foreground/70 line-clamp-2"
              title={`${summary.canonicalStatus.note} · ${t('vehicleDocuments.source.prefix')} Rental Health: ${resolveStatusSourceLabel(summary.canonicalStatus.rentalHealthSource, t)}`}
            >
              {summary.canonicalStatus.note}
              <span className="mx-1 opacity-60">·</span>
              {t('vehicleDocuments.source.prefix')}{' '}
              {resolveStatusSourceLabel(summary.canonicalStatus.rentalHealthSource, t)}
            </p>
          </header>

          <aside className="surface-premium surface-elevated rounded-xl border border-border/70 p-3 sm:p-4">
            <p className="mb-2 sq-section-label">{t('vehicleDocuments.overview.label')}</p>
            <div className="grid grid-cols-2 gap-2">
              <CompactSummaryMetric
                label={t('vehicleDocuments.overview.mandatory')}
                value={`${summary.mandatoryDocumentCoverage.configured}/${summary.mandatoryDocumentCoverage.total}`}
                subtext={
                  missingMandatory != null && missingMandatory > 0
                    ? t('vehicleDocuments.overview.mandatoryMissing', { count: missingMandatory })
                    : t('vehicleDocuments.overview.mandatoryComplete', {
                        configured: summary.mandatoryDocumentCoverage.configured,
                        total: summary.mandatoryDocumentCoverage.total,
                      })
                }
                emphasis={
                  summary.mandatoryDocumentCoverage.configured >=
                  summary.mandatoryDocumentCoverage.total
                    ? 'success'
                    : 'watch'
                }
              />
              <CompactSummaryMetric
                label={t('vehicleDocuments.overview.openReviews')}
                value={String(summary.pendingReviews.count)}
                subtext={
                  summary.pendingReviews.count > 0
                    ? t('vehicleDocuments.overview.reviewsOpen')
                    : t('vehicleDocuments.overview.reviewsNone')
                }
                emphasis={summary.pendingReviews.count > 0 ? 'watch' : 'neutral'}
              />
              <DocumentComplianceSummaryCard summary={summary} compact />
              <CompactSummaryMetric
                label={t('vehicleDocuments.overview.fixedCostMonthly')}
                value={formatEuroAmount(summary.fixedCosts.monthlyTotal, vehicleFormattingLocaleOrDefault(locale))}
                subtext={t('vehicleDocuments.overview.fixedCostSubtext')}
                emphasis={summary.fixedCosts.monthlyTotal != null ? 'neutral' : 'neutral'}
                mono
              />
            </div>
          </aside>
        </div>
      ) : null}

      {loading && !summary ? (
        <SkeletonRows rows={6} />
      ) : summary ? (
        <>
          <section className="space-y-3">
            <SectionHeader
              title={t('vehicleDocuments.section.compliance.title')}
              description={t('vehicleDocuments.section.compliance.description')}
            />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {sortedCategories.map((cat) => (
                <DocumentCategoryCard
                  key={cat.id}
                  category={cat}
                  linkedTask={
                    cat.latestExtractionId
                      ? taskByDocumentId.get(cat.latestExtractionId) ?? null
                      : null
                  }
                  onOpenLinkedTask={onOpenLinkedTask}
                  onUpload={() => openUpload(cat.id)}
                  onReview={() => openReview(cat)}
                  onView={() => openReview(cat)}
                  t={t}
                  locale={locale}
                />
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <DataCard
              title={t('vehicleDocuments.fixedCosts.title')}
              description={t('vehicleDocuments.fixedCosts.description')}
            >
              <div className="space-y-2">
                {summary.fixedCosts.items.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-foreground">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {t('vehicleDocuments.category.source')}{' '}
                          {resolveStatusSourceLabel(item.source, t)}
                        </p>
                        {item.evidenceFileName ? (
                          <p className="mt-0.5 truncate text-[9px] text-muted-foreground/80">
                            {t('vehicleDocuments.fixedCosts.evidence')} {item.evidenceFileName}
                          </p>
                        ) : null}
                      </div>
                      <StatusChip tone={fixedCostStatusTone(item.status)}>
                        {resolveFixedCostStatusLabel(item.status, t)}
                      </StatusChip>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground">
                          {t('vehicleDocuments.fixedCosts.monthly')}
                        </p>
                        <p className="text-[13px] font-bold tabular-nums text-foreground">
                          {formatEuroAmount(item.amountMonthly, vehicleFormattingLocaleOrDefault(locale))}
                        </p>
                      </div>
                      {item.amountYearly != null ? (
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">
                            {t('vehicleDocuments.fixedCosts.yearly')}
                          </p>
                          <p className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                            {formatEuroAmount(item.amountYearly, vehicleFormattingLocaleOrDefault(locale))}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-3 py-3">
                  <span className="text-[12px] font-semibold text-foreground">
                    {t('vehicleDocuments.fixedCosts.total')}
                  </span>
                  <span className="text-[15px] font-bold tabular-nums text-foreground">
                    {formatEuroAmount(summary.fixedCosts.monthlyTotal, vehicleFormattingLocaleOrDefault(locale))}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {t('vehicleDocuments.fixedCosts.hint')}
                </p>
              </div>
            </DataCard>

            <DataCard
              title={t('vehicleDocuments.specs.title')}
              description={t('vehicleDocuments.specs.description')}
            >
              <div className="space-y-4">
                <SpecAccordion
                  title={t('vehicleDocuments.specs.general')}
                  rows={summary.technicalSpecs.general}
                  defaultOpen
                  t={t}
                />
                <SpecAccordion
                  title={t('vehicleDocuments.specs.lvBattery')}
                  rows={summary.technicalSpecs.lvBattery}
                  defaultOpen={summary.technicalSpecs.lvBattery.length > 0}
                  emptyMessage={t('vehicleDocuments.specs.lvBatteryEmpty')}
                  t={t}
                />
                {summary.technicalSpecs.hvBattery && summary.technicalSpecs.hvBattery.length > 0 ? (
                  <SpecAccordion
                    title={t('vehicleDocuments.specs.hvBattery')}
                    rows={summary.technicalSpecs.hvBattery}
                    t={t}
                  />
                ) : null}
                {summary.technicalSpecs.tankEngine && summary.technicalSpecs.tankEngine.length > 0 ? (
                  <SpecAccordion
                    title={t('vehicleDocuments.specs.tankEngine')}
                    rows={summary.technicalSpecs.tankEngine}
                    t={t}
                  />
                ) : null}
              </div>
            </DataCard>
          </div>

          {hasVariableCosts ? (
            <DataCard
              title={t('vehicleDocuments.variable.sectionTitle')}
              description={t('vehicleDocuments.variable.title', {
                serviceEvents: summary.variableCostAverages.sampleServiceEvents,
                repairEvents: summary.variableCostAverages.sampleRepairEvents,
              })}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                  <p className="text-[10px] text-muted-foreground">
                    {t('vehicleDocuments.variable.service')}
                  </p>
                  <p className="text-[14px] font-bold tabular-nums text-foreground">
                    {formatEuroAmount(
                      summary.variableCostAverages.serviceAverageMonthly,
                      vehicleFormattingLocaleOrDefault(locale),
                    )}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                  <p className="text-[10px] text-muted-foreground">
                    {t('vehicleDocuments.variable.repair')}
                  </p>
                  <p className="text-[14px] font-bold tabular-nums text-foreground">
                    {formatEuroAmount(
                      summary.variableCostAverages.repairAverageMonthly,
                      vehicleFormattingLocaleOrDefault(locale),
                    )}
                  </p>
                </div>
              </div>
            </DataCard>
          ) : null}

          <DataCard
            title={t('vehicleDocuments.timeline.title')}
            description={t('vehicleDocuments.timeline.description')}
          >
            {timelineItems.length > 0 ? (
              <Timeline items={timelineItems} />
            ) : (
              <EmptyState
                compact
                icon={<Icon name="history" className="w-4 h-4" />}
                title={t('vehicleDocuments.timeline.empty.title')}
                description={t('vehicleDocuments.timeline.empty.description')}
              />
            )}
          </DataCard>
        </>
      ) : !error ? (
        <EmptyState
          icon={<Icon name="file-text" className="w-5 h-5" />}
          title={t('vehicleDocuments.empty.title')}
          description={t('vehicleDocuments.empty.description')}
        />
      ) : null}

      {drawer && vehicle.id ? (
        <VehicleDocumentUploadDrawer
          open={!!drawer}
          onOpenChange={(open) => {
            if (!open) setDrawer(null);
          }}
          vehicleId={vehicle.id}
          vehicleLabel={vehicleName}
          categoryId={drawer.categoryId}
          mode={drawer.mode}
          extractionId={drawer.extractionId}
          fileName={drawer.fileName}
          onComplete={() => void reload()}
        />
      ) : null}
    </div>
  );
}

function CompactSummaryMetric({
  label,
  value,
  subtext,
  emphasis = 'neutral',
  mono = false,
}: {
  label: string;
  value: string;
  subtext?: string;
  emphasis?: 'success' | 'watch' | 'neutral';
  mono?: boolean;
}) {
  const valueClass =
    emphasis === 'success'
      ? 'text-[color:var(--status-positive)]'
      : emphasis === 'watch'
        ? 'text-[color:var(--status-watch)]'
        : 'text-foreground';

  return (
    <div className="rounded-xl border border-border/60 bg-muted/15 px-2.5 py-2">
      <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 text-[20px] font-bold leading-none tabular-nums ${mono ? 'font-mono' : ''} ${valueClass}`}
      >
        {value}
      </p>
      {subtext ? <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{subtext}</p> : null}
    </div>
  );
}

function categoryToneClass(tone: CategoryUiMeta['tone']): string {
  if (tone === 'brand') return 'sq-tone-brand';
  if (tone === 'info') return 'sq-tone-info';
  if (tone === 'success') return 'sq-tone-success';
  if (tone === 'warning') return 'sq-tone-warning';
  if (tone === 'critical') return 'sq-tone-critical';
  return 'sq-tone-neutral';
}

function DocumentCategoryCard({
  category,
  linkedTask,
  onOpenLinkedTask,
  onUpload,
  onReview,
  onView,
  t,
  locale,
}: {
  category: VehicleDocumentCategorySummary;
  linkedTask?: ApiTask | null;
  onOpenLinkedTask?: (taskId: string) => void;
  onUpload: () => void;
  onReview: () => void;
  onView: () => void;
  t: Translate;
  locale: string;
}) {
  const meta = CATEGORY_UI_META[category.id];
  const isMandatory = MANDATORY_CATEGORY_IDS.includes(category.id);
  const isPriority =
    category.uiStatus === 'needs_review' ||
    category.uiStatus === 'error' ||
    category.uiStatus === 'expired' ||
    category.uiStatus === 'missing';
  const isCompact =
    category.uiStatus === 'verified' || category.uiStatus === 'applied';

  return (
    <article
      data-category-id={category.id}
      className={`group surface-elevated flex flex-col rounded-xl border surface-premium p-3 transition-all duration-200 hover:border-border hover:bg-muted/20 ${
        isPriority ? 'border-[color:var(--status-watch)]/35' : 'border-border/70'
      } ${isCompact ? 'opacity-95' : ''}`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${categoryToneClass(meta.tone)}`}>
          <Icon name={meta.icon} className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-[12px] font-semibold text-foreground">
              {resolveVehicleDocumentCategoryShortTitle(category.id, t, category.label)}
            </h3>
            {isMandatory ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('vehicleDocuments.category.mandatory')}
              </span>
            ) : (
              <span className="text-[9px] text-muted-foreground">
                {t('vehicleDocuments.category.optional')}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">
            {resolveVehicleDocumentCategoryDescription(category.id, t)}
          </p>
        </div>
        <StatusChip tone={uiStatusTone(category.uiStatus)} className="shrink-0">
          {category.uiStatus === 'processing' ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="loader-2" className="h-3 w-3 animate-spin" />
              {resolveVehicleDocumentUiStatusLabel(category.uiStatus, t)}
            </span>
          ) : (
            resolveVehicleDocumentUiStatusLabel(category.uiStatus, t)
          )}
        </StatusChip>
      </div>

      <div className="mt-2.5 space-y-1 text-[10px] text-muted-foreground">
        <p>
          {t('vehicleDocuments.category.source')}{' '}
          <span className="font-medium text-foreground">
            {resolveStatusSourceLabel(category.statusSource, t)}
          </span>
        </p>
        {category.latestFileName ? (
          <p className="truncate">
            {t('vehicleDocuments.category.lastFile')}{' '}
            <span className="text-foreground">{category.latestFileName}</span>
          </p>
        ) : category.documentCount === 0 ? (
          <p className="italic">{resolveVehicleDocumentCategoryEmptyHint(category.id, t)}</p>
        ) : null}
        {linkedTask && onOpenLinkedTask ? (
          <button
            type="button"
            onClick={() => onOpenLinkedTask(linkedTask.id)}
            className="text-left font-medium text-[color:var(--brand-ink)] underline sq-press"
          >
            {t('vehicleDocuments.category.linkedTask')} {linkedTask.title}
          </button>
        ) : null}
        {category.complianceDisplay?.validTill ? (
          <p>
            {t('vehicleDocuments.category.deadline')}{' '}
            <span className="font-medium text-foreground">
              {formatVehicleDocumentDate(locale, category.complianceDisplay.validTill)}
            </span>
            <span className="ml-1 text-[9px]">{t('vehicleDocuments.category.serviceCompliance')}</span>
          </p>
        ) : null}
        {category.documentCount > 1 ? (
          <p>{t('vehicleDocuments.category.documentCount', { count: category.documentCount })}</p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {category.latestExtractionId ? (
          <button
            type="button"
            onClick={onView}
            className="sq-press inline-flex items-center gap-1 rounded-lg border border-border surface-premium px-2.5 py-1.5 text-[10px] font-semibold text-foreground"
          >
            <Icon name="eye" className="w-3 h-3" />
            {t('vehicleDocuments.action.view')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onUpload}
          className="sq-press inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[10px] font-semibold text-primary-foreground"
        >
          <Icon name="upload" className="w-3 h-3" />
          {category.latestFileName
            ? t('vehicleDocuments.action.replace')
            : t('vehicleDocuments.action.upload')}
        </button>
        {category.uiStatus === 'needs_review' && category.latestExtractionId ? (
          <button
            type="button"
            onClick={onReview}
            className="sq-press inline-flex items-center gap-1 rounded-lg border border-[color:var(--status-watch)]/40 bg-[color:var(--status-watch)]/10 px-2.5 py-1.5 text-[10px] font-semibold text-[color:var(--status-watch)]"
          >
            <Icon name="clipboard-check" className="w-3 h-3" />
            {t('vehicleDocuments.action.review')}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function SpecAccordion({
  title,
  rows,
  defaultOpen = false,
  emptyMessage,
  t,
}: {
  title: string;
  rows: Array<{ key: string; label: string; value: string | number | null; source: string }>;
  defaultOpen?: boolean;
  emptyMessage?: string;
  t: Translate;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasValues = rows.some((r) => r.value != null && r.value !== '');

  return (
    <div className="overflow-hidden rounded-xl border border-border/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 bg-muted/20 px-3 py-2.5 text-left sq-press"
      >
        <span className="text-[11px] font-semibold text-foreground">{title}</span>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-muted-foreground" />
      </button>
      {open ? (
        <div className="border-t border-border/60">
          {!hasValues && emptyMessage ? (
            <p className="px-3 py-3 text-[11px] text-muted-foreground">{emptyMessage}</p>
          ) : (
            rows.map((row, i) => (
              <div
                key={row.key}
                className={`flex items-center justify-between gap-3 px-3 py-2 ${i > 0 ? 'border-t border-border/40' : ''}`}
              >
                <span className="text-[10px] text-muted-foreground">{row.label}</span>
                <div className="text-right">
                  <span className="text-[11px] font-medium tabular-nums text-foreground">
                    {formatVehicleDocumentSpecValue(row.value, t)}
                  </span>
                  <p className="text-[9px] text-muted-foreground/70">
                    {resolveStatusSourceLabel(row.source, t)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

import { useMemo, useState, useEffect } from 'react';
import { Icon } from './ui/Icon';
import { VehicleData } from '../data/vehicles';
import { api, type ApiTask } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
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
import {
  formatEuroAmount,
  uiStatusLabel,
  uiStatusTone,
  type VehicleDocumentCategoryId,
  type VehicleDocumentCategorySummary,
  type VehicleFileSummary,
} from '../lib/vehicle-file-summary.types';
import { useVehicleFileSummary } from '../hooks/useVehicleFileSummary';
import {
  CATEGORY_UI_META,
  formatStatusSource,
  MANDATORY_CATEGORY_IDS,
  rentalHealthLabelDe,
  sortDocumentCategories,
  type CategoryUiMeta,
} from './documents/vehicle-file.constants';
import {
  VehicleDocumentUploadDrawer,
  type DocumentDrawerMode,
} from './documents/VehicleDocumentUploadDrawer';
import { DocumentComplianceSummaryCard } from './documents/DocumentComplianceSummaryCard';

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

function formatFileDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

function formatSpecValue(value: string | number | null): string {
  if (value == null || value === '') return 'Nicht hinterlegt';
  return String(value);
}

function fixedCostStatusLabel(status: string): string {
  if (status === 'verified') return 'Verifiziert';
  if (status === 'missing_evidence') return 'Nachweis fehlt';
  return 'Nicht hinterlegt';
}

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

function timelineKindLabel(kind?: string): string | null {
  if (kind === 'service_event') return 'Service-Ereignis';
  if (kind === 'compliance') return 'Compliance';
  if (kind === 'document') return 'Dokument';
  return null;
}

export function DocumentsView({ vehicle, onOpenLinkedTask }: DocumentsViewProps) {
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
    ? [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Fahrzeug'
    : 'Kein Fahrzeug ausgewählt';
  const licensePlate = summary?.vehicle.licensePlate ?? vehicle?.license ?? null;
  const vin = summary?.vehicle.vin ?? null;
  const odometer =
    summary?.vehicle.odometerKm != null
      ? `${Math.round(summary.vehicle.odometerKm).toLocaleString('de-DE')} km`
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
      const kindLabel = timelineKindLabel(item.kind);
      const linkedTask =
        item.relatedExtractionId != null
          ? vehicleTasks.find((t) => t.documentId === item.relatedExtractionId) ?? null
          : null;
      return {
        id: item.id,
        title: item.title,
        time: formatFileDate(item.occurredAt, true),
        description: [
          item.subtitle,
          item.relatedServiceEventId ? 'Verknüpftes Service-Ereignis' : null,
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
              Quelle: {formatStatusSource(item.source)}
            </StatusChip>
            {linkedTask && onOpenLinkedTask ? (
              <button
                type="button"
                onClick={() => onOpenLinkedTask(linkedTask.id)}
                className="text-[9px] font-semibold text-[color:var(--brand-ink)] underline sq-press"
              >
                Aufgabe: {linkedTask.title}
              </button>
            ) : null}
          </div>
        ),
      };
    });
  }, [summary, vehicleTasks, onOpenLinkedTask]);

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
        title="Kein Fahrzeug ausgewählt"
        description="Wähle ein Fahrzeug aus, um die Fahrzeugakte zu öffnen."
      />
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {error ? (
        <ErrorState
          compact
          title="Fahrzeugakte nicht verfügbar"
          description={error}
          onRetry={() => void reload()}
          retryLabel="Erneut laden"
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
                <p className="sq-section-label">Fahrzeugakte</p>
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
                  Rental Health: {rentalHealthLabelDe(summary.canonicalStatus.rentalHealthStatus)}
                </StatusChip>
                {missingMandatory != null && missingMandatory > 0 ? (
                  <StatusChip tone="watch" className="!text-[10px]">
                    {missingMandatory} Pflichtdok. fehlen
                  </StatusChip>
                ) : null}
                {summary.pendingReviews.count > 0 ? (
                  <StatusChip tone="watch" className="!text-[10px]">
                    {summary.pendingReviews.count} zur Prüfung
                  </StatusChip>
                ) : null}
                {summary.canonicalStatus.serviceCompliance.tuv?.uiStatus === 'expiring_soon' ||
                summary.canonicalStatus.serviceCompliance.tuv?.uiStatus === 'expired' ? (
                  <StatusChip tone="watch" className="!text-[10px]">
                    TÜV: {uiStatusLabel(summary.canonicalStatus.serviceCompliance.tuv.uiStatus, true)}
                  </StatusChip>
                ) : null}
                {summary.canonicalStatus.serviceCompliance.bokraft?.uiStatus === 'expiring_soon' ||
                summary.canonicalStatus.serviceCompliance.bokraft?.uiStatus === 'expired' ? (
                  <StatusChip tone="watch" className="!text-[10px]">
                    BOKraft:{' '}
                    {uiStatusLabel(summary.canonicalStatus.serviceCompliance.bokraft.uiStatus, true)}
                  </StatusChip>
                ) : null}
              </div>
            </div>

            <p
              className="mt-2 text-[10px] leading-snug text-muted-foreground/70 line-clamp-2"
              title={`${summary.canonicalStatus.note} · Quelle Rental Health: ${formatStatusSource(summary.canonicalStatus.rentalHealthSource)}`}
            >
              {summary.canonicalStatus.note}
              <span className="mx-1 opacity-60">·</span>
              Quelle: {formatStatusSource(summary.canonicalStatus.rentalHealthSource)}
            </p>
          </header>

          <aside className="surface-premium surface-elevated rounded-xl border border-border/70 p-3 sm:p-4">
            <p className="mb-2 sq-section-label">Übersicht</p>
            <div className="grid grid-cols-2 gap-2">
              <CompactSummaryMetric
                label="Pflichtdokumente"
                value={`${summary.mandatoryDocumentCoverage.configured}/${summary.mandatoryDocumentCoverage.total}`}
                subtext={
                  missingMandatory != null && missingMandatory > 0
                    ? `${missingMandatory} fehlen`
                    : `${summary.mandatoryDocumentCoverage.configured} von ${summary.mandatoryDocumentCoverage.total} vorhanden`
                }
                emphasis={
                  summary.mandatoryDocumentCoverage.configured >=
                  summary.mandatoryDocumentCoverage.total
                    ? 'success'
                    : 'watch'
                }
              />
              <CompactSummaryMetric
                label="Offene Reviews"
                value={String(summary.pendingReviews.count)}
                subtext={
                  summary.pendingReviews.count > 0 ? 'Zur Prüfung offen' : 'Keine offenen Reviews'
                }
                emphasis={summary.pendingReviews.count > 0 ? 'watch' : 'neutral'}
              />
              <DocumentComplianceSummaryCard summary={summary} compact />
              <CompactSummaryMetric
                label="Fixkosten / Monat"
                value={formatEuroAmount(summary.fixedCosts.monthlyTotal)}
                subtext="Feste monatliche Last"
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
          {/* ── Compliance & Dokumente ── */}
          <section className="space-y-3">
            <SectionHeader
              title="Compliance & Dokumente"
              description="Status aus kanonischen Quellen — Upload und Review direkt aus der Karte."
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
                />
              ))}
            </div>
          </section>

          {/* ── Fixkosten + Technische Daten ── */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <DataCard
              title="Feste monatliche Fahrzeugkosten"
              description="Finanzielle Grundlast — getrennt von variablen Wartungskosten."
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
                          Quelle: {formatStatusSource(item.source)}
                        </p>
                        {item.evidenceFileName ? (
                          <p className="mt-0.5 truncate text-[9px] text-muted-foreground/80">
                            Nachweis: {item.evidenceFileName}
                          </p>
                        ) : null}
                      </div>
                      <StatusChip tone={fixedCostStatusTone(item.status)}>
                        {fixedCostStatusLabel(item.status)}
                      </StatusChip>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Monatlich</p>
                        <p className="text-[13px] font-bold tabular-nums text-foreground">
                          {formatEuroAmount(item.amountMonthly)}
                        </p>
                      </div>
                      {item.amountYearly != null ? (
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">Jährlich</p>
                          <p className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                            {formatEuroAmount(item.amountYearly)}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-3 py-3">
                  <span className="text-[12px] font-semibold text-foreground">Gesamt pro Monat</span>
                  <span className="text-[15px] font-bold tabular-nums text-foreground">
                    {formatEuroAmount(summary.fixedCosts.monthlyTotal)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Fehlende Beträge können im Fahrzeugstamm (Master Admin) gepflegt werden.
                </p>
              </div>
            </DataCard>

            <DataCard
              title="Technische Fahrzeugdaten"
              description="Stammdaten und Telemetrie — read-only."
            >
              <div className="space-y-4">
                <SpecAccordion title="Allgemeine Technische Daten" rows={summary.technicalSpecs.general} defaultOpen />
                <SpecAccordion
                  title="LV Battery Daten"
                  rows={summary.technicalSpecs.lvBattery}
                  defaultOpen={summary.technicalSpecs.lvBattery.length > 0}
                  emptyMessage="Keine LV-Battery-Spezifikationen im Fahrzeugstamm hinterlegt."
                />
                {summary.technicalSpecs.hvBattery && summary.technicalSpecs.hvBattery.length > 0 ? (
                  <SpecAccordion title="HV Battery" rows={summary.technicalSpecs.hvBattery} />
                ) : null}
                {summary.technicalSpecs.tankEngine && summary.technicalSpecs.tankEngine.length > 0 ? (
                  <SpecAccordion title="Tank / Motor" rows={summary.technicalSpecs.tankEngine} />
                ) : null}
              </div>
            </DataCard>
          </div>

          {hasVariableCosts ? (
            <DataCard
              title="Variable Durchschnittskosten"
              description={`Basierend auf ${summary.variableCostAverages.sampleServiceEvents} Service- und ${summary.variableCostAverages.sampleRepairEvents} Reparatur-Events — nicht in Fixkosten enthalten.`}
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                  <p className="text-[10px] text-muted-foreground">Wartung & Service (Ø)</p>
                  <p className="text-[14px] font-bold tabular-nums text-foreground">
                    {formatEuroAmount(summary.variableCostAverages.serviceAverageMonthly)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-muted/20 px-3 py-2.5">
                  <p className="text-[10px] text-muted-foreground">Reparaturen (Ø)</p>
                  <p className="text-[14px] font-bold tabular-nums text-foreground">
                    {formatEuroAmount(summary.variableCostAverages.repairAverageMonthly)}
                  </p>
                </div>
              </div>
            </DataCard>
          ) : null}

          {/* ── Timeline ── */}
          <DataCard
            title="Timeline / Audit Trail"
            description="Dokumente, Service-Events und Compliance-Einträge chronologisch."
          >
            {timelineItems.length > 0 ? (
              <Timeline items={timelineItems} />
            ) : (
              <EmptyState
                compact
                icon={<Icon name="history" className="w-4 h-4" />}
                title="Noch keine Einträge"
                description="Hochgeladene Dokumente und Service-Events erscheinen hier."
              />
            )}
          </DataCard>
        </>
      ) : !error ? (
        <EmptyState
          icon={<Icon name="file-text" className="w-5 h-5" />}
          title="Keine Daten"
          description="Für dieses Fahrzeug liegen noch keine Akten-Daten vor."
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
}: {
  category: VehicleDocumentCategorySummary;
  linkedTask?: ApiTask | null;
  onOpenLinkedTask?: (taskId: string) => void;
  onUpload: () => void;
  onReview: () => void;
  onView: () => void;
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
            <h3 className="text-[12px] font-semibold text-foreground">{meta.shortTitle}</h3>
            {isMandatory ? (
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pflicht
              </span>
            ) : (
              <span className="text-[9px] text-muted-foreground">Optional</span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-2">{meta.description}</p>
        </div>
        <StatusChip tone={uiStatusTone(category.uiStatus)} className="shrink-0">
          {category.uiStatus === 'processing' ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="loader-2" className="h-3 w-3 animate-spin" />
              {uiStatusLabel(category.uiStatus, true)}
            </span>
          ) : (
            uiStatusLabel(category.uiStatus, true)
          )}
        </StatusChip>
      </div>

      <div className="mt-2.5 space-y-1 text-[10px] text-muted-foreground">
        <p>
          Quelle: <span className="font-medium text-foreground">{formatStatusSource(category.statusSource)}</span>
        </p>
        {category.latestFileName ? (
          <p className="truncate">
            Letzte Datei: <span className="text-foreground">{category.latestFileName}</span>
          </p>
        ) : category.documentCount === 0 ? (
          <p className="italic">{meta.emptyHint}</p>
        ) : null}
        {linkedTask && onOpenLinkedTask ? (
          <button
            type="button"
            onClick={() => onOpenLinkedTask(linkedTask.id)}
            className="text-left font-medium text-[color:var(--brand-ink)] underline sq-press"
          >
            Verknüpfte Aufgabe: {linkedTask.title}
          </button>
        ) : null}
        {category.complianceDisplay?.validTill ? (
          <p>
            Frist:{' '}
            <span className="font-medium text-foreground">
              {formatFileDate(category.complianceDisplay.validTill)}
            </span>
            <span className="ml-1 text-[9px]">(Service Compliance)</span>
          </p>
        ) : null}
        {category.documentCount > 1 ? (
          <p>{category.documentCount} Dokumente in dieser Kategorie</p>
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
            Ansehen
          </button>
        ) : null}
        <button
          type="button"
          onClick={onUpload}
          className="sq-press inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[10px] font-semibold text-primary-foreground"
        >
          <Icon name="upload" className="w-3 h-3" />
          {category.latestFileName ? 'Ersetzen' : 'Hochladen'}
        </button>
        {category.uiStatus === 'needs_review' && category.latestExtractionId ? (
          <button
            type="button"
            onClick={onReview}
            className="sq-press inline-flex items-center gap-1 rounded-lg border border-[color:var(--status-watch)]/40 bg-[color:var(--status-watch)]/10 px-2.5 py-1.5 text-[10px] font-semibold text-[color:var(--status-watch)]"
          >
            <Icon name="clipboard-check" className="w-3 h-3" />
            Zur Prüfung
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
}: {
  title: string;
  rows: Array<{ key: string; label: string; value: string | number | null; source: string }>;
  defaultOpen?: boolean;
  emptyMessage?: string;
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
                    {formatSpecValue(row.value)}
                  </span>
                  <p className="text-[9px] text-muted-foreground/70">
                    {formatStatusSource(row.source)}
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

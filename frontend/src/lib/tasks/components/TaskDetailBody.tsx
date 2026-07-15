import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Car,
  ChevronRight,
  File,
  FileText,
  Receipt,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { PriorityBadge, SectionHeader, StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { TaskDetailLinkedObjectModel, TaskDetailViewModel } from '../taskDetailView.utils';
import { TaskDetailChecklistSection } from './TaskDetailChecklistSection';
import { TaskDetailNotesActivitySection, type TaskNotesActivityTab } from './TaskDetailNotesActivitySection';

export interface TaskDetailBodyProps {
  model: TaskDetailViewModel;
  density?: 'desktop' | 'mobile';
  hideHeader?: boolean;
  className?: string;
  beforeSections?: ReactNode;
  afterSections?: ReactNode;
  technicalExtra?: ReactNode;
  onClose?: () => void;
  onPrimaryAction?: () => void;
  onLinkedObjectClick?: (object: TaskDetailLinkedObjectModel) => void;
  onChecklistToggle?: (itemId: string, isDone: boolean) => void;
  pendingChecklistItemIds?: ReadonlySet<string>;
  onChecklistOverride?: () => void;
  checklistDisabled?: boolean;
  commentDraft?: string;
  onCommentDraftChange?: (value: string) => void;
  onAddComment?: () => void;
  commentError?: string | null;
  showCommentForm?: boolean;
  focusComment?: boolean;
  commentPending?: boolean;
  notesActivityTab?: TaskNotesActivityTab;
  onNotesActivityTabChange?: (tab: TaskNotesActivityTab) => void;
}

export function TaskDetailBody({
  model,
  density = 'desktop',
  hideHeader = false,
  className,
  beforeSections,
  afterSections,
  technicalExtra,
  onClose,
  onPrimaryAction,
  onLinkedObjectClick,
  onChecklistToggle,
  pendingChecklistItemIds,
  onChecklistOverride,
  checklistDisabled = false,
  commentDraft = '',
  onCommentDraftChange,
  onAddComment,
  commentError,
  showCommentForm,
  focusComment = false,
  commentPending = false,
  notesActivityTab,
  onNotesActivityTabChange,
}: TaskDetailBodyProps) {
  const mobile = density === 'mobile';
  const canComment = showCommentForm ?? model.flags.canAddComment;

  return (
    <div
      className={cn('min-w-0', className)}
      data-testid="task-detail-body"
      data-density={density}
    >
      {!hideHeader && (
        <TaskDetailCompactHeader
          model={model}
          mobile={mobile}
          onClose={onClose}
          sticky
        />
      )}

      {beforeSections}

      <div className="divide-y divide-border/60">
        <TaskDetailReasonSection model={model} mobile={mobile} />
        <TaskDetailNextStepSection
          model={model}
          mobile={mobile}
          onPrimaryAction={onPrimaryAction}
        />
        {model.checklist && (
          <TaskDetailChecklistSection
            checklist={model.checklist}
            mobile={mobile}
            pendingItemIds={pendingChecklistItemIds}
            onToggle={checklistDisabled ? undefined : onChecklistToggle}
            onRequestOverride={onChecklistOverride}
          />
        )}
        <TaskDetailLinkedObjectsSection
          model={model}
          mobile={mobile}
          onObjectClick={onLinkedObjectClick}
        />
        <TaskDetailNotesActivitySection
          model={model}
          mobile={mobile}
          commentDraft={commentDraft}
          onCommentDraftChange={onCommentDraftChange}
          onAddComment={onAddComment}
          commentError={commentError}
          showCommentForm={canComment}
          focusComment={focusComment}
          commentPending={commentPending}
          activeTab={notesActivityTab}
          onActiveTabChange={onNotesActivityTabChange}
        />
        <TaskDetailTechnicalSection
          model={model}
          mobile={mobile}
          extra={technicalExtra}
        />
      </div>

      {afterSections}
    </div>
  );
}

interface TaskDetailCompactHeaderProps {
  model: TaskDetailViewModel;
  mobile: boolean;
  sticky?: boolean;
  onClose?: () => void;
}

export function TaskDetailCompactHeader({
  model,
  mobile,
  sticky = false,
  onClose,
}: TaskDetailCompactHeaderProps) {
  const { header, flags } = model;

  return (
    <header
      className={cn(
        'mb-4',
        sticky &&
          'sticky top-0 z-[1] -mx-5 border-b border-border/70 bg-background/95 px-5 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/80',
        mobile && sticky && '-mx-4 px-4',
      )}
      data-testid="task-detail-header"
    >
      {header.eyebrow && <p className="sq-section-label mb-1">{header.eyebrow}</p>}

      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 items-start gap-2">
            <h2
              className={cn(
                'min-w-0 flex-1 font-semibold leading-snug text-foreground',
                mobile ? 'text-base' : 'text-[16px]',
              )}
            >
              {header.title}
            </h2>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="sq-press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-foreground shadow-sm transition-colors hover:bg-muted"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip tone={header.statusTone} dot={mobile}>
              {header.statusLabel}
              {flags.isOverdue && !flags.isTerminal ? ' · Überfällig' : ''}
            </StatusChip>
            {header.showPriority && (
              <PriorityBadge priority={header.priority} label={header.priorityLabel} />
            )}
            {flags.blocksVehicleAvailability && (
              <StatusChip tone="critical">Blockiert Verfügbarkeit</StatusChip>
            )}
          </div>

          <div
            className={cn(
              'flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground',
              mobile ? 'text-xs' : 'text-[12px]',
            )}
          >
            {header.timingLabel && (
              <span className={cn('font-medium', header.timingWarn && 'text-[color:var(--status-critical)]')}>
                {header.timingLabel}
              </span>
            )}
            {header.timingLabel && header.subtitle && <span aria-hidden>·</span>}
            {header.subtitle && <span className="truncate">{header.subtitle}</span>}
          </div>
        </div>
      </div>
    </header>
  );
}

function TaskDetailReasonSection({
  model,
  mobile,
}: {
  model: TaskDetailViewModel;
  mobile: boolean;
}) {
  const { reason } = model;

  return (
    <section className="py-4" data-section="reason">
      <SectionHeader
        as="label"
        title="Warum wurde diese Aufgabe erstellt?"
        className="mb-2.5"
      />
      <p className={cn('sq-section-label mb-1.5', mobile ? 'text-xs' : 'text-[11px]')}>
        {reason.headline}
      </p>
      <p
        className={cn(
          'leading-relaxed text-foreground',
          mobile ? 'text-sm' : 'text-[13px]',
        )}
      >
        {reason.description}
      </p>
      {reason.basis && (
        <p className={cn('mt-2 text-foreground/85', mobile ? 'text-sm' : 'text-[12.5px]')}>
          {reason.basis}
        </p>
      )}
      <div className={cn('mt-2.5 flex flex-wrap gap-x-2 gap-y-1 text-muted-foreground', mobile ? 'text-xs' : 'text-[11px]')}>
        {reason.detectedAtLabel && <span>Erkannt am {reason.detectedAtLabel}</span>}
        {reason.detectedAtLabel && reason.humanReadableSource && <span aria-hidden>·</span>}
        {reason.humanReadableSource && <span>Auslöser: {reason.humanReadableSource}</span>}
      </div>
    </section>
  );
}

function TaskDetailNextStepSection({
  model,
  mobile,
  onPrimaryAction,
}: {
  model: TaskDetailViewModel;
  mobile: boolean;
  onPrimaryAction?: () => void;
}) {
  const { nextStep } = model;
  if (!nextStep) return null;

  return (
    <section className="py-4" data-section="next-step">
      <SectionHeader as="label" title="Nächster Schritt" className="mb-2.5" />
      <div
        className={cn(
          'rounded-xl border p-4',
          nextStep.enabled
            ? 'border-[color:var(--brand)]/30 bg-[color:var(--brand)]/[0.06]'
            : 'border-border/70 bg-muted/15',
        )}
      >
        <p className={cn('font-semibold text-foreground', mobile ? 'text-base' : 'text-[15px]')}>
          {nextStep.label}
        </p>
        {nextStep.description && (
          <p className={cn('mt-1.5 text-muted-foreground', mobile ? 'text-sm' : 'text-[12.5px]')}>
            {nextStep.description}
          </p>
        )}
        {nextStep.primaryActionLabel && (
          <div className="mt-3.5">
            <button
              type="button"
              disabled={!nextStep.enabled}
              onClick={onPrimaryAction}
              title={nextStep.disabledReason ?? undefined}
              className={cn(
                'sq-press inline-flex w-full items-center justify-center rounded-xl border font-semibold transition-colors disabled:cursor-not-allowed',
                mobile ? 'min-h-[48px] px-4 text-sm' : 'min-h-[40px] px-4 text-[13px]',
                nextStep.enabled
                  ? 'border-[color:var(--brand)] bg-[color:var(--brand)] text-white shadow-sm disabled:opacity-50'
                  : 'border-border bg-muted/40 text-muted-foreground opacity-80',
              )}
            >
              {nextStep.primaryActionLabel}
            </button>
            {!nextStep.enabled && nextStep.disabledReason && (
              <p
                className={cn(
                  'mt-2 rounded-lg border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] px-3 py-2 text-[color:var(--status-watch)]',
                  mobile ? 'text-xs' : 'text-[11px]',
                )}
                role="status"
              >
                {nextStep.disabledReason}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function TaskDetailLinkedObjectsSection({
  model,
  mobile,
  onObjectClick,
}: {
  model: TaskDetailViewModel;
  mobile: boolean;
  onObjectClick?: (object: TaskDetailLinkedObjectModel) => void;
}) {
  const { linkedObjects } = model;

  return (
    <section className="py-4" data-section="linked-objects">
      <SectionHeader as="label" title="Verknüpfte Objekte" className="mb-2.5" />
      {linkedObjects.length === 0 ? (
        <p className={cn('text-muted-foreground', mobile ? 'text-sm' : 'text-[12px]')}>
          Keine verknüpften Objekte.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {linkedObjects.map((object) => {
            const Icon = linkedObjectIcon(object.type);
            const interactive = Boolean(onObjectClick);
            const navigable = interactive && object.isAvailable;

            return (
              <li key={`${object.type}-${object.id}`}>
                <button
                  type="button"
                  disabled={!interactive}
                  onClick={() => onObjectClick?.(object)}
                  title={[object.primaryLabel, object.secondaryLabel].filter(Boolean).join(' · ')}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                    object.isAvailable
                      ? 'border-border bg-muted/10 hover:bg-muted/25 sq-press'
                      : 'border-border/50 bg-muted/5',
                    !interactive && 'cursor-default',
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-[color:var(--brand)]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate font-medium text-foreground',
                        mobile ? 'text-sm' : 'text-[12px]',
                      )}
                    >
                      {object.primaryLabel}
                    </span>
                    <span
                      className={cn(
                        'block truncate text-muted-foreground',
                        mobile ? 'text-xs' : 'text-[11px]',
                      )}
                    >
                      {object.typeLabel}
                      {object.secondaryLabel ? ` · ${object.secondaryLabel}` : ''}
                      {object.statusLabel ? ` · ${object.statusLabel}` : ''}
                    </span>
                    {!object.isAvailable && object.unavailableReason && (
                      <span className="mt-0.5 block text-[10px] text-[color:var(--status-watch)]">
                        {object.unavailableReason}
                      </span>
                    )}
                  </span>
                  {navigable && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TaskDetailTechnicalSection({
  model,
  mobile,
  extra,
}: {
  model: TaskDetailViewModel;
  mobile: boolean;
  extra?: ReactNode;
}) {
  return (
    <section className="py-4" data-section="technical">
      <details className="group rounded-lg border border-border/50 bg-muted/10 px-3 py-2">
        <summary
          className={cn(
            'cursor-pointer list-none font-semibold uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden',
            mobile ? 'text-xs' : 'text-[10px]',
          )}
        >
          Technische Details
        </summary>
        <dl className={cn('mt-3 space-y-2', mobile ? 'text-xs' : 'text-[11px]')}>
          {model.technical.rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd
                className={cn(
                  'text-right font-medium',
                  row.highlight ? 'text-[color:var(--status-critical)]' : 'text-foreground',
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
        {extra}
      </details>
    </section>
  );
}

function linkedObjectIcon(type: TaskDetailLinkedObjectModel['type']) {
  switch (type) {
    case 'VEHICLE':
      return Car;
    case 'BOOKING':
      return Calendar;
    case 'CUSTOMER':
      return User;
    case 'INVOICE':
      return FileText;
    case 'DOCUMENT':
      return File;
    case 'ALERT':
      return AlertTriangle;
    case 'SERVICE_CASE':
      return Wrench;
    case 'FINE':
      return Receipt;
    case 'VENDOR':
      return Building2;
    default:
      return File;
  }
}

export function TaskDetailLoadingSkeleton({ density = 'desktop' }: { density?: 'desktop' | 'mobile' }) {
  const mobile = density === 'mobile';

  return (
    <div className="space-y-4" aria-busy="true" data-testid="task-detail-loading">
      <div className={cn('animate-pulse rounded bg-muted', mobile ? 'h-5 w-3/4' : 'h-4 w-2/3')} />
      <div className="flex gap-2">
        <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
        <div className="h-6 w-14 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="space-y-3">
        <div className={cn('animate-pulse rounded-lg bg-muted/60', mobile ? 'h-24' : 'h-20')} />
        <div className={cn('animate-pulse rounded-lg bg-muted/60', mobile ? 'h-20' : 'h-16')} />
        <div className={cn('animate-pulse rounded-lg bg-muted/60', mobile ? 'h-28' : 'h-24')} />
      </div>
    </div>
  );
}

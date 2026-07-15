import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Building2,
  Calendar,
  Car,
  ChevronRight,
  File,
  FileText,
  Paperclip,
  Receipt,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { PriorityBadge, SectionHeader, StatusChip, Timeline } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { TaskDetailLinkedObjectModel, TaskDetailViewModel } from '../taskDetailView.utils';

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
  checklistDisabled?: boolean;
  commentDraft?: string;
  onCommentDraftChange?: (value: string) => void;
  onAddComment?: () => void;
  commentError?: string | null;
  showCommentForm?: boolean;
  focusComment?: boolean;
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
  checklistDisabled = false,
  commentDraft = '',
  onCommentDraftChange,
  onAddComment,
  commentError,
  showCommentForm,
  focusComment = false,
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
            model={model}
            mobile={mobile}
            disabled={checklistDisabled}
            onToggle={onChecklistToggle}
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
      <p className={cn('font-medium text-foreground', mobile ? 'text-sm' : 'text-[13px]')}>
        {reason.title}
      </p>
      <p
        className={cn(
          'mt-1.5 leading-relaxed text-foreground/90',
          mobile ? 'text-sm' : 'text-[12.5px]',
        )}
      >
        {reason.description}
      </p>
      {(reason.basis || reason.detectedAtLabel) && (
        <p className={cn('mt-2 text-muted-foreground', mobile ? 'text-xs' : 'text-[11px]')}>
          {reason.basis}
          {reason.basis && reason.detectedAtLabel ? ' · ' : ''}
          {reason.detectedAtLabel ? `Erkannt ${reason.detectedAtLabel}` : ''}
        </p>
      )}
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
      <p className={cn('font-medium text-foreground', mobile ? 'text-sm' : 'text-[13px]')}>
        {nextStep.label}
      </p>
      {nextStep.description && (
        <p className={cn('mt-1 text-muted-foreground', mobile ? 'text-xs' : 'text-[12px]')}>
          {nextStep.description}
        </p>
      )}
      {nextStep.primaryActionLabel && (
        <div className="mt-3">
          <button
            type="button"
            disabled={!nextStep.enabled}
            onClick={onPrimaryAction}
            title={nextStep.disabledReason ?? undefined}
            className={cn(
              'sq-press inline-flex items-center justify-center rounded-xl border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
              mobile ? 'min-h-[44px] w-full px-4 text-sm' : 'px-3.5 py-2 text-[12px]',
              nextStep.enabled
                ? 'border-[color:var(--brand)]/30 bg-[color:var(--brand)]/10 text-[color:var(--brand-ink)]'
                : 'border-border bg-muted/30 text-muted-foreground',
            )}
          >
            {nextStep.primaryActionLabel}
          </button>
          {!nextStep.enabled && nextStep.disabledReason && (
            <p className={cn('mt-1.5 text-[color:var(--status-watch)]', mobile ? 'text-xs' : 'text-[11px]')}>
              {nextStep.disabledReason}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function TaskDetailChecklistSection({
  model,
  mobile,
  disabled,
  onToggle,
}: {
  model: TaskDetailViewModel;
  mobile: boolean;
  disabled?: boolean;
  onToggle?: (itemId: string, isDone: boolean) => void;
}) {
  const checklist = model.checklist;
  if (!checklist) return null;

  const { progress, items, blocked, blockerLabel } = checklist;
  const requiredOpen = progress.remainingRequiredItems;

  return (
    <section className="py-4" data-section="checklist">
      <SectionHeader
        as="label"
        title="Checkliste"
        description={
          progress.requiredItems > 0
            ? `${progress.completedRequiredItems} von ${progress.requiredItems} Pflichtpunkten erledigt`
            : `${progress.completedItems} von ${progress.totalItems} Punkten erledigt`
        }
        className="mb-2.5"
      />

      {progress.requiredItems > 0 && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Fortschritt</span>
            <span>{progress.progressPercent ?? 0}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[color:var(--status-positive)] transition-all"
              style={{ width: `${progress.progressPercent ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {blocked && blockerLabel && (
        <p
          className={cn(
            'mb-3 rounded-lg border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] px-3 py-2 text-[color:var(--status-watch)]',
            mobile ? 'text-xs' : 'text-[11px]',
          )}
        >
          {blockerLabel}
          {requiredOpen > 0 ? ` (${requiredOpen} offen)` : ''}
        </p>
      )}

      <div className="space-y-1.5">
        {items.map((item) => (
          <label
            key={item.id}
            className={cn(
              'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors',
              item.isDone
                ? 'border-border/50 bg-muted/20'
                : 'border-border bg-muted/10',
              disabled || !onToggle ? 'opacity-70' : 'cursor-pointer',
            )}
          >
            <input
              type="checkbox"
              checked={item.isDone}
              disabled={disabled || !onToggle}
              onChange={(event) => onToggle?.(item.id, event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[color:var(--status-positive)]"
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block font-medium',
                  mobile ? 'text-sm' : 'text-[12px]',
                  item.isDone ? 'text-muted-foreground line-through' : 'text-foreground',
                )}
              >
                {item.title}
              </span>
              {item.description?.trim() && (
                <span className={cn('mt-0.5 block text-muted-foreground', mobile ? 'text-xs' : 'text-[11px]')}>
                  {item.description}
                </span>
              )}
              <span className={cn('mt-1 inline-block text-muted-foreground', mobile ? 'text-[10px]' : 'text-[10px]')}>
                {item.isRequired ? 'Pflicht' : 'Optional'}
              </span>
            </span>
          </label>
        ))}
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
            const interactive = Boolean(onObjectClick) && object.isAvailable;

            return (
              <li key={`${object.type}-${object.id}`}>
                <button
                  type="button"
                  disabled={!interactive}
                  onClick={() => onObjectClick?.(object)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                    object.isAvailable
                      ? 'border-border bg-muted/10 hover:bg-muted/25'
                      : 'border-border/50 bg-muted/5 opacity-80',
                    !interactive && 'cursor-default',
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/50 text-[color:var(--brand)]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block font-medium text-foreground', mobile ? 'text-sm' : 'text-[12px]')}>
                      {object.primaryLabel}
                    </span>
                    <span className={cn('block text-muted-foreground', mobile ? 'text-xs' : 'text-[11px]')}>
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
                  {interactive && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function TaskDetailNotesActivitySection({
  model,
  mobile,
  commentDraft,
  onCommentDraftChange,
  onAddComment,
  commentError,
  showCommentForm,
  focusComment,
}: {
  model: TaskDetailViewModel;
  mobile: boolean;
  commentDraft?: string;
  onCommentDraftChange?: (value: string) => void;
  onAddComment?: () => void;
  commentError?: string | null;
  showCommentForm?: boolean;
  focusComment?: boolean;
}) {
  const { comments, timeline, attachments, resolutionNote } = model;

  return (
    <section className="py-4" data-section="notes-activity">
      <SectionHeader as="label" title="Notizen und Aktivität" className="mb-2.5" />

      {resolutionNote && (
        <div className="mb-3 rounded-lg border border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.05] px-3 py-2.5">
          <p className={cn('font-medium text-foreground', mobile ? 'text-xs' : 'text-[11px]')}>
            Abschluss-Notiz
          </p>
          <p className={cn('mt-1 text-foreground/90', mobile ? 'text-sm' : 'text-[12px]')}>
            {resolutionNote}
          </p>
        </div>
      )}

      {comments.length > 0 ? (
        <div className="mb-3 space-y-2">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5"
            >
              <p className={cn('text-foreground', mobile ? 'text-sm' : 'text-[12px]')}>
                {comment.body}
              </p>
              <p className={cn('mt-1 text-muted-foreground', mobile ? 'text-[10px]' : 'text-[10px]')}>
                {comment.authorLabel} · {comment.createdAtLabel}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className={cn('mb-3 text-muted-foreground', mobile ? 'text-sm' : 'text-[12px]')}>
          Noch keine Notizen.
        </p>
      )}

      {showCommentForm && onCommentDraftChange && onAddComment && (
        <div className="mb-4 space-y-2">
          <textarea
            value={commentDraft}
            onChange={(event) => onCommentDraftChange(event.target.value)}
            disabled={!model.flags.canAddComment}
            autoFocus={focusComment}
            placeholder="Notiz hinzufügen …"
            className={cn(
              'w-full resize-y rounded-lg border border-border surface-premium px-3 py-2',
              mobile ? 'min-h-[88px] text-sm' : 'min-h-[72px] text-[12px]',
            )}
          />
          {commentError && (
            <p className={cn('font-medium text-[color:var(--status-critical)]', mobile ? 'text-xs' : 'text-[10px]')}>
              {commentError}
            </p>
          )}
          <button
            type="button"
            disabled={!commentDraft?.trim()}
            onClick={onAddComment}
            className={cn(
              'sq-press rounded-lg border border-border font-semibold disabled:opacity-50',
              mobile ? 'min-h-[44px] w-full px-4 text-sm' : 'px-3 py-2 text-[11px]',
            )}
          >
            Notiz speichern
          </button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="mb-4">
          <p className={cn('mb-2 font-medium text-muted-foreground', mobile ? 'text-xs' : 'text-[11px]')}>
            Anhänge
          </p>
          <div className="space-y-1.5">
            {attachments.map((attachment) => (
              <a
                key={attachment.id}
                href={attachment.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 font-medium text-[color:var(--brand)] underline',
                  mobile ? 'text-sm' : 'text-[12px]',
                )}
              >
                <Paperclip className="h-4 w-4 shrink-0" />
                <span className="truncate">{attachment.fileName ?? attachment.fileUrl}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {timeline.length > 0 && (
        <div>
          <p className={cn('mb-2 font-medium text-muted-foreground', mobile ? 'text-xs' : 'text-[11px]')}>
            Verlauf
          </p>
          <Timeline items={timeline} />
        </div>
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

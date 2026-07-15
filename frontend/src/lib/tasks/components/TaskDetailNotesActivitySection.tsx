import { useMemo, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { SectionHeader, Timeline } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { TaskDetailCommentModel, TaskDetailViewModel } from '../taskDetailView.utils';

export type TaskNotesActivityTab = 'notes' | 'activity';

export interface TaskDetailNotesActivitySectionProps {
  model: TaskDetailViewModel;
  mobile?: boolean;
  commentDraft?: string;
  onCommentDraftChange?: (value: string) => void;
  onAddComment?: () => void;
  commentError?: string | null;
  showCommentForm?: boolean;
  focusComment?: boolean;
  commentPending?: boolean;
  activeTab?: TaskNotesActivityTab;
  onActiveTabChange?: (tab: TaskNotesActivityTab) => void;
}

export function TaskDetailNotesActivitySection({
  model,
  mobile = false,
  commentDraft = '',
  onCommentDraftChange,
  onAddComment,
  commentError,
  showCommentForm,
  focusComment = false,
  commentPending = false,
  activeTab: controlledTab,
  onActiveTabChange,
}: TaskDetailNotesActivitySectionProps) {
  const canComment = showCommentForm ?? model.flags.canAddComment;
  const [activeTab, setActiveTab] = useState<TaskNotesActivityTab>('notes');
  const isControlledTab = controlledTab != null;
  const currentTab = isControlledTab ? controlledTab : activeTab;

  const setTab = (tab: TaskNotesActivityTab) => {
    if (!isControlledTab) setActiveTab(tab);
    onActiveTabChange?.(tab);
  };

  const hasNotes = model.comments.length > 0;
  const hasActivity =
    model.timeline.length > 0 || model.attachments.length > 0 || Boolean(model.resolutionNote);

  const notesPanel = (
    <TaskDetailNotesPanel
      comments={model.comments}
      mobile={mobile}
      canComment={canComment}
      commentDraft={commentDraft}
      onCommentDraftChange={onCommentDraftChange}
      onAddComment={onAddComment}
      commentError={commentError}
      focusComment={focusComment}
      commentPending={commentPending}
      compactEmpty={!mobile}
    />
  );

  const activityPanel = (
    <TaskDetailActivityPanel
      timeline={model.timeline}
      attachments={model.attachments}
      resolutionNote={model.resolutionNote}
      mobile={mobile}
    />
  );

  return (
    <section className="py-4" data-section="notes-activity">
      {mobile ? (
        <>
          <SectionHeader as="label" title="Notizen und Aktivität" className="mb-2.5" />
          <div
            className="sq-tab-bar sq-tab-bar--inset mb-3 flex p-1"
            role="tablist"
            aria-label="Notizen und Aktivität"
          >
            <button
              type="button"
              role="tab"
              aria-selected={currentTab === 'notes'}
              onClick={() => setTab('notes')}
              className={cn(
                'sq-press min-h-[40px] flex-1 rounded-lg px-3 text-sm font-semibold transition-colors',
                currentTab === 'notes'
                  ? 'surface-premium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Notizen
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={currentTab === 'activity'}
              onClick={() => setTab('activity')}
              className={cn(
                'sq-press min-h-[40px] flex-1 rounded-lg px-3 text-sm font-semibold transition-colors',
                currentTab === 'activity'
                  ? 'surface-premium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Aktivität
            </button>
          </div>
          <div role="tabpanel">
            {currentTab === 'notes' ? notesPanel : activityPanel}
          </div>
          {!hasNotes && !hasActivity && currentTab === 'notes' && (
            <p className={cn('mt-2 text-muted-foreground', mobile ? 'text-xs' : 'text-[12px]')}>
              Noch keine Einträge in diesem Bereich.
            </p>
          )}
        </>
      ) : (
        <>
          <SectionHeader as="label" title="Notizen und Aktivität" className="mb-2.5" />
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Notizen
              </h3>
              {notesPanel}
            </div>
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Aktivität
              </h3>
              {activityPanel}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function TaskDetailNotesPanel({
  comments,
  mobile,
  canComment,
  commentDraft,
  onCommentDraftChange,
  onAddComment,
  commentError,
  focusComment,
  commentPending,
  compactEmpty,
}: {
  comments: TaskDetailCommentModel[];
  mobile: boolean;
  canComment: boolean;
  commentDraft?: string;
  onCommentDraftChange?: (value: string) => void;
  onAddComment?: () => void;
  commentError?: string | null;
  focusComment?: boolean;
  commentPending?: boolean;
  compactEmpty?: boolean;
}) {
  const sortedComments = useMemo(
    () =>
      [...comments].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [comments],
  );

  return (
    <div data-panel="notes">
      {canComment && onCommentDraftChange && onAddComment && (
        <div className="mb-3 space-y-2">
          <textarea
            value={commentDraft}
            onChange={(event) => onCommentDraftChange(event.target.value)}
            disabled={commentPending}
            autoFocus={focusComment}
            placeholder="Notiz hinzufügen …"
            aria-label="Neue Notiz"
            className={cn(
              'w-full resize-y rounded-lg border border-border surface-premium px-3 py-2',
              mobile ? 'min-h-[72px] text-sm' : 'min-h-[56px] text-[12px]',
            )}
          />
          {commentError && (
            <p
              className={cn(
                'font-medium text-[color:var(--status-critical)]',
                mobile ? 'text-xs' : 'text-[10px]',
              )}
              role="alert"
            >
              {commentError}
            </p>
          )}
          <button
            type="button"
            disabled={!commentDraft?.trim() || commentPending}
            onClick={onAddComment}
            className={cn(
              'sq-press rounded-lg border border-border font-semibold disabled:opacity-50',
              mobile ? 'min-h-[44px] w-full px-4 text-sm' : 'px-3 py-2 text-[11px]',
            )}
          >
            {commentPending ? 'Wird gespeichert …' : 'Notiz speichern'}
          </button>
        </div>
      )}

      {sortedComments.length > 0 ? (
        <ul className="space-y-2" aria-label="Notizen">
          {sortedComments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5"
              data-pending={comment.id.startsWith('optimistic-comment-') ? 'true' : undefined}
            >
              <p className={cn('text-foreground', mobile ? 'text-sm' : 'text-[12px]')}>
                {comment.body}
              </p>
              <p
                className={cn('mt-1 text-muted-foreground', mobile ? 'text-[10px]' : 'text-[10px]')}
              >
                {comment.authorLabel} · {comment.createdAtLabel}
              </p>
            </li>
          ))}
        </ul>
      ) : compactEmpty ? (
        <p className={cn('text-muted-foreground', mobile ? 'text-sm' : 'text-[12px]')}>
          Noch keine Notizen.
        </p>
      ) : null}
    </div>
  );
}

function TaskDetailActivityPanel({
  timeline,
  attachments,
  resolutionNote,
  mobile,
}: {
  timeline: TaskDetailViewModel['timeline'];
  attachments: TaskDetailViewModel['attachments'];
  resolutionNote: string | null;
  mobile: boolean;
}) {
  return (
    <div data-panel="activity">
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

      {attachments.length > 0 && (
        <div className="mb-3">
          <p className={cn('mb-2 font-medium text-muted-foreground', mobile ? 'text-xs' : 'text-[11px]')}>
            Anhänge
          </p>
          <ul className="space-y-1.5">
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                <a
                  href={attachment.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 font-medium text-[color:var(--brand)] underline',
                    mobile ? 'min-h-[44px] text-sm' : 'text-[12px]',
                  )}
                >
                  <Paperclip className="h-4 w-4 shrink-0" />
                  <span className="truncate">{attachment.fileName ?? attachment.fileUrl}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {timeline.length > 0 ? (
        <div
          className={cn(
            mobile && timeline.length > 8 ? 'max-h-[420px] overflow-y-auto pr-1' : undefined,
          )}
        >
          <Timeline items={timeline} />
        </div>
      ) : (
        <p className={cn('text-muted-foreground', mobile ? 'text-sm' : 'text-[12px]')}>
          Noch keine Aktivität protokolliert.
        </p>
      )}
    </div>
  );
}

import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../../i18n/LanguageContext';
import { localizedSupportQueues } from './support-ops-i18n';
import { sop, type SupportQueueId } from './support-ops.utils';

interface SupportOpsQueueProps {
  activeQueue: SupportQueueId;
  onQueueChange: (queue: SupportQueueId) => void;
  counts?: Partial<Record<SupportQueueId, number>>;
}

export function SupportOpsQueue({ activeQueue, onQueueChange, counts }: SupportOpsQueueProps) {
  const { t, locale } = useLanguage();
  const queues = localizedSupportQueues(locale);

  return (
    <aside className={cn(sop.queueCol, 'sticky top-0 self-start max-h-[calc(100vh-9rem)]')}>
      <div className="border-b border-border/40 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          {t('support.ops.queue.header')}
        </p>
      </div>
      <nav className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {queues.map((queue) => {
          const count = counts?.[queue.id];
          return (
            <button
              key={queue.id}
              type="button"
              onClick={() => onQueueChange(queue.id)}
              className={cn(sop.queueBtn, activeQueue === queue.id && sop.queueBtnActive)}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate">{queue.label}</span>
                {count != null && count > 0 && (
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                    {count}
                  </span>
                )}
              </span>
              {queue.hint && <span className="mt-0.5 block text-[9px] text-muted-foreground">{queue.hint}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

/** Mobile queue strip */
export function SupportOpsQueueMobile({
  activeQueue,
  onQueueChange,
}: {
  activeQueue: SupportQueueId;
  onQueueChange: (queue: SupportQueueId) => void;
}) {
  const { locale } = useLanguage();
  const queues = localizedSupportQueues(locale);

  return (
    <div className="lg:hidden overflow-x-auto">
      <div className="flex gap-1.5 pb-1 min-w-max">
        {queues.map((queue) => (
          <button
            key={queue.id}
            type="button"
            onClick={() => onQueueChange(queue.id)}
            className={cn(
              'rounded-lg border px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors',
              activeQueue === queue.id
                ? 'border-[color:var(--brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
                : 'border-border/50 text-muted-foreground hover:bg-muted/40',
            )}
          >
            {queue.label}
          </button>
        ))}
      </div>
    </div>
  );
}

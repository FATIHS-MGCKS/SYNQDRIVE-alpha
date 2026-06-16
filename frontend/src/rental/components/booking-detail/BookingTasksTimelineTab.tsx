import { api } from '../../../lib/api';
import { EntityTasksSection } from '../EntityTasksSection';
import type { BookingDetailDto } from '../../../lib/api';
import { formatDateTime, EM_DASH } from './bookingDetailUtils';

const card = 'rounded-lg border border-border bg-card p-4';

interface BookingTasksTimelineTabProps {
  orgId: string;
  detail: BookingDetailDto;
  isDarkMode: boolean;
}

export function BookingTasksTimelineTab({ orgId, detail, isDarkMode }: BookingTasksTimelineTabProps) {
  const bookingId = detail.core.bookingId;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="Offen" value={detail.tasks.openCount} />
        <MiniStat label="Überfällig" value={detail.tasks.overdueCount} highlight={detail.tasks.overdueCount > 0} />
        <MiniStat label="Erledigt" value={detail.tasks.completedCount} />
      </div>

      <EntityTasksSection
        isDark={isDarkMode}
        title="Aufgaben zur Buchung"
        emptyHint="Keine Aufgaben mit dieser Buchung verknüpft."
        fetchTasks={() => api.tasks.forBooking(orgId, bookingId)}
        deps={[orgId, bookingId]}
      />

      <div className={card}>
        <h3 className="text-xs font-bold mb-3">Verlauf</h3>
        {detail.activity.length === 0 ? (
          <p className="text-xs text-muted-foreground">Keine Audit-Einträge für diese Buchung.</p>
        ) : (
          <ul className="space-y-3">
            {detail.activity.map((ev) => (
              <li key={ev.id} className="flex gap-3 text-xs border-b border-border/50 pb-3 last:border-0">
                <time className="text-muted-foreground shrink-0 w-36">{formatDateTime(ev.createdAt)}</time>
                <div>
                  <div className="font-semibold text-foreground">{ev.action}</div>
                  <div className="text-muted-foreground mt-0.5">{ev.description || EM_DASH}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`${card} text-center ${highlight ? 'sq-tone-warning border-current/30' : ''}`}
    >
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xl font-bold text-foreground">{value}</div>
    </div>
  );
}

import { useCallback, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Car,
  ListTodo,
  Plus,
} from 'lucide-react';
import { EmptyState, ErrorState, SkeletonRows } from '../../components/patterns';
import { useOperatorHandover } from '../handover/OperatorHandoverProvider';
import { useOperatorToday } from '../hooks/useOperatorToday';
import { OperatorBookingCard } from '../components/OperatorBookingCard';
import { OperatorBookingDetailSheet } from '../components/OperatorBookingDetailSheet';
import { OperatorListCard } from '../components/OperatorListCard';
import { OperatorTodaySection } from '../components/OperatorTodaySection';
import { OperatorTabletFrame } from '../components/OperatorTabletFrame';
import { OperatorVehicleQuickView } from '../components/OperatorVehicleQuickView';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useOperatorTabletLayout } from '../hooks/useOperatorTabletLayout';
import type { OperatorTodayBookingItem } from '../lib/operatorData';
import { toHandoverBookingSeed } from '../lib/operatorData';

export function OperatorTodayView() {
  const { orgId, orgLoading, snapshot, loading, error, reload } = useOperatorToday('de');
  const { openHandover } = useOperatorHandover();
  const { selectedVehicleId, setSelectedVehicleId, openSheet } = useOperatorShell();
  const isTablet = useOperatorTabletLayout();
  const [detailItem, setDetailItem] = useState<OperatorTodayBookingItem | null>(null);

  const startHandover = useCallback(
    (item: OperatorTodayBookingItem, kind: 'PICKUP' | 'RETURN') => {
      openHandover({
        bookingId: item.bookingId,
        kind,
        booking: toHandoverBookingSeed(item),
      });
    },
    [openHandover],
  );

  if (!orgLoading && !orgId) {
    return (
      <EmptyState
        compact
        icon={<Car className="h-5 w-5" />}
        title="Keine Organisation"
        description="Melde dich mit einem Miet-Organisationskonto an."
      />
    );
  }

  const sectionEmpty = (icon: ReactNode, title: string, description: string) => (
    <EmptyState compact icon={icon} title={title} description={description} />
  );

  const mainContent = (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain pb-4">
      <button
        type="button"
        onClick={() => openSheet({ type: 'booking-create' })}
        className="sq-3d-btn sq-3d-btn--primary flex min-h-[48px] w-full items-center justify-center gap-2 font-semibold"
      >
        <Plus className="h-5 w-5" />
        Buchung aufnehmen
      </button>

      {loading && <SkeletonRows rows={6} />}
      {!loading && error && (
        <ErrorState compact title="Heute-Daten nicht verfügbar" error={error} onRetry={() => void reload()} />
      )}

      {!loading && !error && (
        <>
          <OperatorTodaySection
            title="Jetzt fällig"
            count={snapshot.dueNow.length}
            isEmpty={snapshot.dueNow.length === 0}
            empty={sectionEmpty(
              <AlertTriangle className="h-5 w-5" />,
              'Nichts Dringendes',
              'Keine überfälligen oder unmittelbar anstehenden Übergaben.',
            )}
          >
            <div className="space-y-2">
              {snapshot.dueNow.map((item) => (
                <OperatorBookingCard
                  key={`${item.kind}-${item.bookingId}`}
                  item={item}
                  onPickupStart={() => startHandover(item, 'PICKUP')}
                  onReturnStart={() => startHandover(item, 'RETURN')}
                  onDetails={() => setDetailItem(item)}
                />
              ))}
            </div>
          </OperatorTodaySection>

          <OperatorTodaySection
            title="Abholungen heute"
            count={snapshot.pickupsToday.length}
            isEmpty={snapshot.pickupsToday.length === 0}
            empty={sectionEmpty(
              <ArrowUpRight className="h-5 w-5" />,
              'Keine Abholungen heute',
              'Sobald Pickups geplant sind, erscheinen sie hier.',
            )}
          >
            <div className="space-y-2">
              {snapshot.pickupsToday.map((item) => (
                <OperatorBookingCard
                  key={item.bookingId}
                  item={item}
                  onPickupStart={() => startHandover(item, 'PICKUP')}
                  onReturnStart={() => startHandover(item, 'RETURN')}
                  onDetails={() => setDetailItem(item)}
                />
              ))}
            </div>
          </OperatorTodaySection>

          <OperatorTodaySection
            title="Rückgaben heute"
            count={snapshot.returnsToday.length}
            isEmpty={snapshot.returnsToday.length === 0}
            empty={sectionEmpty(
              <ArrowDownLeft className="h-5 w-5" />,
              'Keine Rückgaben heute',
              'Sobald Returns geplant sind, erscheinen sie hier.',
            )}
          >
            <div className="space-y-2">
              {snapshot.returnsToday.map((item) => (
                <OperatorBookingCard
                  key={item.bookingId}
                  item={item}
                  onPickupStart={() => startHandover(item, 'PICKUP')}
                  onReturnStart={() => startHandover(item, 'RETURN')}
                  onDetails={() => setDetailItem(item)}
                />
              ))}
            </div>
          </OperatorTodaySection>

          <OperatorTodaySection
            title="Offene Aufgaben"
            count={snapshot.openTasks.length}
            isEmpty={snapshot.openTasks.length === 0}
            empty={sectionEmpty(
              <ListTodo className="h-5 w-5" />,
              'Keine offenen Aufgaben',
              'Alle operativen Tasks erledigt.',
            )}
          >
            <div className="space-y-2">
              {snapshot.openTasks.map((task) => (
                <OperatorListCard
                  key={task.id}
                  title={task.title}
                  subtitle={task.category || task.type}
                  meta={task.dueDate ? new Date(task.dueDate).toLocaleDateString('de-DE') : undefined}
                  badges={[
                    {
                      kind: 'task_open',
                      label: task.isOverdue ? 'Überfällig' : 'Offen',
                      tone: task.isOverdue ? 'critical' : 'info',
                    },
                  ]}
                  onClick={
                    task.vehicleId
                      ? () => setSelectedVehicleId(task.vehicleId!)
                      : undefined
                  }
                />
              ))}
            </div>
          </OperatorTodaySection>

          {snapshot.vehicleCheckTasks.length > 0 && (
            <OperatorTodaySection title="Fahrzeugchecks" count={snapshot.vehicleCheckTasks.length}>
              <div className="space-y-2">
                {snapshot.vehicleCheckTasks.map((task) => (
                  <OperatorListCard
                    key={`check-${task.id}`}
                    title={task.title}
                    subtitle={task.type}
                    onClick={task.vehicleId ? () => setSelectedVehicleId(task.vehicleId!) : undefined}
                  />
                ))}
              </div>
            </OperatorTodaySection>
          )}

          <OperatorTodaySection
            title="Blocker"
            count={snapshot.blockedVehicles.length}
            isEmpty={snapshot.blockedVehicles.length === 0}
            empty={sectionEmpty(
              <Car className="h-5 w-5" />,
              'Keine blockierten Fahrzeuge',
              'Alle Fahrzeuge sind aus Rental-Health-Sicht vermietbar.',
            )}
          >
            <div className="space-y-2">
              {snapshot.blockedVehicles.map((v) => (
                <OperatorListCard
                  key={v.vehicleId}
                  title={`${v.label} · ${v.plate}`}
                  subtitle={v.station || undefined}
                  badges={[{ kind: 'blocked', label: 'Blockiert', tone: 'critical' }]}
                  onClick={() => setSelectedVehicleId(v.vehicleId)}
                />
              ))}
            </div>
          </OperatorTodaySection>
        </>
      )}
    </div>
  );

  const detailPanel = selectedVehicleId ? (
    <OperatorVehicleQuickView vehicleId={selectedVehicleId} onClose={() => setSelectedVehicleId(null)} />
  ) : (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/10 p-8 text-center">
      <p className="text-sm text-muted-foreground">Fahrzeug oder Aufgabe für Quick Actions wählen</p>
    </div>
  );

  return (
    <>
      {isTablet ? (
        <OperatorTabletFrame list={mainContent} detail={detailPanel} showDetail={Boolean(selectedVehicleId)} />
      ) : (
        mainContent
      )}
      <OperatorBookingDetailSheet
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onPickupStart={(item) => startHandover(item, 'PICKUP')}
        onReturnStart={(item) => startHandover(item, 'RETURN')}
      />
    </>
  );
}

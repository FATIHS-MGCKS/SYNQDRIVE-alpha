import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Icon } from '../ui/Icon';
import { api } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { useHandover } from '../../HandoverContext';
import { SkeletonCard } from '../../../components/patterns';
import { BookingDetailHeader } from './BookingDetailHeader';
import { BookingOverviewTab } from './BookingOverviewTab';
import { BookingFinanceDocumentsTab } from './BookingFinanceDocumentsTab';
import { BookingHandoverTab } from './BookingHandoverTab';
import { BookingCustomerRiskTab } from './BookingCustomerRiskTab';
import { BookingVehicleHealthTab } from './BookingVehicleHealthTab';
import { BookingUsageMisuseTab } from './BookingUsageMisuseTab';
import { BookingTasksTimelineTab } from './BookingTasksTimelineTab';
import { BookingEditDialog } from './BookingEditDialog';
import { BOOKING_DETAIL_TABS, type BookingDetailTab } from './bookingDetailTypes';
import { getBookingActionMatrix, getPrimaryBookingAction } from './bookingActionRules';
import { useBookingDetail } from './useBookingDetail';
import { formatDateTime } from './bookingDetailUtils';

interface BookingDossierProps {
  bookingId: string;
  onBack: () => void;
  isDarkMode: boolean;
  onRefreshList?: () => void;
  onBookingCancelled?: (bookingId: string) => void;
  onOpenCustomer?: (customerId: string) => void;
  onOpenVehicle?: (vehicleId: string) => void;
}

export function BookingDossier({
  bookingId,
  onBack,
  isDarkMode,
  onRefreshList,
  onBookingCancelled,
  onOpenCustomer,
  onOpenVehicle,
}: BookingDossierProps) {
  const { orgId } = useRentalOrg();
  const { openHandover } = useHandover();
  const { detail, loading, error, refresh } = useBookingDetail(orgId, bookingId);
  const [activeTab, setActiveTab] = useState<BookingDetailTab>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [noShowOpen, setNoShowOpen] = useState(false);
  const [noShowReason, setNoShowReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const matrix = useMemo(() => (detail ? getBookingActionMatrix(detail) : null), [detail]);
  const primary = useMemo(
    () => (detail && matrix ? getPrimaryBookingAction(detail, matrix) : { key: 'none' as const, label: '—' }),
    [detail, matrix],
  );

  const handlePrimary = () => {
    if (!detail || !matrix) return;
    switch (primary.key) {
      case 'pickup':
        if (matrix.pickup.allowed) openHandover({ bookingId, kind: 'PICKUP' });
        break;
      case 'return':
        if (matrix.return.allowed) openHandover({ bookingId, kind: 'RETURN' });
        break;
      case 'no_show':
        if (matrix.no_show.allowed) setNoShowOpen(true);
        break;
      case 'edit':
        if (matrix.edit.allowed) setEditOpen(true);
        break;
      case 'final_invoice':
        setActiveTab('finance_documents');
        toast.info('Schlussrechnung im Tab Zahlung & Dokumente erstellen');
        break;
      default:
        break;
    }
  };

  const handlePickupReturn = (kind: 'PICKUP' | 'RETURN') => {
    if (!detail) return;
    if (kind === 'PICKUP' && detail.handover.pickup) {
      setActiveTab('finance_documents');
      return;
    }
    if (kind === 'RETURN' && detail.handover.return) {
      setActiveTab('finance_documents');
      return;
    }
    openHandover({ bookingId, kind });
  };

  const executeCancel = async () => {
    if (!orgId || !detail || submitting) return;
    setSubmitting(true);
    try {
      await api.bookings.cancel(orgId, bookingId);
      toast.success('Buchung storniert');
      onBookingCancelled?.(bookingId);
      onRefreshList?.();
      setCancelOpen(false);
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Stornierung fehlgeschlagen';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const executeNoShow = async () => {
    if (!orgId || !detail || submitting) return;
    setSubmitting(true);
    try {
      await api.bookings.markNoShow(orgId, bookingId, noShowReason.trim() || null);
      toast.success('Als No-Show markiert');
      onBookingCancelled?.(bookingId);
      onRefreshList?.();
      setNoShowOpen(false);
      setNoShowReason('');
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No-Show konnte nicht gesetzt werden';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !detail) {
    return (
      <div className="max-w-[1800px] mx-auto px-4 py-10 space-y-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Icon name="loader-2" className="w-4 h-4 animate-spin" />
          <span>Lade Buchungsakte…</span>
        </div>
        <SkeletonCard />
      </div>
    );
  }

  if (error || !detail || !matrix) {
    return (
      <div className="max-w-[1800px] mx-auto px-4 py-10">
        <button type="button" onClick={onBack} className="mb-4 text-xs text-muted-foreground hover:text-foreground flex items-center gap-2">
          <Icon name="arrow-left" className="w-4 h-4" />
          Zurück
        </button>
        <div className="rounded-lg border border-border surface-premium p-6 text-center space-y-3">
          <p className="text-sm text-foreground">{error ?? 'Buchung nicht gefunden'}</p>
          <button type="button" onClick={refresh} className="text-xs font-semibold sq-tone-brand px-4 py-2 rounded-lg">
            Erneut laden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1800px] mx-auto px-4 pb-10">
      <BookingDetailHeader
        detail={detail}
        primary={primary}
        matrix={matrix}
        onBack={onBack}
        onPrimaryAction={handlePrimary}
        onEdit={() => matrix.edit.allowed && setEditOpen(true)}
        onCancel={() => matrix.cancel.allowed && setCancelOpen(true)}
        onNoShow={() => matrix.no_show.allowed && setNoShowOpen(true)}
      />

      <nav className="flex gap-1 overflow-x-auto border-b border-border mb-4 -mx-1 px-1">
        {BOOKING_DETAIL_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-[color:var(--brand)] text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'overview' && <BookingOverviewTab detail={detail} matrix={matrix} />}
      {activeTab === 'finance_documents' && orgId && (
        <BookingFinanceDocumentsTab
          orgId={orgId}
          detail={detail}
          isDarkMode={isDarkMode}
          onRefresh={refresh}
          onRecordManualPayment={() => {
            toast.info('Manuelle Zahlung bitte in der Rechnungsansicht erfassen.');
          }}
        />
      )}
      {activeTab === 'handover' && (
        <BookingHandoverTab
          detail={detail}
          matrix={matrix}
          onPickup={() => handlePickupReturn('PICKUP')}
          onReturn={() => handlePickupReturn('RETURN')}
        />
      )}
      {activeTab === 'customer_risk' && (
        <BookingCustomerRiskTab detail={detail} orgId={orgId} onOpenCustomer={onOpenCustomer} />
      )}
      {activeTab === 'vehicle_health' && orgId && (
        <BookingVehicleHealthTab orgId={orgId} detail={detail} onOpenVehicle={onOpenVehicle} />
      )}
      {activeTab === 'usage_misuse' && orgId && (
        <BookingUsageMisuseTab orgId={orgId} detail={detail} />
      )}
      {activeTab === 'tasks_timeline' && orgId && (
        <BookingTasksTimelineTab orgId={orgId} detail={detail} isDarkMode={isDarkMode} />
      )}

      {editOpen && orgId && (
        <BookingEditDialog
          orgId={orgId}
          detail={detail}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            refresh();
            onRefreshList?.();
          }}
        />
      )}

      {cancelOpen && (
        <ConfirmModal
          title="Buchung stornieren?"
          description="Die Buchung wird als storniert markiert."
          confirmLabel="Stornieren"
          tone="critical"
          submitting={submitting}
          onClose={() => setCancelOpen(false)}
          onConfirm={executeCancel}
        >
          <SummaryRows
            rows={[
              ['Kunde', detail.customer.fullName],
              ['Fahrzeug', `${detail.vehicle.displayName} · ${detail.vehicle.licensePlate}`],
              ['Zeitraum', `${formatDateTime(detail.core.startDate)} – ${formatDateTime(detail.core.endDate)}`],
            ]}
          />
        </ConfirmModal>
      )}

      {noShowOpen && (
        <ConfirmModal
          title="Kunde nicht erschienen?"
          description="Die Buchung wird auf No-Show gesetzt — getrennt von einer Stornierung."
          confirmLabel={submitting ? 'Wird gesetzt …' : 'Als No-Show markieren'}
          tone="critical"
          submitting={submitting}
          onClose={() => {
            setNoShowOpen(false);
            setNoShowReason('');
          }}
          onConfirm={executeNoShow}
        >
          <textarea
            value={noShowReason}
            onChange={(e) => setNoShowReason(e.target.value)}
            rows={3}
            placeholder="Grund (optional)"
            className="w-full px-2.5 py-2 rounded-md border border-border bg-[color:var(--input-background)] text-xs outline-none resize-none mb-3"
          />
        </ConfirmModal>
      )}
    </div>
  );
}

function SummaryRows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rounded-lg p-3 my-4 text-left text-xs space-y-1.5 bg-muted">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2">
          <span className="text-muted-foreground">{k}</span>
          <span className="text-foreground text-right">{v}</span>
        </div>
      ))}
    </div>
  );
}

function ConfirmModal({
  title,
  description,
  confirmLabel,
  tone,
  submitting,
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  tone: 'critical';
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 overlay-scrim" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md mx-4 rounded-lg shadow-2xl border overflow-hidden surface-frosted border-border"
      >
        <div className="p-8 text-center">
          <div className={`w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center sq-tone-${tone}`}>
            <Icon name="alert-triangle" className="w-5 h-5 text-[color:var(--status-critical)]" />
          </div>
          <h3 className="text-base mb-2 text-foreground">{title}</h3>
          <p className="text-xs mb-1 text-muted-foreground">{description}</p>
          {children}
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="flex-1 px-3 py-2.5 rounded-lg text-xs border surface-premium border-border hover:bg-muted"
            >
              Zurück
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={onConfirm}
              className="flex-1 px-3 py-2.5 rounded-lg text-xs bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

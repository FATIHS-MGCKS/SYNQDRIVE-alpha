import { useState } from 'react';
import { toast } from 'sonner';
import { StatusChip } from '../../../components/patterns';
import { api, type BookingDetailDto } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { bd } from './booking-detail-ui';

type PreparationArtifact = NonNullable<BookingDetailDto['preparation']>['artifacts'][number];

interface BookingPreparationPanelProps {
  orgId: string;
  bookingId: string;
  preparation: NonNullable<BookingDetailDto['preparation']>;
  onRetryComplete?: () => void;
}

function artifactTone(status: string): 'success' | 'warning' | 'critical' | 'neutral' {
  switch (status) {
    case 'READY':
    case 'NOT_REQUIRED':
      return 'success';
    case 'FAILED':
      return 'critical';
    case 'PROCESSING':
    case 'RETRY_SCHEDULED':
    case 'PENDING':
      return 'warning';
    default:
      return 'neutral';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'READY':
      return 'Bereit';
    case 'FAILED':
      return 'Fehlgeschlagen';
    case 'PROCESSING':
      return 'In Bearbeitung';
    case 'RETRY_SCHEDULED':
      return 'Wiederholung geplant';
    case 'NOT_REQUIRED':
      return 'Nicht erforderlich';
    case 'PENDING':
    default:
      return 'Ausstehend';
  }
}

function recoveryActionLabel(action: string | null): string {
  switch (action) {
    case 'RETRY_INVOICE':
      return 'Rechnung erneut';
    case 'RETRY_DOCUMENT':
      return 'Dokumente erneut';
    case 'RETRY_EMAIL':
      return 'E-Mail erneut';
    case 'REBUILD_TASKS':
      return 'Aufgaben neu';
    default:
      return 'Erneut versuchen';
  }
}

export function BookingPreparationPanel({
  orgId,
  bookingId,
  preparation,
  onRetryComplete,
}: BookingPreparationPanelProps) {
  const { hasPermission } = useRentalOrg();
  const canManage = hasPermission('bookings', 'manage');
  const [retrying, setRetrying] = useState<string | null>(null);

  const visibleArtifacts = preparation.artifacts.filter(
    (a) => a.required || a.status === 'FAILED' || a.status === 'RETRY_SCHEDULED',
  );

  if (visibleArtifacts.length === 0 && preparation.isOperationallyReady) {
    return null;
  }

  const handleRetry = async (artifact: PreparationArtifact) => {
    if (!canManage || !artifact.recoverable || !artifact.recoveryAction) return;
    const key = artifact.artifactType;
    setRetrying(key);
    try {
      const idempotencyKey = `booking-prep-ui:${bookingId}:${artifact.artifactType}:${Date.now()}`;
      const result = await api.bookings.retryPreparation(orgId, bookingId, {
        artifactType: artifact.artifactType,
        idempotencyKey,
      });
      if (result.deduplicated) {
        toast.info('Wiederherstellung wurde bereits ausgeführt');
      } else {
        toast.success(`${artifact.label}: Wiederherstellung gestartet`);
      }
      onRetryComplete?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Wiederherstellung fehlgeschlagen';
      toast.error(msg);
    } finally {
      setRetrying(null);
    }
  };

  const overallTone = preparation.failedCount > 0
    ? 'critical'
    : preparation.processingCount > 0 || preparation.missingRequiredCount > 0
      ? 'warning'
      : preparation.isOperationallyReady
        ? 'success'
        : 'neutral';

  return (
    <div className={bd.card}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h3 className="text-xs font-bold">Vorbereitung</h3>
        <StatusChip tone={overallTone}>
          {preparation.isOperationallyReady ? 'Betriebsbereit' : 'Unvollständig'}
        </StatusChip>
        {preparation.blocksPickup && (
          <StatusChip tone="critical">Pickup blockiert</StatusChip>
        )}
      </div>

      {preparation.pickupBlockReasons.length > 0 && (
        <div className="mb-3 rounded-md border border-current/20 sq-tone-warning px-3 py-2 text-xs">
          <p className="font-semibold mb-1">Pickup blockiert wegen:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {preparation.pickupBlockReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      <ul className="space-y-2">
        {visibleArtifacts.map((artifact) => (
          <li
            key={artifact.artifactType}
            className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between text-xs border-b border-border/60 pb-2 last:border-0 last:pb-0"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{artifact.label}</span>
                <StatusChip tone={artifactTone(artifact.status)}>{statusLabel(artifact.status)}</StatusChip>
                {artifact.blocksPickup && artifact.status !== 'READY' && (
                  <StatusChip tone="warning">Pickup-Pflicht</StatusChip>
                )}
              </div>
              {artifact.lastError && (
                <p className="text-[color:var(--status-critical)]">{artifact.lastError}</p>
              )}
            </div>
            {canManage && artifact.recoverable && artifact.recoveryAction && (
              <button
                type="button"
                disabled={retrying === artifact.artifactType}
                onClick={() => handleRetry(artifact)}
                className="shrink-0 sq-press px-2.5 py-1 rounded-md border border-border text-xs font-semibold hover:bg-muted disabled:opacity-50"
              >
                {retrying === artifact.artifactType
                  ? 'Wird gestartet…'
                  : recoveryActionLabel(artifact.recoveryAction)}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

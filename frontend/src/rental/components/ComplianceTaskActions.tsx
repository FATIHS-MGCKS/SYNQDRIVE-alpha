import { useState } from 'react';
import { toast } from 'sonner';
import { api, type ComplianceTaskSignal } from '../../lib/api';
import { useRentalOrg } from '../RentalContext';
import { Icon } from './ui/Icon';

interface ComplianceTaskActionsProps {
  vehicleId: string;
  signals: ComplianceTaskSignal[] | null | undefined;
  className?: string;
  compact?: boolean;
}

export function ComplianceTaskActions({
  vehicleId,
  signals,
  className = '',
  compact = false,
}: ComplianceTaskActionsProps) {
  const { orgId } = useRentalOrg();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  if (!signals?.length) return null;

  const onMaterialize = async (signal: ComplianceTaskSignal) => {
    if (!orgId || loadingKey) return;
    setLoadingKey(signal.signalKey);
    try {
      await api.vehicleIntelligence.materializeComplianceTask(vehicleId, signal.signalKey);
      toast.success(signal.suggestionOnly ? 'Aufgabenvorschlag erstellt' : 'Aufgabe erstellt', {
        description: signal.title,
      });
    } catch (err) {
      toast.error('Aufgabe konnte nicht erstellt werden', {
        description: err instanceof Error ? err.message : 'Unbekannter Fehler',
      });
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {signals.map((signal) => (
        <button
          key={signal.signalKey}
          type="button"
          disabled={loadingKey === signal.signalKey}
          onClick={(e) => {
            e.stopPropagation();
            void onMaterialize(signal);
          }}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-60 ${
            signal.severity === 'CRITICAL'
              ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400'
              : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
          }`}
          title={signal.message}
        >
          <Icon name="clipboard-list" className="w-3 h-3 shrink-0" />
          {compact ? signal.actionLabel : (signal.suggestionOnly ? `Aufgabe: ${signal.actionLabel}` : signal.actionLabel)}
        </button>
      ))}
    </div>
  );
}

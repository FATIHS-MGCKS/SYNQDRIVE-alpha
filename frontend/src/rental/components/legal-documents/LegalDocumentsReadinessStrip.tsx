import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { MetricCard } from '../../../components/patterns';
import type { LegalDocumentsReadinessSummary } from '../../lib/legal-documents-overview';

interface Props {
  summary: LegalDocumentsReadinessSummary;
  loading?: boolean;
}

export function LegalDocumentsReadinessStrip({ summary, loading }: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      <MetricCard
        label="Gesamtstatus"
        value={summary.overallLabel}
        hint={summary.overallDetail}
        status={summary.overallTone}
        icon={
          summary.overallTone === 'success' ? (
            <ShieldCheck className="h-4 w-4" />
          ) : summary.overallTone === 'critical' ? (
            <ShieldAlert className="h-4 w-4" />
          ) : (
            <ShieldQuestion className="h-4 w-4" />
          )
        }
        loading={loading}
        variant="summary"
        valueSize="compact"
        className="col-span-2 sm:col-span-1"
      />
      <MetricCard
        label="Einsatzbereit"
        value={summary.readyCount}
        unit={`/ ${summary.categories.length}`}
        status={summary.readyCount === summary.categories.length ? 'success' : 'neutral'}
        loading={loading}
        variant="summary"
        valueSize="compact"
      />
      <MetricCard
        label="Einschränkung"
        value={summary.attentionCount}
        status={summary.attentionCount > 0 ? 'watch' : 'neutral'}
        hint={summary.attentionCount > 0 ? 'Prüfhinweise offen' : 'Keine offenen Hinweise'}
        loading={loading}
        variant="summary"
        valueSize="compact"
      />
      <MetricCard
        label="Blockiert / fehlend"
        value={summary.blockedCount + summary.emptyCount}
        status={summary.blockedCount + summary.emptyCount > 0 ? 'critical' : 'neutral'}
        hint={
          summary.blockedCount + summary.emptyCount > 0
            ? 'Buchungsdokumente unvollständig'
            : 'Keine blockierten Kategorien'
        }
        loading={loading}
        variant="summary"
        valueSize="compact"
      />
    </div>
  );
}

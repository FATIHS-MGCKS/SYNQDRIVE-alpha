import { FileText, Receipt } from 'lucide-react';

import { Icon } from '../ui/Icon';
import type { InvoiceDetailDto } from './invoiceDetailTypes';
import { InvoiceDetailRow } from './InvoiceDetailRow';
import { InvoiceRelationRow } from './InvoiceRelationRow';
import type { InvoiceEntityRelation } from './invoiceDetailTypes';
import type { InvoiceThemeClasses } from './invoiceTheme';

export type InvoiceRelationNavigation = {
  onOpenCustomer?: (customerId: string) => void;
  onOpenBooking?: (bookingId: string) => void;
  onOpenVehicle?: (vehicleId: string) => void;
};

interface InvoiceRelationsProps extends InvoiceThemeClasses {
  detail: InvoiceDetailDto;
  navigation?: InvoiceRelationNavigation;
  tasks?: { id: string; title: string; status: string }[];
}

export function InvoiceRelations({
  detail,
  navigation,
  tasks,
  card,
  tp,
  ts,
  isDarkMode,
}: InvoiceRelationsProps) {
  const { relations } = detail;

  const handleNavigate = (relation: InvoiceEntityRelation) => {
    if (!relation.navigable || !relation.entityId) return;
    switch (relation.kind) {
      case 'customer':
        navigation?.onOpenCustomer?.(relation.entityId);
        break;
      case 'booking':
        navigation?.onOpenBooking?.(relation.entityId);
        break;
      case 'vehicle':
        navigation?.onOpenVehicle?.(relation.entityId);
        break;
      default:
        break;
    }
  };

  const entityRelations = [
    relations.customer,
    relations.vendor,
    relations.booking,
    relations.vehicle,
  ].filter((row): row is InvoiceEntityRelation => row != null);

  return (
    <>
      <div className={`${card} p-5`}>
        <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Zuordnung</h3>
        <div className={`divide-y ${isDarkMode ? 'divide-border/30' : 'divide-gray-100'}`}>
          {entityRelations.map((relation) => (
            <InvoiceRelationRow
              key={relation.kind}
              relation={relation}
              onNavigate={handleNavigate}
              isDarkMode={isDarkMode}
              tp={tp}
              ts={ts}
            />
          ))}

          <div className="py-2.5">
            <div className="flex items-start gap-3">
              <FileText className={`w-4 h-4 mt-0.5 ${ts} shrink-0`} aria-hidden />
              <div className="flex-1 min-w-0 space-y-2">
                <p className={`text-[10px] ${ts} uppercase tracking-wider font-semibold`}>Herkunft</p>
                <dl className="space-y-1.5">
                  <ProvenanceItem label="Erstellt von" value={relations.provenance.erstelltVon} tp={tp} ts={ts} />
                  <ProvenanceItem label="Erstellt über" value={relations.provenance.erstelltUeber} tp={tp} ts={ts} />
                  <ProvenanceItem label="Quelle" value={relations.provenance.quelle} tp={tp} ts={ts} />
                </dl>
              </div>
            </div>
          </div>

          {relations.template && (
            <InvoiceDetailRow
              label="Vorlage"
              value={relations.template.name}
              icon={Receipt}
              tp={tp}
              ts={ts}
            />
          )}
        </div>
      </div>

      {tasks && tasks.length > 0 && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Verknüpfte Aufgabe</h3>
          {tasks.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-3 p-3 rounded-xl border ${isDarkMode ? 'border-border/30 bg-muted/30' : 'border-gray-100 bg-gray-50/50'}`}
            >
              <Icon
                name="list-todo"
                className={`w-4 h-4 ${t.status === 'DONE' ? 'text-green-500' : 'text-amber-500'}`}
              />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${tp} truncate`}>{t.title}</p>
                <p className={`text-[10px] ${ts}`}>
                  {t.status === 'DONE' ? 'Erledigt' : t.status === 'IN_PROGRESS' ? 'In Bearbeitung' : 'Offen'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ProvenanceItem({
  label,
  value,
  tp,
  ts,
}: {
  label: string;
  value: string;
  tp: string;
  ts: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className={`text-[10px] ${ts} uppercase tracking-wider font-semibold sm:w-28 shrink-0`}>{label}</dt>
      <dd className={`text-xs ${tp} break-words`}>{value}</dd>
    </div>
  );
}

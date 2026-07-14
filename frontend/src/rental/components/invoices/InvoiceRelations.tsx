import { FileText, Receipt } from 'lucide-react';
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
}

export function InvoiceRelations({
  detail,
  navigation,
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

  if (entityRelations.length === 0 && !relations.template) {
    return null;
  }

  return (
    <div className={`${card} p-4 sm:p-5`} data-testid="invoice-relations-primary">
      <h3 className={`text-xs font-bold ${tp} mb-2 uppercase tracking-wider`}>Zuordnung</h3>
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

        {relations.template ? (
          <InvoiceDetailRow
            label="Vorlage"
            value={relations.template.name}
            icon={Receipt}
            tp={tp}
            ts={ts}
          />
        ) : null}
      </div>
    </div>
  );
}

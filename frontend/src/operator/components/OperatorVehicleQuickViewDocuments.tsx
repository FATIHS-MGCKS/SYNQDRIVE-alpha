import { useLanguage } from '../../i18n/LanguageContext';
import { SkeletonRows } from '../../components/patterns';
import {
  formatOperatorVehicleQuickViewDateTime,
  operatorVehicleQuickViewDocumentPrimaryLine,
  operatorVehicleQuickViewDocumentsSectionTitle,
  operatorVehicleQuickViewDocumentSecondaryLine,
} from '../lib/operator-vehicle-quick-view-i18n';
import { OperatorGlassCard } from './OperatorGlassCard';

export interface OperatorVehicleQuickViewDocumentRow {
  id: string;
  documentType: string;
  status: string;
  sourceFileName: string | null;
  createdAt: string;
}

export interface OperatorVehicleQuickViewDocumentsProps {
  documents: OperatorVehicleQuickViewDocumentRow[];
  documentsLoading: boolean;
}

export function OperatorVehicleQuickViewDocuments({
  documents,
  documentsLoading,
}: OperatorVehicleQuickViewDocumentsProps) {
  const { locale } = useLanguage();

  return (
    <OperatorGlassCard className="space-y-3 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {operatorVehicleQuickViewDocumentsSectionTitle(locale)}
      </h3>
      {documentsLoading ? (
        <SkeletonRows rows={2} />
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div key={doc.id} className="rounded-xl border border-border/50 px-3 py-2 text-xs">
              <p className="font-semibold text-foreground">
                {operatorVehicleQuickViewDocumentPrimaryLine(locale, doc)}
              </p>
              <p className="text-muted-foreground">
                {operatorVehicleQuickViewDocumentSecondaryLine(locale, doc)}
              </p>
            </div>
          ))}
        </div>
      )}
    </OperatorGlassCard>
  );
}

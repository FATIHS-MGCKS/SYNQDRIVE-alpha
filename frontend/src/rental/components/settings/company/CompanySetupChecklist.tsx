import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleDashed,
  CreditCard,
  FileText,
  ImageIcon,
  Mail,
  MapPin,
} from 'lucide-react';
import { StatusChip } from '../../../../components/patterns';
import type { CompanySection, SetupCheckItem, SetupItemStatus } from './company-utils';
import { SETUP_STATUS_LABEL } from './company-utils';

const ICONS: Record<string, typeof Building2> = {
  company: Building2,
  billing: CreditCard,
  branding: ImageIcon,
  legal: FileText,
  station: MapPin,
  contact: Mail,
};

const TONE: Record<SetupItemStatus, 'success' | 'warning' | 'neutral'> = {
  done: 'success',
  missing: 'warning',
  review: 'neutral',
};

interface CompanySetupChecklistProps {
  items: SetupCheckItem[];
  onNavigate: (section: CompanySection) => void;
  onManageDocuments?: () => void;
  onNavigateToStations?: () => void;
}

export function CompanySetupChecklist({
  items,
  onNavigate,
  onManageDocuments,
  onNavigateToStations,
}: CompanySetupChecklistProps) {
  return (
    <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Einrichtungsstatus</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Prüfen Sie die wichtigsten Voraussetzungen für Rechnungen, Dokumente und Kommunikation.
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const Icon = ICONS[item.id] ?? CircleDashed;
          const statusIcon =
            item.status === 'done' ? (
              <CheckCircle2 className="w-4 h-4 text-[var(--status-success)]" />
            ) : item.status === 'review' ? (
              <AlertCircle className="w-4 h-4 text-[var(--status-warning)]" />
            ) : (
              <CircleDashed className="w-4 h-4 text-muted-foreground" />
            );
          return (
            <li
              key={item.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border border-border/60 bg-muted/20 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {statusIcon}
                    <p className="text-xs font-medium text-foreground">{item.label}</p>
                    <StatusChip tone={TONE[item.status]}>
                      {SETUP_STATUS_LABEL[item.status]}
                    </StatusChip>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.description}</p>
                </div>
              </div>
              {item.ctaLabel &&
                (item.id === 'legal'
                  ? onManageDocuments
                  : item.id === 'station'
                    ? onNavigateToStations
                    : item.ctaSection) && (
                <button
                  type="button"
                  onClick={() => {
                    if (item.id === 'legal' && onManageDocuments) {
                      onManageDocuments();
                    } else if (item.id === 'station' && onNavigateToStations) {
                      onNavigateToStations();
                    } else if (item.ctaSection) {
                      onNavigate(item.ctaSection);
                    }
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--brand)] hover:underline shrink-0"
                >
                  {item.ctaLabel}
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
